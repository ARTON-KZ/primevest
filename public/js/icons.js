// Inline SVG icon set. Stroke uses currentColor so CSS controls colour.
(function () {
  const S = (inner, fill) =>
    `<svg viewBox="0 0 24 24" width="24" height="24" fill="${fill ? 'currentColor' : 'none'}" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;
  const st = 'stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"';

  const ICONS = {
    home:     S(`<path d="M4 10.5 12 4l8 6.5" ${st}/><path d="M6 9.8V20h12V9.8" ${st}/><path d="M10 20v-5h4v5" ${st}/>`),
    user:     S(`<circle cx="12" cy="8" r="3.6" ${st}/><path d="M5 19.5c1.6-3.3 4.1-4.8 7-4.8s5.4 1.5 7 4.8" ${st}/>`),
    trade:    S(`<path d="M4 17.5 9.5 12l3.2 3 6.3-7.2" ${st}/><path d="M19 7.8v3.4h-3.4" ${st}/><path d="M4 20h16" ${st}/>`),
    deposit:  S(`<rect x="3" y="6.5" width="18" height="12" rx="2.2" ${st}/><path d="M12 10.5v4M10 12.5h4" ${st}/><path d="M3 10h18" ${st}/>`),
    withdraw: S(`<rect x="3" y="9" width="18" height="11" rx="2.2" ${st}/><path d="M12 7.5 12 1.8M12 1.8 9.6 4.3M12 1.8l2.4 2.5" ${st}/>`),
    logout:   S(`<path d="M14 8V6.2A2.2 2.2 0 0 0 11.8 4H6.2A2.2 2.2 0 0 0 4 6.2v11.6A2.2 2.2 0 0 0 6.2 20h5.6A2.2 2.2 0 0 0 14 17.8V16" ${st}/><path d="M9.5 12H21M21 12l-3-3M21 12l-3 3" ${st}/>`),
    chat:     S(`<path d="M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H9l-4 3.2V6a1 1 0 0 1 1-1Z" ${st}/><path d="M8.5 10h7M8.5 12.7h4.5" ${st}/>`),
    copy:     S(`<rect x="9" y="9" width="11" height="11" rx="2" ${st}/><path d="M5 15V5a1 1 0 0 1 1-1h9" ${st}/>`),
    check:    S(`<path d="M5 12.5l4.2 4.2L19 7" ${st}/>`),
    settings: S(`<circle cx="12" cy="12" r="3.2" ${st}/><path d="M12 2.5v3M12 18.5v3M21.5 12h-3M5.5 12h-3M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1M18.4 18.4l-2.1-2.1M7.7 7.7 5.6 5.6" ${st}/>`),
    users:    S(`<circle cx="9" cy="8" r="3.2" ${st}/><path d="M3.5 19c1.3-2.8 3.3-4.1 5.5-4.1S13.2 16.2 14.5 19" ${st}/><path d="M16 5.2a3.2 3.2 0 0 1 0 6M17.5 14.9c1.6.5 2.8 1.7 3.5 3.1" ${st}/>`),
    wallet:   S(`<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H18v3" ${st}/><path d="M3 7.5V17a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1v-7a1 1 0 0 0-1-1H5.5A2.5 2.5 0 0 1 3 7.5Z" ${st}/><circle cx="16.5" cy="13.5" r="1.2" fill="currentColor"/>`),
  };

  function paint(root) {
    (root || document).querySelectorAll('[data-ic]').forEach(el => {
      const name = el.dataset.ic;
      if (ICONS[name]) el.innerHTML = ICONS[name];
    });
  }
  window.RACK.icons = ICONS;
  window.RACK.paintIcons = paint;
  paint(document);
})();
