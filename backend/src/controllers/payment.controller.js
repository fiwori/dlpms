const payments = require('../services/payment.service');

// Passes async errors to the Express error handler
const handle = (fn) => (req, res, next) => fn(req, res).catch(next);

const actor = (req) => ({ id: req.user.id, role: req.user.role, ip: req.ip });

exports.initiate = handle(async (req, res) => {
  res.status(201).json(await payments.initiate(req.body, actor(req)));
});
exports.webhook = handle(async (req, res) => {
  res.json(await payments.processWebhook(req.body, req.ip));
});
exports.mockGateway = handle(async (req, res) => {
  res.json(await payments.mockGateway(req.params.id, req.body, actor(req)));
});
exports.offline = handle(async (req, res) => {
  res.status(201).json(await payments.recordOffline(req.body, actor(req)));
});
exports.refund = handle(async (req, res) => {
  res.json(await payments.refund(req.params.id, req.body, actor(req)));
});
exports.getOne = handle(async (req, res) => {
  res.json(await payments.getOne(req.params.id, actor(req)));
});
exports.mine = handle(async (req, res) => {
  res.json(await payments.listMine(actor(req)));
});
exports.list = handle(async (req, res) => {
  res.json(await payments.list(req.query));
});
exports.receipt = handle(async (req, res) => {
  const out = await payments.receipt(req.params.id, actor(req));
  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `inline; filename="${out.filename}"`,
    'Cache-Control': 'no-store',
  });
  res.send(out.buffer);
});