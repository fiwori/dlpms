const router = require('express').Router();
const reports = require('../services/report.service');
const { authenticate, authorize } = require('../middleware/auth');

const wrap = (fn) => (req, res, next) => fn(req, res).catch(next);
const VIEWERS = ['LAND_OFFICER', 'TAX_OFFICIAL', 'SYSTEM_ADMIN'];

function sendCsv(res, filename, csv) {
  res.set({
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Cache-Control': 'no-store',
  });
  res.send(csv);
}

router.use(authenticate, authorize(...VIEWERS));

router.get('/summary', wrap(async (req, res) => res.json(await reports.summary())));
router.get('/transfers.csv', wrap(async (req, res) => sendCsv(res, 'transfers.csv', await reports.transfersCsv())));
router.get('/payments.csv', wrap(async (req, res) => sendCsv(res, 'payments.csv', await reports.paymentsCsv())));

module.exports = router;
