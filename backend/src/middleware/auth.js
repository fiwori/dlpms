const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');

// Requires a valid "Authorization: Bearer <token>" header
async function authenticate(req, res, next) {
  const [scheme, token] = (req.headers.authorization || '').split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }

  try {
    // Read the role from the database so role changes and deactivation apply at once
    const user = await prisma.user.findUnique({
      where: { id: Number(payload.sub) },
      select: { id: true, role: true, is_active: true },
    });
    if (!user || !user.is_active) {
      return res.status(401).json({ message: 'Account not found or deactivated' });
    }
    req.user = { id: user.id, role: user.role };
    next();
  } catch (err) {
    next(err);
  }
}

// Usage: router.get('/x', authenticate, authorize('LAND_OFFICER', 'SYSTEM_ADMIN'), handler)
function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'You do not have permission to perform this action' });
    }
    next();
  };
}

module.exports = { authenticate, authorize };