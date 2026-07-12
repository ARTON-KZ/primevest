const express = require('express');
const bcrypt  = require('bcryptjs');
const crypto  = require('crypto');
const jwt     = require('jsonwebtoken');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

const FIELD_PROP = { balance: 'balance', profit: 'profit', deposit: 'deposit_total', locked: 'locked' };
const SETTING_KEYS = ['addr_btc', 'addr_eth', 'addr_usdt', 'usdt_network', 'min_deposit', 'min_withdraw', 'support_email'];

const randomPassword = () =>
  crypto.randomBytes(10).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 10) + 'A1!';

function tokenFor(user) {
  const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
  return { token, user: { id: user.id, name: user.name, email: user.email, role: user.role } };
}

// ── Users ─────────────────────────────────────────────────────────────────────
router.get('/users', requireAdmin, (req, res) => {
  const { stmts, accrueEarnings } = req.app.locals;
  // Make sure listed balances reflect accrued earnings.
  stmts.getAllUsers.all().forEach(u => { if (u.role === 'user') accrueEarnings(u.id); });
  res.json(stmts.getAllUsers.all());
});

router.get('/stats', requireAdmin, (req, res) => {
  const { stmts } = req.app.locals;
  const users = stmts.getAllUsers.all().filter(u => u.role === 'user');
  let totalWithdrawal = 0, pendingDeposit = 0, pendingWithdrawal = 0;
  try {
    stmts.getAllTransactions.all().forEach(t => {
      if (t.type === 'withdrawal' && t.status === 'completed') totalWithdrawal += t.amount;
      if (t.type === 'deposit'    && t.status === 'pending')   pendingDeposit  += t.amount;
      if (t.type === 'withdrawal' && t.status === 'pending')   pendingWithdrawal += t.amount;
    });
  } catch { /* empty */ }
  res.json({
    totalUsers:    users.length,
    activeEarners: users.filter(u => u.earn_active).length,
    blockedUsers:  users.filter(u => u.blocked).length,
    totalDeposit:  users.reduce((s, u) => s + (u.deposit_total || 0), 0),
    totalBalance:  users.reduce((s, u) => s + (u.balance || 0), 0),
    totalProfit:   users.reduce((s, u) => s + (u.profit || 0), 0),
    totalWithdrawal, pendingDeposit, pendingWithdrawal,
  });
});

