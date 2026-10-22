const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');

// Only a SYSTEM_ADMIN may call this. It exists to prove the role check works.
router.get('/ping', authenticate, authorize('SYSTEM_ADMIN'), (req, res) => {
  res.json({ message: 'Welcome, admin', user_id: req.user.id, role: req.user.role });
});

module.exports = router;