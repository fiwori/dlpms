const router = require('express').Router();
const users = require('../services/user.service');
const { authenticate, authorize } = require('../middleware/auth');

const wrap = (fn) => (req, res, next) => fn(req, res).catch(next);
const actor = (req) => ({ id: req.user.id, role: req.user.role, ip: req.ip });

router.use(authenticate, authorize('SYSTEM_ADMIN'));

router.get('/', wrap(async (req, res) => res.json(await users.list(req.query))));
router.post('/', wrap(async (req, res) => res.status(201).json(await users.createStaff(req.body, actor(req)))));
router.patch('/:id', wrap(async (req, res) => res.json(await users.update(req.params.id, req.body, actor(req)))));
router.post('/:id/reset-password', wrap(async (req, res) => res.json(await users.resetPassword(req.params.id, req.body, actor(req)))));

module.exports = router;
