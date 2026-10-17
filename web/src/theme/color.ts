/**
 * Material 3 dynamic colour, implemented with CIELAB/LCh as a close stand-in for HCT.
 * A seed colour becomes six tonal palettes which are mapped to the Material 3 colour roles
 * for light and dark schemes, following the "tonal spot" variant used by Google's apps.
 */

export type Rgb = [number, number, number];

export function hexToRgb(hex: string): Rgb {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]: Rgb): string {
  return '#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
}

const srgbToLinear = (c: number) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
};
const linearToSrgb = (v: number) => {
  const c = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
  return c * 255;
};

const WHITE = [0.95047, 1, 1.08883];
const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
const fInv = (t: number) => (t > 0.206893 ? t * t * t : (t - 16 / 116) / 7.787);

export function rgbToLab([r, g, b]: Rgb): [number, number, number] {
  const [R, G, B] = [r, g, b].map(srgbToLinear);
  const x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / WHITE[0];
  const y = (R * 0.2126 + G * 0.7152 + B * 0.0722) / WHITE[1];
  const z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / WHITE[2];
  const [fx, fy, fz] = [x, y, z].map(f);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export function labToRgb([L, a, b]: [number, number, number]): Rgb {
  const fy = (L + 16) / 116;
  const fx = a / 500 + fy;
  const fz = fy - b / 200;
  const x = fInv(fx) * WHITE[0];
  const y = fInv(fy) * WHITE[1];
  const z = fInv(fz) * WHITE[2];
  const R = x * 3.2406 + y * -1.5372 + z * -0.4986;
  const G = x * -0.9689 + y * 1.8758 + z * 0.0415;
  const B = x * 0.0557 + y * -0.204 + z * 1.057;
  return [R, G, B].map(linearToSrgb) as Rgb;
}

const inGamut = (rgb: Rgb) => rgb.every((v) => v >= -0.5 && v <= 255.5);

/** Colour at a given tone (L*), hue and chroma, reducing chroma until it fits in sRGB. */
export function lchToHex(tone: number, chroma: number, hue: number): string {
  const rad = (hue * Math.PI) / 180;
  let c = chroma;
  for (let i = 0; i < 40; i++) {
    const rgb = labToRgb([tone, c * Math.cos(rad), c * Math.sin(rad)]);
    if (inGamut(rgb)) return rgbToHex(rgb);
    c *= 0.9;
  }
  return rgbToHex(labToRgb([tone, 0, 0]));
}

export function hexToLch(hex: string): { tone: number; chroma: number; hue: number } {
  const [L, a, b] = rgbToLab(hexToRgb(hex));
  return { tone: L, chroma: Math.hypot(a, b), hue: ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360 };
}

export type TonalPalette = (tone: number) => string;
export const palette = (hue: number, chroma: number): TonalPalette => (tone) => lchToHex(tone, chroma, hue);

export interface Scheme {
  [role: string]: string;
}

export function makeScheme(seed: string, dark: boolean): Scheme {
  const { hue, chroma } = hexToLch(seed);
  const P = palette(hue, Math.max(48, chroma));
  const S = palette(hue, 16);
  const T = palette((hue + 60) % 360, 28);
  const N = palette(hue, 4);
  const NV = palette(hue, 8);
  const E = palette(30, 80);
  return dark
    ? {
        primary: P(80), onPrimary: P(20), primaryContainer: P(30), onPrimaryContainer: P(90),
        secondary: S(80), onSecondary: S(20), secondaryContainer: S(30), onSecondaryContainer: S(90),
        tertiary: T(80), onTertiary: T(20), tertiaryContainer: T(30), onTertiaryContainer: T(90),
        error: E(80), onError: E(20), errorContainer: E(30), onErrorContainer: E(90),
        surface: N(6), onSurface: N(90), surfaceVariant: NV(30), onSurfaceVariant: NV(80),
        outline: NV(60), outlineVariant: NV(30),
        surfaceDim: N(6), surfaceBright: N(24), surfaceContainerLowest: N(4), surfaceContainerLow: N(10),
        surfaceContainer: N(12), surfaceContainerHigh: N(17), surfaceContainerHighest: N(22),
        inverseSurface: N(90), inverseOnSurface: N(20), inversePrimary: P(40), scrim: N(0), shadow: N(0),
        primaryFixed: P(90), primaryFixedDim: P(80), onPrimaryFixed: P(10), onPrimaryFixedVariant: P(30),
      }
    : {
        primary: P(40), onPrimary: P(100), primaryContainer: P(90), onPrimaryContainer: P(30),
        secondary: S(40), onSecondary: S(100), secondaryContainer: S(90), onSecondaryContainer: S(30),
        tertiary: T(40), onTertiary: T(100), tertiaryContainer: T(90), onTertiaryContainer: T(30),
        error: E(40), onError: E(100), errorContainer: E(90), onErrorContainer: E(30),
        surface: N(98), onSurface: N(10), surfaceVariant: NV(90), onSurfaceVariant: NV(30),
        outline: NV(50), outlineVariant: NV(80),
        surfaceDim: N(87), surfaceBright: N(98), surfaceContainerLowest: N(100), surfaceContainerLow: N(96),
        surfaceContainer: N(94), surfaceContainerHigh: N(92), surfaceContainerHighest: N(90),
        inverseSurface: N(20), inverseOnSurface: N(95), inversePrimary: P(80), scrim: N(0), shadow: N(0),
        primaryFixed: P(90), primaryFixedDim: P(80), onPrimaryFixed: P(10), onPrimaryFixedVariant: P(30),
      };
}

/** Fixed, recognisable hues for the four relationship categories. */
export const CATEGORY_SEEDS = { personal: '#1e8e3e', business: '#1a73e8', corporate: '#8430ce', social: '#e8710a' } as const;

export function categoryColors(dark: boolean): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, seed] of Object.entries(CATEGORY_SEEDS)) {
    const { hue, chroma } = hexToLch(seed);
    const P = palette(hue, Math.max(64, chroma));
    // Dark mode keeps hues saturated and distinguishable (tone ~70 rather than the pastel 80),
    // with muted low-tone containers so text stays readable.
    const C = palette(hue, 28);
    out[`cat-${name}`] = P(dark ? 70 : 40);
    out[`cat-${name}-dim`] = P(dark ? 60 : 50);
    out[`cat-${name}-container`] = dark ? C(24) : P(90);
    out[`cat-${name}-on-container`] = dark ? P(88) : P(12);
    out[`cat-${name}-fixed`] = P(60);
  }
  return out;
}

export const SEED_PRESETS = [
  { name: 'Google Blue', value: '#0b57d0' },
  { name: 'Material Purple', value: '#6750a4' },
  { name: 'Forest', value: '#146c2e' },
  { name: 'Sunset', value: '#b3261e' },
  { name: 'Ocean', value: '#00677d' },
  { name: 'Mango', value: '#8c4a00' },
];

const kebab = (s: string) => s.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());

/** Writes every colour role as a CSS custom property on :root. */
export function applyTheme(seed: string, dark: boolean) {
  const root = document.documentElement;
  const scheme = makeScheme(seed, dark);
  for (const [k, val] of Object.entries(scheme)) root.style.setProperty(`--md-sys-color-${kebab(k)}`, val);
  for (const [k, val] of Object.entries(categoryColors(dark))) root.style.setProperty(`--${k}`, val);
  root.style.colorScheme = dark ? 'dark' : 'light';
  root.dataset.theme = dark ? 'dark' : 'light';
  const meta = document.querySelector('meta[name="theme-color"]:not([media])') ?? document.head.appendChild(Object.assign(document.createElement('meta'), { name: 'theme-color' }));
  meta.setAttribute('content', scheme.surface);
}
