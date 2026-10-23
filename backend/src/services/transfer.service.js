const crypto = require('crypto');
const { Prisma } = require('@prisma/client');
const prisma = require('../lib/prisma');
const audit = require('./audit.service');
const { fail, str, paging, toId } = require('../lib/util');

const ACTIVE = [
  'draft',
  'submitted',
  'tax_verified',
  'tax_hold',
  'under_review',
  'docs_requested',
];

// Table 24 of the project document
const ALLOWED = {
  draft: ['submitted', 'cancelled'],
  submitted: ['tax_verified', 'tax_hold', 'cancelled'],
  tax_hold: ['submitted', 'cancelled'],
  tax_verified: ['under_review', 'cancelled'],
  under_review: ['docs_requested', 'approved', 'rejected', 'cancelled'],
  docs_requested: ['under_review', 'cancelled'],
  approved: [],
  rejected: [],
  cancelled: [],
};

const detailInclude = {
  parcel: {
    select: {
      id: true,
      parcel_number: true,
      kebele: true,
      area_sqm: true,
      current_owner_id: true,
    },
  },
  seller: { select: { id: true, user_id: true, full_name: true, national_id: true } },
  buyer: { select: { id: true, user_id: true, full_name: true, national_id: true } },
  assigned_officer: { select: { id: true, phone_number: true } },
};

// ---------- helpers ----------

function newTrackingId() {
  const n = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  return `TRF-${new Date().getFullYear()}-${n}`;
}

function normalizeDocuments(input) {
  if (input === undefined) return [];
  if (!Array.isArray(input) || input.length > 20) {
    throw fail(400, 'documents must be a list of at most 20 items');
  }
  return input.map((d) => {
    const name = str(d && d.name);
    if (!name) throw fail(400, 'Every document needs a name');
    return { name, type: str(d.type) || 'other', added_at: new Date().toISOString() };
  });
}

function requireVersion(data) {
  const v = Number((data || {}).version);
  if (!Number.isInteger(v)) {
    throw fail(400, 'version is required (send the version you loaded)');
  }
  return v;
}

// Automated tax check: any tax record with an unpaid balance blocks the transfer
async function outstandingTax(tx, parcelId) {
  const records = await tx.taxRecord.findMany({ where: { parcel_id: parcelId } });
  let total = new Prisma.Decimal(0);
  for (const r of records) {
    const owing = r.tax_amount.minus(r.paid_amount);
    if (owing.gt(0)) total = total.plus(owing);
  }
  return { hasDues: total.gt(0), total: total.toFixed(2) };
}

async function loadTransfer(tx, id) {
  const t = await tx.transferRequest.findUnique({ where: { id }, include: detailInclude });
  if (!t) throw fail(404, 'Transfer request not found');
  return t;
}

const isRelated = (t, actor) =>
  t.created_by_id === actor.id ||
  (t.seller && t.seller.user_id === actor.id) ||
  (t.buyer && t.buyer.user_id === actor.id);

function assertVisible(t, actor) {
  if (actor.role === 'CITIZEN' && !isRelated(t, actor)) {
    throw fail(404, 'Transfer request not found');
  }
}

function assertCreator(t, actor) {
  if (t.created_by_id !== actor.id) throw fail(404, 'Transfer request not found');
}

function assertCanReview(t, actor) {
  if (actor.role === 'SYSTEM_ADMIN') return;
  if (t.assigned_officer_id !== actor.id) {
    throw fail(403, 'This request is assigned to another officer');
  }
}

// The only place where the status changes. Enforces Table 24 and writes the audit entry.
async function moveTo(tx, transfer, to, actor, opts = {}) {
  if (!ALLOWED[transfer.status].includes(to)) {
    throw fail(409, `A request cannot move from ${transfer.status} to ${to}`);
  }

  const where = { id: transfer.id, status: transfer.status };
  if (opts.version !== undefined) where.version = opts.version;

  const result = await tx.transferRequest.updateMany({
    where,
    data: { status: to, version: { increment: 1 }, ...(opts.data || {}) },
  });
  if (result.count === 0) {
    throw fail(409, 'This request was changed by someone else. Reload it and try again.');
  }

  const newValues = { status: to };
  if (opts.reason) newValues.reason = opts.reason;
  await audit.log(
    {
      userId: actor.id ?? null,
      action: `TRANSFER_${to.toUpperCase()}`,
      entityType: 'transfer_request',
      entityId: transfer.id,
      oldValues: { status: transfer.status },
      newValues,
      ipAddress: actor.ip,
    },
    tx
  );

  return tx.transferRequest.findUnique({ where: { id: transfer.id }, include: detailInclude });
}

