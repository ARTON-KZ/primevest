// Register + login form handling.
(function () {
  const { api, Auth } = window.RACK;

  // If already authenticated, skip the auth screens.
  if (Auth.token) {
    location.href = Auth.isAdmin ? 'admin.html' : 'dashboard.html';
    return;
  }

  const CURRENCIES = ['USD','EUR','GBP','CAD','AUD','NGN','ZAR','INR','JPY','CNY','CHF','SGD','HKD','AED','BRL','SEK','NOK','KES','GHS',
    'ZMW','MWK','MYR','TZS','UGX','RWF','ETB','XAF','XOF','BWP','NAD','MZN','AOA','ZWL','CDF','EGP','MAD','TND','LKR','NPR','BDT','PKR',
    'PHP','THB','VND','IDR','KRW','MXN','ARS','CLP','COP','PEN','TRY','SAR','QAR','KWD','BHD','OMR','JOD','ILS','PLN','CZK','RON','DKK','RUB','UAH'];

  function showError(msg) {
    const box = document.getElementById('formError');
    box.textContent = msg;
    box.classList.remove('hidden');
    box.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  function setLoading(btn, loading, label) {
    btn.disabled = loading;
    btn.innerHTML = loading ? '<span class="spinner"></span>' : label;
  }
  function afterAuth(session) {
    Auth.set(session);
    location.href = session.user.role === 'admin' ? 'admin.html' : 'dashboard.html';
  }

  // ── Register ─────────────────────────────────────────────────────────────────
  const registerForm = document.getElementById('registerForm');
  if (registerForm) {
    const countrySel = document.getElementById('country');
    const currencySel = document.getElementById('currency');
    const dialCode = document.getElementById('dialCode');

    (window.RACK.COUNTRIES || []).forEach(c => {
      const o = document.createElement('option');
      o.value = c.n; o.textContent = c.n; o.dataset.dial = c.d; o.dataset.cur = c.c;
      countrySel.appendChild(o);
    });
    CURRENCIES.forEach(cur => {
      const o = document.createElement('option');
      o.value = cur; o.textContent = cur;
      currencySel.appendChild(o);
    });
    currencySel.value = 'USD';

    countrySel.addEventListener('change', () => {
      const opt = countrySel.selectedOptions[0];
      if (opt && opt.dataset.dial) dialCode.value = opt.dataset.dial;
      if (opt && opt.dataset.cur && CURRENCIES.includes(opt.dataset.cur)) currencySel.value = opt.dataset.cur;
    });

    // Prefill email from the landing newsletter handoff (?email=).
    const qEmail = new URLSearchParams(location.search).get('email');
    if (qEmail) document.getElementById('email').value = qEmail;

    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('submitBtn');
      const number = document.getElementById('phone').value.trim();
      const phone = `${dialCode.value.trim()} ${number}`.trim();
      const payload = {
        name: document.getElementById('name').value.trim(),
        email: document.getElementById('email').value.trim(),
        password: document.getElementById('password').value,
        country: countrySel.value,
        phone,
        address: document.getElementById('address').value.trim(),
        currency: currencySel.value,
      };
      if (!payload.country) return showError('Please select your country.');
      setLoading(btn, true, 'Create account');
      try {
        const session = await api.post('/api/auth/register', payload);
        afterAuth(session);
      } catch (err) {
        showError(err.message);
        setLoading(btn, false, 'Create account');
      }
    });
  }

  // ── Login ────────────────────────────────────────────────────────────────────
  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    // Prefill from the landing-page handoff (?email=).
    const qEmail = new URLSearchParams(location.search).get('email');
    if (qEmail) document.getElementById('email').value = qEmail;
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('submitBtn');
      setLoading(btn, true, 'Log in');
      try {
        const session = await api.post('/api/auth/login', {
          email: document.getElementById('email').value.trim(),
          password: document.getElementById('password').value,
        });
        afterAuth(session);
      } catch (err) {
        showError(err.message);
        setLoading(btn, false, 'Log in');
      }
    });
  }
})();
