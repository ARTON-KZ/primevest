# PrimeVest

Full-stack crypto investment platform — Node.js + Express + `sql.js` backend, vanilla
HTML/CSS/JS frontend in `public/`. Dark-navy + mint-green design (sampled from
`brand_assets/dash.jpg`), Notion-inspired structure, trillionmines-style landing.

## Run locally

```bash
npm install
cp .env.example .env      # then edit secrets
node server.js            # http://localhost:3001
```

Port 3000 is taken by another app on this machine, so PrimeVest defaults to **3001**
(`PORT=4000 node server.js` to change it).

## Default admin

On first run an admin is seeded from `.env`:

- **Email:** `admin@primevest.com`
- **Password:** `Admin@1234`  ← change `ADMIN_PASSWORD` before going live

Log in at `/login.html`; admins are redirected to `/admin.html`.

## Features

- **Sign up** collects name, email, password, **country, phone (with country code), currency**.
  New accounts are **auto-approved** and get a **welcome email** prompting a deposit.
- **Auto-earnings** — admin sets an amount + interval per user (e.g. `$25 / hour`); the
  balance grows automatically and **ticks live** on the dashboard. Admin can **pause / resume**
  any time. Accrual is computed lazily + on a 30s server tick.
- **Crypto deposits** — per-coin addresses (BTC / ETH / USDT-TRC20), editable in admin.
  User picks a coin, sees address + QR, declares the payment → admin approves to credit.
- **Withdrawals** — user requests a payout to their wallet → admin approves (debits) / rejects.
- **Admin** — users table, per-user drawer (credit/debit, auto-earnings, approve/block,
  reset password, impersonate, clear, delete), pending approvals, crypto settings, admins.

## Web app (PWA)

The site is installable as an app: `manifest.json` + `sw.js` (service worker) +
icons in `public/icons/`. On mobile, "Add to Home Screen" launches straight into
the dashboard, standalone, with the brand icon and dark theme chrome. The service
worker is network-first for pages and never caches `/api/` responses, so money
data is always fresh. Bump `VERSION` in `public/sw.js` when deploying changes.

## Social-proof alerts (600 × 3)

`public/js/alerts-data.js` holds **600 deposit, 600 reinvestment and 600
withdrawal alerts** (generated — regenerate with `node scripts/gen-alerts.cjs`).
`public/js/alerts.js` pops them in a corner card on the landing page and
dashboard every 11–17 s, weighted toward deposits/withdrawals, color-coded per
type (green / amber / blue). The hero "proof line" also rotates through
withdrawal entries. Respects `prefers-reduced-motion`.

## Email (welcome on signup)

Set SMTP creds in `.env` (`SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, …). If they're blank,
the email is logged to the console so local dev still works. Works with Gmail (App
Password), Zoho, Mailgun SMTP, etc.

## Project layout

```
server.js            Express app (API + static), 30s earnings tick
database.js          sql.js schema, prepared statements, earnings accrual
lib/email.js         nodemailer welcome email (+ console fallback)
middleware/auth.js   JWT bearer auth / admin guard
routes/              auth · user · wallet (deposit/withdraw) · admin
public/              index (landing) · register · login · dashboard · admin + css/js
```

## Deploy

Single service (API + frontend together). Set the env vars in your host, point
`DB_PATH` at a mounted volume so data survives restarts, e.g. `DB_PATH=/data/primevest.db`.

## Notes

- The deposit QR loads from `api.qrserver.com`; the address + copy button is the primary
  flow and works regardless. Swap in a bundled QR generator if you want zero external calls.
- The two landing images are **placeholders** (`data-placeholder="hero"` / `"feature"`) —
  drop in real `<img>`s there.
