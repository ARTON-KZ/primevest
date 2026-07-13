// User dashboard: profile, live-ticking balance, deposit/withdraw, tabs.
(function () {
  const { api, Auth, toast, money } = window.RACK;
  if (!window.RACK.requireAuth()) return;
  if (Auth.isAdmin) { location.href = 'admin.html'; return; }

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let profile = null;
  let wallet = null;
  let currency = (Auth.user && Auth.user.currency) || 'USD';
  let activeCoin = 'BTC';

  const $ = (id) => document.getElementById(id);
  const balanceEl = $('balanceAmount');

  // ── Live-ticking balance ─────────────────────────────────────────────────────
  let tick = { base: 0, rate: 0, startPerf: 0, baseFrac: 0, active: false };
  let rafId = null;

  function setupTick(p) {
    const active = !!p.earn_active && p.earn_amount > 0 && p.earn_interval_sec > 0;
    const rate = active ? p.earn_amount / p.earn_interval_sec : 0;
    let baseFrac = 0;
    if (active && p.earn_last_at && p.server_time) {
      const lastMs = Date.parse(p.earn_last_at.replace(' ', 'T') + 'Z');
      if (!isNaN(lastMs)) baseFrac = Math.max(0, (p.server_time - lastMs) / 1000);
    }
    tick = { base: p.balance || 0, rate, startPerf: performance.now(), baseFrac, active };
    $('earnBadge').classList.toggle('hidden', !active);
    if (reduced || !active) {
      balanceEl.textContent = money(tick.base, currency);
      if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    } else if (!rafId) {
      frame();
    }
  }
  function frame() {
    const elapsed = (performance.now() - tick.startPerf) / 1000;
    balanceEl.textContent = money(tick.base + tick.rate * (tick.baseFrac + elapsed), currency);
    rafId = requestAnimationFrame(frame);
  }

  // ── Load + render profile ────────────────────────────────────────────────────
  async function loadProfile() {
    profile = await api.get('/api/user/profile');
    currency = profile.currency || 'USD';
    Auth.patchUser(profile);
    $('curBadge').textContent = currency;
    $('hello').textContent = 'Welcome back, ' + (profile.name || '').split(' ')[0];
    $('profitAmount').textContent = money(profile.profit, currency);
    $('depositAmount').textContent = money(profile.deposit_total, currency);
    $('lockedAmount').textContent = money(profile.locked, currency);
    $('availBalance').textContent = money(profile.balance, currency);
    renderAccount();
    setupTick(profile);
  }

  function renderAccount() {
    const p = profile;
    const initials = (p.name || '?').split(' ').map(s => s[0]).slice(0, 2).join('').toUpperCase();
    $('avatar').textContent = initials;
    $('profileName').textContent = p.name;
    $('profileEmail').textContent = p.email;
    $('pCountry').textContent = p.country || '—';
    $('pPhone').textContent = p.phone || '—';
    $('pAddress').textContent = p.address || '—';
    $('pCurrency').textContent = p.currency || 'USD';
    $('pSince').textContent = (p.created_at || '').split(' ')[0] || '—';
    $('pStatus').innerHTML = '<span class="badge green"><span class="dot"></span>Active</span>';
  }

  // ── Activity (transactions) ──────────────────────────────────────────────────
  function txnLabel(t) {
    if (t.type === 'deposit') return 'Deposit' + (t.coin ? ' · ' + t.coin : '');
    if (t.type === 'withdrawal') return 'Withdrawal' + (t.coin ? ' · ' + t.coin : '');
    if (t.type === 'admin_credit') return 'Account credit';
    if (t.type === 'admin_debit') return 'Account debit';
    return t.type;
  }
  function statusBadge(s) {
    const cls = s === 'completed' ? 'green' : s === 'rejected' ? 'red' : 'amber';
    return `<span class="badge ${cls}">${s}</span>`;
  }
  async function renderActivity() {
    const el = $('activityList');
    try {
      const txns = await api.get('/api/user/transactions');
      if (!txns.length) { el.innerHTML = '<div class="empty">No activity yet. Make your first deposit to get started.</div>'; return; }
      const isOut = (t) => t.type === 'withdrawal' || t.type === 'admin_debit';
      el.innerHTML = txns.map(t => `
        <div class="row">
          <div class="row-left">
            <div class="row-ic ${isOut(t) ? 'out' : 'in'}">${isOut(t) ? '↑' : '↓'}</div>
            <div>
              <div class="row-title">${txnLabel(t)}</div>
              <div class="row-sub">${(t.created_at || '').replace('T', ' ')} · ${statusBadge(t.status)}</div>
            </div>
          </div>
          <div class="row-amount ${isOut(t) ? 'neg' : 'pos'}">${isOut(t) ? '−' : '+'}${money(t.amount, currency).replace(window.RACK.symbol(currency), window.RACK.symbol(currency))}</div>
        </div>`).join('');
    } catch (e) { el.innerHTML = `<div class="empty">${e.message}</div>`; }
  }

  // ── Trade panel ──────────────────────────────────────────────────────────────
  const MARKETS = [
    { t: 'BTC', n: 'Bitcoin',  p: 67432.18, c: +2.4 },
    { t: 'ETH', n: 'Ethereum', p: 3518.04,  c: +1.8 },
    { t: 'SOL', n: 'Solana',   p: 168.42,   c: +4.1 },
    { t: 'BNB', n: 'BNB',      p: 604.77,   c: -0.6 },
    { t: 'USDT',n: 'Tether',   p: 1.00,     c: +0.0 },
  ];
  let tradeLoaded = false;
  async function renderTrade() {
    if (tradeLoaded) return; tradeLoaded = true;
    $('markets').innerHTML = MARKETS.map(m => `
      <div class="market-row">
        <div class="market-coin">
          <div class="market-badge">${m.t}</div>
          <div><div class="market-name">${m.n}</div><div class="market-tic">${m.t}/USD</div></div>
        </div>
        <div>
          <div class="market-price">$${m.p.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
          <div class="market-chg ${m.c >= 0 ? 'up' : 'down'}" style="text-align:right">${m.c >= 0 ? '▲' : '▼'} ${Math.abs(m.c).toFixed(1)}%</div>
        </div>
      </div>`).join('');
    const el = $('tradeList');
    try {
      const trades = await api.get('/api/user/trades');
      if (!trades.length) { el.innerHTML = '<div class="empty">No trades yet. Your trade history will appear here.</div>'; return; }
      el.innerHTML = trades.map(t => `
        <div class="row">
          <div class="row-left">
            <div class="row-ic in">${t.side === 'sell' ? '↓' : '↑'}</div>
            <div><div class="row-title">${t.pair} · ${t.side}</div><div class="row-sub">${(t.created_at || '').replace('T', ' ')}</div></div>
          </div>
          <div class="row-amount ${t.profit >= 0 ? 'pos' : 'neg'}">${t.profit >= 0 ? '+' : ''}${money(t.profit, currency)}</div>
        </div>`).join('');
    } catch (e) { el.innerHTML = `<div class="empty">${e.message}</div>`; }
  }

  // ── Deposit panel ────────────────────────────────────────────────────────────
  async function loadWallet() {
    if (wallet) return wallet;
    wallet = await api.get('/api/wallet/info');
    $('minDepHint').textContent = `Minimum deposit $${wallet.min_deposit}.`;
    $('minWdHint').textContent = `Minimum withdrawal $${wallet.min_withdraw}.`;
    renderCoin(activeCoin);
    return wallet;
  }
  function renderCoin(code) {
    activeCoin = code;
    document.querySelectorAll('#coinTabs .coin-tab').forEach(b => b.classList.toggle('active', b.dataset.coin === code));
    const coin = (wallet.coins || []).find(c => c.code === code) || {};
    $('coinLabel').textContent = coin.label || code;
    $('netLabel').textContent = coin.network ? '(' + coin.network + ')' : '';
    const addr = coin.address || '';
    $('depAddress').textContent = addr || 'Address not configured yet — contact support.';
    const qr = $('qr');
    qr.classList.remove('loaded');
    const phGlyph = '<svg viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="7" height="7" rx="1" stroke="currentColor" stroke-width="1.6"/><rect x="14" y="3" width="7" height="7" rx="1" stroke="currentColor" stroke-width="1.6"/><rect x="3" y="14" width="7" height="7" rx="1" stroke="currentColor" stroke-width="1.6"/><path d="M14 14h3v3M21 14v7h-7" stroke="currentColor" stroke-width="1.6"/></svg>';
    if (addr) {
      qr.innerHTML = `<div class="qr-ph">${phGlyph}<span>Scan to pay</span></div>`;
      const img = new Image();
      img.alt = 'Deposit QR';
      img.onload = () => { qr.classList.add('loaded'); qr.innerHTML = ''; qr.appendChild(img); };
      img.src = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&margin=8&data=${encodeURIComponent(addr)}`;
      $('addrHint').textContent = `Send only ${coin.label || code} ${coin.network ? '(' + coin.network + ') ' : ''}to this address.`;
    } else {
      qr.innerHTML = `<div class="qr-ph">${phGlyph}<span>No address set</span></div>`;
      $('addrHint').textContent = '';
    }
  }

  // ── Tab switching ────────────────────────────────────────────────────────────
  const TITLES = { dashboard: 'Dashboard', account: 'Account', trade: 'Trade', deposit: 'Deposit', withdraw: 'Withdraw' };
  function switchTab(tab) {
    document.querySelectorAll('.panel').forEach(p => p.classList.toggle('hidden', p.dataset.panel !== tab));
    document.querySelectorAll('[data-tab]').forEach(b => { if (b.classList.contains('nav-item') || b.classList.contains('bot-item')) b.classList.toggle('active', b.dataset.tab === tab); });
    $('pageTitle').textContent = TITLES[tab] || 'Dashboard';
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (tab === 'trade') renderTrade();
    if (tab === 'deposit' || tab === 'withdraw') loadWallet().catch(e => toast(e.message, 'error'));
  }

  document.querySelectorAll('[data-tab]').forEach(btn => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));
  document.querySelectorAll('#coinTabs .coin-tab').forEach(b => b.addEventListener('click', () => renderCoin(b.dataset.coin)));

  // Copy address
  $('copyAddr').addEventListener('click', async () => {
    const addr = $('depAddress').textContent;
    try { await navigator.clipboard.writeText(addr); toast('Address copied'); } catch { toast('Copy failed', 'error'); }
  });

  // Deposit submit
  $('depositForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('depBtn'); const amount = parseFloat($('depAmount').value);
    btn.disabled = true;
    try {
      const r = await api.post('/api/wallet/deposit', { coin: activeCoin, amount });
      toast(r.message);
      $('depAmount').value = '';
      renderActivity();
    } catch (err) { toast(err.message, 'error'); }
    btn.disabled = false;
  });

  // Withdraw method toggle (crypto wallet ⇄ bank account)
  let wdMethod = 'crypto';
  document.querySelectorAll('#wdMethodTabs .coin-tab').forEach(b => b.addEventListener('click', () => {
    wdMethod = b.dataset.method;
    document.querySelectorAll('#wdMethodTabs .coin-tab').forEach(x => x.classList.toggle('active', x === b));
    $('wdCryptoFields').classList.toggle('hidden', wdMethod !== 'crypto');
    $('wdBankFields').classList.toggle('hidden', wdMethod !== 'bank');
  }));

  // Withdraw submit
  $('withdrawForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('wdBtn');
    btn.disabled = true;
    try {
      const payload = { method: wdMethod, amount: parseFloat($('wdAmount').value) };
      if (wdMethod === 'bank') {
        payload.bank_name = $('wdBankName').value.trim();
        payload.account_name = $('wdAccountName').value.trim();
        payload.account_number = $('wdAccountNumber').value.trim();
      } else {
        payload.coin = $('wdCoin').value;
        payload.address = $('wdAddress').value.trim();
      }
      const r = await api.post('/api/wallet/withdraw', payload);
      toast(r.message);
      $('wdAmount').value = ''; $('wdAddress').value = '';
      $('wdBankName').value = ''; $('wdAccountName').value = ''; $('wdAccountNumber').value = '';
      renderActivity();
    } catch (err) { toast(err.message, 'error'); }
    btn.disabled = false;
  });

  // Logout + support
  function logout() { Auth.clear(); location.href = 'login.html'; }
  ['logoutDesktop', 'logoutMobile', 'logoutAccount'].forEach(id => { const el = $(id); if (el) el.addEventListener('click', logout); });
  $('supportFab').addEventListener('click', () => toast('Need help? Email ' + (wallet?.support_email || 'tradingfxvault@gmail.com')));

  // ── Live markets: TradingView chart + crypto converter ──────────────────────
  function initChart() {
    const wrap = $('tvChart');
    if (!wrap || wrap.dataset.ready) return;
    wrap.dataset.ready = '1';
    const s = document.createElement('script');
    s.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    s.async = true;
    s.innerHTML = JSON.stringify({
      autosize: true,
      symbol: 'BINANCE:BTCUSDT',
      interval: '60',
      timezone: 'Etc/UTC',
      theme: 'dark',
      style: '1',
      locale: 'en',
      backgroundColor: 'rgba(13, 22, 38, 1)',
      gridColor: 'rgba(29, 44, 71, 0.4)',
      hide_top_toolbar: false,
      allow_symbol_change: true,
      save_image: false,
      calendar: false,
    });
    wrap.appendChild(s);
  }

  const RATES = { USD: 1, BTC: 67432, ETH: 3518, USDT: 1 }; // fallback, refreshed live below
  async function refreshRates() {
    try {
      const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,tether&vs_currencies=usd');
      const j = await r.json();
      if (j.bitcoin?.usd) RATES.BTC = j.bitcoin.usd;
      if (j.ethereum?.usd) RATES.ETH = j.ethereum.usd;
      if (j.tether?.usd) RATES.USDT = j.tether.usd;
    } catch { /* keep fallback rates */ }
    convert();
  }
  function convert() {
    const amt = parseFloat($('convAmount').value) || 0;
    const from = $('convFrom').value, to = $('convTo').value;
    const usd = amt * RATES[from];
    const out = usd / RATES[to];
    $('convResult').value = out ? out.toLocaleString('en-US', { maximumFractionDigits: out < 1 ? 8 : 2 }) : '0';
    $('convRate').textContent = `1 ${from} ≈ ${(RATES[from] / RATES[to]).toLocaleString('en-US', { maximumFractionDigits: RATES[from] / RATES[to] < 1 ? 8 : 2 })} ${to}`;
  }
  ['convAmount', 'convFrom', 'convTo'].forEach(id => { const el = $(id); if (el) { el.addEventListener('input', convert); el.addEventListener('change', convert); } });
  const swapBtn = $('convSwap');
  if (swapBtn) swapBtn.addEventListener('click', () => {
    const f = $('convFrom').value; $('convFrom').value = $('convTo').value; $('convTo').value = f; convert();
  });

  // Re-sync the balance with the server periodically (keeps the tick accurate).
  setInterval(() => { loadProfile().catch(() => {}); }, 25000);

  // Init
  switchTab('dashboard');
  loadProfile().then(renderActivity).catch(e => toast(e.message, 'error'));
  initChart();
  refreshRates();
})();
