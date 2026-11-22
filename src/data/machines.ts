// Every figure here is the simulator's own: measured on its models and machines, not a brochure estimate.
// Units are keys (see i18n `units`); values are formatted per language at build time.

export type Unit = 't' | 'kW' | 'm3' | 'm' | 'kN' | 'MPa' | 'kmh' | 's' | 'm3h' | 'pcs' | 'deg';

export interface Spec {
  key: string; // label key in i18n `spec`
  value: number;
  unit: Unit;
  digits?: number; // decimals shown
}

export interface Machine {
  id: 'ex20' | 'ex50' | 'ex80' | 'ex150' | 'truck' | 'hauler' | 'bwe';
  kind: 'excavator' | 'truck' | 'bwe';
  paint: string; // the model's paint, as in the simulator
  accent: string; // the same hue, lifted for use on a dark page
  headline: Spec[]; // the three figures shown large
  specs: Spec[]; // the full table
  model: string; // .glb in /models
  sideLength: number; // metres, nose to tail in the side view
  sideHeight: number;
}

export const machines: Machine[] = [
  {
    id: 'ex20',
    kind: 'excavator',
    paint: '#F2B705',
    accent: '#F2B705',
    model: 'excavator-20t.glb',
    sideLength: 8.9,
    sideHeight: 5.7,
    headline: [
      { key: 'mass', value: 21.55, unit: 't', digits: 1 },
      { key: 'bucket', value: 1.0, unit: 'm3', digits: 1 },
      { key: 'reach', value: 9.81, unit: 'm', digits: 1 },
    ],
    specs: [
      { key: 'mass', value: 21.55, unit: 't', digits: 2 },
      { key: 'engine', value: 110, unit: 'kW' },
      { key: 'bucket', value: 1.0, unit: 'm3', digits: 1 },
      { key: 'reach', value: 9.81, unit: 'm', digits: 2 },
      { key: 'depth', value: 6.46, unit: 'm', digits: 2 },
      { key: 'dump', value: 5.59, unit: 'm', digits: 2 },
      { key: 'breakout', value: 170, unit: 'kN' },
      { key: 'relief', value: 34.3, unit: 'MPa', digits: 1 },
      { key: 'travel', value: 8, unit: 'kmh' },
    ],
  },
  {
    id: 'ex50',
    kind: 'excavator',
    paint: '#E4E0D3',
    accent: '#E4E0D3',
    model: 'excavator-50t.glb',
    sideLength: 11.3,
    sideHeight: 7.0,
    headline: [
      { key: 'mass', value: 50, unit: 't' },
      { key: 'bucket', value: 3.0, unit: 'm3', digits: 1 },
      { key: 'reach', value: 12.04, unit: 'm', digits: 1 },
    ],
    specs: [
      { key: 'mass', value: 50, unit: 't', digits: 1 },
      { key: 'engine', value: 270, unit: 'kW' },
      { key: 'bucket', value: 3.0, unit: 'm3', digits: 1 },
      { key: 'reach', value: 12.04, unit: 'm', digits: 2 },
      { key: 'depth', value: 7.49, unit: 'm', digits: 2 },
      { key: 'dump', value: 7.26, unit: 'm', digits: 2 },
      { key: 'breakout', value: 250, unit: 'kN' },
      { key: 'relief', value: 34.3, unit: 'MPa', digits: 1 },
      { key: 'travel', value: 7.3, unit: 'kmh', digits: 1 },
      { key: 'outputBot', value: 346, unit: 'm3h' },
    ],
  },
  {
    id: 'ex80',
    kind: 'excavator',
    paint: '#7A8288',
    accent: '#A9B4BC',
    model: 'excavator-80t.glb',
    sideLength: 11.9,
    sideHeight: 7.3,
    headline: [
      { key: 'mass', value: 80, unit: 't' },
      { key: 'bucket', value: 5.0, unit: 'm3', digits: 1 },
      { key: 'reach', value: 11.95, unit: 'm', digits: 1 },
    ],
    specs: [
      { key: 'mass', value: 80, unit: 't', digits: 1 },
      { key: 'engine', value: 390, unit: 'kW' },
      { key: 'bucket', value: 5.0, unit: 'm3', digits: 1 },
      { key: 'reach', value: 11.95, unit: 'm', digits: 2 },
      { key: 'depth', value: 7.44, unit: 'm', digits: 2 },
      { key: 'dump', value: 7.52, unit: 'm', digits: 2 },
      { key: 'breakout', value: 428, unit: 'kN' },
      { key: 'relief', value: 35.0, unit: 'MPa', digits: 1 },
      { key: 'travel', value: 6.5, unit: 'kmh', digits: 1 },
      { key: 'outputBot', value: 560, unit: 'm3h' },
    ],
  },
  {
    id: 'ex150',
    kind: 'excavator',
    paint: '#1E8A6E',
    accent: '#2FB892',
    model: 'excavator-150t.glb',
    sideLength: 13.6,
    sideHeight: 8.3,
    headline: [
      { key: 'mass', value: 140, unit: 't' },
      { key: 'bucket', value: 8.0, unit: 'm3', digits: 1 },
      { key: 'reach', value: 13.54, unit: 'm', digits: 1 },
    ],
    specs: [
      { key: 'mass', value: 140, unit: 't', digits: 1 },
      { key: 'engine', value: 600, unit: 'kW' },
      { key: 'bucket', value: 8.0, unit: 'm3', digits: 1 },
      { key: 'reach', value: 13.54, unit: 'm', digits: 2 },
      { key: 'depth', value: 8.03, unit: 'm', digits: 2 },
      { key: 'dump', value: 8.53, unit: 'm', digits: 2 },
      { key: 'breakout', value: 563, unit: 'kN' },
      { key: 'relief', value: 32.0, unit: 'MPa', digits: 1 },
      { key: 'travel', value: 5.1, unit: 'kmh', digits: 1 },
      { key: 'outputBot', value: 817, unit: 'm3h' },
    ],
  },
  {
    id: 'truck',
    kind: 'truck',
    paint: '#F26B1D',
    accent: '#F26B1D',
    model: 'dump-truck.glb',
    sideLength: 7.1,
    sideHeight: 3.2,
    headline: [
      { key: 'payload', value: 15, unit: 't' },
      { key: 'body', value: 10.6, unit: 'm3', digits: 1 },
      { key: 'speed', value: 60, unit: 'kmh' },
    ],
    specs: [
      { key: 'empty', value: 11, unit: 't', digits: 1 },
      { key: 'payload', value: 15, unit: 't', digits: 1 },
      { key: 'body', value: 10.6, unit: 'm3', digits: 1 },
      { key: 'speed', value: 60, unit: 'kmh' },
      { key: 'tipAngle', value: 50, unit: 'deg' },
      { key: 'tipTime', value: 12.1, unit: 's', digits: 1 },
      { key: 'length', value: 7.1, unit: 'm', digits: 1 },
      { key: 'height', value: 3.2, unit: 'm', digits: 1 },
    ],
  },
  {
    id: 'hauler',
    kind: 'truck',
    paint: '#A8231D',
    accent: '#E2473D',
    model: 'rigid-hauler.glb',
    sideLength: 9.09,
    sideHeight: 4.4,
    headline: [
      { key: 'payload', value: 40, unit: 't' },
      { key: 'bodyHeaped', value: 26.0, unit: 'm3', digits: 1 },
      { key: 'engine', value: 382, unit: 'kW' },
    ],
    specs: [
      { key: 'empty', value: 35, unit: 't', digits: 1 },
      { key: 'payload', value: 40, unit: 't', digits: 1 },
      { key: 'bodyStruck', value: 19.07, unit: 'm3', digits: 1 },
      { key: 'bodyHeaped', value: 26.02, unit: 'm3', digits: 1 },
      { key: 'engine', value: 382, unit: 'kW' },
      { key: 'speed', value: 66, unit: 'kmh' },
      { key: 'tipAngle', value: 50, unit: 'deg' },
      { key: 'tipTime', value: 10.1, unit: 's', digits: 1 },
      { key: 'length', value: 9.09, unit: 'm', digits: 2 },
      { key: 'height', value: 4.4, unit: 'm', digits: 1 },
    ],
  },
  {
    id: 'bwe',
    kind: 'bwe',
    paint: '#3A8FD6',
    accent: '#4FA3EA',
    model: 'bucket-wheel.glb',
    sideLength: 47.6,
    sideHeight: 21.1,
    headline: [
      { key: 'mass', value: 550, unit: 't' },
      { key: 'wheel', value: 7.03, unit: 'm', digits: 1 },
      { key: 'output', value: 2022, unit: 'm3h' },
    ],
    specs: [
      { key: 'mass', value: 550, unit: 't' },
      { key: 'wheel', value: 7.03, unit: 'm', digits: 2 },
      { key: 'buckets', value: 10, unit: 'pcs' },
      { key: 'bucketEach', value: 0.45, unit: 'm3', digits: 2 },
      { key: 'length', value: 47.6, unit: 'm', digits: 1 },
      { key: 'height', value: 21.1, unit: 'm', digits: 1 },
      { key: 'cutAbove', value: 15.0, unit: 'm', digits: 1 },
      { key: 'cutBelow', value: 1.5, unit: 'm', digits: 1 },
      { key: 'output', value: 2022, unit: 'm3h' },
      { key: 'fillsHauler', value: 46, unit: 's' },
    ],
  },
];