router.get('/users/:id', requireAdmin, (req, res) => {
  const { stmts, accrueEarnings } = req.app.locals;
  const id = parseInt(req.params.id);
  accrueEarnings(id);
  const user = stmts.getUserById.get(id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({
    user,
    transactions: stmts.getTransactionsByUser.all(id),
    trades:       stmts.getTradesByUser.all(id),
    logins:       stmts.getLoginsByUser.all(id),
  });
});

router.post('/users', requireAdmin, (req, res) => {
  const { stmts } = req.app.locals;
  let { name, email, password, country, phone, currency } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Valid email is required' });
  email = email.toLowerCase().trim();
  if (stmts.getUserByEmail.get(email)) return res.status(409).json({ error: 'Email already in use' });

  const generated = !password;
  if (generated) password = randomPassword();
  const result = stmts.insertUser.run(name.trim(), email, bcrypt.hashSync(password, 12),
    country || null, phone || null, req.body.whatsapp || null, req.body.address || null,
    req.body.office_location || null, (currency || 'USD').toUpperCase().slice(0, 4), 'approved');
  res.status(201).json({
    message: 'User created',
    user: stmts.getUserById.get(result.lastInsertRowid),
    generatedPassword: generated ? password : undefined,
  });
});

// ── Credit / debit a money field ───────────────────────────────────────────────
router.patch('/users/:id/balance', requireAdmin, (req, res) => {
  const { stmts, adjustField } = req.app.locals;
  const id = parseInt(req.params.id);
  let { field = 'balance', action, amount } = req.body;
  if (!FIELD_PROP[field]) return res.status(400).json({ error: 'Invalid field (balance, profit, deposit, locked)' });
  if (!['increase', 'reduce'].includes(action)) return res.status(400).json({ error: 'action must be increase or reduce' });
  const amt = parseFloat(amount);
  if (!amt || amt <= 0) return res.status(400).json({ error: 'Amount must be a positive number' });

  const full = stmts.getUserByIdFull.get(id);
  if (!full) return res.status(404).json({ error: 'User not found' });
  if (field === 'deposit' && action === 'reduce') return res.status(400).json({ error: 'The deposit total cannot be debited' });
  const current = full[FIELD_PROP[field]] || 0;
  if (action === 'reduce' && current < amt) return res.status(400).json({ error: `Insufficient ${field} (have ${current.toFixed(2)})` });

  adjustField(id, field, action === 'reduce' ? -amt : amt);
  if (field === 'balance' || field === 'deposit') {
    stmts.insertTransaction.run(id, action === 'reduce' ? 'admin_debit' : 'admin_credit', null, amt, null,
      'completed', `Admin ${action} (${field}) by ${req.user.email}`);
  }
  res.json({ message: 'Balance updated', user: stmts.getUserById.get(id) });
});

// ── Auto-earnings: set amount + interval, pause / resume ────────────────────────
router.patch('/users/:id/earnings', requireAdmin, (req, res) => {
  const { stmts, setEarnings } = req.app.locals;
  const id = parseInt(req.params.id);
  const user = stmts.getUserById.get(id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (user.role === 'admin') return res.status(403).json({ error: 'Auto-earnings apply to client accounts only' });

  const patch = {};
  if (req.body.amount !== undefined) {
    const a = parseFloat(req.body.amount);
    if (isNaN(a) || a < 0) return res.status(400).json({ error: 'Amount must be zero or more' });
    patch.amount = a;
  }
  if (req.body.interval_sec !== undefined) {
    const iv = parseInt(req.body.interval_sec);
    if (!iv || iv < 1) return res.status(400).json({ error: 'Interval must be at least 1 second' });
    patch.interval_sec = iv;
  }
  if (req.body.active !== undefined) patch.active = !!req.body.active;

  const updated = setEarnings(id, patch);
  res.json({ message: 'Auto-earnings updated', user: updated });
});

// ── Status / block / profile / password ─────────────────────────────────────────
router.patch('/users/:id/status', requireAdmin, (req, res) => {
  const { stmts } = req.app.locals;
  const id = parseInt(req.params.id);
  const { status } = req.body;
  if (!['approved', 'rejected', 'pending'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
  const user = stmts.getUserById.get(id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (user.role === 'admin') return res.status(403).json({ error: 'Cannot change an admin account status' });
  stmts.updateUserStatus.run(status, id);
  res.json({ message: `User ${status}`, user: stmts.getUserById.get(id) });
});

router.patch('/users/:id/block', requireAdmin, (req, res) => {
  const { stmts, setField } = req.app.locals;
  const id = parseInt(req.params.id);
  const user = stmts.getUserById.get(id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (user.role === 'admin') return res.status(403).json({ error: 'Cannot block an admin account' });
  setField(id, 'blocked', req.body.blocked ? 1 : 0);
  res.json({ message: req.body.blocked ? 'User blocked' : 'User unblocked', user: stmts.getUserById.get(id) });
});

router.patch('/users/:id/profile', requireAdmin, (req, res) => {
  const { stmts, setField } = req.app.locals;
  const id = parseInt(req.params.id);
  const { name, email, country, phone, currency } = req.body;
  const user = stmts.getUserById.get(id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  if (email !== undefined) {
    const e = String(email).toLowerCase().trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return res.status(400).json({ error: 'Invalid email address' });
    const existing = stmts.getUserByEmail.get(e);
    if (existing && existing.id !== id) return res.status(409).json({ error: 'Email already in use' });
    stmts.updateEmail.run(e, id);
  }
  if (name !== undefined && String(name).trim()) setField(id, 'name', String(name).trim());
  if (country !== undefined)  setField(id, 'country', country || null);
  if (phone !== undefined)    setField(id, 'phone', phone || null);
  if (currency !== undefined) setField(id, 'currency', (currency || 'USD').toUpperCase().slice(0, 4));
  res.json({ message: 'Profile updated', user: stmts.getUserById.get(id) });
});

router.patch('/users/:id/password', requireAdmin, (req, res) => {
  const { stmts } = req.app.locals;
  const id = parseInt(req.params.id);
  const user = stmts.getUserById.get(id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (user.role === 'admin') return res.status(403).json({ error: 'Cannot reset an admin password here' });
  const newPassword = randomPassword();
  stmts.updatePassword.run(bcrypt.hashSync(newPassword, 12), id);
  res.json({ newPassword });
});

router.post('/users/:id/clear', requireAdmin, (req, res) => {
  const { stmts, clearAccount } = req.app.locals;
  const id = parseInt(req.params.id);
  const user = stmts.getUserById.get(id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (user.role === 'admin') return res.status(403).json({ error: 'Cannot clear an admin account' });
  clearAccount(id);
  res.json({ message: 'Account cleared', user: stmts.getUserById.get(id) });
});

router.delete('/users/:id', requireAdmin, (req, res) => {
  const { stmts, deleteUser } = req.app.locals;
  const id = parseInt(req.params.id);
  const user = stmts.getUserById.get(id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (user.role === 'admin') return res.status(403).json({ error: 'Cannot delete an admin account' });
  deleteUser(id);
  res.json({ message: 'User deleted' });
});

router.post('/users/:id/impersonate', requireAdmin, (req, res) => {
  const { stmts } = req.app.locals;
  const target = stmts.getUserByIdFull.get(parseInt(req.params.id));
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (target.role === 'admin') return res.status(403).json({ error: 'Cannot impersonate another admin' });
  res.json(tokenFor(target));
});

router.post('/users/:id/trade-history', requireAdmin, (req, res) => {
  const { stmts } = req.app.locals;
  const id = parseInt(req.params.id);
  const { pair, side = 'buy', amount, profit = 0, outcome = 'win' } = req.body;
  if (!pair || !pair.trim()) return res.status(400).json({ error: 'Trading pair is required' });
  const amt = parseFloat(amount);
  if (!amt || amt <= 0) return res.status(400).json({ error: 'Amount must be positive' });
  if (!stmts.getUserById.get(id)) return res.status(404).json({ error: 'User not found' });
  stmts.insertTrade.run(id, pair.trim(), side, amt, parseFloat(profit) || 0, outcome);
  res.json({ message: 'Trade added', trades: stmts.getTradesByUser.all(id) });
});

// ── Transactions: list + approve / reject deposits & withdrawals ────────────────
router.get('/transactions', requireAdmin, (req, res) => {
  const { stmts } = req.app.locals;
  res.json(stmts.getAllTransactions.all());
});

router.patch('/transactions/:id', requireAdmin, (req, res) => {
  const { stmts, completeDeposit, completeWithdrawal } = req.app.locals;
  const id = parseInt(req.params.id);
  const action = req.body.action; // approve | reject
  const txn = stmts.getTransactionById.get(id);
  if (!txn) return res.status(404).json({ error: 'Transaction not found' });
  if (txn.status !== 'pending') return res.status(400).json({ error: 'Only pending transactions can be updated' });

  if (action === 'reject') {
    stmts.updateTransactionStatus.run('rejected', id);
    return res.json({ message: 'Transaction rejected', transaction: stmts.getTransactionById.get(id) });
  }
  if (action !== 'approve') return res.status(400).json({ error: 'action must be approve or reject' });

  if (txn.type === 'deposit') {
    completeDeposit(id, txn.user_id, txn.amount);
  } else if (txn.type === 'withdrawal') {
    const user = stmts.getUserById.get(txn.user_id);
    if ((user.balance || 0) < txn.amount) return res.status(400).json({ error: 'User balance is below the withdrawal amount' });
    completeWithdrawal(id, txn.user_id, txn.amount);
  } else {
    return res.status(400).json({ error: 'This transaction type cannot be approved' });
  }
  res.json({ message: 'Transaction approved', transaction: stmts.getTransactionById.get(id) });
});

// ── Settings (crypto addresses + limits) ────────────────────────────────────────
router.get('/settings', requireAdmin, (req, res) => {
  const { stmts } = req.app.locals;
  const map = {};
  stmts.getAllSettings.all().forEach(r => { map[r.key] = r.value; });
  res.json(map);
});

router.patch('/settings', requireAdmin, (req, res) => {
  const { stmts } = req.app.locals;
  let updated = 0;
  SETTING_KEYS.forEach(k => {
    if (req.body[k] !== undefined) { stmts.setSetting.run(k, String(req.body[k]).trim()); updated++; }
  });
  const map = {};
  stmts.getAllSettings.all().forEach(r => { map[r.key] = r.value; });
  res.json({ message: `Saved ${updated} setting${updated === 1 ? '' : 's'}`, settings: map });
});

// ── Admins ──────────────────────────────────────────────────────────────────────
router.get('/admins', requireAdmin, (req, res) => {
  const { stmts } = req.app.locals;
  res.json(stmts.getAllUsers.all().filter(u => u.role === 'admin'));
});

router.post('/admins', requireAdmin, (req, res) => {
  const { stmts } = req.app.locals;
  let { name, email, password } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Valid email is required' });
  if (!password || password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  email = email.toLowerCase().trim();
  if (stmts.getUserByEmail.get(email)) return res.status(409).json({ error: 'Email already in use' });
  const result = stmts.insertAdmin.run(name.trim(), email, bcrypt.hashSync(password, 12));
  res.status(201).json({ message: 'Administrator created', admin: stmts.getUserById.get(result.lastInsertRowid) });
});

router.delete('/admins/:id', requireAdmin, (req, res) => {
  const { stmts, deleteUser } = req.app.locals;
  const id = parseInt(req.params.id);
  if (id === req.user.id) return res.status(400).json({ error: 'You cannot remove your own admin account' });
  const target = stmts.getUserById.get(id);
  if (!target || target.role !== 'admin') return res.status(404).json({ error: 'Administrator not found' });
  if (stmts.getAllUsers.all().filter(u => u.role === 'admin').length <= 1) {
    return res.status(400).json({ error: 'Cannot remove the last administrator' });
  }
  deleteUser(id);
  res.json({ message: 'Administrator removed' });
});

module.exports = router;
