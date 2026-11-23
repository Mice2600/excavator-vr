// Prints the documents in each language to public/downloads/: the presentation (16:9 slides), the brochure,
// the fleet data sheet and the controls card (A4).
//
//   npm run build && npm run preview        (in one terminal)
//   node tools/pdf.mjs                      (then build again, so the new PDFs are in dist/)
//
// The presentation is also saved in exports/ in the forms other places ask for: the PDF, a light PDF made of
// pictures (for upload forms with a size limit), one JPG per slide, and one long JPG with every slide under
// the last. exports/ is not published.
//
// Uses the Chrome that is already installed. Pass a folder to also save a picture of every A4 page for review;
// pass --only=presentation (or brochure, fleet, controls) to print just one document.

import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';
import sharp from 'sharp';

const base = process.env.SITE_URL ?? 'http://localhost:4321/excavator-vr/';
const out = path.resolve('public/downloads');
const exportsDir = path.resolve('exports');
const args = process.argv.slice(2);
const only = args.find((a) => a.startsWith('--only='))?.slice(7);
const reviewArg = args.find((a) => !a.startsWith('--'));
const review = reviewArg ? path.resolve(reviewArg) : null;
await fs.mkdir(out, { recursive: true });
if (review) await fs.mkdir(review, { recursive: true });

const DOCS = [
  { id: 'presentation', route: 'deck/', page: '.slide', viewport: { width: 1400, height: 800 } },
  { id: 'brochure', route: 'print/brochure/', page: '.sheet', viewport: { width: 900, height: 1200 } },
  { id: 'fleet', route: 'print/fleet/', page: '.sheet', viewport: { width: 900, height: 1200 } },
  { id: 'controls', route: 'print/controls/', page: '.sheet', viewport: { width: 900, height: 1200 } },
].filter((d) => !only || d.id === only);

const ready = (page) =>
  page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map((im) => im.decode().catch(() => {})));
  });

const browser = await chromium.launch({ channel: 'chrome' });

// The address the presentation itself prints (its QR code and last slide point there).
async function page0Link(browser, deckUrl) {
  const p = await browser.newPage();
  await p.goto(deckUrl, { waitUntil: 'domcontentloaded' });
  const text = await p.locator('.qr b').first().textContent();
  await p.close();
  return `https://${text.trim()}/`;
}
for (const lang of ['uz', 'ru', 'en']) {
  for (const doc of DOCS) {
    const page = await browser.newPage({ viewport: doc.viewport });
    await page.goto(`${base}${lang}/${doc.route}`, { waitUntil: 'networkidle' });
    await ready(page);
    // Some languages need more room for the same sentence. A page that runs long is scaled down a little
    // (never below 88 %) until it fits.
    const fitted = await page.evaluate((sel) => {
      const report = [];
      document.querySelectorAll(sel).forEach((sheet, i) => {
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
    }, doc.page);
    await page.waitForTimeout(300);
    const file = path.join(out, `excavator-vr-${doc.id}-${lang}.pdf`);
    await page.pdf({ path: file, preferCSSPageSize: true, printBackground: true });
    const size = ((await fs.stat(file)).size / 1e6).toFixed(2);
    console.log(`${path.basename(file)}  ${size} MB${fitted.length ? `  (${fitted.join('; ')})` : ''}`);
    if (review && doc.id !== 'presentation') {
      await page.screenshot({ path: path.join(review, `${doc.id}-${lang}.jpg`), type: 'jpeg', quality: 78, fullPage: true });
    }
    await page.close();

    if (doc.id === 'presentation') {
      // the same slides as pictures, at twice the screen size
      const dir = path.join(exportsDir, lang);
      await fs.mkdir(dir, { recursive: true });
      const sharpPage = await browser.newPage({ viewport: doc.viewport, deviceScaleFactor: 2 });
      await sharpPage.goto(`${base}${lang}/${doc.route}`, { waitUntil: 'networkidle' });
      await ready(sharpPage);
      const slides = await sharpPage.locator(doc.page).all();
      const files = [];
      for (const [i, slide] of slides.entries()) {
        const f = path.join(dir, `slide-${String(i + 1).padStart(2, '0')}.jpg`);
        await slide.screenshot({ path: f, type: 'jpeg', quality: 90 });
        files.push(f);
      }
      await sharpPage.close();
      const W = 1600;
      const tiles = await Promise.all(files.map((f) => sharp(f).resize({ width: W }).toBuffer({ resolveWithObject: true })));
      let y = 0;
      const composite = tiles.map((t) => {
        const item = { input: t.data, left: 0, top: y };
        y += t.info.height;
        return item;
      });
      const long = path.join(exportsDir, `excavator-vr-presentation-${lang}.jpg`);
      await sharp({ create: { width: W, height: y, channels: 3, background: '#0a0b0d' } }).composite(composite).jpeg({ quality: 86 }).toFile(long);
      await fs.copyFile(file, path.join(exportsDir, path.basename(file)));
      // a light PDF made of the slide pictures, for upload forms with a size limit; each page links to the site
      const site = await page0Link(browser, `${base}${lang}/${doc.route}`);
      const light = path.join(exportsDir, `excavator-vr-presentation-${lang}-light.pdf`);
      const lightPage = await browser.newPage();
      const pics = await Promise.all(
        files.map(async (f) => (await sharp(f).resize({ width: 1920 }).jpeg({ quality: 84 }).toBuffer()).toString('base64')),
      );
      await lightPage.setContent(
        `<style>@page{size:338.67mm 190.5mm;margin:0}body{margin:0}a{display:block;width:338.67mm;height:190.5mm;break-after:page}` +
          `a:last-child{break-after:auto}img{display:block;width:100%;height:100%}</style>` +
          pics.map((b64) => `<a href="${site}"><img src="data:image/jpeg;base64,${b64}"></a>`).join(''),
      );
      await lightPage.evaluate(() => Promise.all([...document.images].map((im) => im.decode().catch(() => {}))));
      await lightPage.pdf({ path: light, preferCSSPageSize: true, printBackground: true });
      await lightPage.close();
      const lightSize = ((await fs.stat(light)).size / 1e6).toFixed(2);
      console.log(`  ${files.length} slides as pictures in ${path.relative('.', dir)}, ${path.basename(long)}, and ${path.basename(light)} (${lightSize} MB)`);
    }
  }
}
await browser.close();
