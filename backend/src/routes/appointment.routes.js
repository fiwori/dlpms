const router = require('express').Router();
const appts = require('../services/appointment.service');
const { authenticate, authorize } = require('../middleware/auth');

const wrap = (fn) => (req, res, next) => fn(req, res).catch(next);
const actor = (req) => ({ id: req.user.id, role: req.user.role, ip: req.ip });
const OFFICERS = ['LAND_OFFICER', 'SYSTEM_ADMIN'];

router.get('/slots', authenticate, wrap(async (req, res) => res.json(await appts.availability(req.query.date))));
router.get('/mine', authenticate, authorize('CITIZEN'), wrap(async (req, res) => res.json(await appts.listMine(actor(req)))));
router.post('/', authenticate, authorize('CITIZEN'), wrap(async (req, res) => res.status(201).json(await appts.book(req.body, actor(req)))));
router.delete('/:id', authenticate, authorize('CITIZEN'), wrap(async (req, res) => res.json(await appts.cancel(req.params.id, actor(req)))));

router.get('/', authenticate, authorize(...OFFICERS), wrap(async (req, res) => res.json(await appts.listForStaff(actor(req), req.query))));
router.patch('/:id', authenticate, authorize(...OFFICERS), wrap(async (req, res) => res.json(await appts.setStatus(req.params.id, req.body, actor(req)))));

module.exports = router;
