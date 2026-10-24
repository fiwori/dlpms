const prisma = require('../lib/prisma');
const audit = require('./audit.service');
const { notify } = require('./notification.service');
const { fail, str, toId } = require('../lib/util');

// Office hours: Monday to Friday, lunch break 12:00-14:00
const SLOTS = ['09:00', '10:00', '11:00', '14:00', '15:00', '16:00'];
const DAY_MS = 24 * 60 * 60 * 1000;

function parseDate(value) {
  const s = String(value || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw fail(400, 'date must look like 2026-11-05');
  const d = new Date(`${s}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) throw fail(400, 'Invalid date');
  const day = d.getUTCDay();
  if (day === 0 || day === 6) throw fail(400, 'Appointments are available Monday to Friday only');
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  if (d < today) throw fail(400, 'The date is in the past');
  if (d - today > 30 * DAY_MS) throw fail(400, 'Appointments can be booked up to 30 days ahead');
  return { s, d };
}

async function availability(dateParam) {
  const { s, d } = parseDate(dateParam);
  const officers = await prisma.user.count({ where: { role: 'LAND_OFFICER', is_active: true } });
  const booked = await prisma.appointment.groupBy({
    by: ['time_slot'],
    where: { scheduled_date: d },
    _count: { _all: true },
  });
  const taken = {};
  booked.forEach((b) => {
    taken[b.time_slot] = b._count._all;
  });
  return {
    date: s,
    slots: SLOTS.map((time) => ({ time, free: Math.max(officers - (taken[time] || 0), 0) })),
  };
}

// FR-08 / FR-36: the database's unique key (officer, date, slot) makes double booking impossible
async function book(data, actor) {
  const body = data || {};
  const { s, d } = parseDate(body.date);
  const time_slot = str(body.time_slot);
  if (!SLOTS.includes(time_slot)) throw fail(400, 'Unknown time slot');
  const purpose = str(body.purpose) || null;

  const mine = await prisma.appointment.findFirst({
    where: { citizen_id: actor.id, scheduled_date: d, time_slot },
  });
  if (mine) throw fail(409, 'You already have an appointment at this time');

  const officers = await prisma.user.findMany({
    where: { role: 'LAND_OFFICER', is_active: true },
    select: { id: true },
    orderBy: { id: 'asc' },
  });
  if (officers.length === 0) throw fail(409, 'No officers are available');

  for (const officer of officers) {
    try {
      const appointment = await prisma.$transaction(async (tx) => {
        const created = await tx.appointment.create({
          data: { citizen_id: actor.id, officer_id: officer.id, scheduled_date: d, time_slot, purpose },
        });
        await audit.log(
          {
            userId: actor.id,
            action: 'APPOINTMENT_BOOKED',
            entityType: 'appointment',
            entityId: created.id,
            newValues: { date: s, time_slot, officer_id: officer.id },
            ipAddress: actor.ip,
          },
          tx
        );
        return created;
      });

      const user = await prisma.user.findUnique({
        where: { id: actor.id },
        select: { phone_number: true, email: true },
      });
      notify({
        phone: user.phone_number,
        email: user.email,
        subject: 'Appointment confirmed',
        message: `Your land office appointment is booked for ${s} at ${time_slot}.`,
      });
      return appointment;
    } catch (err) {
      if (err.code === 'P2002') continue; // this officer is busy at that time: try the next one
      throw err;
    }
  }
  throw fail(409, 'This time slot is fully booked');
}

async function listMine(actor) {
  const items = await prisma.appointment.findMany({
    where: { citizen_id: actor.id },
    orderBy: [{ scheduled_date: 'desc' }, { time_slot: 'asc' }],
  });
  return { total: items.length, items };
}

// Cancelling frees the slot (the row is removed; the audit log keeps the history)
async function cancel(idParam, actor) {
  const id = toId(idParam);
  return prisma.$transaction(async (tx) => {
    const a = await tx.appointment.findUnique({ where: { id } });
    if (!a || a.citizen_id !== actor.id) throw fail(404, 'Appointment not found');
    if (a.status !== 'scheduled') throw fail(409, 'Only a scheduled appointment can be cancelled');
    await tx.appointment.delete({ where: { id } });
    await audit.log(
      {
        userId: actor.id,
        action: 'APPOINTMENT_CANCELLED',
        entityType: 'appointment',
        entityId: id,
        oldValues: { date: a.scheduled_date.toISOString().slice(0, 10), time_slot: a.time_slot },
        ipAddress: actor.ip,
      },
      tx
    );
    return { cancelled: true };
  });
}

async function listForStaff(actor, query) {
  const where = {};
  if (actor.role === 'LAND_OFFICER') where.officer_id = actor.id;
  if (query.date) where.scheduled_date = parseDateLoose(query.date);
  const items = await prisma.appointment.findMany({
    where,
    include: {
      citizen: {
        select: { phone_number: true, owner: { select: { full_name: true } } },
      },
    },
    orderBy: [{ scheduled_date: 'asc' }, { time_slot: 'asc' }],
    take: 200,
  });
  return { total: items.length, items };
}

function parseDateLoose(value) {
  const s = String(value || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw fail(400, 'date must look like 2026-11-05');
  return new Date(`${s}T00:00:00.000Z`);
}

async function setStatus(idParam, data, actor) {
  const id = toId(idParam);
  const status = str((data || {}).status);
  if (!['completed', 'no_show'].includes(status)) {
    throw fail(400, 'status must be completed or no_show');
  }
  return prisma.$transaction(async (tx) => {
    const a = await tx.appointment.findUnique({ where: { id } });
    if (!a) throw fail(404, 'Appointment not found');
    if (actor.role === 'LAND_OFFICER' && a.officer_id !== actor.id) {
      throw fail(403, 'This appointment belongs to another officer');
    }
    if (a.status !== 'scheduled') throw fail(409, 'This appointment is already closed');
    const updated = await tx.appointment.update({ where: { id }, data: { status } });
    await audit.log(
      {
        userId: actor.id,
        action: `APPOINTMENT_${status.toUpperCase()}`,
        entityType: 'appointment',
        entityId: id,
        ipAddress: actor.ip,
      },
      tx
    );
    return updated;
  });
}

// Run every hour: reminds citizens about appointments in the next 24 hours
async function sendReminders() {
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const to = new Date(from.getTime() + 2 * DAY_MS);
  const due = await prisma.appointment.findMany({
    where: { status: 'scheduled', reminder_sent: false, scheduled_date: { gte: from, lt: to } },
    include: { citizen: { select: { phone_number: true, email: true } } },
  });

  let sent = 0;
  for (const a of due) {
    const day = a.scheduled_date.toISOString().slice(0, 10);
    const diff = new Date(`${day}T${a.time_slot}:00`) - now;
    if (diff > 0 && diff <= DAY_MS) {
      notify({
        phone: a.citizen.phone_number,
        email: a.citizen.email,
        subject: 'Appointment reminder',
        message: `Reminder: your land office appointment is on ${day} at ${a.time_slot}.`,
      });
      await prisma.appointment.update({ where: { id: a.id }, data: { reminder_sent: true } });
      sent += 1;
    }
  }
  return sent;
}

module.exports = { availability, book, listMine, cancel, listForStaff, setStatus, sendReminders };
