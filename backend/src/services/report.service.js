const { Prisma } = require('@prisma/client');
const prisma = require('../lib/prisma');

const zero = () => new Prisma.Decimal(0);

async function summary() {
  const startOfToday = new Date();
  startOfToday.setUTCHours(0, 0, 0, 0);

  const [parcels, owners, users, transferGroups, taxTotals, payGroups, upcoming] = await Promise.all([
    prisma.landParcel.count(),
    prisma.owner.count(),
    prisma.user.count(),
    prisma.transferRequest.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.taxRecord.aggregate({ _sum: { tax_amount: true, paid_amount: true } }),
    prisma.paymentTransaction.groupBy({
      by: ['method'],
      where: { status: 'completed' },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.appointment.count({ where: { status: 'scheduled', scheduled_date: { gte: startOfToday } } }),
  ]);

  const transfers = {};
  transferGroups.forEach((g) => {
    transfers[g.status] = g._count._all;
  });
  const assessed = taxTotals._sum.tax_amount || zero();
  const collected = taxTotals._sum.paid_amount || zero();

  return {
    parcels,
    owners,
    users,
    transfers,
    tax: {
      assessed: assessed.toFixed(2),
      collected: collected.toFixed(2),
      outstanding: assessed.minus(collected).toFixed(2),
    },
    payments: payGroups.map((g) => ({
      method: g.method,
      count: g._count._all,
      total: (g._sum.amount || zero()).toFixed(2),
    })),
    upcoming_appointments: upcoming,
  };
}

function csvCell(v) {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@]/.test(s)) s = `'${s}`; // stops spreadsheet formula injection
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(headers, rows) {
  return [headers.join(','), ...rows.map((r) => r.map(csvCell).join(','))].join('\n') + '\n';
}

const iso = (d) => (d ? d.toISOString() : '');

async function transfersCsv() {
  const items = await prisma.transferRequest.findMany({
    include: {
      parcel: { select: { parcel_number: true } },
      seller: { select: { full_name: true } },
      buyer: { select: { full_name: true } },
    },
    orderBy: { id: 'asc' },
  });
  return toCsv(
    ['id', 'tracking_id', 'parcel', 'seller', 'buyer', 'status', 'sale_price', 'submitted_at', 'decided_at'],
    items.map((t) => [
      t.id,
      t.tracking_id,
      t.parcel.parcel_number,
      t.seller.full_name,
      t.buyer.full_name,
      t.status,
      t.sale_price ? t.sale_price.toString() : '',
      iso(t.submitted_at),
      iso(t.decided_at),
    ])
  );
}

async function paymentsCsv() {
  const items = await prisma.paymentTransaction.findMany({
    include: { tax_record: { include: { parcel: { select: { parcel_number: true } } } } },
    orderBy: { id: 'asc' },
  });
  return toCsv(
    ['id', 'reference', 'parcel', 'tax_year', 'amount', 'method', 'status', 'created_at'],
    items.map((p) => [
      p.id,
      p.transaction_ref,
      p.tax_record.parcel.parcel_number,
      p.tax_record.tax_year,
      p.amount.toString(),
      p.method,
      p.status,
      iso(p.created_at),
    ])
  );
}

module.exports = { summary, transfersCsv, paymentsCsv };
