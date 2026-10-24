// Prototype notifications: messages are printed to the server console.
// Replace the bodies with a real SMS gateway and SMTP mailer later (FR-30, FR-31).
function notify({ phone, email, subject, message }) {
  if (phone) console.log(`[MOCK SMS] to ${phone}: ${message}`);
  if (email) console.log(`[MOCK EMAIL] to ${email}: ${subject} - ${message}`);
}

module.exports = { notify };
