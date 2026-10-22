const router = require('express').Router();
const controller = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth');

router.post('/register', controller.register);
router.post('/login', controller.login);
router.post('/verify-otp', controller.verifyOtp);
router.get('/me', authenticate, controller.me);

module.exports = router;