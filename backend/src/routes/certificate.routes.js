const router = require('express').Router();
const c = require('../controllers/certificate.controller');
const { authenticate } = require('../middleware/auth');

// The service limits citizens to transfers they are part of
router.get('/transfers/:id/certificate', authenticate, c.download);

// Public: no login needed, so the QR code works for anyone
router.get('/verify/:number', c.verify);

module.exports = router;