// The ground, top to bottom: depth below the natural surface, relative dig resistance (topsoil = 1.0),
// the share of normal cutting speed the teeth keep, and the layer's colour in the simulator.
export interface Layer {
  id: 'turf' | 'topsoil' | 'clay' | 'gravel' | 'sand' | 'stiffclay' | 'cgravel' | 'rock' | 'bedrock';
  top: number;
  bottom: number; // metres; bedrock has no bottom
  strength: number | null;
  speed: number | null; // 1 = full speed
  color: string;
  reach: Machine['id'][]; // machines that can cut it
}

const ALL_DIGGERS: Machine['id'][] = ['ex20', 'ex50', 'ex80', 'ex150', 'bwe'];
const HEAVY: Machine['id'][] = ['ex50', 'ex80', 'ex150'];

export const layers: Layer[] = [
  { id: 'turf', top: 0, bottom: 0.15, strength: 0.6, speed: 1, color: '#458F21', reach: ALL_DIGGERS },
  { id: 'topsoil', top: 0.15, bottom: 1, strength: 1.0, speed: 1, color: '#3D2112', reach: ALL_DIGGERS },
  { id: 'clay', top: 1, bottom: 3.5, strength: 1.6, speed: 1, color: '#C76B21', reach: ALL_DIGGERS },
  { id: 'gravel', top: 3.5, bottom: 12, strength: 2.2, speed: 1, color: '#A89E87', reach: ALL_DIGGERS },
  { id: 'sand', top: 12, bottom: 18, strength: 2.6, speed: 0.78, color: '#D9BD78', reach: ALL_DIGGERS },
  { id: 'stiffclay', top: 18, bottom: 26, strength: 3.2, speed: 0.57, color: '#54614D', reach: ALL_DIGGERS },
  { id: 'cgravel', top: 26, bottom: 36, strength: 3.9, speed: 0.43, color: '#B87557', reach: ALL_DIGGERS },
  { id: 'rock', top: 36, bottom: 50, strength: 6.0, speed: 0.22, color: '#5C4D4F', reach: HEAVY },
  { id: 'bedrock', top: 50, bottom: 56, strength: null, speed: null, color: '#54667D', reach: [] },
];

export const LOOSE_COLOR = '#946B45';
