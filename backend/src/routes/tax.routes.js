const router = require('express').Router();
const c = require('../controllers/tax.controller');
const { authenticate, authorize } = require('../middleware/auth');

const TAX_STAFF = ['TAX_OFFICIAL', 'SYSTEM_ADMIN'];
const VIEWERS = ['TAX_OFFICIAL', 'LAND_OFFICER', 'SYSTEM_ADMIN'];

router.post('/records', authenticate, authorize(...TAX_STAFF), c.createRecord);
router.get('/records', authenticate, authorize(...VIEWERS), c.listRecords);
router.get('/mine', authenticate, authorize('CITIZEN'), c.mine);

router.get('/rates', authenticate, authorize(...VIEWERS), c.listRates);
router.put('/rates', authenticate, authorize('SYSTEM_ADMIN'), c.setRate);

module.exports = router;