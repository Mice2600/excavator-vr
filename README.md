# Excavator VR: the website

The advertising site for Excavator VR, a virtual-reality training simulator for excavator operators.
One page in three languages (Uzbek, Russian, English), with a machine selector and 3D viewer, a depth
explorer for the ground, a small dig demo on the ISO lever pattern, the cab control panels with numbered
hotspots, the film, and four PDF downloads per language: a presentation of the whole project in eleven slides,
a brochure, a fleet data sheet and a controls card.

Live: https://mice2600.github.io/excavator-vr/

## Run it

Needs Node 22.23 or newer.

```
npm install
npm run dev        # http://localhost:4321/excavator-vr/
npm run build      # writes dist/
npm run preview    # serves dist/ the way the live site is served
```

## Change things

| What | Where |
|---|---|
| Contact details (email, phone, Telegram) | `src/site.ts`, `contact`. Empty fields are hidden; with all three empty the contact block is not shown. After changing them run `npm run pdf` so the brochures carry them too. |
| Any sentence on the site | `src/i18n/en.ts`, `ru.ts`, `uz.ts`. The three files have the same shape. |
| Machine figures and ground layers | `src/data/machines.ts`. Numbers are written once and formatted per language. |
| Film chapter times | `src/site.ts`, `filmChapters`. |
| Colours, type, layout | `src/styles/global.css` (site), `src/styles/print.css` (PDFs). |
| Address of the site | `astro.config.mjs`, or `SITE=https://example.uz BASE=/ npm run build` for a domain of its own. |

Every figure on the site comes from the simulator itself (its machine specs, model measurements and
test results). Keep it that way: a number that is not in the project should not be on the page.

## Pictures, video, models

The pictures are studio renders of the simulator's own machine models, made in Blender 5.2 from the
generator scripts in the Excavator VR project (`Art/Blender/scripts`). The render scripts are in
`tools/render/`; they build each machine in a scratch folder and never write into the Unity project.

```
npm run images -- <folder with the renders>   # trims, grades and writes src/assets/img, plus
                                              # src/data/sideviews.json and src/data/cabs.json
```

The people (the trainee in the headset, the worker in the hard hat, the crew of four) are made the same way,
from an open-source human generator; see `tools/render/README.md`, "The people".

- `public/video/` holds the film (re-encoded from `Builds/Film/ExcavatorVR_film.mp4`) and two short clips.
- `public/models/` holds the seven machines as `.glb` for the 3D viewer (`tools/render/export_glb.py`).

## PDFs

The presentation (`src/pages/[lang]/deck.astro`, 16:9 slides), the brochure, the fleet data sheet and the
controls card (`src/pages/[lang]/print/[doc].astro`, A4) are ordinary pages printed to PDF with the Chrome
already on the PC:

```
npm run build
npm run preview        # leave it running, and in a second terminal:
npm run pdf            # writes public/downloads/*.pdf
npm run build          # again, so the new PDFs are in dist/
```

`npm run pdf` also fills `exports/` (not published, not in git) with the presentation in the forms other
places ask for: the PDF, a light PDF of about 4 MB for upload forms with a size limit
(`excavator-vr-presentation-<lang>-light.pdf`), one JPG per slide (`exports/<lang>/slide-01.jpg` ...) and one long JPG with every
slide (`exports/excavator-vr-presentation-<lang>.jpg`). `npm run pdf -- --only=presentation` prints just
that document. The last slide and the cover carry a QR code and the address of the site, taken from
`astro.config.mjs`.

## Check it

With `npm run preview` running:

```
npm run check -- <folder>    # exercises the selector, 3D viewer, depth explorer, cab hotspots, film
                             # chapters and the dig demo's soil ledger, and saves pictures
npm run shots -- <folder> ru 1440 900    # one picture per section
```

## Publish

```
npm run deploy     # builds, then pushes dist/ to the gh-pages branch, which GitHub Pages serves
```

## Credits

People: built with MPFB (MakeHuman for Blender) and the MakeHuman system assets (CC0).
Surface textures on the machine models: Poly Haven (CC0). Fonts: Fira Sans Extra Condensed, Onest,
IBM Plex Mono (SIL Open Font License), bundled through Fontsource. 3D viewer: `@google/model-viewer`.
