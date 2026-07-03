require('dotenv').config();
const initSqlJs = require('sql.js');
const bcrypt    = require('bcryptjs');
const fs        = require('fs');
const path      = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'primevest.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

// ── Compatibility shim: small better-sqlite3-style Statement API over sql.js ──
class Statement {
  constructor(db, sql, save) { this._db = db; this._sql = sql; this._save = save; }

  get(...args) {
    const params = args.flat();
    const stmt = this._db.prepare(this._sql);
    if (params.length) stmt.bind(params);
    const row = stmt.step() ? stmt.getAsObject() : undefined;
    stmt.free();
    return row;
  }

  all(...args) {
    const params = args.flat();
    const stmt = this._db.prepare(this._sql);
    if (params.length) stmt.bind(params);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return rows;
  }

  run(...args) {
    const params = args.flat();
    this._db.run(this._sql, params);
    const idStmt = this._db.prepare('SELECT last_insert_rowid() AS lid');
    idStmt.step();
    const lid = idStmt.getAsObject().lid;
    idStmt.free();
    this._save();
    return { lastInsertRowid: lid ?? null };
  }
}

// Money columns the admin may credit / debit (whitelist — interpolated into SQL).
const MONEY_FIELDS = {
  balance: 'balance',
  profit:  'profit',
  deposit: 'deposit_total',
};

// Single-value settable columns (whitelist).
const SETTABLE_FIELDS = {
  name:     'name',
  blocked:  'blocked',
  country:  'country',
  phone:    'phone',
  currency: 'currency',
};