async function runTaxCheck(tx, transfer, actor) {
  const { hasDues, total } = await outstandingTax(tx, transfer.parcel_id);
  if (hasDues) {
    return moveTo(tx, transfer, 'tax_hold', actor, { reason: `Outstanding tax: ${total}` });
  }
  return moveTo(tx, transfer, 'tax_verified', actor, { reason: 'No outstanding tax' });
}

// ---------- citizen actions ----------

async function create(data, actor) {
  const body = data || {};
  const parcel_id = toId(body.parcel_id);
  const buyerNid = str(body.buyer_national_id);
  if (!buyerNid) throw fail(400, 'buyer_national_id is required');

  let sale_price = null;
  if (body.sale_price !== undefined && body.sale_price !== null && body.sale_price !== '') {
    sale_price = Number(body.sale_price);
    if (!Number.isFinite(sale_price) || sale_price <= 0) {
      throw fail(400, 'sale_price must be a positive number');
    }
  }
  const documents = normalizeDocuments(body.documents);

  for (let attempt = 0; ; attempt += 1) {
    try {
      return await prisma.$transaction(async (tx) => {
        const me = await tx.owner.findUnique({ where: { user_id: actor.id } });
        if (!me) throw fail(403, 'No owner profile is linked to your account');

        const parcel = await tx.landParcel.findUnique({ where: { id: parcel_id } });
        if (!parcel || parcel.current_owner_id !== me.id) {
          throw fail(404, 'Parcel not found');
        }

        const buyer = await tx.owner.findUnique({ where: { national_id: buyerNid } });
        if (!buyer) throw fail(404, 'Buyer not found. The buyer must be registered first.');
        if (buyer.id === me.id) {
          throw fail(400, 'Buyer and seller cannot be the same person');
        }

        const active = await tx.transferRequest.findFirst({
          where: { parcel_id, status: { in: ACTIVE } },
        });
        if (active) throw fail(409, 'This parcel already has an active transfer request');

        const transfer = await tx.transferRequest.create({
          data: {
            tracking_id: newTrackingId(),
            parcel_id,
            seller_id: me.id,
            buyer_id: buyer.id,
            created_by_id: actor.id,
            sale_price,
            documents,
          },
          include: detailInclude,
        });

        await audit.log(
          {
            userId: actor.id,
            action: 'TRANSFER_CREATED',
            entityType: 'transfer_request',
            entityId: transfer.id,
            newValues: {
              tracking_id: transfer.tracking_id,
              parcel_id,
              seller_id: me.id,
              buyer_id: buyer.id,
            },
            ipAddress: actor.ip,
          },
          tx
        );
        return transfer;
      });
    } catch (err) {
      // Extremely unlikely tracking id collision: try again with a new id
      if (err.code === 'P2002' && attempt < 2) continue;
      throw err;
    }
  }
}

async function addDocuments(idParam, data, actor) {
  const id = toId(idParam);
  const docs = normalizeDocuments((data || {}).documents);
  if (docs.length === 0) throw fail(400, 'documents must contain at least one item');

  return prisma.$transaction(async (tx) => {
    const t = await loadTransfer(tx, id);
    assertCreator(t, actor);
    if (!['draft', 'docs_requested'].includes(t.status)) {
      throw fail(409, 'Documents can only be added to a draft or after more were requested');
    }

    const existing = Array.isArray(t.documents) ? t.documents : [];
    const merged = [...existing, ...docs];
    if (merged.length > 40) throw fail(400, 'Too many documents on this request');

    // Documents Requested -> Under Review: review resumes
    if (t.status === 'docs_requested') {
      return moveTo(tx, t, 'under_review', actor, {
        data: { documents: merged },
        reason: 'Additional documents uploaded',
      });
    }

    const result = await tx.transferRequest.updateMany({
      where: { id, status: 'draft' },
      data: { documents: merged, version: { increment: 1 } },
    });
    if (result.count === 0) {
      throw fail(409, 'This request was changed by someone else. Reload it and try again.');
    }
    await audit.log(
      {
        userId: actor.id,
        action: 'TRANSFER_DOCUMENTS_ADDED',
        entityType: 'transfer_request',
        entityId: id,
        newValues: { added: docs.map((d) => d.name) },
        ipAddress: actor.ip,
      },
      tx
    );
    return tx.transferRequest.findUnique({ where: { id }, include: detailInclude });
  });
}

