const router = require('express').Router();
const c = require('../controllers/transfer.controller');
const { authenticate, authorize } = require('../middleware/auth');

const OFFICERS = ['LAND_OFFICER', 'SYSTEM_ADMIN'];

// Citizen
router.post('/', authenticate, authorize('CITIZEN'), c.create);
router.get('/mine', authenticate, authorize('CITIZEN'), c.mine);
router.post('/:id/documents', authenticate, authorize('CITIZEN'), c.addDocuments);
router.post('/:id/submit', authenticate, authorize('CITIZEN'), c.submit);
router.post('/:id/cancel', authenticate, authorize('CITIZEN', 'SYSTEM_ADMIN'), c.cancel);

// Shared (the service limits citizens to their own requests)
router.get('/:id', authenticate, c.getOne);
router.post(
  '/:id/recheck-tax',
  authenticate,
  authorize('CITIZEN', 'LAND_OFFICER', 'TAX_OFFICIAL', 'SYSTEM_ADMIN'),
  c.recheckTax
);

// Staff
router.get(
  '/',
  authenticate,
  authorize('LAND_OFFICER', 'TAX_OFFICIAL', 'SYSTEM_ADMIN'),
  c.list
);
router.post('/:id/assign', authenticate, authorize(...OFFICERS), c.assign);
router.post('/:id/request-documents', authenticate, authorize(...OFFICERS), c.requestDocuments);
router.post('/:id/approve', authenticate, authorize(...OFFICERS), c.approve);
router.post('/:id/reject', authenticate, authorize(...OFFICERS), c.reject);

module.exports = router;