// The machine selector: seven tabs, one stage, and a 3D model on request.

export function initFleet(root: HTMLElement) {
  const tabs = [...root.querySelectorAll<HTMLButtonElement>('[data-tab]')];
  const panels = [...root.querySelectorAll<HTMLElement>('[data-panel]')];
  const stage = root.querySelector<HTMLElement>('.fleet__stage')!;

  function select(id: string, focus = false) {
    for (const tab of tabs) {
      const on = tab.dataset.tab === id;
      tab.setAttribute('aria-selected', String(on));
      tab.tabIndex = on ? 0 : -1;
      if (on) {
        root.style.setProperty('--accent', tab.dataset.accent!);
        if (focus) tab.focus();
        tab.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
      }
    }
    for (const panel of panels) {
      const on = panel.dataset.panel === id;
      if (!on) close3d(panel);
      panel.hidden = !on;
    }
  }

  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => select(tab.dataset.tab!));
    tab.addEventListener('keydown', (e) => {
      const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!step) return;
      e.preventDefault();
      select(tabs[(i + step + tabs.length) % tabs.length].dataset.tab!, true);
    });
  });

  // The scale lineup doubles as a second way in.
  root.querySelectorAll<HTMLElement>('[data-jump]').forEach((fig) => {
    fig.addEventListener('click', () => {
      select(fig.dataset.jump!);
      stage.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
  });

  root.querySelectorAll<HTMLButtonElement>('[data-3d]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const panel = btn.closest<HTMLElement>('[data-panel]')!;
      if (panel.dataset.mode === '3d') close3d(panel);
      else open3d(panel, btn);
    });
  });
}

async function open3d(panel: HTMLElement, btn: HTMLButtonElement) {
  const pic = panel.querySelector<HTMLElement>('[data-pic]')!;
  const label = btn.querySelector('span')!;
  panel.dataset.mode = '3d';
  label.textContent = btn.dataset.labelLoading!;
  btn.disabled = true;
  try {
    await import('@google/model-viewer');
  } catch {
    panel.dataset.mode = '';
    label.textContent = btn.dataset.labelOpen!;
    btn.disabled = false;
    return;
  }
  if (panel.dataset.mode !== '3d') return; // closed while loading
  const viewer = document.createElement('model-viewer');
  const attrs: Record<string, string> = {
    src: btn.dataset['3d']!,
    alt: btn.dataset.alt!,
    'camera-controls': '',
    'auto-rotate': '',
    'auto-rotate-delay': '600',
    'rotation-per-second': '14deg',
    'interaction-prompt': 'none',
    'camera-orbit': '-38deg 76deg auto',
    'min-camera-orbit': 'auto 20deg auto',
    'max-camera-orbit': 'auto 92deg auto',
    'shadow-intensity': '1.1',
    'shadow-softness': '0.9',
    exposure: '1.05',
    'tone-mapping': 'neutral',
    'touch-action': 'pan-y',
  };
  for (const [k, v] of Object.entries(attrs)) viewer.setAttribute(k, v);
  const hint = document.createElement('p');
  hint.className = 'fleet__hint';
  hint.textContent = btn.dataset.hint!;
  const still = pic.querySelector('picture');
  if (still) still.hidden = true;
  pic.append(viewer, hint);
  const ready = () => {
    label.textContent = btn.dataset.labelClose!;
    btn.disabled = false;
  };
  viewer.addEventListener('load', ready, { once: true });
  viewer.addEventListener('error', ready, { once: true });
}

function close3d(panel: HTMLElement) {
  if (panel.dataset.mode !== '3d') return;
  panel.dataset.mode = '';
  const pic = panel.querySelector<HTMLElement>('[data-pic]')!;
  pic.querySelector('model-viewer')?.remove();
  pic.querySelector('.fleet__hint')?.remove();
  const still = pic.querySelector('picture');
  if (still) still.hidden = false;
  const btn = panel.querySelector<HTMLButtonElement>('[data-3d]');
  if (btn) {
    btn.disabled = false;
    btn.querySelector('span')!.textContent = btn.dataset.labelOpen!;
  }
}
