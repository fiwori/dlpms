const authService = require('../services/auth.service');

// Passes async errors to the Express error handler
const handle = (fn) => (req, res, next) => fn(req, res).catch(next);

exports.register = handle(async (req, res) => {
  const user = await authService.register(req.body);
  res.status(201).json({ message: 'Registration successful', user });
});

exports.login = handle(async (req, res) => {
  res.json(await authService.login(req.body));
});

exports.verifyOtp = handle(async (req, res) => {
  res.json(await authService.verifyOtp(req.body));
});

exports.me = handle(async (req, res) => {
  res.json(await authService.getProfile(req.user.id));
});