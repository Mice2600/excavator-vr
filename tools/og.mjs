// The picture shown when the site's link is shared: the first screen, at 1200 x 630.
//   (with `npm run preview` running)  node tools/og.mjs

import { chromium } from 'playwright-core';

const base = process.env.SITE_URL ?? 'http://localhost:4321/excavator-vr/';
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.goto(`${base}en/`, { waitUntil: 'networkidle' });
await page.addStyleTag({ content: '.nav__links,.langs,.hero__copy,.facts{display:none!important}.hero{padding-top:4.6rem!important}' });
await page.waitForTimeout(1800);
await page.screenshot({ path: 'public/og.jpg', type: 'jpeg', quality: 86 });
await browser.close();
console.log('public/og.jpg written');
