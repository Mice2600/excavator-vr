// Prints the three documents in each language to public/downloads/.
//
//   npm run build && npm run preview        (in one terminal)
//   node tools/pdf.mjs                      (then build again, so the new PDFs are in dist/)
//
// Uses the Chrome that is already installed. Pass a folder to also save a picture of every page for review.

import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';

const base = process.env.SITE_URL ?? 'http://localhost:4321/excavator-vr/';
const out = path.resolve('public/downloads');
const review = process.argv[2] ? path.resolve(process.argv[2]) : null;
await fs.mkdir(out, { recursive: true });
if (review) await fs.mkdir(review, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome' });
for (const lang of ['uz', 'ru', 'en']) {
  for (const doc of ['brochure', 'fleet', 'controls']) {
    const page = await browser.newPage({ viewport: { width: 900, height: 1200 } });
    await page.goto(`${base}${lang}/print/${doc}/`, { waitUntil: 'networkidle' });
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all([...document.images].map((im) => im.decode().catch(() => {})));
    });
    // Some languages need more room for the same sentence. A page that runs long is scaled down a little
    // (never below 88 %) until it fits its sheet of A4.
    const fitted = await page.evaluate(() => {
      const report = [];
      document.querySelectorAll('.sheet').forEach((sheet, i) => {
        let zoom = 1;
        const parts = [...sheet.children].filter((el) => getComputedStyle(el).position !== 'absolute');
        while (sheet.scrollHeight > sheet.clientHeight + 1 && zoom > 0.88) {
          zoom -= 0.01;
          for (const el of parts) el.style.zoom = String(zoom);
        }
        const over = sheet.scrollHeight - sheet.clientHeight;
        if (zoom < 1 || over > 1) report.push(`page ${i + 1}: ${Math.round(zoom * 100)} %${over > 1 ? ` STILL +${over}px` : ''}`);
      });
      return report;
    });
    await page.waitForTimeout(300);
    const file = path.join(out, `excavator-vr-${doc}-${lang}.pdf`);
    await page.pdf({ path: file, preferCSSPageSize: true, printBackground: true });
    const size = ((await fs.stat(file)).size / 1e6).toFixed(2);
    console.log(`${path.basename(file)}  ${size} MB${fitted.length ? `  (${fitted.join('; ')})` : ''}`);
    if (review) await page.screenshot({ path: path.join(review, `${doc}-${lang}.jpg`), type: 'jpeg', quality: 78, fullPage: true });
    await page.close();
  }
}
await browser.close();
