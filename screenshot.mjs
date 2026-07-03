// Screenshot a URL with Puppeteer.
// Usage:
//   node screenshot.mjs http://localhost:3001
//   node screenshot.mjs http://localhost:3001 label
//   node screenshot.mjs http://localhost:3001 label mobile   (optional viewport: desktop|mobile|<width>)
//
// Saves to "./temporary screenshots/screenshot-N[-label].png"
// N auto-increments and existing files are never overwritten.

import puppeteer from "puppeteer";
import { readdir, mkdir, access } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const OUT_DIR = join(ROOT, "temporary screenshots");

// Locate a usable Chrome in the puppeteer cache (newest complete install wins).
// This avoids relying on puppeteer's bundled download, which may be unavailable.
async function findChrome() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  const chromeDir = join(homedir(), ".cache", "puppeteer", "chrome");
  let dirs = [];
  try {
    dirs = await readdir(chromeDir);
  } catch {
    return undefined; // fall back to puppeteer's default resolution
  }
  // Sort newest version first (e.g. win64-149.x before win64-148.x).
  dirs.sort().reverse();
  for (const d of dirs) {
    const exe = join(chromeDir, d, "chrome-win64", "chrome.exe");
    try {
      await access(exe);
      return exe;
    } catch {
      /* try next */
    }
  }
  return undefined;
}

const url = process.argv[2] || "http://localhost:3001";
const label = process.argv[3] ? `-${process.argv[3]}` : "";
const viewportArg = (process.argv[4] || "desktop").toLowerCase();

const VIEWPORTS = {
  desktop: { width: 1440, height: 900, deviceScaleFactor: 2 },
  mobile: { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true },
};
const viewport =
  VIEWPORTS[viewportArg] ||
  (Number(viewportArg)
    ? { width: Number(viewportArg), height: 900, deviceScaleFactor: 2 }
    : VIEWPORTS.desktop);

async function nextIndex() {
  let files = [];
  try {
    files = await readdir(OUT_DIR);
  } catch {
    return 1;
  }
  let max = 0;
  for (const f of files) {
    const m = f.match(/^screenshot-(\d+)/);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max + 1;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const n = await nextIndex();
  const outPath = join(OUT_DIR, `screenshot-${n}${label}.png`);

  const executablePath = await findChrome();
  const browser = await puppeteer.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport(viewport);
    await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
    // Give web fonts / lazy assets a moment to settle.
    await new Promise((r) => setTimeout(r, 500));
    // Scroll through the page so IntersectionObserver reveals fire, then return
    // to the top before capturing.
    await page.evaluate(async () => {
      // Defeat css `scroll-behavior: smooth` so each step lands instantly.
      document.documentElement.style.scrollBehavior = "auto";
      const step = window.innerHeight * 0.7;
      for (let y = 0; y < document.body.scrollHeight; y += step) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 120));
      }
      await new Promise((r) => setTimeout(r, 300));
      window.scrollTo(0, 0);
    });
    await new Promise((r) => setTimeout(r, 800));
    await page.screenshot({ path: outPath, fullPage: true });
    console.log(`Saved ${outPath}`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
