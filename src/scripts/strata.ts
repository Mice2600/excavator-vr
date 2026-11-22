// The depth explorer: drag a marker down a column of ground and read what each layer does to a bucket.

interface Layer {
  id: string;
  top: number;
  bottom: number;
  strength: number | null;
  speed: number | null;
  color: string;
  reach: string[];
  name: string;
  note: string;
}

interface Data {
  max: number;
  locale: string;
  unit: string;
  full: string;
  layers: Layer[];
}

export function initStrata(root: HTMLElement) {
  const data: Data = JSON.parse(root.querySelector('script[type="application/json"]')!.textContent!);
  const col = root.querySelector<HTMLElement>('[data-col]')!;
  const marker = root.querySelector<HTMLElement>('[data-marker]')!;
  const q = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel)!;
  const out = {
    depth: q('[data-depth]'),
    name: q('[data-name]'),
    range: q('[data-range]'),
    note: q('[data-note]'),
    strength: q('[data-strength]'),
    strengthV: q('[data-strength-v]'),
    speed: q('[data-speed]'),
    speedV: q('[data-speed-v]'),
    nobody: q('[data-nobody]'),
  };
  const bands = [...root.querySelectorAll<HTMLElement>('[data-band]')];
  const chips = [...root.querySelectorAll<HTMLElement>('[data-chip]')];
  const fmt = (v: number, digits: number) =>
    new Intl.NumberFormat(data.locale, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v);
  const hardest = Math.max(...data.layers.map((l) => l.strength ?? 0));

  // The column uses a square-root scale (see Ground.astro), so the thin upper layers stay readable.
  const toY = (depth: number) => Math.sqrt(depth / data.max);
  const toDepth = (y: number) => y * y * data.max;

  let depth = -1;
  function set(next: number) {
    next = Math.min(data.max - 0.5, Math.max(0, next));
    if (Math.abs(next - depth) < 0.004) return;
    depth = next;
    const layer = data.layers.find((l) => depth < l.bottom) ?? data.layers[data.layers.length - 1];
    marker.style.setProperty('--y', `${toY(depth) * 100}%`);
    col.setAttribute('aria-valuenow', depth.toFixed(1));
    out.depth.textContent = `${fmt(depth, depth < 10 ? 1 : 0)} ${data.unit}`;
    col.setAttribute('aria-valuetext', `${out.depth.textContent}, ${layer.name}`);
    if (out.name.textContent !== layer.name) {
      out.name.textContent = layer.name;
      out.note.textContent = layer.note;
      const digits = (v: number) => (v % 1 ? (v < 1 ? 2 : 1) : 0);
      out.range.textContent =
        layer.strength === null
          ? `${fmt(layer.top, 0)} ${data.unit} +`
          : `${fmt(layer.top, digits(layer.top))} – ${fmt(layer.bottom, digits(layer.bottom))} ${data.unit}`;
      out.strength.style.setProperty('--v', String(layer.strength === null ? 1 : layer.strength / hardest));
      out.strengthV.textContent = layer.strength === null ? '∞' : `× ${fmt(layer.strength, 1)}`;
      out.speed.style.setProperty('--v', String(layer.speed ?? 0));
      out.speedV.textContent =
        layer.speed === null ? '0 %' : layer.speed === 1 ? data.full : `${Math.round(layer.speed * 100)} %`;
      for (const chip of chips) chip.classList.toggle('is-off', !layer.reach.includes(chip.dataset.chip!));
      for (const chip of chips) chip.hidden = layer.reach.length === 0;
      out.nobody.hidden = layer.reach.length > 0;
      for (const band of bands) band.classList.toggle('is-on', band.dataset.band === layer.id);
    }
  }

  const fromPointer = (e: PointerEvent) => {
    const r = col.getBoundingClientRect();
    set(toDepth(Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))));
  };
  col.addEventListener('pointerdown', (e) => {
    col.setPointerCapture(e.pointerId);
    fromPointer(e);
  });
  col.addEventListener('pointermove', (e) => {
    if (col.hasPointerCapture(e.pointerId)) fromPointer(e);
  });
  col.addEventListener(
    'wheel',
    (e) => {
      // Scrolling over the column walks through the ground; at either end the page scrolls on.
      const next = toDepth(Math.min(1, Math.max(0, toY(depth) + e.deltaY / 1400)));
      if (next <= 0.01 || next >= data.max - 0.6) return;
      e.preventDefault();
      set(next);
    },
    { passive: false },
  );
  col.addEventListener('keydown', (e) => {
    const step = { ArrowDown: 0.02, ArrowUp: -0.02, PageDown: 0.1, PageUp: -0.1 }[e.key];
    if (step === undefined) return;
    e.preventDefault();
    set(toDepth(Math.min(1, Math.max(0, toY(depth) + step))));
  });

  set(2);
}
