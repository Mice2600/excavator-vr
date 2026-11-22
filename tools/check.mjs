// Exercises the interactive parts of the built site and saves pictures of what happened.
//
//   npm run build && npm run preview        (in one terminal)
//   node tools/check.mjs <out folder>
//
// Checks: the hero in three languages, the machine selector and its 3D viewer, the truck cab hotspots,
// the depth explorer, the film chapters, and the dig demo's soil ledger (nothing created or lost).

import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';

const out = path.resolve(process.argv[2] ?? 'shots');
const base = process.env.SITE_URL ?? 'http://localhost:4321/excavator-vr/';
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const problems = [];
const note = (ok, text) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${text}`);
  if (!ok) problems.push(text);
};

async function open(lang, width = 1440, height = 900) {
  const page = await browser.newPage({ viewport: { width, height } });
  page.on('pageerror', (e) => problems.push(`${lang}: ${e}`));
  page.on('console', (m) => m.type() === 'error' && problems.push(`${lang}: ${m.text()}`));
  await page.goto(`${base}${lang}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  return page;
}
const shot = (page, name) => page.screenshot({ path: path.join(out, `${name}.jpg`), type: 'jpeg', quality: 80 });
const settle = async (page, sel) => {
  await page.evaluate((s) => {
    document.querySelectorAll('[data-reveal]').forEach((n) => n.classList.add('is-in'));
    const el = document.querySelector(s);
    scrollTo({ top: el.getBoundingClientRect().top + scrollY - 70, behavior: 'instant' });
  }, sel);
  await page.waitForTimeout(500);
};

// 1. the first screen, in each language
for (const lang of ['en', 'ru', 'uz']) {
  const page = await open(lang);
  await shot(page, `hero-${lang}`);
  const wide = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  note(!wide, `${lang}: no sideways scroll at 1440`);
  await page.close();
}

const page = await open('en');

// 2. the machine selector, then the 3D viewer
await settle(page, '.fleet__tabs');
await page.click('[data-tab="bwe"]');
await page.waitForTimeout(900);
note(await page.isVisible('#panel-bwe'), 'fleet: the bucket-wheel panel opens');
await shot(page, 'fleet-bwe');
await page.click('[data-tab="hauler"]');
await page.waitForTimeout(600);
await page.click('#panel-hauler [data-3d]');
const loaded = await page
  .waitForFunction(() => document.querySelector('#panel-hauler model-viewer')?.loaded === true, null, { timeout: 60000 })
  .then(() => true, () => false);
note(loaded, 'fleet: the 3D model loads');
await page.waitForTimeout(2500);
await shot(page, 'fleet-3d');
await page.click('#panel-hauler [data-3d]');
note(!(await page.$('#panel-hauler model-viewer')), 'fleet: the 3D viewer closes again');

// 3. the depth explorer
await settle(page, '[data-strata]');
const col = page.locator('[data-col]');
const box = await col.boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.86);
await page.mouse.down();
await page.mouse.up();
await page.waitForTimeout(500);
const name = await page.textContent('[data-name]');
note(/rock/i.test(name), `ground: the marker at 86 % reads "${name.trim()}"`);
note(await page.evaluate(() => document.querySelector('[data-chip="ex20"]').classList.contains('is-off')), 'ground: the 20 t is struck out on rock');
await shot(page, 'ground-rock');

// 4. the cab: the truck tab and a hotspot
await settle(page, '.cab__tabs');
await page.click('[data-cabtab="truck"]');
await page.waitForTimeout(900);
await page.hover('#cab-truck [data-spot="gear"]');
note(await page.evaluate(() => document.querySelector('#cab-truck [data-item="gear"]').classList.contains('is-on')), 'cab: a hotspot lights its line of text');
await shot(page, 'cab-truck');

// 5. the dig demo: let the bot work for two minutes of its own time, then read the ledger
await settle(page, '[data-toy]');
await page.waitForTimeout(600);
const ledger = await page.evaluate(() => {
  const toy = document.querySelector('[data-toy]').toy;
  const before = toy.ledger();
  let hauled = 0;
  let last = before.truck;
  for (let s = 0; s < 150; s++) {
    toy.run(1);
    const now = toy.ledger();
    if (now.truck < last - 1) hauled += last; // the truck drove off with its load
    last = now.truck;
  }
  const after = toy.ledger();
  return { before: before.total, after: after.total, hauled, truck: after.truck, state: toy.state() };
});
const drift = Math.abs(ledger.after + ledger.hauled - ledger.before);
note(ledger.truck + ledger.hauled > 1, `dig demo: the bot loaded ${(ledger.truck + ledger.hauled).toFixed(2)} m3 into the truck`);
note(drift < 0.02, `dig demo: soil ledger drift ${drift.toFixed(5)} m3`);
await shot(page, 'toy-after');

// 6. the film: a chapter button seeks and plays
await settle(page, '[data-film]');
await page.click('[data-chapters] li:nth-child(5) button');
await page.waitForTimeout(2500);
const t = await page.evaluate(() => document.querySelector('[data-film] video').currentTime);
note(t > 62 && t < 70, `film: the "Tip" chapter starts at ${t.toFixed(1)} s`);
await shot(page, 'film-playing');
await page.close();

// 7. a phone
const phone = await open('ru', 390, 844);
const wide = await phone.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
note(!wide, 'phone: no sideways scroll at 390');
await shot(phone, 'phone-hero');
for (const id of ['feel', 'fleet', 'ground', 'controls', 'cab', 'views', 'film', 'together', 'proof', 'downloads', 'contact']) {
  await settle(phone, `#${id}`);
  await phone.waitForTimeout(700);
  await phone.screenshot({ path: path.join(out, `phone-${id}.jpg`), type: 'jpeg', quality: 78, fullPage: false });
}
await phone.close();

await browser.close();
console.log(problems.length ? `\n${problems.length} problem(s):\n${problems.join('\n')}` : '\nall checks passed');
process.exitCode = problems.length ? 1 : 0;
