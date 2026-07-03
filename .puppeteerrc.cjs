// Puppeteer is a dev-only tool (screenshot workflow). Never download Chrome at
// install time — local dev uses the machine's cached Chrome (screenshot.mjs
// auto-detects it), and production hosts (Railway/Vercel) don't need it at all.
module.exports = { skipDownload: true };
