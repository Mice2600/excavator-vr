import { initFleet } from './fleet';
import { initStrata } from './strata';
import { initToy } from './toy';

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

// Remember the language, so the front door opens on it next time.
try {
  localStorage.setItem('lang', document.documentElement.lang);
} catch {
  /* private mode: nothing to remember */
}

// Language links keep the reader in the section they were reading.
document.querySelectorAll<HTMLAnchorElement>('a[data-lang]').forEach((a) => {
  a.addEventListener('click', () => {
    if (location.hash) a.href = a.href.split('#')[0] + location.hash;
  });
});

// The bar turns solid once the page moves, and steps aside while reading downwards.
const nav = document.querySelector<HTMLElement>('[data-nav]');
if (nav) {
  let last = 0;
  const onScroll = () => {
    const y = scrollY;
    nav.classList.toggle('is-solid', y > 30);
    nav.classList.toggle('is-away', y > last && y > 700);
    last = y;
  };
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

// Things rise into place as they come on screen.
const reveal = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (e.isIntersecting) {
        e.target.classList.add('is-in');
        reveal.unobserve(e.target);
      }
    }
  },
  { threshold: 0.12, rootMargin: '0px 0px -6% 0px' },
);
document.querySelectorAll('[data-reveal]').forEach((el) => reveal.observe(el));

// The hero machine drifts a little against the type as the page moves and the pointer wanders.
const machine = document.querySelector<HTMLElement>('[data-hero-machine]');
if (machine && !reduced) {
  let px = 0;
  let sy = 0;
  let queued = false;
  const apply = () => {
    queued = false;
    machine.style.transform = `translate3d(${px * -14}px, ${sy * -0.07}px, 0)`;
  };
  const queue = () => {
    if (!queued) {
      queued = true;
      requestAnimationFrame(apply);
    }
  };
  addEventListener(
    'scroll',
    () => {
      if (scrollY < innerHeight * 1.5) {
        sy = scrollY;
        queue();
      }
    },
    { passive: true },
  );
  addEventListener(
    'pointermove',
    (e) => {
      if (e.pointerType === 'mouse' && scrollY < innerHeight) {
        px = e.clientX / innerWidth - 0.5;
        queue();
      }
    },
    { passive: true },
  );
}

// Short silent clips play only while they are on screen.
const clips = document.querySelectorAll<HTMLVideoElement>('video[data-autoplay]');
if (clips.length && !reduced) {
  const watch = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const v = e.target as HTMLVideoElement;
        if (e.isIntersecting) v.play().catch(() => {});
        else v.pause();
      }
    },
    { threshold: 0.35 },
  );
  clips.forEach((v) => watch.observe(v));
} else {
  clips.forEach((v) => (v.controls = true));
}

// The film: one big play button, and chapters that jump.
const film = document.querySelector<HTMLElement>('[data-film]');
if (film) {
  const video = film.querySelector('video')!;
  const play = film.querySelector<HTMLButtonElement>('[data-play]')!;
  const items = [...document.querySelectorAll<HTMLLIElement>('[data-chapters] li')];
  const times = items.map((li) => Number(li.querySelector('button')!.dataset.t));
  const start = (t?: number) => {
    play.hidden = true;
    if (t !== undefined) {
      const seek = () => (video.currentTime = t);
      if (video.readyState >= 1) seek();
      else video.addEventListener('loadedmetadata', seek, { once: true });
    }
    video.play().catch(() => {});
  };
  play.addEventListener('click', () => start());
  video.addEventListener('play', () => (play.hidden = true));
  items.forEach((li, i) =>
    li.querySelector('button')!.addEventListener('click', () => {
      start(times[i]);
      film.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
    }),
  );
  video.addEventListener('timeupdate', () => {
    let now = 0;
    for (let i = 0; i < times.length; i++) if (video.currentTime >= times[i] - 0.25) now = i;
    items.forEach((li, i) => li.classList.toggle('is-now', i === now));
  });
}

// The cab pictures: a tab for each machine, and numbered controls that light up with their description.
document.querySelectorAll<HTMLElement>('[data-cab]').forEach((cab) => {
  const tabs = [...cab.querySelectorAll<HTMLButtonElement>('[data-cabtab]')];
  const panels = [...cab.querySelectorAll<HTMLElement>('[data-cabpanel]')];
  const show = (key: string, focus = false) => {
    for (const tab of tabs) {
      const on = tab.dataset.cabtab === key;
      tab.setAttribute('aria-selected', String(on));
      tab.tabIndex = on ? 0 : -1;
      if (on && focus) tab.focus();
    }
    for (const panel of panels) panel.hidden = panel.dataset.cabpanel !== key;
  };
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => show(tab.dataset.cabtab!));
    tab.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault();
      show(tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length].dataset.cabtab!, true);
    });
  });
  for (const panel of panels) {
    const spots = [...panel.querySelectorAll<HTMLElement>('[data-spot]')];
    const items = [...panel.querySelectorAll<HTMLElement>('[data-item]')];
    let pinned = '';
    const light = (id: string) => {
      panel.classList.toggle('has-pick', id !== '');
      for (const s of spots) s.classList.toggle('is-on', s.dataset.spot === id);
      for (const it of items) it.classList.toggle('is-on', it.dataset.item === id);
    };
    const wire = (el: HTMLElement, id: string, scrollToText: boolean) => {
      el.addEventListener('pointerenter', () => light(id));
      el.addEventListener('pointerleave', () => light(pinned));
      el.addEventListener('focus', () => light(id));
      el.addEventListener('blur', () => light(pinned));
      el.addEventListener('click', () => {
        pinned = pinned === id ? '' : id;
        light(pinned);
        if (scrollToText && pinned) {
          items.find((it) => it.dataset.item === id)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      });
    };
    spots.forEach((s) => wire(s, s.dataset.spot!, true));
    items.forEach((it) => wire(it, it.dataset.item!, false));
  }
});

document.querySelectorAll<HTMLElement>('[data-fleet]').forEach(initFleet);
document.querySelectorAll<HTMLElement>('[data-strata]').forEach(initStrata);
document.querySelectorAll<HTMLElement>('[data-toy]').forEach((el) => initToy(el, reduced));
