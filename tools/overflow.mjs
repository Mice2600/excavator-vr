// Lists what sticks out past the right edge of a narrow screen.
//   (with `npm run preview` running)  node tools/overflow.mjs [lang] [width]

import { chromium } from 'playwright-core';

const [lang = 'en', width = '390'] = process.argv.slice(2);
const base = process.env.SITE_URL ?? 'http://localhost:4321/excavator-vr/';
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: +width, height: 844 } });
await page.goto(`${base}${lang}/`, { waitUntil: 'networkidle' });
const found = await page.evaluate(() => {
  const w = document.documentElement.clientWidth;
  const out = [];
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (r.width && r.right > w + 0.5 && getComputedStyle(el).position !== 'fixed') {
      out.push(`${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]}  right ${r.right.toFixed(1)} of ${w}`);
    }
  }
  return { scroll: document.documentElement.scrollWidth - w, out: out.slice(0, 40) };
});
console.log('sideways scroll:', found.scroll);
console.log(found.out.join('\n'));
await browser.close();
