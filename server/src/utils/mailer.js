// utils/mailer.js
// Sends transactional email through Gmail's SMTP relay using nodemailer.
//
// Setup (one-time):
//   1. Enable 2-Step Verification on the Gmail account that will send mail.
//   2. Create an "App Password": https://myaccount.google.com/apppasswords
//      (choose "Mail" as the app — Google generates a 16-character password).
//   3. Put these in server/.env:
//        GMAIL_USER=youraddress@gmail.com
//        GMAIL_APP_PASSWORD=xxxxxxxxxxxxxxxx   (16 chars, no spaces)
//        FRONTEND_URL=http://localhost:5173
//
// Do NOT use your normal Gmail password — it will be rejected. An App
// Password is required when 2FA is enabled (and Google requires 2FA for
// SMTP access in general now).

const nodemailer = require('nodemailer');

let _transporter = null;

function getTransporter() {
  if (_transporter) return _transporter;

  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;

  if (!user || !pass) {
    console.warn('[mailer] GMAIL_USER / GMAIL_APP_PASSWORD not set — emails will be logged to console instead of sent.');
    return null;
  }

  _transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  });

  return _transporter;
}

/**
 * Send an email. Falls back to console logging if Gmail credentials
 * are not configured, so local development never breaks.
 *
 * @param {{to: string, subject: string, html: string, text?: string}} opts
 */
async function sendMail({ to, subject, html, text }) {
  const transporter = getTransporter();

  if (!transporter) {
    console.log('[mailer] (dev fallback) would send email:');
    console.log('  to:', to);
    console.log('  subject:', subject);
    console.log('  body:', text || html);
    return { sent: false, dev: true };
  }

  const from = process.env.GMAIL_FROM || process.env.GMAIL_USER;

  await transporter.sendMail({
    from: `"${process.env.GMAIL_FROM_NAME || 'ERP System'}" <${from}>`,
    to,
    subject,
    html,
    text,
  });

  return { sent: true };
}

module.exports = { sendMail, getTransporter };
