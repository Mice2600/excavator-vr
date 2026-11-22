// A flat sketch of the simulator's idea: an excavator on the ISO lever pattern, layered ground that
// keeps its volume, loose soil that slides to its angle of repose, and a truck to fill.
// The arm is the 20 t machine's own geometry; everything else is simplified to a side view.

interface ToyLayer {
  top: number;
  bottom: number;
  strength: number | null;
  color: string;
  name: string;
}
interface ToyData {
  locale: string;
  unit: string;
  air: string;
  loose: string;
  looseColor: string;
  truckFull: string;
  overTruck: string;
  layers: ToyLayer[];
}

const DEG = Math.PI / 180;
const X0 = -12.5; // metres shown; the dig side is negative, the truck stands on the positive side
const X1 = 13.5;
const DX = 0.1;
const N = Math.round((X1 - X0) / DX);
const WIDTH = 1.16; // bucket width
const CAP = 1.0; // bucket, heaped m3
const SWELL = 1.2;
const FLOOR = -4.0; // the sketch's own bottom
const REPOSE = Math.tan(34 * DEG) * DX; // loose soil
const FACE = Math.tan(70 * DEG) * DX; // a cut face
const FOOT: [number, number] = [0.3, 1.92];
const BOOM = 5.7;
const STICK = 2.9;
const TOOTH = 1.45;
const LIMIT = { boom: [-45, 48], stick: [35, 155], phi: [-90, 90] } as const;
const RATE = { swing: 46, boom: 24, stick: 34, phi: 62 }; // degrees a second at full lever
const TRUCK = { x0: 5.3, x1: 9.7, floor: 1.3, top: 2.36, cap: 10.6 };
const PAINT = '#f2b705';
const PAINT_DIM = '#b98a00';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function arm(boom: number, stick: number, phi: number) {
  const tx = FOOT[0] + BOOM * Math.cos(boom * DEG);
  const tz = FOOT[1] + BOOM * Math.sin(boom * DEG);
  const sd = boom - stick;
  const sx = tx + STICK * Math.cos(sd * DEG);
  const sz = tz + STICK * Math.sin(sd * DEG);
  const bd = sd + phi - 55; // direction from the bucket pin to the teeth
  return {
    T: [tx, tz] as const,
    S: [sx, sz] as const,
    tip: [sx + TOOTH * Math.cos(bd * DEG), sz + TOOTH * Math.sin(bd * DEG)] as const,
    stickDeg: sd,
    bucketDeg: bd,
  };
}

