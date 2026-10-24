const crypto = require('crypto');
const { Prisma } = require('@prisma/client');
const PDFDocument = require('pdfkit');
const prisma = require('../lib/prisma');
const audit = require('./audit.service');
const transfers = require('./transfer.service');
const { balance } = require('./tax.service');
const { fail, str, paging, toId } = require('../lib/util');

if (!process.env.TELEBIRR_SECRET) {
  throw new Error('TELEBIRR_SECRET is missing. Add it to backend/.env');
}
const SECRET = process.env.TELEBIRR_SECRET;

const TIMEOUT_MS = 15 * 60 * 1000; // section 4.5.2: no callback within 15 minutes -> Failed
const IN_PROGRESS = ['initiated', 'pending', 'processing'];
const ALL_STATUSES = ['initiated', 'pending', 'processing', 'completed', 'failed', 'refunded'];

const systemActor = (ip) => ({ id: null, role: 'SYSTEM_ADMIN', ip });
const safeAudit = (entry) =>
  audit.log(entry).catch((e) => console.error('Audit log failed:', e));

const txnInclude = {
  tax_record: {
    include: {
      parcel: {
        select: {
          id: true,
          parcel_number: true,
          kebele: true,
          owner: { select: { id: true, user_id: true, full_name: true } },
        },
      },
    },
  },
};

// ---------- signing (the contract with the payment gateway) ----------

function sign(p) {
  return crypto
    .createHmac('sha256', SECRET)
    .update(`${p.transaction_ref}|${p.amount}|${p.status}|${p.timestamp}`)
    .digest('hex');
}

