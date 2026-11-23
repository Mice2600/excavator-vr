// A picture of one section of the page, for review.
//   (with `npm run preview` running)  node tools/section.mjs <out.jpg> <lang> <#id> [width] [height]

import { chromium } from 'playwright-core';

const [out, lang = 'en', id = '#vr', width = '1440', height = '900'] = process.argv.slice(2);
const base = process.env.SITE_URL ?? 'http://localhost:4321/excavator-vr/';
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: +width, height: +height } });
await page.goto(`${base}${lang}/`, { waitUntil: 'networkidle' });
await page.addStyleTag({ content: '[data-reveal]{opacity:1!important;transform:none!important}' });
const el = page.locator(id);
await el.scrollIntoViewIfNeeded();
await page.evaluate(async (sel) => {
  const imgs = [...document.querySelector(sel).querySelectorAll('img')];
  for (const im of imgs) im.loading = 'eager';
  await Promise.all(imgs.map((im) => im.decode().catch(() => {})));
}, id);
await page.waitForTimeout(600);
await el.screenshot({ path: out, type: 'jpeg', quality: 82 });
const wide = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
console.log(out, 'sideways scroll:', wide);
await browser.close();
