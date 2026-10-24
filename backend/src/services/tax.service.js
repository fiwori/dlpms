const { Prisma } = require('@prisma/client');
const prisma = require('../lib/prisma');
const audit = require('./audit.service');
const { fail, str, paging, toId } = require('../lib/util');

function balance(record) {
  const owing = record.tax_amount.minus(record.paid_amount);
  return owing.gt(0) ? owing : new Prisma.Decimal(0);
}

const withBalance = (record) => ({ ...record, balance: balance(record).toFixed(2) });

const recordInclude = {
  parcel: {
    select: {
      id: true,
      parcel_number: true,
      kebele: true,
      land_use: true,
      area_sqm: true,
    },
  },
};

// A kebele-specific rate wins over the general rate for that land use
async function findRate(client, landUse, kebele) {
  const base = { land_use: { equals: landUse, mode: 'insensitive' }, is_active: true };
  const specific = await client.taxRate.findFirst({
    where: { ...base, kebele: { equals: kebele, mode: 'insensitive' } },
  });
  if (specific) return specific;
  return client.taxRate.findFirst({ where: { ...base, kebele: null } });
}

async function createRecord(data, actor) {
  const body = data || {};
  const parcel_id = toId(body.parcel_id);
  const tax_year = Number(body.tax_year);
  if (!Number.isInteger(tax_year) || tax_year < 2000 || tax_year > 2100) {
    throw fail(400, 'tax_year must be a year between 2000 and 2100');
  }

  let due_date = new Date(Date.UTC(tax_year, 11, 31));
  if (body.due_date) {
    due_date = new Date(body.due_date);
    if (Number.isNaN(due_date.getTime())) throw fail(400, 'due_date is not a valid date');
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const parcel = await tx.landParcel.findUnique({ where: { id: parcel_id } });
      if (!parcel) throw fail(404, 'Parcel not found');

      const rate = await findRate(tx, parcel.land_use, parcel.kebele);
      if (!rate) {
        throw fail(409, `No tax rate is configured for land use "${parcel.land_use}"`);
      }

      const tax_amount = parcel.area_sqm.times(rate.rate_per_sqm).toDecimalPlaces(2);
      if (!tax_amount.gt(0)) {
        throw fail(409, 'The calculated tax is zero. Check the tax rate and the parcel area.');
      }

      const record = await tx.taxRecord.create({
        data: { parcel_id, tax_year, tax_amount, due_date },
        include: recordInclude,
      });
      await audit.log(
        {
          userId: actor.id,
          action: 'TAX_RECORD_CREATED',
          entityType: 'tax_record',
          entityId: record.id,
          newValues: {
            parcel_id,
            tax_year,
            tax_amount: tax_amount.toFixed(2),
            rate_per_sqm: rate.rate_per_sqm.toString(),
          },
          ipAddress: actor.ip,
        },
        tx
      );
      return withBalance(record);
    });
  } catch (err) {
    if (err.code === 'P2002') {
      throw fail(409, 'A tax record for this parcel and year already exists');
    }
    throw err;
  }
}

async function listRecords(query) {
  const { page, limit, skip } = paging(query);
  const where = {};
  if (query.parcel_id) where.parcel_id = toId(query.parcel_id);
  const status = str(query.status);
  if (status) {
    if (!['unpaid', 'partial', 'paid'].includes(status)) throw fail(400, 'Unknown status');
    where.status = status;
  }

  const [total, items] = await Promise.all([
    prisma.taxRecord.count({ where }),
    prisma.taxRecord.findMany({
      where,
      include: recordInclude,
      orderBy: { id: 'desc' },
      skip,
      take: limit,
    }),
  ]);
  return { page, limit, total, items: items.map(withBalance) };
}

async function listMine(actor) {
  const items = await prisma.taxRecord.findMany({
    where: { parcel: { owner: { user_id: actor.id } } },
    include: recordInclude,
    orderBy: { id: 'desc' },
  });
  return { total: items.length, items: items.map(withBalance) };
}

async function setRate(data, actor) {
  const body = data || {};
  const land_use = str(body.land_use);
  const kebele = str(body.kebele) || null;
  const rate = Number(body.rate_per_sqm);
  if (!land_use) throw fail(400, 'land_use is required');
  if (!Number.isFinite(rate) || rate <= 0) {
    throw fail(400, 'rate_per_sqm must be a positive number');
  }

  return prisma.$transaction(async (tx) => {
    const existing = await tx.taxRate.findFirst({
      where: {
        land_use: { equals: land_use, mode: 'insensitive' },
        kebele: kebele ? { equals: kebele, mode: 'insensitive' } : null,
      },
    });
    const saved = existing
      ? await tx.taxRate.update({
          where: { id: existing.id },
          data: { rate_per_sqm: rate, is_active: true },
        })
      : await tx.taxRate.create({ data: { land_use, kebele, rate_per_sqm: rate } });

    await audit.log(
      {
        userId: actor.id,
        action: 'TAX_RATE_SET',
        entityType: 'tax_rate',
        entityId: saved.id,
        oldValues: existing ? { rate_per_sqm: existing.rate_per_sqm.toString() } : undefined,
        newValues: { land_use, kebele, rate_per_sqm: rate },
        ipAddress: actor.ip,
      },
      tx
    );
    return saved;
  });
}

async function listRates() {
  const items = await prisma.taxRate.findMany({
    orderBy: [{ land_use: 'asc' }, { kebele: 'asc' }],
  });
  return { total: items.length, items };
}

module.exports = { balance, createRecord, listRecords, listMine, setRate, listRates };