const transfers = require('../services/transfer.service');

// Passes async errors to the Express error handler
const handle = (fn) => (req, res, next) => fn(req, res).catch(next);

const actor = (req) => ({ id: req.user.id, role: req.user.role, ip: req.ip });

exports.create = handle(async (req, res) => {
  res.status(201).json(await transfers.create(req.body, actor(req)));
});
exports.mine = handle(async (req, res) => {
  res.json(await transfers.listMine(actor(req)));
});
exports.list = handle(async (req, res) => {
  res.json(await transfers.list(req.query));
});
exports.getOne = handle(async (req, res) => {
  res.json(await transfers.getOne(req.params.id, actor(req)));
});
exports.addDocuments = handle(async (req, res) => {
  res.json(await transfers.addDocuments(req.params.id, req.body, actor(req)));
});
exports.submit = handle(async (req, res) => {
  res.json(await transfers.submit(req.params.id, actor(req)));
});
exports.recheckTax = handle(async (req, res) => {
  res.json(await transfers.recheckTax(req.params.id, actor(req)));
});
exports.cancel = handle(async (req, res) => {
  res.json(await transfers.cancel(req.params.id, req.body, actor(req)));
});
exports.assign = handle(async (req, res) => {
  res.json(await transfers.assign(req.params.id, req.body, actor(req)));
});
exports.requestDocuments = handle(async (req, res) => {
  res.json(await transfers.requestDocuments(req.params.id, req.body, actor(req)));
});
exports.approve = handle(async (req, res) => {
  res.json(await transfers.approve(req.params.id, req.body, actor(req)));
});
exports.reject = handle(async (req, res) => {
  res.json(await transfers.reject(req.params.id, req.body, actor(req)));
});