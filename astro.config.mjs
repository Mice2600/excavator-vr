// @ts-check
import { defineConfig } from 'astro/config';

// The site is served from https://<user>.github.io/excavator-vr/. For a custom domain, set SITE to the
// domain and BASE to '/', e.g.  SITE=https://example.uz BASE=/ npm run build
const site = process.env.SITE ?? 'https://mice2600.github.io';
const base = process.env.BASE ?? '/excavator-vr';

export default defineConfig({
  site,
  base,
  trailingSlash: 'always',
  build: { assets: 'assets' },
  image: { responsiveStyles: false },
  devToolbar: { enabled: false },
});
