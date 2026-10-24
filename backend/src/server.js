require('dotenv').config();
const app = require('./app');
const payments = require('./services/payment.service');
const appointments = require('./services/appointment.service');

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`DLPMS API running on http://localhost:${PORT}`);
});

// Payments with no gateway callback after 15 minutes become Failed (every minute)
setInterval(() => {
  payments.expireStale().catch((e) => console.error('Payment sweep failed:', e));
}, 60 * 1000).unref();

// Appointment reminders for the next 24 hours (every hour)
setInterval(() => {
  appointments.sendReminders().catch((e) => console.error('Reminder job failed:', e));
}, 60 * 60 * 1000).unref();
