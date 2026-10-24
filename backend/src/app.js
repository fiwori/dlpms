const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const prisma = require('./lib/prisma');
const authRoutes = require('./routes/auth.routes');
const adminRoutes = require('./routes/admin.routes');
const userRoutes = require('./routes/user.routes');
const landRoutes = require('./routes/land.routes');
const transferRoutes = require('./routes/transfer.routes');
const certificateRoutes = require('./routes/certificate.routes');
const taxRoutes = require('./routes/tax.routes');
const paymentRoutes = require('./routes/payment.routes');
const gisRoutes = require('./routes/gis.routes');
const appointmentRoutes = require('./routes/appointment.routes');
const reportRoutes = require('./routes/report.routes');

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : true,
  })
);
app.use(express.json());
app.use(morgan('dev'));

// Slows down password and OTP guessing (set AUTH_RATE_LIMIT in .env to change it)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.AUTH_RATE_LIMIT || 200),
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many attempts. Please try again later.' },
});

// Health check: confirms the API is up and the database is reachable
app.get('/api/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({
      status: 'ok',
      database: 'connected',
      time: new Date().toISOString(),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', database: 'unreachable' });
  }
});

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/admin/users', userRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/transfers', transferRoutes);
app.use('/api/tax', taxRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/gis', gisRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api', certificateRoutes);
app.use('/api', landRoutes);

// Anything else
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// Central error handler
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ message: 'Invalid JSON in request body' });
  }
  if (err.status) {
    return res.status(err.status).json({ message: err.message });
  }
  console.error(err);
  res.status(500).json({ message: 'Internal server error' });
});

module.exports = app;
