const router = require('express').Router();
const c = require('../controllers/land.controller');
const { authenticate, authorize } = require('../middleware/auth');

const STAFF = ['LAND_OFFICER', 'TAX_OFFICIAL', 'GIS_OFFICER', 'SYSTEM_ADMIN'];
const REGISTRARS = ['LAND_OFFICER', 'SYSTEM_ADMIN'];

// Owners (staff only)
router.post('/owners', authenticate, authorize(...REGISTRARS), c.createOwner);
router.get('/owners', authenticate, authorize(...STAFF), c.listOwners);
router.get('/owners/:id', authenticate, authorize(...STAFF), c.getOwner);

// Parcels
router.post('/parcels', authenticate, authorize(...REGISTRARS), c.createParcel);
router.get('/parcels', authenticate, authorize(...STAFF), c.listParcels);
router.get('/parcels/mine', authenticate, authorize('CITIZEN'), c.myParcels);
// Citizens may call this too; the service limits them to their own parcels
router.get('/parcels/:id', authenticate, c.getParcel);
router.patch('/parcels/:id', authenticate, authorize(...REGISTRARS), c.updateParcel);

module.exports = router;