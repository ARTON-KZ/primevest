// API base. Same-origin in this all-in-one deploy; override if the frontend is
// ever hosted separately from the backend.
window.RACK = window.RACK || {};
window.RACK.API = window.location.origin;
window.RACK.BRAND = 'PrimeVest';
