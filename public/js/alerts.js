/* Social-proof alert popups — cycles the 600×3 generated alerts
   (deposits / reinvestments / withdrawals) in a corner card.
   Loaded after alerts-data.js (which defines window.ALERTS). */
(function () {
  'use strict';
  const DATA = window.ALERTS || {};
  const pools = [
    { list: DATA.deposits || [],      verb: 'deposited',  cls: 'dep' },
    { list: DATA.reinvestments || [], verb: 'reinvested', cls: 'rei' },
    { list: DATA.withdrawals || [],   verb: 'withdrew',   cls: 'wd'  },
  ].filter(p => p.list.length);
  if (!pools.length) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion) return;

  function shuffle(a) { const r = a.slice(); for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; }
  pools.forEach(p => { p.deck = shuffle(p.list); p.cursor = 0; });

  // Weighted pick: deposits and withdrawals show more than reinvestments.
  const weights = [0.38, 0.24, 0.38];
  function nextAlert() {
    let r = Math.random(), idx = 0;
    for (let i = 0; i < pools.length; i++) { r -= weights[i] ?? (1 / pools.length); if (r <= 0) { idx = i; break; } }
    const p = pools[idx];
    return { ...p.deck[p.cursor++ % p.deck.length], verb: p.verb, cls: p.cls };
  }

  const host = document.createElement('div');
  host.id = 'proof-host';
  host.setAttribute('aria-live', 'polite');
  document.body.appendChild(host);

  const ICONS = {
    dep: '<svg viewBox="0 0 24 24" fill="none"><path d="M12 4v11M12 15l-4-4M12 15l4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 19h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    rei: '<svg viewBox="0 0 24 24" fill="none"><path d="M4 12a8 8 0 0 1 13.6-5.7M20 12a8 8 0 0 1-13.6 5.7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M17.8 2.8v3.6h-3.6M6.2 21.2v-3.6h3.6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    wd:  '<svg viewBox="0 0 24 24" fill="none"><path d="M12 20V9M12 9l-4 4M12 9l4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 5h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  };
  const timeAgo = () => { const m = 1 + Math.floor(Math.random() * 44); return m < 2 ? 'just now' : m + ' min ago'; };
  const fmt = (n) => '$' + n.toLocaleString('en-US');

  let hideTimer = null;
  function show() {
    const a = nextAlert();
    host.innerHTML = `
      <div class="proof-card ${a.cls}">
        <div class="proof-ic">${ICONS[a.cls]}</div>
        <div class="proof-body">
          <div class="proof-line"><strong>${a.n}</strong> ${a.verb} <strong class="proof-amt">${fmt(a.a)}</strong> <span class="proof-coin">${a.c}</span></div>
          <div class="proof-meta">${a.l} · ${timeAgo()} · <span class="proof-check">✓ verified</span></div>
        </div>
      </div>`;
    requestAnimationFrame(() => host.classList.add('show'));
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => host.classList.remove('show'), 5200);
  }

  setTimeout(show, 3500);                                    // first pop
  setInterval(show, 11000 + Math.random() * 6000);           // then every 11–17s
})();
