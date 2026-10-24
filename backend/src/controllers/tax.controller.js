const tax = require('../services/tax.service');

// Passes async errors to the Express error handler
const handle = (fn) => (req, res, next) => fn(req, res).catch(next);

const actor = (req) => ({ id: req.user.id, role: req.user.role, ip: req.ip });

exports.createRecord = handle(async (req, res) => {
  res.status(201).json(await tax.createRecord(req.body, actor(req)));
});
exports.listRecords = handle(async (req, res) => {
  res.json(await tax.listRecords(req.query));
});
exports.mine = handle(async (req, res) => {
  res.json(await tax.listMine(actor(req)));
});
exports.setRate = handle(async (req, res) => {
  res.json(await tax.setRate(req.body, actor(req)));
});
exports.listRates = handle(async (req, res) => {
  res.json(await tax.listRates());
});