function validSignature(p) {
  const given = Buffer.from(String(p.signature || ''), 'hex');
  const expected = Buffer.from(sign(p), 'hex');
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

// ---------- helpers ----------

function statusFor(record, paid) {
  if (paid.gte(record.tax_amount)) return 'paid';
  return paid.gt(0) ? 'partial' : 'unpaid';
}

async function applyPayment(tx, record, amount) {
  const paid = record.paid_amount.plus(amount);
  return tx.taxRecord.update({
    where: { id: record.id },
    data: { paid_amount: paid, status: statusFor(record, paid) },
  });
}

// When dues are cleared, requests on tax hold for that parcel move on by themselves
async function releaseTaxHolds(parcelId, ip) {
  const holds = await prisma.transferRequest.findMany({
    where: { parcel_id: parcelId, status: 'tax_hold' },
    select: { id: true },
  });
  for (const h of holds) {
    try {
      await transfers.recheckTax(String(h.id), systemActor(ip));
    } catch (err) {
      // 409 means dues remain (partial payment): leave it on hold
      if (!err.status) console.error('Releasing tax hold failed:', err);
    }
  }
}

function canSee(txn, actor) {
  if (actor.role !== 'CITIZEN') return true;
  const owner = txn.tax_record.parcel.owner;
  return txn.payer_id === actor.id || (owner && owner.user_id === actor.id);
}

async function loadTxn(client, id) {
  const txn = await client.paymentTransaction.findUnique({
    where: { id },
    include: txnInclude,
  });
  if (!txn) throw fail(404, 'Payment not found');
  return txn;
}

// Payments still waiting after 15 minutes become Failed
async function expireStale() {
  const cutoff = new Date(Date.now() - TIMEOUT_MS);
  const stale = await prisma.paymentTransaction.findMany({
    where: { status: { in: ['initiated', 'pending'] }, created_at: { lt: cutoff } },
    select: { id: true, transaction_ref: true },
  });
  for (const p of stale) {
    const res = await prisma.paymentTransaction.updateMany({
      where: { id: p.id, status: { in: ['initiated', 'pending'] } },
      data: { status: 'failed' },
    });
    if (res.count) {
      await safeAudit({
        userId: null,
        action: 'PAYMENT_TIMED_OUT',
        entityType: 'payment_transaction',
        entityId: p.id,
        newValues: { transaction_ref: p.transaction_ref },
      });
    }
  }
  return stale.length;
}

// ---------- citizen: online payment ----------

async function initiate(data, actor) {
  await expireStale();
  const taxRecordId = toId((data || {}).tax_record_id);

  return prisma.$transaction(async (tx) => {
    const record = await tx.taxRecord.findUnique({
      where: { id: taxRecordId },
      include: { parcel: { include: { owner: true } } },
    });
    if (!record || !record.parcel.owner || record.parcel.owner.user_id !== actor.id) {
      throw fail(404, 'Tax record not found');
    }

    const owing = balance(record);
    if (!owing.gt(0)) throw fail(409, 'This tax record is already paid');

    const active = await tx.paymentTransaction.findFirst({
      where: { tax_record_id: record.id, status: { in: IN_PROGRESS } },
    });
    if (active) throw fail(409, 'A payment for this tax record is already in progress');

    const transaction_ref = `TB${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
    await tx.paymentTransaction.create({
      data: {
        transaction_ref,
        tax_record_id: record.id,
        payer_id: actor.id,
        amount: owing,
        method: 'telebirr',
        status: 'initiated',
      },
    });
    // The mock gateway accepts the request: Initiated -> Pending
    const txn = await tx.paymentTransaction.update({
      where: { transaction_ref },
      data: { status: 'pending' },
    });

    await audit.log(
      {
        userId: actor.id,
        action: 'PAYMENT_INITIATED',
        entityType: 'payment_transaction',
        entityId: txn.id,
        newValues: { transaction_ref, tax_record_id: record.id, amount: owing.toFixed(2) },
        ipAddress: actor.ip,
      },
      tx
    );
    return { ...txn, checkout_url: `mock-telebirr://pay/${transaction_ref}` };
  });
}

// ---------- the gateway's callback ----------

async function processWebhook(payload, ip) {
  const p = payload || {};

  if (!validSignature(p)) {
    await safeAudit({
      userId: null,
      action: 'PAYMENT_WEBHOOK_REJECTED',
      entityType: 'payment_transaction',
      newValues: { transaction_ref: str(p.transaction_ref).slice(0, 40), reason: 'invalid signature' },
      ipAddress: ip,
    });
    throw fail(401, 'Invalid signature');
  }

  const sentAt = Date.parse(p.timestamp);
  if (!Number.isFinite(sentAt) || Math.abs(Date.now() - sentAt) > TIMEOUT_MS) {
    throw fail(400, 'Stale or invalid timestamp');
  }
  if (p.status !== 'SUCCESS' && p.status !== 'FAILED') {
    throw fail(400, 'status must be SUCCESS or FAILED');
  }
  const ref = str(p.transaction_ref);

  const result = await prisma.$transaction(async (tx) => {
    const txn = await tx.paymentTransaction.findUnique({
      where: { transaction_ref: ref },
      include: { tax_record: true },
    });
    if (!txn) throw fail(404, 'Unknown transaction');

    // Replays of an already processed payment change nothing
    if (txn.status === 'completed') return { txn, already: true };
    if (txn.status !== 'pending') throw fail(409, `Transaction is ${txn.status}`);

    if (Date.now() - txn.created_at.getTime() > TIMEOUT_MS) {
      const timedOut = await tx.paymentTransaction.update({
        where: { id: txn.id },
        data: { status: 'failed' },
      });
      await audit.log(
        {
          userId: null,
          action: 'PAYMENT_TIMED_OUT',
          entityType: 'payment_transaction',
          entityId: txn.id,
          newValues: { transaction_ref: ref },
          ipAddress: ip,
        },
        tx
      );
      return { txn: timedOut };
    }

    // Callback received: Pending -> Processing
    const claimed = await tx.paymentTransaction.updateMany({
      where: { id: txn.id, status: 'pending' },
      data: {
        status: 'processing',
        webhook_payload: {
          transaction_ref: ref,
          amount: String(p.amount),
          status: p.status,
          timestamp: p.timestamp,
        },
      },
    });
    if (claimed.count === 0) throw fail(409, 'Transaction is already being processed');

    let amountOk = false;
    try {
      amountOk = new Prisma.Decimal(p.amount).equals(txn.amount);
    } catch (e) {
      amountOk = false;
    }

    if (p.status === 'FAILED' || !amountOk) {
      const failed = await tx.paymentTransaction.update({
        where: { id: txn.id },
        data: { status: 'failed' },
      });
      await audit.log(
        {
          userId: null,
          action: 'PAYMENT_FAILED',
          entityType: 'payment_transaction',
          entityId: txn.id,
          newValues: {
            transaction_ref: ref,
            reason:
              p.status === 'FAILED'
                ? 'gateway reported failure'
                : `amount mismatch: expected ${txn.amount.toString()}, received ${String(p.amount)}`,
          },
          ipAddress: ip,
        },
        tx
      );
      return { txn: failed };
    }

    await applyPayment(tx, txn.tax_record, txn.amount);
    const done = await tx.paymentTransaction.update({
      where: { id: txn.id },
      data: { status: 'completed' },
    });
    await audit.log(
      {
        userId: null,
        action: 'PAYMENT_COMPLETED',
        entityType: 'payment_transaction',
        entityId: txn.id,
        newValues: { transaction_ref: ref, amount: txn.amount.toString() },
        ipAddress: ip,
      },
      tx
    );
    return { txn: done, completed: true, parcel_id: txn.tax_record.parcel_id };
  });

  if (result.completed) await releaseTaxHolds(result.parcel_id, ip);

  const out = { received: true, status: result.txn.status };
  if (result.already) out.already_processed = true;
  return out;
}

// Development only: plays the role of the telebirr app on the citizen's phone
async function mockGateway(idParam, data, actor) {
  if (process.env.NODE_ENV === 'production') throw fail(404, 'Route not found');
  const id = toId(idParam);
  const body = data || {};

  const txn = await prisma.paymentTransaction.findUnique({ where: { id } });
  if (!txn || txn.payer_id !== actor.id) throw fail(404, 'Payment not found');
  if (txn.status !== 'pending') throw fail(409, `Transaction is ${txn.status}`);

  let amount = txn.amount.toFixed(2);
  if (body.amount !== undefined) {
    const a = Number(body.amount);
    if (!Number.isFinite(a)) throw fail(400, 'amount must be a number');
    amount = a.toFixed(2);
  }

  const payload = {
    transaction_ref: txn.transaction_ref,
    amount,
    status: str(body.outcome) === 'fail' ? 'FAILED' : 'SUCCESS',
    timestamp: new Date().toISOString(),
  };
  payload.signature = sign(payload);
  return processWebhook(payload, actor.ip);
}

// ---------- tax official: counter payments ----------

async function recordOffline(data, actor) {
  const body = data || {};
  const taxRecordId = toId(body.tax_record_id);
  const payer_name = str(body.payer_name);
  const amountNum = Number(body.amount);
  if (!payer_name) throw fail(400, 'payer_name is required');
  if (!Number.isFinite(amountNum) || amountNum <= 0) {
    throw fail(400, 'amount must be a positive number');
  }
  const amount = new Prisma.Decimal(amountNum).toDecimalPlaces(2);

  const txn = await prisma.$transaction(async (tx) => {
    const record = await tx.taxRecord.findUnique({ where: { id: taxRecordId } });
    if (!record) throw fail(404, 'Tax record not found');

    const owing = balance(record);
    if (!owing.gt(0)) throw fail(409, 'This tax record is already paid');
    if (amount.gt(owing)) {
      throw fail(400, `The amount is more than the outstanding balance of ${owing.toFixed(2)}`);
    }

    const created = await tx.paymentTransaction.create({
      data: {
        transaction_ref: `OFF${crypto.randomBytes(6).toString('hex').toUpperCase()}`,
        tax_record_id: record.id,
        payer_name,
        recorded_by_id: actor.id,
        amount,
        method: 'cash',
        status: 'completed',
      },
    });
    await applyPayment(tx, record, amount);
    await audit.log(
      {
        userId: actor.id,
        action: 'PAYMENT_RECORDED_OFFLINE',
        entityType: 'payment_transaction',
        entityId: created.id,
        newValues: { tax_record_id: record.id, amount: amount.toFixed(2), payer_name },
        ipAddress: actor.ip,
      },
      tx
    );
    return { created, parcel_id: record.parcel_id };
  });

  await releaseTaxHolds(txn.parcel_id, actor.ip);
  return txn.created;
}

// ---------- admin: refund ----------

async function refund(idParam, data, actor) {
  const id = toId(idParam);
  const reason = str((data || {}).reason);
  if (!reason) throw fail(400, 'reason is required');

  return prisma.$transaction(async (tx) => {
    const txn = await tx.paymentTransaction.findUnique({
      where: { id },
      include: { tax_record: true },
    });
    if (!txn) throw fail(404, 'Payment not found');

    const claimed = await tx.paymentTransaction.updateMany({
      where: { id, status: 'completed' },
      data: { status: 'refunded' },
    });
    if (claimed.count === 0) throw fail(409, 'Only completed payments can be refunded');

    let after = txn.tax_record.paid_amount.minus(txn.amount);
    if (after.lt(0)) after = new Prisma.Decimal(0);
    await tx.taxRecord.update({
      where: { id: txn.tax_record_id },
      data: { paid_amount: after, status: statusFor(txn.tax_record, after) },
    });

    await audit.log(
      {
        userId: actor.id,
        action: 'PAYMENT_REFUNDED',
        entityType: 'payment_transaction',
        entityId: id,
        newValues: { transaction_ref: txn.transaction_ref, reason },
        ipAddress: actor.ip,
      },
      tx
    );
    if (txn.method === 'telebirr') {
      console.log(`[MOCK TELEBIRR] reversal sent for ${txn.transaction_ref}`);
    }
    return tx.paymentTransaction.findUnique({ where: { id }, include: txnInclude });
  });
}

// ---------- reading ----------

async function getOne(idParam, actor) {
  await expireStale();
  const txn = await loadTxn(prisma, toId(idParam));
  if (!canSee(txn, actor)) throw fail(404, 'Payment not found');
  return txn;
}

async function listMine(actor) {
  await expireStale();
  const items = await prisma.paymentTransaction.findMany({
    where: {
      OR: [
        { payer_id: actor.id },
        { tax_record: { parcel: { owner: { user_id: actor.id } } } },
      ],
    },
    include: txnInclude,
    orderBy: { id: 'desc' },
  });
  return { total: items.length, items };
}

async function list(query) {
  await expireStale();
  const { page, limit, skip } = paging(query);
  const where = {};
  const status = str(query.status);
  if (status) {
    if (!ALL_STATUSES.includes(status)) throw fail(400, 'Unknown status');
    where.status = status;
  }
  const [total, items] = await Promise.all([
    prisma.paymentTransaction.count({ where }),
    prisma.paymentTransaction.findMany({
      where,
      include: txnInclude,
      orderBy: { id: 'desc' },
      skip,
      take: limit,
    }),
  ]);
  return { page, limit, total, items };
}

// ---------- receipts (FR-20) ----------

function renderReceipt(d) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A5', margin: 40 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.font('Helvetica-Bold').fontSize(14).fillColor('#1f3a5f');
    doc.text('Dire Dawa Land Administration', { align: 'center' });
    doc.font('Helvetica').fontSize(10).fillColor('#444');
    doc.text('Digital Land and Property Management System', { align: 'center' });
    doc.moveDown(1);
    doc.font('Helvetica-Bold').fontSize(15).fillColor('#000');
    doc.text('OFFICIAL TAX RECEIPT', { align: 'center' });
    doc.moveDown(1);

    const rows = [
      ['Receipt No', d.receipt_number],
      ['Date', d.date],
      ['Parcel', d.parcel_number],
      ['Tax year', d.tax_year],
      ['Paid by', d.payer],
      ['Method', d.method],
      ['Reference', d.reference],
      ['Amount paid', `${d.amount} ETB`],
    ];
    if (d.recorded_by) rows.push(['Received by', d.recorded_by]);

    let y = doc.y;
    rows.forEach(([label, value]) => {
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#333');
      doc.text(label, 40, y, { width: 100 });
      doc.font('Helvetica').fontSize(10).fillColor('#000');
      doc.text(String(value), 145, y, { width: 220 });
      y = doc.y + 6;
    });

    doc.fontSize(8).fillColor('#666');
    doc.text('Keep this receipt as proof of payment.', 40, 520, { align: 'center', width: 330 });
    doc.end();
  });
}

