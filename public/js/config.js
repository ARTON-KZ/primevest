/* Frontend → backend wiring.
   - Served by the Express app itself (localhost or Railway): same-origin API.
   - Served as a static site elsewhere (Vercel): calls the Railway backend by
     its full URL below. Update BACKEND if the Railway domain ever changes. */
(function () {
  var BACKEND = 'https://primevest-production.up.railway.app';
  var sameOrigin =
    location.hostname === 'localhost' ||
    location.hostname === '127.0.0.1' ||
    location.hostname.endsWith('.up.railway.app');
  window.RACK = window.RACK || {};
  window.RACK.API = sameOrigin || BACKEND.indexOf('PLACEHOLDER') !== -1
    ? window.location.origin
    : BACKEND;
  window.RACK.BRAND = 'PrimeVest';
})();
