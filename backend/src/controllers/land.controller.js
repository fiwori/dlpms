const land = require('../services/land.service');

// Passes async errors to the Express error handler
const handle = (fn) => (req, res, next) => fn(req, res).catch(next);

const actor = (req) => ({ id: req.user.id, role: req.user.role, ip: req.ip });

exports.createOwner = handle(async (req, res) => {
  res.status(201).json(await land.createOwner(req.body, actor(req)));
});

exports.listOwners = handle(async (req, res) => {
  res.json(await land.listOwners(req.query));
});

exports.getOwner = handle(async (req, res) => {
  res.json(await land.getOwner(req.params.id));
});

exports.createParcel = handle(async (req, res) => {
  res.status(201).json(await land.createParcel(req.body, actor(req)));
});

exports.listParcels = handle(async (req, res) => {
  res.json(await land.listParcels(req.query));
});

exports.myParcels = handle(async (req, res) => {
  res.json(await land.listMyParcels(req.user.id));
});

exports.getParcel = handle(async (req, res) => {
  res.json(await land.getParcel(req.params.id, actor(req)));
});

exports.updateParcel = handle(async (req, res) => {
  res.json(await land.updateParcel(req.params.id, req.body, actor(req)));
});