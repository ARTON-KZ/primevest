const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { sendWelcome } = require('../lib/email');

const router = express.Router();

function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function userPayload(u) {
  return {
    id: u.id, name: u.name, email: u.email, role: u.role,
    country: u.country, phone: u.phone, whatsapp: u.whatsapp, address: u.address,
    office_location: u.office_location, currency: u.currency,
    balance: u.balance, profit: u.profit, deposit_total: u.deposit_total, locked: u.locked,
    earn_amount: u.earn_amount, earn_interval_sec: u.earn_interval_sec,
    earn_active: u.earn_active, earn_last_at: u.earn_last_at,
    status: u.status,
  };
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const { stmts } = req.app.locals;
  let { name, email, password, country, phone, address, currency } = req.body;

  if (!name || name.trim().length < 2)  return res.status(400).json({ error: 'Name must be at least 2 characters' });
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email address' });
  if (!password || password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  if (!/\d/.test(password))             return res.status(400).json({ error: 'Password must contain at least one number' });
  if (!country || !country.trim())      return res.status(400).json({ error: 'Please select your country' });
  if (!phone || !/^\+\d[\d\s().-]{5,}$/.test(phone.trim())) return res.status(400).json({ error: 'Enter a phone number with country code, e.g. +1 555 123 4567' });
  if (!address || address.trim().length < 5) return res.status(400).json({ error: 'Enter your address' });
  currency = (currency || 'USD').toUpperCase().trim().slice(0, 4);

  email = email.toLowerCase().trim();
  if (stmts.getUserByEmail.get(email)) return res.status(409).json({ error: 'That email is already registered' });

  const hash = bcrypt.hashSync(password, 12);
  // Auto-approved: the user can sign in and deposit right away.
  const result = stmts.insertUser.run(name.trim(), email, hash, country.trim(), phone.trim(),
    null, address.trim(), null, currency, 'approved');
  const user = stmts.getUserByIdFull.get(result.lastInsertRowid);

  // Welcome email (fire-and-forget — never block signup on mail delivery).
  sendWelcome(user).catch(err => console.error('[welcome email]', err.message));

  return res.status(201).json({ token: signToken(user), user: userPayload(user) });
});

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { stmts } = req.app.locals;
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

  const user = stmts.getUserByEmail.get(String(email).toLowerCase().trim());
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  if (user.role !== 'admin') {
    if (user.blocked)               return res.status(403).json({ error: 'Your account has been suspended. Contact support.' });
    if (user.status === 'rejected') return res.status(403).json({ error: 'Your account request was declined. Contact support.' });
    if (user.status === 'pending')  return res.status(403).json({ pending: true, error: 'Your account is awaiting approval.' });
  }

  try {
    const ip = (req.headers['x-forwarded-for'] || req.ip || '').toString().split(',')[0].trim();
    stmts.insertLogin.run(user.id, ip || 'unknown', (req.headers['user-agent'] || 'unknown').slice(0, 200));
  } catch { /* non-fatal */ }

  return res.json({ token: signToken(user), user: userPayload(user) });
});

module.exports = router;
