import puppeteer from "puppeteer";
import { readdir, access, mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { homedir, tmpdir } from "node:os";
const OUT = "C:/Users/USER PC/Desktop/rack invest/temporary screenshots";
async function chrome() { const d = join(homedir(), ".cache", "puppeteer", "chrome"); for (const x of (await readdir(d)).sort().reverse()) { const e = join(d, x, "chrome-win64", "chrome.exe"); try { await access(e); return e; } catch {} } }
async function idx() { const f = await readdir(OUT).catch(() => []); let m = 0; f.forEach(x => { const r = x.match(/^screenshot-(\d+)/); if (r) m = Math.max(m, +r[1]); }); return m + 1; }
const br = await puppeteer.launch({ headless: true, executablePath: await chrome(), userDataDir: await mkdtemp(join(tmpdir(), "pv-")), args: ["--no-sandbox"] });

let p = await br.newPage();
await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true });
await p.goto("http://localhost:3001", { waitUntil: "networkidle2" });
await new Promise(r => setTimeout(r, 3200));
await p.screenshot({ path: join(OUT, `screenshot-${await idx()}-v9-hero-mobile-clear.png`) });
console.log("saved mobile");
await p.close();

p = await br.newPage();
await p.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
await p.goto("http://localhost:3001", { waitUntil: "networkidle2" });
await new Promise(r => setTimeout(r, 3200));
await p.screenshot({ path: join(OUT, `screenshot-${await idx()}-v9-hero-desktop-clear.png`) });
console.log("saved desktop");
await br.close();