async function submit(idParam, actor) {
  const id = toId(idParam);
  return prisma.$transaction(async (tx) => {
    const t = await loadTransfer(tx, id);
    assertCreator(t, actor);
    if (t.status !== 'draft') throw fail(409, 'Only a draft can be submitted');

    const docs = Array.isArray(t.documents) ? t.documents : [];
    if (docs.length === 0) {
      throw fail(400, 'Add at least one supporting document before submitting');
    }

    const submitted = await moveTo(tx, t, 'submitted', actor, {
      data: { submitted_at: new Date() },
    });
    return runTaxCheck(tx, submitted, actor); // automated tax check
  });
}

async function cancel(idParam, data, actor) {
  const id = toId(idParam);
  const reason = str((data || {}).reason);
  return prisma.$transaction(async (tx) => {
    const t = await loadTransfer(tx, id);
    if (actor.role !== 'SYSTEM_ADMIN') assertCreator(t, actor);
    return moveTo(tx, t, 'cancelled', actor, { reason: reason || 'Cancelled' });
  });
}

// Tax Hold -> Submitted -> Tax Verified, once the dues are paid
async function recheckTax(idParam, actor) {
  const id = toId(idParam);
  return prisma.$transaction(async (tx) => {
    const t = await loadTransfer(tx, id);
    assertVisible(t, actor);
    if (t.status !== 'tax_hold') {
      throw fail(409, 'Tax can only be re-checked for requests on tax hold');
    }

    const { hasDues, total } = await outstandingTax(tx, t.parcel_id);
    if (hasDues) {
      throw fail(409, `Outstanding tax of ${total} must be paid before the request can continue`);
    }

    const submitted = await moveTo(tx, t, 'submitted', actor, {
      reason: 'Tax paid; re-running the tax check',
    });
    return runTaxCheck(tx, submitted, actor);
  });
}

// ---------- reading ----------

async function listMine(actor) {
  const items = await prisma.transferRequest.findMany({
    where: {
      OR: [
        { created_by_id: actor.id },
        { seller: { user_id: actor.id } },
        { buyer: { user_id: actor.id } },
      ],
    },
    include: detailInclude,
    orderBy: { id: 'desc' },
  });
  return { total: items.length, items };
}

async function list(query) {
  const { page, limit, skip } = paging(query);
  const where = {};
  const status = str(query.status);
  if (status) {
    if (!Object.keys(ALLOWED).includes(status)) throw fail(400, 'Unknown status');
    where.status = status;
  }

  const [total, items] = await Promise.all([
    prisma.transferRequest.count({ where }),
    prisma.transferRequest.findMany({
      where,
      include: detailInclude,
      orderBy: { id: 'desc' },
      skip,
      take: limit,
    }),
  ]);
  return { page, limit, total, items };
}

async function getOne(idParam, actor) {
  const id = toId(idParam);
  const t = await loadTransfer(prisma, id);
  assertVisible(t, actor);

  const history = await prisma.auditLog.findMany({
    where: { entity_type: 'transfer_request', entity_id: String(id) },
    orderBy: { id: 'asc' },
    select: { action: true, user_id: true, new_values: true, created_at: true },
  });
  return { ...t, history };
}

// ---------- officer actions ----------