export function initToy(root: HTMLElement, reduced: boolean) {
  const data: ToyData = JSON.parse(root.querySelector('script[type="application/json"]')!.textContent!);
  const canvas = root.querySelector<HTMLCanvasElement>('[data-canvas]')!;
  const ctx = canvas.getContext('2d')!;
  const topCanvas = root.querySelector<HTMLCanvasElement>('[data-top]')!;
  const tctx = topCanvas.getContext('2d')!;
  const hud = (name: string) => root.querySelector<HTMLElement>(`[data-hud="${name}"]`)!;
  const out = {
    bucket: hud('bucket'),
    bucketV: hud('bucket-v'),
    truck: hud('truck'),
    truckV: hud('truck-v'),
    pump: hud('pump'),
    layer: hud('layer'),
    msg: root.querySelector<HTMLElement>('[data-msg]')!,
  };
  const fmt = new Intl.NumberFormat(data.locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  // ----- state
  const firm = new Float32Array(N);
  const loose = new Float32Array(N);
  let pose = { boom: 30, stick: 110, phi: -15, swing: 0 };
  let load = 0;
  let truck = 0;
  let truckX = 0; // the truck's offset while it hauls a load away
  let truckPhase: 'here' | 'full' | 'leaving' | 'coming' = 'here';
  let truckClock = 0;
  let cutting = 0; // strength of the ground being cut this frame, 0 = none
  let pump = 0;
  let layerName = data.air;
  let pourCarry = 0;
  const drops: { x: number; z: number; vx: number; vz: number; vol: number }[] = [];
  let prevTip = tipWorld(pose);

  function reset() {
    firm.fill(0);
    loose.fill(0);
    pose = { boom: 30, stick: 110, phi: -15, swing: 0 };
    load = truck = truckX = 0;
    truckPhase = 'here';
    drops.length = 0;
    prevTip = tipWorld(pose);
    out.msg.hidden = true;
    botStep = 0;
    botClock = 0;
    botCycle = 0;
  }

  // The side view is the plane the machine works in; swinging turns the arm out of it and back in on the other side.
  function project(y: number, x: number, swing: number) {
    return -y * Math.cos(swing * DEG) + x * Math.sin(swing * DEG);
  }
  function tipWorld(p: typeof pose) {
    const a = arm(p.boom, p.stick, p.phi);
    return [project(a.tip[0], 0.2, p.swing), a.tip[1]] as [number, number];
  }
  const col = (x: number) => clamp(Math.round((x - X0) / DX), 0, N - 1);
  const surface = (i: number) => firm[i] + loose[i];
  const layerAt = (depth: number) => data.layers.find((l) => depth < l.bottom) ?? data.layers[data.layers.length - 1];

  // ----- input: two levers, by pointer or by keys
  const axes = { lx: 0, ly: 0, rx: 0, ry: 0 };
  const held = new Set<string>();
  let lastTouch = -1e9;
  const pads = [...root.querySelectorAll<HTMLElement>('[data-pad]')].map((el) => {
    const base = el.querySelector<HTMLElement>('.pad__base')!;
    const knob = el.querySelector<HTMLElement>('[data-knob]')!;
    const st = { x: 0, y: 0, down: false, side: el.dataset.pad as 'left' | 'right', base, knob };
    const move = (e: PointerEvent) => {
      const r = base.getBoundingClientRect();
      let x = (e.clientX - r.left - r.width / 2) / (r.width * 0.32);
      let y = -(e.clientY - r.top - r.height / 2) / (r.height * 0.32);
      const m = Math.hypot(x, y);
      if (m > 1) {
        x /= m;
        y /= m;
      }
      st.x = x;
      st.y = y;
    };
    base.addEventListener('pointerdown', (e) => {
      base.setPointerCapture(e.pointerId);
      st.down = true;
      lastTouch = performance.now();
      move(e);
      e.preventDefault();
    });
    base.addEventListener('pointermove', (e) => {
      if (st.down) {
        lastTouch = performance.now();
        move(e);
      }
    });
    const up = () => {
      st.down = false;
      st.x = st.y = 0;
    };
    base.addEventListener('pointerup', up);
    base.addEventListener('pointercancel', up);
    base.addEventListener('lostpointercapture', up);
    return st;
  });
  const KEYS: Record<string, [keyof typeof axes, number]> = {
    KeyA: ['lx', -1],
    KeyD: ['lx', 1],
    KeyW: ['ly', 1],
    KeyS: ['ly', -1],
    KeyJ: ['rx', -1],
    KeyL: ['rx', 1],
    KeyI: ['ry', 1],
    KeyK: ['ry', -1],
  };
  const caps = new Map<string, HTMLElement>();
  root.querySelectorAll<HTMLElement>('kbd[data-key]').forEach((k) => caps.set(k.dataset.key!, k));
  let onScreen = false;
  addEventListener('keydown', (e) => {
    if (!onScreen || !(e.code in KEYS) || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target as HTMLElement;
    if (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
    held.add(e.code);
    lastTouch = performance.now();
    caps.get(e.code)?.classList.add('is-down');
  });
  addEventListener('keyup', (e) => {
    held.delete(e.code);
    caps.get(e.code)?.classList.remove('is-down');
  });
  addEventListener('blur', () => {
    held.clear();
    caps.forEach((k) => k.classList.remove('is-down'));
  });
  root.querySelector('[data-reset]')?.addEventListener('click', () => {
    reset();
    lastTouch = performance.now();
  });

  // ----- the bot: digs and loads by itself until somebody takes the levers
  let botStep = 0;
  let botClock = 0;
  let botCycle = 0;
  function botPlan() {
    const deeper = Math.min(botCycle, 7);
    const reach = 56 + (botCycle % 3) * 9;
    return [
      { boom: 10 - deeper * 1.3, stick: reach, phi: 42, swing: 0, t: 3.4 },
      { boom: 9 - deeper * 1.3, stick: 124, phi: -42, swing: 0, t: 3.8 },
      { boom: 40, stick: 124, phi: -82, swing: 0, t: 2.4 },
      { boom: 40, stick: 112, phi: -82, swing: 180, t: 5.2 },
      { boom: 38, stick: 78, phi: -82, swing: 180, t: 1.8 },
      { boom: 38, stick: 78, phi: 62, swing: 180, t: 2.0 },
      { boom: 36, stick: 100, phi: -12, swing: 0, t: 5.2 },
    ];
  }
  function bot(dt: number) {
    const plan = botPlan();
    const goal = plan[botStep];
    const drive = (now: number, want: number, gain: number) => clamp((want - now) / gain, -1, 1);
    axes.lx = drive(pose.swing, goal.swing, 14);
    axes.ly = -drive(pose.stick, goal.stick, 9);
    axes.ry = -drive(pose.boom, goal.boom, 7);
    axes.rx = drive(pose.phi, goal.phi, 14);
    botClock += dt;
    const off =
      Math.abs(pose.swing - goal.swing) +
      Math.abs(pose.stick - goal.stick) +
      Math.abs(pose.boom - goal.boom) +
      Math.abs(pose.phi - goal.phi);
    if (off < 5 || botClock > goal.t + 2.5) {
      botClock = 0;
      botStep = (botStep + 1) % plan.length;
      if (botStep === 0) botCycle++;
    }
  }

  // ----- one step of the world
  function step(dt: number) {
    const manual = performance.now() - lastTouch < 14000;
    if (manual || reduced) {
      axes.lx = axes.ly = axes.rx = axes.ry = 0;
      for (const p of pads) {
        if (p.side === 'left') {
          axes.lx += p.x;
          axes.ly += p.y;
        } else {
          axes.rx += p.x;
          axes.ry += p.y;
        }
      }
      for (const code of held) {
        const [axis, dir] = KEYS[code];
        axes[axis] += dir;
      }
      axes.lx = clamp(axes.lx, -1, 1);
      axes.ly = clamp(axes.ly, -1, 1);
      axes.rx = clamp(axes.rx, -1, 1);
      axes.ry = clamp(axes.ry, -1, 1);
    } else {
      bot(dt);
    }

    // One pump: ask for everything at once and everything slows down. Hard ground slows it more.
    const demand = Math.abs(axes.lx) + Math.abs(axes.ly) + Math.abs(axes.rx) + Math.abs(axes.ry);
    const share = demand > 1.5 ? 1.5 / demand : 1;
    const drag = cutting ? 1 / (0.55 + 0.45 * cutting) : 1;
    const k = dt * share * Math.min(1, drag);
    const next = {
      swing: pose.swing + axes.lx * RATE.swing * dt * share,
      stick: clamp(pose.stick - axes.ly * RATE.stick * k, LIMIT.stick[0], LIMIT.stick[1]),
      boom: clamp(pose.boom - axes.ry * RATE.boom * k, LIMIT.boom[0], LIMIT.boom[1]),
      phi: clamp(pose.phi + axes.rx * RATE.phi * k, LIMIT.phi[0], LIMIT.phi[1]),
    };
    if (next.swing > 180) next.swing -= 360;
    if (next.swing < -180) next.swing += 360;
    let tip = tipWorld(next);
    if (tip[1] < FLOOR || tip[0] < X0 + 0.3 || tip[0] > X1 - 0.3) {
      next.stick = pose.stick; // the sketch ends here: hold the arm, let the swing go on
      next.boom = pose.boom;
      next.phi = pose.phi;
      tip = tipWorld(next);
    }
    pose = next;

    // The lip cuts whatever stands above its path.
    cutting = 0;
    const [xa, za] = prevTip;
    const [xb, zb] = tip;
    const ia = col(Math.min(xa, xb));
    const ib = col(Math.max(xa, xb));
    const overMachine = (x: number) => Math.abs(x) < 2.5;
    for (let i = ia; i <= ib; i++) {
      const x = X0 + i * DX;
      if (overMachine(x) || (x > TRUCK.x0 - 1.2 + truckX && truckPhase === 'here')) continue;
      const t = Math.abs(xb - xa) < 1e-4 ? 1 : clamp((x - xa) / (xb - xa), 0, 1);
      const lip = za + (zb - za) * t;
      const over = surface(i) - lip;
      if (over <= 0) continue;
      const fromLoose = Math.min(loose[i], over);
      const fromFirm = over - fromLoose;
      loose[i] -= fromLoose;
      firm[i] -= fromFirm;
      load += (fromLoose + fromFirm * SWELL) * DX * WIDTH;
      const s = fromFirm > 0 ? (layerAt(-firm[i]).strength ?? 6) : 0.5;
      cutting = Math.max(cutting, s);
    }
    if (load > CAP) {
      // A full bucket pushes the rest ahead of it as a berm.
      const j = col(tip[0] + Math.sign(tip[0] - prevTip[0] || -1) * 0.5);
      loose[j] += (load - CAP) / (DX * WIDTH);
      load = CAP;
    }
    prevTip = tip;

    // The bucket holds its load while it is curled, and pours once the teeth point down and out.
    let a = arm(pose.boom, pose.stick, pose.phi).bucketDeg;
    while (a > 0) a -= 360;
    const pour = clamp((a + 125) / 30, 0, 1);
    if (pour > 0 && load > 0) {
      const outVol = Math.min(load, pour * 1.5 * dt);
      load -= outVol;
      pourCarry += outVol;
      if (pourCarry > 0.02 || load === 0) {
        drops.push({ x: tip[0], z: tip[1], vx: (Math.random() - 0.5) * 0.7, vz: 0, vol: pourCarry });
        pourCarry = 0;
      }
    }
    for (let n = drops.length - 1; n >= 0; n--) {
      const d = drops[n];
      d.vz -= 9.81 * dt;
      d.x += d.vx * dt;
      d.z += d.vz * dt;
      const i = col(d.x);
      const inBody = truckPhase !== 'leaving' && truckPhase !== 'coming' && d.x > TRUCK.x0 + 0.15 && d.x < TRUCK.x1 - 0.15;
      const bodyTop = TRUCK.floor + (truck / TRUCK.cap) * (TRUCK.top - TRUCK.floor) * 1.15;
      if (inBody && d.z <= bodyTop) {
        truck += d.vol;
        drops.splice(n, 1);
      } else if (d.z <= surface(i)) {
        loose[i] += d.vol / (DX * WIDTH);
        drops.splice(n, 1);
      }
    }
    if (truck >= TRUCK.cap && truckPhase === 'here') {
      truckPhase = 'full';
      truckClock = 0;
      out.msg.textContent = data.truckFull;
      out.msg.hidden = false;
    }
    if (truckPhase !== 'here') {
      truckClock += dt;
      if (truckPhase === 'full' && truckClock > 1.6) {
        truckPhase = 'leaving';
        truckClock = 0;
      } else if (truckPhase === 'leaving') {
        truckX = 16 * Math.min(1, truckClock / 2.6) ** 2;
        if (truckClock > 2.6) {
          truckPhase = 'coming';
          truckClock = 0;
          truck = 0;
          out.msg.hidden = true;
        }
      } else if (truckPhase === 'coming') {
        truckX = 16 * (1 - Math.min(1, truckClock / 2.6)) ** 2;
        if (truckClock > 2.6) {
          truckPhase = 'here';
          truckX = 0;
        }
      }
    }

    // Loose soil slides to its angle of repose; a cut face stands to about 70 degrees, then breaks off.
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 0; i < N - 1; i++) {
        const d = surface(i) - surface(i + 1);
        if (d > REPOSE && loose[i] > 0) {
          const m = Math.min(loose[i], (d - REPOSE) * 0.3);
          loose[i] -= m;
          loose[i + 1] += m;
        } else if (-d > REPOSE && loose[i + 1] > 0) {
          const m = Math.min(loose[i + 1], (-d - REPOSE) * 0.3);
          loose[i + 1] -= m;
          loose[i] += m;
        }
        const x = X0 + i * DX;
        if (Math.abs(x) < 2.6) continue; // the machine stands on firm ground
        const fa = firm[i] - surface(i + 1);
        const fb = firm[i + 1] - surface(i);
        if (fa > FACE) {
          const m = (fa - FACE) * 0.25;
          firm[i] -= m;
          loose[i + 1] += m * SWELL; // broken ground takes more room than standing ground
        } else if (fb > FACE) {
          const m = (fb - FACE) * 0.25;
          firm[i + 1] -= m;
          loose[i] += m * SWELL;
        }
      }
    }

    // What the gauges say.
    const want = clamp(demand * 0.28 + (cutting ? 0.22 + 0.11 * cutting : 0) + (load / CAP) * 0.08, 0, 1);
    pump += (want - pump) * Math.min(1, dt * 8);
    const i = col(tip[0]);
    if (tip[1] > surface(i) + 0.05) layerName = data.air;
    else if (tip[1] > firm[i]) layerName = data.loose;
    else layerName = layerAt(Math.max(0, -tip[1])).name;
  }

  // ----- drawing
  let W = 0;
  let H = 0;
  let ppm = 1;
  let gz = 0; // screen y of the natural surface
  const sx = (x: number) => (x - X0) * ppm;
  const sz = (z: number) => gz - z * ppm;

  function resize() {
    const dpr = Math.min(2, devicePixelRatio || 1);
    const r = canvas.getBoundingClientRect();
    W = canvas.width = Math.max(320, Math.round(r.width * dpr));
    H = canvas.height = Math.max(160, Math.round(r.height * dpr));
    ppm = W / (X1 - X0);
    gz = Math.max(H - 4.4 * ppm, H * 0.58);
  }

  function drawGround() {
    for (const layer of data.layers) {
      const top = -layer.top;
      const bottom = Math.max(-layer.bottom, FLOOR - 3);
      if (top < FLOOR - 3) break;
      ctx.beginPath();
      ctx.moveTo(sx(X0), sz(bottom));
      for (let i = 0; i < N; i++) ctx.lineTo(sx(X0 + i * DX), sz(Math.max(bottom, Math.min(top, firm[i]))));
      ctx.lineTo(sx(X1), sz(Math.max(bottom, Math.min(top, firm[N - 1]))));
      ctx.lineTo(sx(X1), sz(bottom));
      ctx.closePath();
      ctx.fillStyle = layer.color;
      ctx.fill();
    }
    // loose soil on top
    ctx.beginPath();
    ctx.moveTo(sx(X0), sz(firm[0]));
    for (let i = 0; i < N; i++) ctx.lineTo(sx(X0 + i * DX), sz(surface(i)));
    for (let i = N - 1; i >= 0; i--) ctx.lineTo(sx(X0 + i * DX), sz(firm[i]));
    ctx.closePath();
    ctx.fillStyle = data.looseColor;
    ctx.fill();
    // the surface line
    ctx.beginPath();
    for (let i = 0; i < N; i++) {
      const x = sx(X0 + i * DX);
      const y = sz(surface(i));
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    }
    ctx.strokeStyle = 'rgba(255,255,255,.22)';
    ctx.lineWidth = Math.max(1, ppm * 0.02);
    ctx.stroke();
    // shade the depths, so the cut reads
    const g = ctx.createLinearGradient(0, gz, 0, H);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,.45)');
    ctx.fillStyle = g;
    ctx.fillRect(0, gz, W, H - gz);
  }

  function drawBackdrop() {
    ctx.fillStyle = '#0d1014';
    ctx.fillRect(0, 0, W, H);
    const sky = ctx.createRadialGradient(sx(0), sz(3), 0, sx(0), sz(3), W * 0.6);
    sky.addColorStop(0, 'rgba(242,183,5,.10)');
    sky.addColorStop(1, 'rgba(242,183,5,0)');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, gz);
    ctx.lineWidth = 1;
    for (let m = Math.ceil(X0); m <= X1; m++) {
      ctx.strokeStyle = m % 5 === 0 ? 'rgba(255,255,255,.07)' : 'rgba(255,255,255,.03)';
      ctx.beginPath();
      ctx.moveTo(sx(m), 0);
      ctx.lineTo(sx(m), gz);
      ctx.stroke();
    }
    for (let m = 1; sz(m) > 0; m++) {
      ctx.strokeStyle = m % 5 === 0 ? 'rgba(255,255,255,.07)' : 'rgba(255,255,255,.03)';
      ctx.beginPath();
      ctx.moveTo(0, sz(m));
      ctx.lineTo(W, sz(m));
      ctx.stroke();
    }
  }

  function drawDepthScale() {
    ctx.font = `${Math.round(Math.max(9, ppm * 0.26))}px "IBM Plex Mono", monospace`;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255,255,255,.55)';
    for (let m = 1; m <= 4; m++) {
      const y = sz(-m);
      if (y > H - 6) break;
      ctx.fillRect(0, y, ppm * 0.18, 1);
      ctx.fillText(`${m} ${data.unit.replace('³', '')}`, ppm * 0.26, y);
    }
  }

  function box(x0: number, x1: number, z0: number, z1: number, fill: string, r = 0.06) {
    const a = sx(Math.min(x0, x1));
    const b = sx(Math.max(x0, x1));
    ctx.beginPath();
    ctx.roundRect(a, sz(z1), b - a, sz(z0) - sz(z1), r * ppm);
    ctx.fillStyle = fill;
    ctx.fill();
  }

  function drawTruck() {
    const o = truckX;
    ctx.save();
    box(4.6 + o, 11.5 + o, 0.86, 1.14, '#1b1d21', 0.03);
    for (const wx of [5.75, 7.05, 10.35]) {
      ctx.beginPath();
      ctx.arc(sx(wx + o), sz(0.555), 0.555 * ppm, 0, 7);
      ctx.fillStyle = '#15171a';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(sx(wx + o), sz(0.555), 0.27 * ppm, 0, 7);
      ctx.fillStyle = '#4b4f55';
      ctx.fill();
    }
    // soil in the body, heaped in the middle
    const f = clamp(truck / TRUCK.cap, 0, 1);
    if (f > 0) {
      const h = (TRUCK.top - TRUCK.floor) * f;
      ctx.beginPath();
      ctx.moveTo(sx(TRUCK.x0 + o), sz(TRUCK.floor));
      ctx.lineTo(sx(TRUCK.x0 + o), sz(TRUCK.floor + h * 0.75));
      ctx.quadraticCurveTo(
        sx((TRUCK.x0 + TRUCK.x1) / 2 + o),
        sz(TRUCK.floor + h * 1.5),
        sx(TRUCK.x1 + o),
        sz(TRUCK.floor + h * 0.75),
      );
      ctx.lineTo(sx(TRUCK.x1 + o), sz(TRUCK.floor));
      ctx.closePath();
      ctx.fillStyle = data.looseColor;
      ctx.fill();
    }
    // the body's side, ribbed, a little see-through so the level shows
    ctx.globalAlpha = 0.86;
    box(TRUCK.x0 - 0.06 + o, TRUCK.x1 + 0.06 + o, TRUCK.floor - 0.06, TRUCK.top, '#5d6268', 0.03);
    ctx.globalAlpha = 1;
    for (let r = 0; r < 6; r++) {
      const x = TRUCK.x0 + 0.35 + r * 0.76 + o;
      box(x, x + 0.07, TRUCK.floor, TRUCK.top - 0.04, '#44484d', 0.01);
    }
    box(TRUCK.x1 + o, TRUCK.x1 + 0.12 + o, TRUCK.floor, 2.62, '#44484d', 0.02);
    const overTruck = Math.abs(Math.abs(pose.swing) - 180) < 25 && truckPhase === 'here';
    if (overTruck) {
      ctx.strokeStyle = PAINT;
      ctx.lineWidth = Math.max(1.5, ppm * 0.05);
      ctx.strokeRect(
        sx(TRUCK.x0 + o),
        sz(TRUCK.top) - ppm * 0.06,
        (TRUCK.x1 - TRUCK.x0) * ppm,
        ppm * 0.001 + ppm * 0.06,
      );
    }
    // cab
    box(9.98 + o, 11.86 + o, 1.2, 3.02, '#f26b1d', 0.1);
    box(10.75 + o, 11.78 + o, 2.12, 2.9, '#1f2c36', 0.06);
    box(11.78 + o, 11.92 + o, 0.78, 1.2, '#1b1d21', 0.03);
    ctx.restore();
  }

  function drawMachine() {
    const th = pose.swing;
    const a = arm(pose.boom, pose.stick, pose.phi);
    const P = (y: number, z: number): [number, number] => [sx(project(y, 0.2, th)), sz(z)];
    const facing = Math.cos(th * DEG);

    // tracks
    box(-2.26, 2.26, 0, 0.96, '#1d1f23', 0.42);
    box(-2.02, 2.02, 0.16, 0.8, '#101114', 0.3);
    for (let r = 0; r < 7; r++) {
      ctx.beginPath();
      ctx.arc(sx(-1.3 + r * 0.433), sz(0.26), 0.11 * ppm, 0, 7);
      ctx.fillStyle = '#3a3d42';
      ctx.fill();
    }
    for (const wx of [-1.78, 1.78]) {
      ctx.beginPath();
      ctx.arc(sx(wx), sz(0.47), 0.31 * ppm, 0, 7);
      ctx.fillStyle = '#3a3d42';
      ctx.fill();
    }
    box(-0.55, 0.55, 0.9, 1.12, '#2a2d31', 0.03);

    const drawUpper = () => {
      const corners = [
        [-2.8, -1.27],
        [-2.8, 1.27],
        [1.25, -1.27],
        [1.25, 1.27],
      ].map(([y, x]) => project(y, x, th));
      const lo = Math.min(...corners);
      const hi = Math.max(...corners);
      box(lo, hi, 1.05, 2.28, PAINT, 0.07);
      // counterweight end
      const tail = [project(-2.8, -1.27, th), project(-2.8, 1.27, th), project(-2.25, -1.27, th), project(-2.25, 1.27, th)];
      box(Math.min(...tail), Math.max(...tail), 1.05, 2.2, '#17191c', 0.07);
      box(lo, hi, 1.05, 1.2, '#17191c', 0.02);
      // cab, on the machine's left
      const cab = [
        [-0.4, -1.27],
        [-0.4, -0.33],
        [1.3, -1.27],
        [1.3, -0.33],
      ].map(([y, x]) => project(y, x, th));
      const c0 = Math.min(...cab);
      const c1 = Math.max(...cab);
      const near = facing >= 0;
      box(c0, c1, 1.2, 3.0, near ? PAINT : PAINT_DIM, 0.06);
      box(c0 + 0.09, c1 - 0.09, 1.86, 2.9, near ? '#22313c' : '#1a252d', 0.04);
    };

    const drawArm = () => {
      const F = P(FOOT[0], FOOT[1]);
      const T = P(a.T[0], a.T[1]);
      const S = P(a.S[0], a.S[1]);
      const nb: [number, number] = [-Math.sin(pose.boom * DEG), Math.cos(pose.boom * DEG)];
      const mid = P((FOOT[0] + a.T[0]) / 2 + nb[0] * 1.05, (FOOT[1] + a.T[1]) / 2 + nb[1] * 1.05);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      // cylinders first, behind the steel
      const rod = (p: [number, number], q: [number, number], w: number) => {
        ctx.strokeStyle = '#c9ced4';
        ctx.lineWidth = w * ppm * 0.55;
        ctx.beginPath();
        ctx.moveTo(...p);
        ctx.lineTo(...q);
        ctx.stroke();
        ctx.strokeStyle = '#23262a';
        ctx.lineWidth = w * ppm;
        ctx.beginPath();
        ctx.moveTo(...p);
        ctx.lineTo(p[0] + (q[0] - p[0]) * 0.56, p[1] + (q[1] - p[1]) * 0.56);
        ctx.stroke();
      };
      const cb = Math.cos(pose.boom * DEG);
      const sb = Math.sin(pose.boom * DEG);
      rod(P(0.56, 1.12), P(FOOT[0] + 2.8 * cb - 0.15 * sb, FOOT[1] + 2.8 * sb + 0.15 * cb), 0.2);
      const cs = Math.cos(a.stickDeg * DEG);
      const ss = Math.sin(a.stickDeg * DEG);
      rod(
        P(FOOT[0] + 2.6 * cb - 1.3 * sb, FOOT[1] + 2.6 * sb + 1.3 * cb),
        P(a.T[0] - 0.72 * cs - 0.05 * ss, a.T[1] - 0.72 * ss + 0.05 * cs),
        0.2,
      );
      // boom, a bent box section
      ctx.strokeStyle = PAINT;
      ctx.lineWidth = 0.62 * ppm;
      ctx.beginPath();
      ctx.moveTo(...F);
      ctx.quadraticCurveTo(mid[0], mid[1], T[0], T[1]);
      ctx.stroke();
      // stick
      ctx.lineWidth = 0.44 * ppm;
      ctx.beginPath();
      ctx.moveTo(...P(a.T[0] - 0.8 * cs, a.T[1] - 0.8 * ss));
      ctx.lineTo(...S);
      ctx.stroke();
      // bucket: pin, shell, lip
      const e1: [number, number] = [Math.cos(a.bucketDeg * DEG), Math.sin(a.bucketDeg * DEG)];
      const e2: [number, number] = [-e1[1], e1[0]];
      const B = (u: number, v: number) => P(a.S[0] + u * e1[0] + v * e2[0], a.S[1] + u * e1[1] + v * e2[1]);
      rod(P(a.T[0] + 0.4 * cs - 0.4 * ss, a.T[1] + 0.4 * ss + 0.4 * cs), B(0.12, 0.52), 0.17);
      const shell = [B(0, 0), B(0.05, 0.5), B(0.5, 0.86), B(1.02, 0.8), B(1.36, 0.42), B(TOOTH, 0)];
      const path = () => {
        ctx.beginPath();
        ctx.moveTo(...shell[0]);
        for (const p of shell.slice(1)) ctx.lineTo(...p);
        ctx.closePath();
      };
      path();
      ctx.fillStyle = '#8f6c06';
      ctx.fill();
      if (load > 0.01) {
        ctx.save();
        path();
        ctx.clip();
        const ys = shell.map((p) => p[1]);
        const top = Math.min(...ys);
        const bottom = Math.max(...ys);
        const level = bottom - (bottom - top) * Math.min(1, 0.18 + (load / CAP) * 0.82);
        ctx.fillStyle = data.looseColor;
        ctx.fillRect(Math.min(...shell.map((p) => p[0])) - 2, level, 3 * ppm, bottom - level + 2);
        ctx.restore();
      }
      path();
      ctx.strokeStyle = PAINT;
      ctx.lineWidth = 0.09 * ppm;
      ctx.stroke();
      ctx.strokeStyle = '#d9dde2';
      ctx.lineWidth = 0.08 * ppm;
      ctx.beginPath();
      ctx.moveTo(...B(1.2, 0.02));
      ctx.lineTo(...B(TOOTH + 0.14, -0.03));
      ctx.stroke();
      // pins
      ctx.fillStyle = '#17191c';
      for (const p of [F, T, S]) {
        ctx.beginPath();
        ctx.arc(p[0], p[1], 0.11 * ppm, 0, 7);
        ctx.fill();
      }
    };

    if (facing >= 0) {
      drawArm();
      drawUpper();
    } else {
      drawUpper();
      drawArm();
    }

    // the dig guide: where the lip will meet the ground
    const tip = tipWorld(pose);
    const i = col(tip[0]);
    if (tip[1] > surface(i) + 0.08 && tip[1] < 4.5 && Math.abs(tip[0]) > 2.6) {
      ctx.setLineDash([ppm * 0.12, ppm * 0.12]);
      ctx.strokeStyle = 'rgba(242,183,5,.7)';
      ctx.lineWidth = Math.max(1, ppm * 0.03);
      ctx.beginPath();
      ctx.moveTo(sx(tip[0]), sz(tip[1]));
      ctx.lineTo(sx(tip[0]), sz(surface(i)));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = PAINT;
      ctx.fillRect(sx(tip[0]) - ppm * 0.35, sz(surface(i)) - 1, ppm * 0.7, Math.max(2, ppm * 0.04));
    }
  }

  function drawDrops() {
    ctx.fillStyle = data.looseColor;
    for (const d of drops) {
      ctx.beginPath();
      ctx.arc(sx(d.x), sz(d.z), Math.max(1.5, Math.cbrt(d.vol) * 0.42 * ppm), 0, 7);
      ctx.fill();
    }
  }

  function drawTop() {
    const w = topCanvas.width;
    const s = w / 25;
    const c = w / 2;
    tctx.clearRect(0, 0, w, w);
    tctx.save();
    tctx.translate(c - 1.2 * s, c);
    // truck
    const over = Math.abs(Math.abs(pose.swing) - 180) < 25 && truckPhase === 'here';
    tctx.fillStyle = over ? PAINT : '#5d6268';
    tctx.fillRect((TRUCK.x0 + truckX) * s, -1.25 * s, (TRUCK.x1 - TRUCK.x0) * s, 2.5 * s);
    tctx.fillStyle = '#f26b1d';
    tctx.fillRect((10 + truckX) * s, -1.25 * s, 1.9 * s, 2.5 * s);
    // tracks
    tctx.fillStyle = '#2a2d31';
    tctx.fillRect(-2.25 * s, -1.5 * s, 4.5 * s, 0.6 * s);
    tctx.fillRect(-2.25 * s, 0.9 * s, 4.5 * s, 0.6 * s);
    // upper and arm, turned by the swing (to the right is clockwise from above)
    tctx.rotate(pose.swing * DEG);
    tctx.fillStyle = PAINT;
    tctx.fillRect(-1.25 * s, -1.27 * s, 4.05 * s, 2.54 * s);
    tctx.fillStyle = '#17191c';
    tctx.fillRect(2.25 * s, -1.27 * s, 0.55 * s, 2.54 * s);
    tctx.fillStyle = '#22313c';
    tctx.fillRect(-1.3 * s, 0.33 * s, 1.7 * s, 0.94 * s);
    const reach = arm(pose.boom, pose.stick, pose.phi).tip[0];
    tctx.strokeStyle = PAINT;
    tctx.lineWidth = 0.55 * s;
    tctx.lineCap = 'round';
    tctx.beginPath();
    tctx.moveTo(-0.3 * s, -0.2 * s);
    tctx.lineTo(-reach * s, -0.2 * s);
    tctx.stroke();
    tctx.fillStyle = load > 0.05 ? data.looseColor : '#8f6c06';
    tctx.fillRect((-reach - 0.6) * s, -0.78 * s, 1.2 * s, 1.16 * s);
    tctx.restore();
  }

  function draw() {
    drawBackdrop();
    drawTruck();
    drawGround();
    drawDepthScale();
    drawMachine();
    drawDrops();
    drawTop();
    out.bucket.style.setProperty('--v', String(clamp(load / CAP, 0, 1)));
    out.bucketV.textContent = `${Math.round((load / CAP) * 100)} %`;
    out.truck.style.setProperty('--v', String(clamp(truck / TRUCK.cap, 0, 1)));
    out.truckV.textContent = `${fmt.format(Math.min(truck, TRUCK.cap))} ${data.unit}`;
    out.pump.style.setProperty('--v', String(pump));
    out.layer.textContent = layerName;
    for (const p of pads) {
      const useAxes = !p.down;
      const x = useAxes ? (p.side === 'left' ? axes.lx : axes.rx) : p.x;
      const y = useAxes ? (p.side === 'left' ? axes.ly : axes.ry) : p.y;
      const r = p.base.clientWidth * 0.28;
      p.knob.style.setProperty('--x', `${(x * r).toFixed(1)}px`);
      p.knob.style.setProperty('--y', `${(-y * r).toFixed(1)}px`);
    }
  }

  // ----- run only while on screen
  let raf = 0;
  let last = 0;
  const frame = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
    last = now;
    step(dt);
    draw();
    raf = requestAnimationFrame(frame);
  };
  new ResizeObserver(() => {
    resize();
    draw();
  }).observe(canvas);
  new IntersectionObserver(
    ([e]) => {
      onScreen = e.isIntersecting;
      cancelAnimationFrame(raf);
      if (onScreen) {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      } else {
        held.clear();
      }
    },
    { threshold: 0.15 },
  ).observe(root);

  // for the test bench: lets a script fast-forward the bot and read the ledger
  (root as HTMLElement & { toy?: unknown }).toy = {
    run(seconds: number) {
      for (let t = 0; t < seconds; t += 1 / 60) step(1 / 60);
      draw();
    },
    ledger() {
      let ground = 0;
      for (let i = 0; i < N; i++) ground += (firm[i] * SWELL + loose[i]) * DX * WIDTH;
      const air = drops.reduce((sum, d) => sum + d.vol, 0);
      return { ground, bucket: load, truck, air: air + pourCarry, total: ground + load + truck + air + pourCarry };
    },
    state: () => ({ ...pose, load, truck, truckPhase }),
  };

  resize();
  draw();
}
