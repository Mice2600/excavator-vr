import type { ImageMetadata } from 'astro';

// Every prepared picture in assets/img, by its file name without the extension.
const files = import.meta.glob<{ default: ImageMetadata }>('./assets/img/*.{webp,jpg,png}', { eager: true });

export function img(name: string): ImageMetadata {
  for (const ext of ['webp', 'jpg', 'png']) {
    const hit = files[`./assets/img/${name}.${ext}`];
    if (hit) return hit.default;
  }
  throw new Error(`No picture named "${name}" in src/assets/img (run: npm run images)`);
}
