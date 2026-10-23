const certificates = require('../services/certificate.service');

// Passes async errors to the Express error handler
const handle = (fn) => (req, res, next) => fn(req, res).catch(next);

exports.download = handle(async (req, res) => {
  const out = await certificates.buildCertificate(req.params.id, {
    id: req.user.id,
    role: req.user.role,
    ip: req.ip,
  });
  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `inline; filename="${out.filename}"`,
    'Cache-Control': 'no-store',
  });
  res.send(out.buffer);
});

exports.verify = handle(async (req, res) => {
  res.json(await certificates.verify(req.params.number));
});