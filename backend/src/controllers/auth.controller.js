const authService = require('../services/auth.service');
const audit = require('../services/audit.service');

// Passes async errors to the Express error handler
const handle = (fn) => (req, res, next) => fn(req, res).catch(next);

// Audit problems on auth events must never break the request itself
const safeLog = (entry) =>
  audit.log(entry).catch((e) => console.error('Audit log failed:', e));

exports.register = handle(async (req, res) => {
  const user = await authService.register(req.body);
  await safeLog({
    userId: user.id,
    action: 'USER_REGISTERED',
    entityType: 'user',
    entityId: user.id,
    newValues: { phone_number: user.phone_number, role: user.role },
    ipAddress: req.ip,
  });
  res.status(201).json({ message: 'Registration successful', user });
});

exports.login = handle(async (req, res) => {
  try {
    res.json(await authService.login(req.body));
  } catch (err) {
    if (err.status === 401) {
      await safeLog({
        action: 'LOGIN_FAILED',
        entityType: 'user',
        newValues: { identifier: String((req.body && req.body.identifier) || '') },
        ipAddress: req.ip,
      });
    }
    throw err;
  }
});

exports.verifyOtp = handle(async (req, res) => {
  const result = await authService.verifyOtp(req.body);
  await safeLog({
    userId: result.user.id,
    action: 'LOGIN_SUCCESS',
    entityType: 'user',
    entityId: result.user.id,
    ipAddress: req.ip,
  });
  res.json(result);
});

exports.me = handle(async (req, res) => {
  res.json(await authService.getProfile(req.user.id));
});