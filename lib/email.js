const nodemailer = require('nodemailer');

const BRAND = 'TradingFXVault';
const GREEN = '#34e07f';
const NAVY  = '#070d18';

// Build a transport from SMTP_* env vars. If they're not set, fall back to a
// console "transport" so local dev works without a mail server.
let transport = null;
let configured = false;

function getTransport() {
  if (transport) return transport;
  if (process.env.SMTP_HOST && process.env.SMTP_USER) {
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: String(process.env.SMTP_SECURE) === 'true',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
    configured = true;
  }
  return transport;
}

async function sendMail({ to, subject, html, text }) {
  const from = process.env.MAIL_FROM || `${BRAND} <no-reply@tradingfxvault.com>`;
  const t = getTransport();
  if (!t) {
    console.log(`\n[email:stub] (SMTP not configured) →\n  to: ${to}\n  subject: ${subject}\n  ${text || '(html only)'}\n`);
    return { stubbed: true };
  }
  try {
    const info = await t.sendMail({ from, to, subject, html, text });
    console.log(`[email] sent to ${to} (${info.messageId})`);
    return { sent: true, id: info.messageId };
  } catch (err) {
    console.error(`[email] send failed to ${to}:`, err.message);
    return { error: err.message };
  }
}

function welcomeTemplate(name) {
  const base = (process.env.BASE_URL || 'http://localhost:3001').replace(/\/$/, '');
  const depositUrl = `${base}/dashboard.html#deposit`;
  const first = (name || 'there').split(' ')[0];
  const html = `
  <div style="margin:0;padding:32px 0;background:${NAVY};font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr><td align="center">
        <table role="presentation" width="520" cellpadding="0" cellspacing="0"
               style="background:#0d1626;border:1px solid #1d2c47;border-radius:18px;overflow:hidden;">
          <tr><td style="padding:28px 32px;border-bottom:1px solid #1d2c47;">
            <span style="font-size:20px;font-weight:700;color:#fff;letter-spacing:-0.02em;">TradingFX<span style="color:${GREEN};">Vault</span></span>
          </td></tr>
          <tr><td style="padding:36px 32px 8px;">
            <h1 style="margin:0 0 14px;color:#fff;font-size:26px;line-height:1.25;letter-spacing:-0.02em;">
              Welcome aboard, ${first}. 🎉</h1>
            <p style="margin:0 0 18px;color:#aab4c8;font-size:15px;line-height:1.7;">
              Your TradingFXVault account is live. You're one step away from putting your
              capital to work — make your first deposit and your balance starts growing.</p>
            <a href="${depositUrl}"
               style="display:inline-block;margin:10px 0 6px;background:${GREEN};color:#04140a;
                      font-weight:700;font-size:15px;text-decoration:none;padding:14px 26px;border-radius:12px;">
              Make your first deposit →</a>
            <p style="margin:22px 0 0;color:#6b7689;font-size:13px;line-height:1.7;">
              Deposits are made to a secure crypto address shown in your dashboard. Once
              received, your funds are credited and start earning right away.</p>
          </td></tr>
          <tr><td style="padding:24px 32px;border-top:1px solid #1d2c47;color:#5a6678;font-size:12px;">
            You're receiving this because you created a TradingFXVault account.
          </td></tr>
        </table>
      </td></tr>
    </table>
  </div>`;
  const text = `Welcome aboard, ${first}!\n\nYour TradingFXVault account is live. Make your first deposit to start growing your balance: ${depositUrl}\n\nDeposits are made to a secure crypto address shown in your dashboard.`;
  return { html, text };
}

async function sendWelcome(user) {
  const { html, text } = welcomeTemplate(user.name);
  return sendMail({ to: user.email, subject: 'Welcome to TradingFXVault — let’s get you started', html, text });
}

module.exports = { sendMail, sendWelcome, isConfigured: () => configured };
