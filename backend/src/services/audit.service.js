const crypto = require('crypto');
const prisma = require('../lib/prisma');

const GENESIS_HASH = '0'.repeat(64);

function computeHash(prevHash, createdAt, userId, action) {
  return crypto
    .createHash('sha256')
    .update(`${prevHash}|${createdAt.toISOString()}|${userId ?? ''}|${action}`)
    .digest('hex');
}

// "client" is either the normal prisma client or a transaction client
async function writeEntry(client, entry) {
  // Serialize writers so the chain never forks (lock is released at commit)
  await client.$executeRawUnsafe('SELECT pg_advisory_xact_lock(726001)');

  const last = await client.auditLog.findFirst({
    orderBy: { id: 'desc' },
    select: { hash_chain: true },
  });
  const prevHash = last ? last.hash_chain : GENESIS_HASH;

  const created_at = new Date();
  const userId = entry.userId ?? null;
  const hash_chain = computeHash(prevHash, created_at, userId, entry.action);

  return client.auditLog.create({
    data: {
      user_id: userId,
      action: entry.action,
      entity_type: entry.entityType,
      entity_id: entry.entityId != null ? String(entry.entityId) : null,
      old_values: entry.oldValues ?? undefined,
      new_values: entry.newValues ?? undefined,
      ip_address: entry.ipAddress ?? null,
      hash_chain,
      created_at,
    },
  });
}

// log(entry)      -> runs in its own transaction
// log(entry, tx)  -> joins the caller's transaction
async function log(entry, tx) {
  if (tx) return writeEntry(tx, entry);
  return prisma.$transaction((t) => writeEntry(t, entry));
}

// Recomputes the whole chain and reports the first broken entry, if any
async function verifyChain() {
  const PAGE = 1000;
  let prevHash = GENESIS_HASH;
  let checked = 0;
  let cursor = 0;

  for (;;) {
    const rows = await prisma.auditLog.findMany({
      where: { id: { gt: cursor } },
      orderBy: { id: 'asc' },
      take: PAGE,
    });
    if (rows.length === 0) break;

    for (const row of rows) {
      const expected = computeHash(prevHash, row.created_at, row.user_id, row.action);
      if (expected !== row.hash_chain) {
        return { valid: false, checked, broken_at_id: row.id };
      }
      prevHash = row.hash_chain;
      checked += 1;
      cursor = row.id;
    }
  }
  return { valid: true, checked };
}

async function list(query = {}) {
  const take = Math.min(Math.max(parseInt(query.limit, 10) || 20, 1), 100);
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const [total, items] = await Promise.all([
    prisma.auditLog.count(),
    prisma.auditLog.findMany({
      orderBy: { id: 'desc' },
      skip: (page - 1) * take,
      take,
    }),
  ]);
  return { page, limit: take, total, items };
}

module.exports = { log, verifyChain, list };