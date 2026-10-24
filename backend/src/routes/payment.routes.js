const router = require('express').Router();
const c = require('../controllers/payment.controller');
const { authenticate, authorize } = require('../middleware/auth');

const TAX_STAFF = ['TAX_OFFICIAL', 'SYSTEM_ADMIN'];

// Public: called by the payment gateway, protected by its signature
router.post('/webhook', c.webhook);

router.post('/offline', authenticate, authorize(...TAX_STAFF), c.offline);
router.get('/mine', authenticate, authorize('CITIZEN'), c.mine);
router.get('/', authenticate, authorize(...TAX_STAFF), c.list);
router.post('/', authenticate, authorize('CITIZEN'), c.initiate);

router.get('/:id/receipt', authenticate, c.receipt);
router.post('/:id/mock-gateway', authenticate, authorize('CITIZEN'), c.mockGateway);
router.post('/:id/refund', authenticate, authorize('SYSTEM_ADMIN'), c.refund);
router.get('/:id', authenticate, c.getOne);

module.exports = router;