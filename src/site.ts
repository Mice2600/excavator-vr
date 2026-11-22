// One place for the things that change without touching a layout.

export const site = {
  name: 'Excavator VR',
  // Contact details shown on the site and in the PDFs. Leave a field empty to hide it;
  // with all three empty the contact block is not shown at all.
  contact: {
    email: '',
    phone: '',
    telegram: '', // a handle without @, e.g. 'excavatorvr'
  },
};

/** Film chapters: start time in seconds, in the order of `film.chapters` in each language file. */
export const filmChapters = [0, 39, 46, 52, 63, 76, 87];
export const filmDuration = 107;

const base = import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : import.meta.env.BASE_URL + '/';

/** A path inside the site, whatever folder the site is served from. */
export function url(path = ''): string {
  return base + path.replace(/^\//, '');
}

export function hasContact(): boolean {
  const c = site.contact;
  return Boolean(c.email || c.phone || c.telegram);
}