async function assign(idParam, data, actor) {
  const id = toId(idParam);
  const body = data || {};
  return prisma.$transaction(async (tx) => {
    const t = await loadTransfer(tx, id);

    let officerId = actor.id;
    if (actor.role === 'SYSTEM_ADMIN') {
      if (body.officer_id === undefined) throw fail(400, 'officer_id is required for admins');
      officerId = toId(body.officer_id);
      const officer = await tx.user.findUnique({ where: { id: officerId } });
      if (!officer || officer.role !== 'LAND_OFFICER' || !officer.is_active) {
        throw fail(400, 'officer_id must be an active land officer');
      }
    }

    if (t.status !== 'tax_verified') {
      throw fail(409, 'Only requests with verified tax can be taken for review');
    }
    return moveTo(tx, t, 'under_review', actor, {
      data: { assigned_officer_id: officerId },
      reason: `Assigned to user ${officerId}`,
    });
  });
}

async function requestDocuments(idParam, data, actor) {
  const id = toId(idParam);
  const note = str((data || {}).note);
  if (!note) throw fail(400, 'note is required: tell the citizen what is missing');

  return prisma.$transaction(async (tx) => {
    const t = await loadTransfer(tx, id);
    assertCanReview(t, actor);
    return moveTo(tx, t, 'docs_requested', actor, {
      data: { officer_notes: note },
      reason: note,
    });
  });
}

async function reject(idParam, data, actor) {
  const id = toId(idParam);
  const reason = str((data || {}).reason);
  if (!reason) throw fail(400, 'reason is required');
  const version = requireVersion(data);

  return prisma.$transaction(async (tx) => {
    const t = await loadTransfer(tx, id);
    assertCanReview(t, actor);
    return moveTo(tx, t, 'rejected', actor, {
      version,
      reason,
      data: { rejection_reason: reason, decided_at: new Date() },
    });
  });
}

// Everything below succeeds together or not at all (section 4.8.2)
async function approve(idParam, data, actor) {
  const id = toId(idParam);
  const version = requireVersion(data);

  return prisma.$transaction(async (tx) => {
    const t = await loadTransfer(tx, id);
    assertCanReview(t, actor);
    if (t.status !== 'under_review') {
      throw fail(409, 'Only a request under review can be approved');
    }

    // 1. The seller must still be the registered owner
    const parcel = await tx.landParcel.findUnique({ where: { id: t.parcel_id } });
    if (!parcel || parcel.current_owner_id !== t.seller_id) {
      throw fail(409, 'The seller is no longer the registered owner of this parcel');
    }

    // 2. Tax must be cleared
    const { hasDues, total } = await outstandingTax(tx, t.parcel_id);
    if (hasDues) throw fail(409, `Cannot approve: outstanding tax of ${total}`);

    // 3. Change the parcel owner (optimistic lock on the parcel)
    const updated = await tx.landParcel.updateMany({
      where: { id: parcel.id, version: parcel.version },
      data: { current_owner_id: t.buyer_id, version: { increment: 1 } },
    });
    if (updated.count === 0) {
      throw fail(409, 'The parcel was changed by someone else. Reload and try again.');
    }

    // 4. Registry entry with a certificate number
    const entry = await tx.registryEntry.create({
      data: {
        parcel_id: parcel.id,
        from_owner_id: t.seller_id,
        to_owner_id: t.buyer_id,
        transfer_id: t.id,
      },
    });
    const certificate_number = `CERT-${new Date().getFullYear()}-${String(entry.id).padStart(6, '0')}`;
    await tx.registryEntry.update({ where: { id: entry.id }, data: { certificate_number } });

    // 5. Final status (also checks the version the officer loaded) + audit
    const approved = await moveTo(tx, t, 'approved', actor, {
      version,
      reason: `Certificate ${certificate_number}`,
      data: { decided_at: new Date() },
    });
    await audit.log(
      {
        userId: actor.id,
        action: 'PARCEL_OWNERSHIP_CHANGED',
        entityType: 'land_parcel',
        entityId: parcel.id,
        oldValues: { owner_id: t.seller_id },
        newValues: { owner_id: t.buyer_id, transfer_id: t.id, certificate_number },
        ipAddress: actor.ip,
      },
      tx
    );

    return { ...approved, certificate_number };
  });
}

module.exports = {
  create,
  addDocuments,
  submit,
  cancel,
  recheckTax,
  listMine,
  list,
  getOne,
  assign,
  requestDocuments,
  reject,
  approve,
};