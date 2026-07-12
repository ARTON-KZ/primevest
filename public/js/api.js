// Shared API client + auth/session helpers + toast notifications.
(function () {
  const API = window.RACK.API;
  const TOKEN_KEY = 'rack_token';
  const USER_KEY  = 'rack_user';

  const Auth = {
    get token() { return localStorage.getItem(TOKEN_KEY); },
    get user()  { try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch { return null; } },
    set(session) {
      localStorage.setItem(TOKEN_KEY, session.token);
      localStorage.setItem(USER_KEY, JSON.stringify(session.user));
    },
    patchUser(partial) {
      const u = { ...(this.user || {}), ...partial };
      localStorage.setItem(USER_KEY, JSON.stringify(u));
      return u;
    },
    clear() { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); },
    get isAdmin() { return this.user && this.user.role === 'admin'; },
  };

  async function request(method, path, body) {
    const headers = { 'Content-Type': 'application/json' };
    if (Auth.token) headers.Authorization = 'Bearer ' + Auth.token;
    let res;
    try {
      res = await fetch(API + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    } catch {
      throw new Error('Network error — is the server running?');
    }
    let data = {};
    try { data = await res.json(); } catch { /* no body */ }
    if (res.status === 401 && Auth.token) {
      Auth.clear();
      if (!location.pathname.endsWith('login.html')) location.href = 'login.html';
    }
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  }

  const api = {
    get:   (p) => request('GET', p),
    post:  (p, b) => request('POST', p, b),
    patch: (p, b) => request('PATCH', p, b),
    del:   (p) => request('DELETE', p),
  };

  // ── Toast ──────────────────────────────────────────────────────────────────
  function toast(message, type) {
    let wrap = document.getElementById('toast-wrap');
    if (!wrap) { wrap = document.createElement('div'); wrap.id = 'toast-wrap'; document.body.appendChild(wrap); }
    const el = document.createElement('div');
    el.className = 'toast' + (type === 'error' ? ' error' : '');
    el.textContent = message;
    wrap.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateY(8px)'; setTimeout(() => el.remove(), 250); }, 3600);
  }

  // ── Formatting ───────────────────────────────────────────────────────────────
  const SYMBOLS = {
    USD: '$', EUR: '€', GBP: '£', NGN: '₦', CAD: 'C$', AUD: 'A$', INR: '₹', JPY: '¥', ZAR: 'R', BRL: 'R$',
    ZMW: 'ZK', MWK: 'MK', MYR: 'RM', TZS: 'TSh', UGX: 'USh', RWF: 'FRw', ETB: 'Br', XAF: 'FCFA', XOF: 'CFA',
    BWP: 'P', NAD: 'N$', MZN: 'MT', AOA: 'Kz', CDF: 'FC', EGP: 'E£', MAD: 'DH', TND: 'DT', LKR: 'Rs', NPR: 'Rs',
    BDT: '৳', PKR: 'Rs', PHP: '₱', THB: '฿', VND: '₫', IDR: 'Rp', KRW: '₩', MXN: 'MX$', ARS: 'AR$', CLP: 'CL$',
    COP: 'CO$', PEN: 'S/', TRY: '₺', SAR: 'SR', QAR: 'QR', KWD: 'KD', BHD: 'BD', OMR: 'OMR', JOD: 'JD',
    ILS: '₪', PLN: 'zł', CZK: 'Kč', RON: 'lei', DKK: 'kr', SEK: 'kr', NOK: 'kr', RUB: '₽', UAH: '₴',
    CHF: 'CHF', SGD: 'S$', HKD: 'HK$', AED: 'AED', KES: 'KSh', GHS: '₵', CNY: '¥',
  };
  function symbol(cur) { return SYMBOLS[(cur || 'USD').toUpperCase()] || '$'; }
  function money(n, cur) {
    const v = Number(n || 0);
    return symbol(cur) + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function requireAuth(adminOnly) {
    if (!Auth.token) { location.href = 'login.html'; return false; }
    if (adminOnly && !Auth.isAdmin) { location.href = 'dashboard.html'; return false; }
    return true;
  }

  window.RACK.api = api;
  window.RACK.Auth = Auth;
  window.RACK.toast = toast;
  window.RACK.money = money;
  window.RACK.symbol = symbol;
  window.RACK.requireAuth = requireAuth;
})();
