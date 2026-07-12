const express = require('express');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const COINS = {
  BTC:  { key: 'addr_btc',  label: 'Bitcoin',  network: 'Bitcoin' },
  ETH:  { key: 'addr_eth',  label: 'Ethereum', network: 'ERC20' },
  USDT: { key: 'addr_usdt', label: 'Tether',   network: 'TRC20' },
};

function settingsMap(stmts) {
  const map = {};
  stmts.getAllSettings.all().forEach(r => { map[r.key] = r.value; });
  return map;
}

// GET /api/wallet/info — deposit addresses + limits the user needs to pay.
router.get('/info', requireAuth, (req, res) => {
  const { stmts } = req.app.locals;
  const s = settingsMap(stmts);
  const coins = Object.entries(COINS).map(([code, c]) => ({
    code, label: c.label,
    network: code === 'USDT' ? (s.usdt_network || c.network) : c.network,
    address: s[c.key] || '',
  }));
  res.json({
    coins,
    min_deposit:  Number(s.min_deposit)  || 50,
    min_withdraw: Number(s.min_withdraw) || 50,
    support_email: s.support_email || '',
  });
});

// POST /api/wallet/deposit — user declares an intended deposit. Creates a
// pending transaction; an admin confirms receipt to credit the balance.
router.post('/deposit', requireAuth, (req, res) => {
  const { stmts } = req.app.locals;
  const coin = String(req.body.coin || '').toUpperCase();
  const amount = parseFloat(req.body.amount);
  const s = settingsMap(stmts);
  const minDeposit = Number(s.min_deposit) || 50;

  if (!COINS[coin])        return res.status(400).json({ error: 'Choose a supported coin (BTC, ETH or USDT)' });
  if (!amount || amount <= 0) return res.status(400).json({ error: 'Enter a valid amount' });
  if (amount < minDeposit) return res.status(400).json({ error: `Minimum deposit is $${minDeposit}` });

  const address = s[COINS[coin].key] || '';
  if (!address) return res.status(503).json({ error: `${coin} deposits are temporarily unavailable. Please try another coin.` });

  const result = stmts.insertTransaction.run(req.user.id, 'deposit', coin, amount, address, 'pending',
    `Awaiting ${coin} payment confirmation`);
  res.status(201).json({
    message: 'Deposit recorded. Send the funds to the address below — your balance is credited once confirmed.',
    transaction: stmts.getTransactionById.get(result.lastInsertRowid),
    address, coin,
    network: coin === 'USDT' ? (s.usdt_network || 'TRC20') : COINS[coin].network,
  });
});

// POST /api/wallet/withdraw — user requests a payout to their own crypto
// wallet (method: "crypto") or their bank account (method: "bank").
router.post('/withdraw', requireAuth, (req, res) => {
  const { stmts } = req.app.locals;
  const method = String(req.body.method || 'crypto').toLowerCase();
  const amount = parseFloat(req.body.amount);
  const s = settingsMap(stmts);
  const minWithdraw = Number(s.min_withdraw) || 50;

  if (!amount || amount <= 0) return res.status(400).json({ error: 'Enter a valid amount' });
  if (amount < minWithdraw) return res.status(400).json({ error: `Minimum withdrawal is $${minWithdraw}` });

  let coin, destination;
  if (method === 'bank') {
    const bankName = String(req.body.bank_name || '').trim();
    const accountName = String(req.body.account_name || '').trim();
    const accountNumber = String(req.body.account_number || '').trim();
    if (bankName.length < 2)      return res.status(400).json({ error: 'Enter your bank name' });
    if (accountName.length < 2)   return res.status(400).json({ error: 'Enter the account holder name' });
    if (accountNumber.length < 5) return res.status(400).json({ error: 'Enter a valid account number' });
    coin = 'BANK';
    destination = `${bankName} · ${accountName} · ${accountNumber}`;
  } else {
    coin = String(req.body.coin || '').toUpperCase();
    destination = String(req.body.address || '').trim();
    if (!COINS[coin])            return res.status(400).json({ error: 'Choose a supported coin (BTC, ETH or USDT)' });
    if (destination.length < 12) return res.status(400).json({ error: 'Enter a valid wallet address' });
  }

  const user = stmts.getUserById.get(req.user.id);
  if (amount > (user.balance || 0)) {
    return res.status(400).json({ error: `Insufficient balance (available $${(user.balance || 0).toFixed(2)})` });
  }

  const result = stmts.insertTransaction.run(req.user.id, 'withdrawal', coin, amount, destination, 'pending',
    method === 'bank' ? 'Bank transfer — awaiting admin approval' : 'Awaiting admin approval');
  res.status(201).json({
    message: 'Withdrawal requested. You’ll be notified once it’s processed.',
    transaction: stmts.getTransactionById.get(result.lastInsertRowid),
  });
});

module.exports = router;
module.exports.COINS = COINS;
