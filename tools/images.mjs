// Turns the studio renders into the pictures the site uses.
//
//   node tools/images.mjs <folder with the renders>
//
// The renders are made in Blender from the simulator's own machine models (see tools/render/README.md).
// Cut-outs are trimmed to the machine and saved as WebP with their transparency; Astro then makes the
// sizes each screen needs. The script also writes two small data files: the true size of each side view
// (for the scale lineup) and where each cab control sits in its picture (for the numbered hotspots).

import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const SRC = process.argv[2];
if (!SRC) {
  console.error('usage: node tools/images.mjs <renders folder>');
  process.exit(1);
}
const OUT = path.resolve('src/assets/img');
const DATA = path.resolve('src/data');

const IDS = ['ex20', 'ex50', 'ex80', 'ex150', 'truck', 'hauler', 'bwe'];

// name -> longest side in pixels. Cut-outs (transparent) first.
const CUTOUTS = {
  hero_reach: 3000,
  hero_reach_b: 3000,
  hero_teeth: 2400,
  hero_teeth_b: 2400,
  detail_bucket: 1500,
  detail_tracks: 2000,
  detail_cab: 1500,
  ex20_red: 2000,
  ex150_tower: 2100,
  bwe_wheel: 1600,
  // the people: the trainee in the headset, the worker, the crew of four
  vr_trainee: 2000,
  vr_trainee_side: 2000,
  vr_headset: 1500,
  vr_crew: 3200,
  vr_pair: 2200,
  worker: 2000,
  worker_b: 2000,
  worker_scale: 3000,
  ...Object.fromEntries(IDS.flatMap((id) => [[`${id}_34`, 2200], [`${id}_low`, 2000], [`${id}_side`, 2400]])),
};
// Full frames (the cab interiors).
const FRAMES = {
  ex20_cabview: 2400,
  cab_ex20: 2400,
  cab_truck: 2400,
  cab_ex20_joystick: 1200,
  cab_ex20_monitor: 1200,
  cab_truck_gauges: 1200,
  cab_truck_gear: 1200,
};

const exists = (p) => fs.access(p).then(() => true, () => false);
const sidecar = async (name) => JSON.parse(await fs.readFile(path.join(SRC, `${name}.json`), 'utf8'));

await fs.mkdir(OUT, { recursive: true });
const sideviews = {};
let made = 0;
const missing = [];

for (const [name, size] of Object.entries(CUTOUTS)) {
  const src = path.join(SRC, `${name}.png`);
  if (!(await exists(src))) {
    missing.push(name);
    continue;
  }
  // Trim to the machine and its shadow, then lift the colour a little: the renders are graded for a dark page.
  const trimmed = await sharp(src).trim({ threshold: 6 }).toBuffer({ resolveWithObject: true });
  const isSide = name.endsWith('_side') && IDS.includes(name.replace('_side', '')); // the machines' true-scale side views
  let img = sharp(trimmed.data).resize({ width: size, height: size, fit: 'inside', withoutEnlargement: true });
  if (!isSide) img = img.modulate({ saturation: 1.1, brightness: 1.03 });
  const info = await img.webp({ quality: 90, alphaQuality: 100, effort: 5 }).toFile(path.join(OUT, `${name}.webp`));
  made++;
  if (isSide) {
    const meta = await sidecar(name);
    sideviews[name.replace('_side', '')] = {
      length: +(meta.hi[1] - meta.lo[1]).toFixed(2),
      height: +(meta.hi[2] - meta.lo[2]).toFixed(2),
      w: info.width,
      h: info.height,
    };
  }
}

const cabs = {};
for (const [name, size] of Object.entries(FRAMES)) {
  const src = path.join(SRC, `${name}.png`);
  if (!(await exists(src))) {
    missing.push(name);
    continue;
  }
  await sharp(src)
    .resize({ width: size, height: size, fit: 'inside', withoutEnlargement: true })
    .modulate({ saturation: 1.06 })
    .webp({ quality: 88, effort: 5 })
    .toFile(path.join(OUT, `${name}.webp`));
  made++;
  if (name === 'cab_ex20' || name === 'cab_truck') {
    cabs[name === 'cab_ex20' ? 'ex' : 'truck'] = (await sidecar(name)).marks;
  }
}

if (Object.keys(sideviews).length) await fs.writeFile(path.join(DATA, 'sideviews.json'), JSON.stringify(sideviews, null, 2) + '\n');
if (Object.keys(cabs).length) await fs.writeFile(path.join(DATA, 'cabs.json'), JSON.stringify(cabs, null, 2) + '\n');

console.log(`${made} pictures written to ${path.relative('.', OUT)}`);
if (missing.length) console.log(`not found in the renders folder: ${missing.join(', ')}`);
