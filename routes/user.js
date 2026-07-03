const express = require('express');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// GET /api/user/profile — accrues outstanding auto-earnings, then returns the
// fresh row plus the server clock so the client can tick the balance live.
router.get('/profile', requireAuth, (req, res) => {
  const { stmts, accrueEarnings } = req.app.locals;
  accrueEarnings(req.user.id);
  const user = stmts.getUserById.get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ ...user, server_time: Date.now() });
});

// GET /api/user/transactions
router.get('/transactions', requireAuth, (req, res) => {
  const { stmts } = req.app.locals;
  res.json(stmts.getTransactionsByUser.all(req.user.id));
});

// GET /api/user/trades
router.get('/trades', requireAuth, (req, res) => {
  const { stmts } = req.app.locals;
  res.json(stmts.getTradesByUser.all(req.user.id));
});

module.exports = router;
