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
      // Fail fast so a blocked port surfaces in seconds, not minutes.
      connectionTimeout: 15000,
      greetingTimeout: 10000,
      socketTimeout: 20000,
    });
    configured = true;
  }
  return transport;
}

function parseFrom() {
  const raw = process.env.MAIL_FROM || `${BRAND} <tradingfxvault@gmail.com>`;
  const m = raw.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/);
  if (m) return { name: (m[1].trim() || BRAND), email: m[2].trim() };
  return { name: BRAND, email: raw.trim() };
}

// ── HTTP email providers (work over HTTPS:443 — not blocked like SMTP) ────────
async function sendViaResend(from, { to, subject, html, text }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: `${from.name} <${from.email}>`, to: [to], subject, html, text }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Resend ${res.status}: ${body.message || JSON.stringify(body)}`);
  return body.id;
}

async function sendViaBrevo(from, { to, subject, html, text }) {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ sender: from, to: [{ email: to }], subject, htmlContent: html, textContent: text }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Brevo ${res.status}: ${body.message || JSON.stringify(body)}`);
  return body.messageId;
}

async function sendViaSendGrid(from, { to, subject, html, text }) {
  const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: from.email, name: from.name },
      subject,
      content: [{ type: 'text/plain', value: text || ' ' }, { type: 'text/html', value: html }],
    }),
  });
  if (!(res.status >= 200 && res.status < 300)) {
    const body = await res.text().catch(() => '');
    throw new Error(`SendGrid ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.headers.get('x-message-id') || 'sent';
}

async function sendMail({ to, subject, html, text }) {
  const from = parseFrom();

  // Prefer an HTTP provider if a key is present (required on hosts that block SMTP).
  const httpProviders = [
    ['RESEND_API_KEY', sendViaResend],
    ['BREVO_API_KEY', sendViaBrevo],
    ['SENDGRID_API_KEY', sendViaSendGrid],
  ];
  for (const [envKey, fn] of httpProviders) {
    if (process.env[envKey]) {
      configured = true;
      try {
        const id = await fn(from, { to, subject, html, text });
        console.log(`[email] sent to ${to} via ${envKey.replace('_API_KEY', '')} (${id})`);
        return { sent: true, id };
      } catch (err) {
        console.error(`[email] ${envKey.replace('_API_KEY', '')} send failed to ${to}:`, err.message);
        return { error: err.message };
      }
    }
  }

  // Fallback: SMTP (works on hosts that allow outbound SMTP).
  const t = getTransport();
  if (!t) {
    console.log(`\n[email:stub] (no provider configured) →\n  to: ${to}\n  subject: ${subject}\n  ${text || '(html only)'}\n`);
    return { stubbed: true };
  }
  try {
    const info = await t.sendMail({ from: `${from.name} <${from.email}>`, to, subject, html, text });
    console.log(`[email] sent to ${to} via SMTP (${info.messageId})`);
    return { sent: true, id: info.messageId };
  } catch (err) {
    console.error(`[email] SMTP send failed to ${to}:`, err.message);
    return { error: err.message };
  }
}

// Structured welcome email: header → greeting → account summary → numbered
// first steps → CTA → support block → footer. Table-based layout with inline
// styles so it renders in Gmail/Outlook/Apple Mail.
function welcomeTemplate(user, contact) {
  const base = (process.env.BASE_URL || 'http://localhost:3001').replace(/\/$/, '');
  const depositUrl = `${base}/dashboard.html#deposit`;
  const first = (user.name || 'there').split(' ')[0];
  const joined = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const c = { email: 'tradingfxvault@gmail.com', whatsapp: '+44 7432 587566', ...(contact || {}) };
  const waLink = 'https://wa.me/' + c.whatsapp.replace(/[^\d]/g, '');

  const detailRow = (label, value) => `
    <tr>
      <td style="padding:9px 0;border-bottom:1px solid #16223a;color:#7c8aa3;font-size:13px;width:42%;">${label}</td>
      <td style="padding:9px 0;border-bottom:1px solid #16223a;color:#e9eef6;font-size:13px;font-weight:600;text-align:right;">${value}</td>
    </tr>`;

  const stepRow = (n, title, body) => `
    <tr><td style="padding:0 0 16px;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>
        <td valign="top" style="width:34px;">
          <div style="width:26px;height:26px;border-radius:8px;background:rgba(52,224,127,0.12);border:1px solid rgba(52,224,127,0.35);
                      color:${GREEN};font-size:13px;font-weight:700;text-align:center;line-height:26px;">${n}</div>
        </td>
        <td style="padding-left:12px;">
          <p style="margin:0 0 3px;color:#fff;font-size:14.5px;font-weight:600;">${title}</p>
          <p style="margin:0;color:#aab4c8;font-size:13px;line-height:1.6;">${body}</p>
        </td>
      </tr></table>
    </td></tr>`;

  const html = `
  <div style="margin:0;padding:32px 0;background:${NAVY};font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;">Your TradingFXVault account is live — here's everything you need to get started.</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr><td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0"
               style="background:#0d1626;border:1px solid #1d2c47;border-radius:18px;overflow:hidden;">

          <!-- Header -->
          <tr><td style="padding:26px 36px;border-bottom:1px solid #1d2c47;">
            <span style="font-size:20px;font-weight:700;color:#fff;letter-spacing:-0.02em;">TradingFX<span style="color:${GREEN};">Vault</span></span>
          </td></tr>

          <!-- Greeting -->
          <tr><td style="padding:34px 36px 6px;">
            <h1 style="margin:0 0 12px;color:#fff;font-size:25px;line-height:1.25;letter-spacing:-0.02em;">
              Welcome aboard, ${first} 🎉</h1>
            <p style="margin:0;color:#aab4c8;font-size:15px;line-height:1.7;">
              Your account is live and ready to fund. Below is a summary of your registration
              and the three steps between you and a growing balance.</p>
          </td></tr>

          <!-- Account summary -->
          <tr><td style="padding:26px 36px 0;">
            <p style="margin:0 0 10px;color:${GREEN};font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;">Your account</p>
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%"
                   style="background:#0f1a2e;border:1px solid #1d2c47;border-radius:12px;padding:6px 18px;">
              ${detailRow('Account holder', user.name || '—')}
              ${detailRow('Email', user.email || '—')}
              ${detailRow('Country', user.country || '—')}
              ${detailRow('Display currency', user.currency || 'USD')}
              ${detailRow('Member since', joined)}
              ${detailRow('Account status', '<span style="color:' + GREEN + ';">Active</span>')}
            </table>
          </td></tr>

          <!-- First steps -->
          <tr><td style="padding:28px 36px 4px;">
            <p style="margin:0 0 14px;color:${GREEN};font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;">Get started in 3 steps</p>
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
              ${stepRow(1, 'Make your first deposit', 'Open your dashboard, pick BTC, ETH or USDT, and send funds to your secure deposit address. Minimum deposit is $100.')}
              ${stepRow(2, 'Watch your balance grow', 'Once your deposit is confirmed, your capital goes to work — your balance updates live, around the clock.')}
              ${stepRow(3, 'Withdraw anytime', 'Request a payout to your own crypto wallet or bank account whenever you choose. No exit penalties.')}
            </table>
          </td></tr>

          <!-- CTA -->
          <tr><td style="padding:8px 36px 30px;" align="center">
            <a href="${depositUrl}"
               style="display:inline-block;background:${GREEN};color:#04140a;font-weight:700;font-size:15px;
                      text-decoration:none;padding:14px 34px;border-radius:12px;">
              Go to my dashboard →</a>
          </td></tr>

          <!-- Support -->
          <tr><td style="padding:22px 36px;border-top:1px solid #1d2c47;background:#0a1322;">
            <p style="margin:0 0 10px;color:${GREEN};font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;">Need a hand?</p>
            <p style="margin:0 0 4px;color:#aab4c8;font-size:13px;line-height:1.7;">
              Email — <a href="mailto:${c.email}" style="color:${GREEN};text-decoration:none;">${c.email}</a></p>
            <p style="margin:0;color:#aab4c8;font-size:13px;line-height:1.7;">
              WhatsApp — <a href="${waLink}" style="color:${GREEN};text-decoration:none;">${c.whatsapp}</a></p>
          </td></tr>

          <!-- Footer -->
          <tr><td style="padding:20px 36px 26px;border-top:1px solid #1d2c47;">
            <p style="margin:0 0 4px;color:#5a6678;font-size:12px;line-height:1.6;">
              © 2020 TradingFXVault · We trade the best so you don't incur loss.</p>
            <p style="margin:0;color:#3e4a5e;font-size:11.5px;line-height:1.6;">
              You're receiving this because you created a TradingFXVault account with this address.</p>
          </td></tr>

        </table>
      </td></tr>
    </table>
  </div>`;

  const text = [
    `Welcome aboard, ${first}!`,
    ``,
    `Your TradingFXVault account is live and ready to fund.`,
    ``,
    `YOUR ACCOUNT`,
    `------------`,
    `Account holder:   ${user.name || '—'}`,
    `Email:            ${user.email || '—'}`,
    `Country:          ${user.country || '—'}`,
    `Display currency: ${user.currency || 'USD'}`,
    `Member since:     ${joined}`,
    `Account status:   Active`,
    ``,
    `GET STARTED IN 3 STEPS`,
    `----------------------`,
    `1. Make your first deposit — pick BTC, ETH or USDT in your dashboard and send to your secure address (minimum $100).`,
    `2. Watch your balance grow — once confirmed, your balance updates live, around the clock.`,
    `3. Withdraw anytime — to your own crypto wallet or bank account, no exit penalties.`,
    ``,
    `Dashboard: ${depositUrl}`,
    ``,
    `NEED A HAND?`,
    `------------`,
    `Email:    ${c.email}`,
    `WhatsApp: ${c.whatsapp}`,
    ``,
    `© 2020 TradingFXVault · We trade the best so you don't incur loss.`,
  ].join('\n');

  return { html, text };
}

async function sendWelcome(user, contact) {
  const { html, text } = welcomeTemplate(user, contact);
  return sendMail({ to: user.email, subject: `Welcome to TradingFXVault, ${(user.name || '').split(' ')[0]} — your account is live`, html, text });
}

module.exports = { sendMail, sendWelcome, welcomeTemplate, isConfigured: () => configured };
