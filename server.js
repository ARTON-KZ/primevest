require('dotenv').config();
const express   = require('express');
const cors      = require('cors');
const rateLimit = require('express-rate-limit');
const path      = require('path');
const initDatabase = require('./database');

async function main() {
  const dbApi = await initDatabase();

  const app = express();
  app.set('trust proxy', 1);
  // Expose the db helpers to route modules via app.locals.
  Object.assign(app.locals, dbApi);

  const allowList = (process.env.ALLOWED_ORIGIN || '*').split(',').map(s => s.trim()).filter(Boolean);
  app.use(cors({ origin: allowList.includes('*') ? '*' : allowList }));
  app.use(express.json({ limit: '50kb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(express.static(path.join(__dirname, 'public')));

  const authLimiter = rateLimit({
    windowMs: 60 * 1000, max: 20,
    message: { error: 'Too many requests, please try again in a minute' },
  });
  app.use('/api/auth', authLimiter);

  app.get('/api/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

  app.use('/api/auth',   require('./routes/auth'));
  app.use('/api/user',   require('./routes/user'));
  app.use('/api/wallet', require('./routes/wallet'));
  app.use('/api/admin',  require('./routes/admin'));

  // SPA-ish fallback for unknown non-API paths → landing page.
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api')) return res.status(404).json({ error: 'Not found' });
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });

  app.use((err, req, res, _next) => {
    console.error('[Error]', err);
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
  });

  // Periodically accrue auto-earnings so balances grow even when users are away.
  // The dashboard also interpolates between syncs for a live-ticking feel.
  setInterval(() => { try { app.locals.accrueAll(); } catch (e) { console.error('[tick]', e.message); } }, 30 * 1000);

  const PORT = process.env.PORT || 3001;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n  TradingFXVault`);
    console.log(`  Listening on http://localhost:${PORT}`);
    console.log(`  DB: ${process.env.DB_PATH || 'primevest.db (local)'}`);
    if (process.env.ADMIN_EMAIL) console.log(`  Admin: ${process.env.ADMIN_EMAIL}`);
    console.log('');
  });
}

main().catch(err => { console.error('[Startup Error]', err); process.exit(1); });
