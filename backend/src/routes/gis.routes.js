const router = require('express').Router();
const gis = require('../services/gis.service');
const { authenticate, authorize } = require('../middleware/auth');

const wrap = (fn) => (req, res, next) => fn(req, res).catch(next);
const actor = (req) => ({ id: req.user.id, role: req.user.role, ip: req.ip });
const READERS = ['LAND_OFFICER', 'TAX_OFFICIAL', 'GIS_OFFICER', 'SYSTEM_ADMIN'];

router.get(
  '/parcels',
  authenticate,
  authorize(...READERS),
  wrap(async (req, res) => res.json(await gis.featureCollection()))
);
router.get(
  '/parcels/:id/boundary',
  authenticate,
  authorize(...READERS),
  wrap(async (req, res) => res.json(await gis.getBoundary(req.params.id)))
);
router.put(
  '/parcels/:id/boundary',
  authenticate,
  authorize('GIS_OFFICER', 'SYSTEM_ADMIN'),
  wrap(async (req, res) => res.json(await gis.setBoundary(req.params.id, req.body, actor(req))))
);

module.exports = router;