async function initDatabase() {
  const SQL = await initSqlJs();
  const db = fs.existsSync(DB_PATH)
    ? new SQL.Database(fs.readFileSync(DB_PATH))
    : new SQL.Database();

  const save = () => fs.writeFileSync(DB_PATH, Buffer.from(db.export()));

  // ── Schema ─────────────────────────────────────────────────────────────────
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      name          TEXT NOT NULL,
      email         TEXT UNIQUE NOT NULL,
      password      TEXT NOT NULL,
      country       TEXT,
      phone         TEXT,
      currency      TEXT DEFAULT 'USD',
      balance       REAL DEFAULT 0.0,
      profit        REAL DEFAULT 0.0,
      deposit_total REAL DEFAULT 0.0,
      -- Auto-earnings ("auto-increment"): credit earn_amount every
      -- earn_interval_sec while earn_active = 1. Accrual is computed lazily.
      earn_amount       REAL DEFAULT 0.0,
      earn_interval_sec INTEGER DEFAULT 3600,
      earn_active       INTEGER DEFAULT 0,
      earn_last_at      TEXT,
      blocked       INTEGER DEFAULT 0,
      role          TEXT DEFAULT 'user' CHECK(role IN ('user','admin')),
      status        TEXT DEFAULT 'approved' CHECK(status IN ('pending','approved','rejected')),
      created_at    TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS transactions (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL REFERENCES users(id),
      type       TEXT NOT NULL,                 -- deposit | withdrawal | admin_credit | admin_debit
      coin       TEXT,                          -- BTC | ETH | USDT (deposit) or payout network (withdrawal)
      amount     REAL NOT NULL,
      address    TEXT,                          -- destination wallet (withdrawal) / note
      status     TEXT DEFAULT 'pending' CHECK(status IN ('pending','completed','rejected')),
      notes      TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS trades (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL REFERENCES users(id),
      pair       TEXT NOT NULL,
      side       TEXT NOT NULL,
      amount     REAL NOT NULL,
      profit     REAL DEFAULT 0.0,
      outcome    TEXT DEFAULT 'win',
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS login_activity (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL REFERENCES users(id),
      ip         TEXT,
      agent      TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT
    )
  `);
  save();

  // ── Seed admin ───────────────────────────────────────────────────────────────
  const adminRes = db.exec(`SELECT COUNT(*) AS c FROM users WHERE role = 'admin'`);
  if ((adminRes[0]?.values[0][0] ?? 0) === 0) {
    const hash = bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'Admin@1234', 12);
    db.run(
      `INSERT INTO users (name, email, password, role, status) VALUES (?, ?, ?, 'admin', 'approved')`,
      ['Administrator', (process.env.ADMIN_EMAIL || 'admin@primevest.com').toLowerCase(), hash]
    );
    save();
    console.log(`[DB] Admin created: ${process.env.ADMIN_EMAIL || 'admin@primevest.com'}`);
  }

  // ── Seed default settings (crypto addresses + limits) ────────────────────────
  const DEFAULT_SETTINGS = {
    addr_btc:      '',
    addr_eth:      '',
    addr_usdt:     '',
    usdt_network:  'TRC20',
    min_deposit:   '50',
    min_withdraw:  '50',
    support_email: process.env.ADMIN_EMAIL || 'support@primevest.com',
  };
  Object.entries(DEFAULT_SETTINGS).forEach(([k, v]) => {
    const exists = db.exec(`SELECT 1 FROM settings WHERE key = '${k}'`);
    if (!exists.length) db.run(`INSERT INTO settings (key, value) VALUES (?, ?)`, [k, v]);
  });
  save();

  const PUBLIC_COLS = `id, name, email, country, phone, currency, balance, profit, deposit_total,
                       earn_amount, earn_interval_sec, earn_active, earn_last_at,
                       blocked, role, status, created_at`;

  const p = sql => new Statement(db, sql, save);

  const stmts = {
    getUserById:     p(`SELECT ${PUBLIC_COLS} FROM users WHERE id = ?`),
    getUserByIdFull: p(`SELECT * FROM users WHERE id = ?`),
    getUserByEmail:  p(`SELECT * FROM users WHERE email = ?`),
    getAllUsers:     p(`SELECT ${PUBLIC_COLS} FROM users ORDER BY created_at DESC`),
    insertUser:      p(`INSERT INTO users (name, email, password, country, phone, currency, status)
                        VALUES (?, ?, ?, ?, ?, ?, ?)`),
    insertAdmin:     p(`INSERT INTO users (name, email, password, role, status)
                        VALUES (?, ?, ?, 'admin', 'approved')`),
    updatePassword:  p(`UPDATE users SET password = ? WHERE id = ?`),
    updateEmail:     p(`UPDATE users SET email = ? WHERE id = ?`),
    updateUserStatus:p(`UPDATE users SET status = ? WHERE id = ?`),

    insertTransaction:     p(`INSERT INTO transactions (user_id, type, coin, amount, address, status, notes)
                              VALUES (?, ?, ?, ?, ?, ?, ?)`),
    getTransactionsByUser: p(`SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`),
    getTransactionById:    p(`SELECT * FROM transactions WHERE id = ?`),
    getAllTransactions:    p(`SELECT t.*, u.name AS user_name, u.email AS user_email
                              FROM transactions t JOIN users u ON u.id = t.user_id
                              ORDER BY t.created_at DESC LIMIT 200`),
    updateTransactionStatus: p(`UPDATE transactions SET status = ? WHERE id = ?`),

    insertTrade:     p(`INSERT INTO trades (user_id, pair, side, amount, profit, outcome) VALUES (?, ?, ?, ?, ?, ?)`),
    getTradesByUser: p(`SELECT * FROM trades WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`),

    insertLogin:     p(`INSERT INTO login_activity (user_id, ip, agent) VALUES (?, ?, ?)`),
    getLoginsByUser: p(`SELECT * FROM login_activity WHERE user_id = ? ORDER BY created_at DESC LIMIT 25`),

    getAllSettings:  p(`SELECT key, value FROM settings`),
    getSetting:      p(`SELECT value FROM settings WHERE key = ?`),
    setSetting:      p(`INSERT INTO settings (key, value) VALUES (?, ?)
                        ON CONFLICT(key) DO UPDATE SET value = excluded.value`),
  };

  // ── Whitelisted field mutators ───────────────────────────────────────────────
  const adjustField = (userId, field, delta) => {
    const col = MONEY_FIELDS[field];
    if (!col) throw new Error(`Invalid money field: ${field}`);
    db.run(`UPDATE users SET ${col} = ${col} + ? WHERE id = ?`, [delta, userId]);
    save();
  };

  const setField = (userId, field, value) => {
    const col = SETTABLE_FIELDS[field];
    if (!col) throw new Error(`Invalid field: ${field}`);
    db.run(`UPDATE users SET ${col} = ? WHERE id = ?`, [value, userId]);
    save();
  };

  const clearAccount = (userId) => {
    db.run(`UPDATE users SET balance = 0, profit = 0, deposit_total = 0 WHERE id = ?`, [userId]);
    save();
  };

  const deleteUser = (userId) => {
    ['transactions', 'trades', 'login_activity'].forEach(t =>
      db.run(`DELETE FROM ${t} WHERE user_id = ?`, [userId]));
    db.run(`DELETE FROM users WHERE id = ?`, [userId]);
    save();
  };

  // Atomic deposit approval: mark completed, credit balance + deposit total.
  const completeDeposit = (txnId, userId, amount) => {
    db.run(`UPDATE transactions SET status = 'completed' WHERE id = ?`, [txnId]);
    db.run(`UPDATE users SET balance = balance + ?, deposit_total = deposit_total + ? WHERE id = ?`,
      [amount, amount, userId]);
    save();
  };

  // Atomic withdrawal approval: mark completed, debit balance.
  const completeWithdrawal = (txnId, userId, amount) => {
    db.run(`UPDATE transactions SET status = 'completed' WHERE id = ?`, [txnId]);
    db.run(`UPDATE users SET balance = balance - ? WHERE id = ?`, [amount, userId]);
    save();
  };

  // ── Auto-earnings: configure + lazy accrual ──────────────────────────────────
  const nowSql = () => new Date().toISOString().slice(0, 19).replace('T', ' ');

  // Credit any whole intervals that have elapsed since earn_last_at. Returns the
  // up-to-date user row. Called on every profile read and on a periodic tick.
  const accrueEarnings = (userId) => {
    const u = stmts.getUserByIdFull.get(userId);
    if (!u) return u;
    if (u.earn_active && u.earn_amount > 0 && u.earn_interval_sec > 0) {
      const lastMs = u.earn_last_at ? Date.parse(u.earn_last_at.replace(' ', 'T') + 'Z') : Date.now();
      const elapsed = Math.floor((Date.now() - lastMs) / 1000);
      const intervals = Math.floor(elapsed / u.earn_interval_sec);
      if (intervals > 0) {
        const credit = intervals * u.earn_amount;
        const newLastMs = lastMs + intervals * u.earn_interval_sec * 1000;
        const newLast = new Date(newLastMs).toISOString().slice(0, 19).replace('T', ' ');
        db.run(`UPDATE users SET balance = balance + ?, earn_last_at = ? WHERE id = ?`,
          [credit, newLast, userId]);
        save();
      }
    }
    return stmts.getUserByIdFull.get(userId);
  };

  // Admin configures the earning rate. Accrues outstanding amount first so a
  // rate change never retroactively over/under-pays.
  const setEarnings = (userId, { amount, interval_sec, active }) => {
    accrueEarnings(userId);
    const sets = [], vals = [];
    if (amount !== undefined)       { sets.push('earn_amount = ?');       vals.push(amount); }
    if (interval_sec !== undefined) { sets.push('earn_interval_sec = ?'); vals.push(interval_sec); }
    if (active !== undefined)       { sets.push('earn_active = ?');       vals.push(active ? 1 : 0); }
    // When (re)activating, reset the clock so accrual starts from now.
    if (active) { sets.push('earn_last_at = ?'); vals.push(nowSql()); }
    if (!sets.length) return stmts.getUserById.get(userId);
    vals.push(userId);
    db.run(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, vals);
    save();
    return stmts.getUserById.get(userId);
  };

  // Accrue for every active earner (used by the server's periodic tick).
  const accrueAll = () => {
    const ids = db.exec(`SELECT id FROM users WHERE earn_active = 1 AND earn_amount > 0`);
    (ids[0]?.values || []).forEach(([id]) => accrueEarnings(id));
  };

  return {
    db, stmts, save,
    adjustField, setField, clearAccount, deleteUser,
    completeDeposit, completeWithdrawal,
    accrueEarnings, setEarnings, accrueAll,
    MONEY_FIELDS, SETTABLE_FIELDS,
  };
}

module.exports = initDatabase;
