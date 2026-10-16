import { useEffect, useRef, useState } from 'react';
import type { Category } from '@shared/types.ts';

/** Reads a CSS custom property from :root (so charts follow the live theme). */
export function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888';
}

export function categoryColor(c: Category | string, variant: '' | '-container' | '-on-container' | '-dim' | '-fixed' = ''): string {
  return cssVar(`--cat-${c}${variant}`);
}

export function themeColors() {
  return {
    onSurface: cssVar('--md-sys-color-on-surface'),
    onSurfaceVariant: cssVar('--md-sys-color-on-surface-variant'),
    outline: cssVar('--md-sys-color-outline'),
    outlineVariant: cssVar('--md-sys-color-outline-variant'),
    surface: cssVar('--md-sys-color-surface-container-lowest'),
    surfaceHigh: cssVar('--md-sys-color-surface-container-high'),
    primary: cssVar('--md-sys-color-primary'),
    primaryContainer: cssVar('--md-sys-color-primary-container'),
    onPrimary: cssVar('--md-sys-color-on-primary'),
    tertiary: cssVar('--md-sys-color-tertiary'),
    secondary: cssVar('--md-sys-color-secondary'),
    secondaryContainer: cssVar('--md-sys-color-secondary-container'),
    inverseSurface: cssVar('--md-sys-color-inverse-surface'),
    inverseOnSurface: cssVar('--md-sys-color-inverse-on-surface'),
  };
}

/** Tracks the pixel size of a container element. */
export function useSize<T extends HTMLElement>(): [React.RefObject<T | null>, { width: number; height: number }] {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      setSize((s) => (Math.abs(s.width - r.width) < 1 && Math.abs(s.height - r.height) < 1 ? s : { width: r.width, height: r.height }));
    });
    ro.observe(el);
    setSize({ width: el.clientWidth, height: el.clientHeight });
    return () => ro.disconnect();
  }, []);
  return [ref, size];
}

/** Re-renders when the theme (data-theme attribute) changes, so charts pick up new colours. */
export function useThemeVersion(): number {
  const [v, setV] = useState(0);
  useEffect(() => {
    const obs = new MutationObserver(() => setV((x) => x + 1));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'style'] });
    return () => obs.disconnect();
  }, []);
  return v;
}

export interface TooltipState {
  x: number;
  y: number;
  content: string;
}

export function mixColor(a: string, b: string, t: number): string {
  const pa = parse(a);
  const pb = parse(b);
  const m = pa.map((v, i) => Math.round(v + (pb[i] - v) * t));
  return `rgb(${m[0]},${m[1]},${m[2]})`;
}

function parse(c: string): [number, number, number] {
  if (c.startsWith('#')) {
    const h = c.slice(1);
    const n = parseInt(h.length === 3 ? h.split('').map((x) => x + x).join('') : h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const m = /rgba?\(([^)]+)\)/.exec(c);
  if (m) {
    const [r, g, b] = m[1].split(',').map((s) => Number(s.trim()));
    return [r, g, b];
  }
  return [128, 128, 128];
}

export function formatMonth(key: string): string {
  const [y, m] = key.split('-');
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
}
