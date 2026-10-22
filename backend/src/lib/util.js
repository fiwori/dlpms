function fail(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

const str = (v) => (typeof v === 'string' ? v.trim() : '');

function paging(query) {
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 20, 1), 100);
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  return { page, limit, skip: (page - 1) * limit };
}

function toId(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) throw fail(400, 'Invalid id');
  return n;
}

module.exports = { fail, str, paging, toId };