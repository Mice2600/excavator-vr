// Review screenshots of the built site, section by section.
//
//   npm run build && npm run preview        (in one terminal)
//   node tools/shots.mjs <out folder> [lang] [width] [height]
//
// Uses the Chrome that is already installed (no browser download).

import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';

const out = path.resolve(process.argv[2] ?? 'shots');
const lang = process.argv[3] ?? 'en';
const width = Number(process.argv[4] ?? 1440);
const height = Number(process.argv[5] ?? 900);
const base = process.env.SITE_URL ?? 'http://localhost:4321/excavator-vr/';
const only = process.env.ONLY ? process.env.ONLY.split(',') : null;

await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('requestfailed', (r) => errors.push(`failed: ${r.url()}`));
await page.goto(`${base}${lang}/`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1600);

const tag = `${lang}-${width}`;
const ids = ['top', 'feel', 'fleet', 'ground', 'controls', 'cab', 'views', 'film', 'together', 'proof', 'downloads', 'contact'];
for (const id of ids) {
  if (only && !only.includes(id)) continue;
  const el = page.locator(`#${id}`);
  await el.scrollIntoViewIfNeeded();
  await page.evaluate((sel) => {
    const node = document.querySelector(sel);
    scrollTo(0, node.getBoundingClientRect().top + scrollY - 10);
    document.querySelectorAll('[data-reveal]').forEach((n) => n.classList.add('is-in'));
    document.querySelector('[data-nav]')?.classList.remove('is-away');
  }, `#${id}`);
  await page.waitForTimeout(1200);
  const box = await el.boundingBox();
  const h = Math.min(Math.ceil(box.height) + 20, 2600);
  await page.setViewportSize({ width, height: Math.max(height, Math.min(h, 2600)) });
  await page.evaluate((sel) => scrollTo(0, document.querySelector(sel).getBoundingClientRect().top + scrollY - 10), `#${id}`);
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(out, `${tag}-${id}.jpg`), type: 'jpeg', quality: 80 });
  await page.setViewportSize({ width, height });
}
console.log(errors.length ? `page errors:\n${[...new Set(errors)].join('\n')}` : 'no page errors');
await browser.close();