async function receipt(idParam, actor) {
  const id = toId(idParam);
  const txn = await prisma.paymentTransaction.findUnique({
    where: { id },
    include: { ...txnInclude, recorded_by: { select: { phone_number: true } } },
  });
  if (!txn || !canSee(txn, actor)) throw fail(404, 'Payment not found');
  if (txn.status !== 'completed') {
    throw fail(409, 'A receipt is only available for completed payments');
  }

  const receipt_number = `RCT-${txn.created_at.getFullYear()}-${String(txn.id).padStart(6, '0')}`;
  const owner = txn.tax_record.parcel.owner;
  const buffer = await renderReceipt({
    receipt_number,
    date: txn.updated_at.toISOString().slice(0, 10),
    parcel_number: txn.tax_record.parcel.parcel_number,
    tax_year: txn.tax_record.tax_year,
    payer: txn.payer_name || (owner ? owner.full_name : 'N/A'),
    method: txn.method === 'telebirr' ? 'telebirr mobile money' : 'Cash at the office',
    reference: txn.transaction_ref,
    amount: txn.amount.toFixed(2),
    recorded_by: txn.recorded_by ? txn.recorded_by.phone_number : null,
  });
  return { buffer, filename: `${receipt_number}.pdf` };
}

module.exports = {
  expireStale,
  initiate,
  processWebhook,
  mockGateway,
  recordOffline,
  refund,
  getOne,
  listMine,
  list,
  receipt,
};