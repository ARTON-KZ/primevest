// Landing page interactions: mobile nav, ticking demo balance, newsletter.
(function () {
  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // Mobile nav toggle
  const burger = document.getElementById('navBurger');
  const links = document.getElementById('navLinks');
  if (burger) burger.addEventListener('click', () => links.classList.toggle('open'));
  links.querySelectorAll('a').forEach(a => a.addEventListener('click', () => links.classList.remove('open')));

  // Live ticking demo balance (the signature) — eases up to a base then drifts.
  const balanceEl = document.getElementById('demoBalance');
  const gainEl = document.getElementById('demoGain');
  const fmt = (n) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let base = 48250;          // starting portfolio value
  const ratePerSec = 0.42;   // visible upward drift
  let gain = 318.40;
  const start = performance.now();

  function frame(t) {
    const secs = (t - start) / 1000;
    const intro = Math.min(secs / 1.4, 1);          // ease-in count-up on load
    const eased = 1 - Math.pow(1 - intro, 3);
    const value = base * eased + ratePerSec * secs;
    balanceEl.textContent = fmt(value);
    gainEl.textContent = '+' + fmt(gain + ratePerSec * secs).slice(1);
    if (!reduced) requestAnimationFrame(frame);
  }
  if (reduced) { balanceEl.textContent = fmt(base); gainEl.textContent = '+' + fmt(gain).slice(1); }
  else requestAnimationFrame(frame);

  // Newsletter → send to register with the email prefilled.
  const form = document.getElementById('newsletter');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = form.querySelector('input').value.trim();
    // Login-first flow: new visitors land on the login page and can move to
    // signup from there. The email travels along for prefill.
    location.href = 'login.html' + (email ? ('?email=' + encodeURIComponent(email)) : '');
  });

  // ── Live market ticker (marquee, duplicated for a seamless loop) ────────────
  const MARKETS = [
    ['BTC/USD', 67432.18, +2.4], ['ETH/USD', 3518.04, +1.8], ['SOL/USD', 168.42, +4.1],
    ['BNB/USD', 604.77, -0.6], ['XRP/USD', 0.62, +1.1], ['ADA/USD', 0.46, -0.8],
    ['DOGE/USD', 0.16, +3.2], ['AVAX/USD', 38.11, +2.0], ['DOT/USD', 7.42, -0.4],
    ['LINK/USD', 17.85, +1.5], ['MATIC/USD', 0.72, +0.9], ['LTC/USD', 84.6, -1.2],
  ];
  const track = document.getElementById('tickerTrack');
  if (track) {
    const item = ([s, p, c]) =>
      `<span class="tick-item"><span class="tick-sym">${s}</span><span class="tick-price">$${p.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span><span class="tick-chg ${c >= 0 ? 'up' : 'down'}">${c >= 0 ? '▲' : '▼'} ${Math.abs(c).toFixed(1)}%</span></span>`;
    const half = MARKETS.map(item).join('');
    track.innerHTML = half + half; // -50% translate = one full set
  }

  // ── Hero proof line: rotate real withdrawal alerts through it ───────────────
  const proofLine = document.getElementById('proofLine');
  function rotateProof() {
    const pool = (window.ALERTS && window.ALERTS.withdrawals) || [];
    if (!proofLine || !pool.length || reduced) return;
    let i = Math.floor(Math.random() * pool.length);
    setInterval(() => {
      const a = pool[i++ % pool.length];
      proofLine.style.opacity = '0';
      setTimeout(() => {
        proofLine.innerHTML = `<strong>${a.n}</strong> from ${a.l.split(',')[0]} withdrew <strong>$${a.a.toLocaleString('en-US')}</strong>`;
        proofLine.style.opacity = '1';
      }, 300);
    }, 6000);
    proofLine.style.transition = 'opacity 0.3s ease';
  }
  // alerts-data.js is deferred; wait for it.
  window.addEventListener('load', rotateProof);

  // ── Footer contact (admin-editable in Settings → shown here) ────────────────
  fetch((window.RACK && window.RACK.API ? window.RACK.API : '') + '/api/public/contact')
    .then(r => r.json())
    .then(c => {
      const set = (id, v) => { const el = document.getElementById(id); if (el && v) el.textContent = v; };
      set('footOffice', c.office);
      set('footAddress', c.address);
      const wa = document.getElementById('footWhatsapp');
      if (wa && c.whatsapp) {
        wa.textContent = 'WhatsApp: ' + c.whatsapp;
        wa.href = 'https://wa.me/' + c.whatsapp.replace(/[^\d]/g, '');
      }
      const em = document.getElementById('footEmail');
      if (em && c.email) {
        em.textContent = c.email;
        em.href = 'mailto:' + c.email;
      }
    })
    .catch(() => { /* keep the defaults baked into the HTML */ });

  // ── Scroll reveals (hidden state is opt-in via .rv so no-JS still shows all) ─
  const revealEls = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && !reduced) {
    document.documentElement.classList.add('rv');
    const io = new IntersectionObserver((entries) => {
      entries.forEach(en => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
    }, { threshold: 0.12, rootMargin: '0px 0px -30px 0px' });
    revealEls.forEach(el => io.observe(el));
  }
})();
