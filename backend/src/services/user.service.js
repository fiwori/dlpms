const bcrypt = require('bcryptjs');
const prisma = require('../lib/prisma');
const audit = require('./audit.service');
const { fail, str, paging, toId } = require('../lib/util');

const STAFF_ROLES = ['LAND_OFFICER', 'TAX_OFFICIAL', 'GIS_OFFICER', 'SYSTEM_ADMIN'];
const ALL_ROLES = ['CITIZEN', ...STAFF_ROLES];

const publicSelect = {
  id: true,
  phone_number: true,
  email: true,
  role: true,
  is_active: true,
  is_phone_verified: true,
  created_at: true,
};

// FR-25: staff accounts are created by an administrator
async function createStaff(data, actor) {
  const body = data || {};
  const phone_number = str(body.phone_number);
  const email = str(body.email).toLowerCase();
  const password = typeof body.password === 'string' ? body.password : '';
  const role = str(body.role);

  if (!phone_number || !password) throw fail(400, 'phone_number and password are required');
  if (password.length < 8) throw fail(400, 'Password must be at least 8 characters');
  if (!STAFF_ROLES.includes(role)) throw fail(400, `role must be one of: ${STAFF_ROLES.join(', ')}`);

  const password_hash = await bcrypt.hash(password, 12);
  try {
    return await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { phone_number, email: email || null, password_hash, role },
        select: publicSelect,
      });
      await audit.log(
        {
          userId: actor.id,
          action: 'USER_CREATED',
          entityType: 'user',
          entityId: user.id,
          newValues: { phone_number, role },
          ipAddress: actor.ip,
        },
        tx
      );
      return user;
    });
  } catch (err) {
    if (err.code === 'P2002') throw fail(409, 'Phone number or email is already in use');
    throw err;
  }
}

async function list(query) {
  const { page, limit, skip } = paging(query);
  const where = {};
  const role = str(query.role);
  if (role) {
    if (!ALL_ROLES.includes(role)) throw fail(400, 'Unknown role');
    where.role = role;
  }
  const search = str(query.search);
  if (search) {
    where.OR = [
      { phone_number: { contains: search } },
      { email: { contains: search, mode: 'insensitive' } },
    ];
  }
  const [total, items] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({ where, select: publicSelect, orderBy: { id: 'asc' }, skip, take: limit }),
  ]);
  return { page, limit, total, items };
}

async function update(idParam, data, actor) {
  const id = toId(idParam);
  const body = data || {};
  const changes = {};
  if (body.role !== undefined) {
    if (!ALL_ROLES.includes(body.role)) throw fail(400, 'Unknown role');
    changes.role = body.role;
  }
  if (body.is_active !== undefined) {
    if (typeof body.is_active !== 'boolean') throw fail(400, 'is_active must be true or false');
    changes.is_active = body.is_active;
  }
  if (Object.keys(changes).length === 0) throw fail(400, 'Nothing to update');
  if (id === actor.id) throw fail(400, 'You cannot change your own role or status');

  return prisma.$transaction(async (tx) => {
    const old = await tx.user.findUnique({ where: { id }, select: publicSelect });
    if (!old) throw fail(404, 'User not found');
    const updated = await tx.user.update({ where: { id }, data: changes, select: publicSelect });

    const oldValues = {};
    Object.keys(changes).forEach((k) => {
      oldValues[k] = old[k];
    });
    await audit.log(
      {
        userId: actor.id,
        action: 'USER_UPDATED',
        entityType: 'user',
        entityId: id,
        oldValues,
        newValues: changes,
        ipAddress: actor.ip,
      },
      tx
    );
    return updated;
  });
}

async function resetPassword(idParam, data, actor) {
  const id = toId(idParam);
  const password = typeof (data || {}).password === 'string' ? data.password : '';
  if (password.length < 8) throw fail(400, 'Password must be at least 8 characters');
  const password_hash = await bcrypt.hash(password, 12);

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id }, select: { id: true } });
    if (!user) throw fail(404, 'User not found');
    await tx.user.update({ where: { id }, data: { password_hash } });
    await audit.log(
      {
        userId: actor.id,
        action: 'USER_PASSWORD_RESET',
        entityType: 'user',
        entityId: id,
        ipAddress: actor.ip,
      },
      tx
    );
    return { reset: true };
  });
}

module.exports = { createStaff, list, update, resetPassword };
