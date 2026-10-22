const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const audit = require('../services/audit.service');

// Everything under /api/admin is for SYSTEM_ADMIN only
router.use(authenticate, authorize('SYSTEM_ADMIN'));

router.get('/ping', (req, res) => {
  res.json({ message: 'Welcome, admin', user_id: req.user.id, role: req.user.role });
});

// GET /api/admin/audit-logs?page=1&limit=20
router.get('/audit-logs', async (req, res, next) => {
  try {
    res.json(await audit.list(req.query));
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/audit-logs/verify  (checks the hash chain)
router.get('/audit-logs/verify', async (req, res, next) => {
  try {
    res.json(await audit.verifyChain());
  } catch (err) {
    next(err);
  }
});

module.exports = router;