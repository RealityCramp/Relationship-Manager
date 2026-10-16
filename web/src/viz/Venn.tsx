import { useEffect, useMemo, useRef, useState } from 'react';
import type { Category } from '@shared/types.ts';
import { CATEGORIES } from '@shared/types.ts';
import { CATEGORY_LABEL } from '@shared/util.ts';
import type { VennRegion } from '@shared/graph.ts';
import { categoryColor, themeColors, useSize, useThemeVersion } from './common.ts';
import { Chip } from '../ui/components.tsx';

interface Shape {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  rot: number; // radians
}

const inside = (s: Shape, x: number, y: number) => {
  const dx = x - s.cx;
  const dy = y - s.cy;
  const c = Math.cos(-s.rot);
  const sn = Math.sin(-s.rot);
  const lx = dx * c - dy * sn;
  const ly = dx * sn + dy * c;
  return (lx * lx) / (s.rx * s.rx) + (ly * ly) / (s.ry * s.ry) <= 1;
};

/** Area of the lens formed by two circles of radii r1, r2 at distance d. */
function lensArea(r1: number, r2: number, d: number): number {
  if (d >= r1 + r2) return 0;
  if (d <= Math.abs(r1 - r2)) return Math.PI * Math.min(r1, r2) ** 2;
  const a1 = r1 * r1 * Math.acos((d * d + r1 * r1 - r2 * r2) / (2 * d * r1));
  const a2 = r2 * r2 * Math.acos((d * d + r2 * r2 - r1 * r1) / (2 * d * r2));
  const a3 = 0.5 * Math.sqrt((-d + r1 + r2) * (d + r1 - r2) * (d - r1 + r2) * (d + r1 + r2));
  return a1 + a2 - a3;
}

function distanceForOverlap(r1: number, r2: number, target: number): number {
  let lo = Math.abs(r1 - r2);
  let hi = r1 + r2;
  if (target <= 0) return hi;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (lensArea(r1, r2, mid) > target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Area-proportional layout for 2–3 sets; Venn's four-ellipse construction for 4. Coordinates are in a 1000×700 space. */
function layout(sets: Category[], regions: VennRegion[]): Shape[] {
  const n = sets.length;
  const size = (s: Category) => regions.find((r) => r.sets.length === 1 && r.sets[0] === s)?.inclusive ?? 0;
  const pair = (a: Category, b: Category) => regions.find((r) => r.sets.length === 2 && r.sets.includes(a) && r.sets.includes(b))?.inclusive ?? 0;
  if (n === 4) {
    const rx = 300;
    const ry = 150;
    return [
      { cx: 340, cy: 330, rx, ry, rot: Math.PI / 4 },
      { cx: 440, cy: 290, rx, ry, rot: Math.PI / 4 },
      { cx: 560, cy: 290, rx, ry, rot: -Math.PI / 4 },
      { cx: 660, cy: 330, rx, ry, rot: -Math.PI / 4 },
    ];
  }
  const sizes = sets.map((s) => Math.max(1, size(s)));
  const scale = 230 / Math.sqrt(Math.max(...sizes) / Math.PI);
  const radii = sizes.map((s) => Math.sqrt(s / Math.PI) * scale);
  if (n === 2) {
    const d = distanceForOverlap(radii[0], radii[1], pair(sets[0], sets[1]) * scale * scale);
    const cx = 500;
    return [
      { cx: cx - d / 2, cy: 350, rx: radii[0], ry: radii[0], rot: 0 },
      { cx: cx + d / 2, cy: 350, rx: radii[1], ry: radii[1], rot: 0 },
    ];
  }
  if (n === 3) {
    const d01 = distanceForOverlap(radii[0], radii[1], pair(sets[0], sets[1]) * scale * scale);
    const d02 = distanceForOverlap(radii[0], radii[2], pair(sets[0], sets[2]) * scale * scale);
    const d12 = distanceForOverlap(radii[1], radii[2], pair(sets[1], sets[2]) * scale * scale);
    // place 0 at origin, 1 on the x axis, 2 by triangulation
    const p0 = { x: 0, y: 0 };
    const p1 = { x: d01, y: 0 };
    let x2 = (d02 * d02 - d12 * d12 + d01 * d01) / (2 * d01);
    let y2 = Math.sqrt(Math.max(0, d02 * d02 - x2 * x2));
    if (!Number.isFinite(x2)) x2 = 0;
    if (!Number.isFinite(y2)) y2 = 0;
    const pts = [p0, p1, { x: x2, y: y2 }];
    const cx = (p0.x + p1.x + x2) / 3;
    const cy = (p0.y + p1.y + y2) / 3;
    return pts.map((p, i) => ({ cx: 500 + (p.x - cx), cy: 350 + (p.y - cy) * -1, rx: radii[i], ry: radii[i], rot: 0 }));
  }
  const r = radii[0] ?? 200;
  return [{ cx: 500, cy: 350, rx: r, ry: r, rot: 0 }];
}

interface Props {
  regions: VennRegion[];
  onRegionClick?: (sets: Category[]) => void;
  initialSets?: Category[];
}

export function Venn({ regions, onRegionClick, initialSets }: Props) {
  const [sets, setSets] = useState<Category[]>(initialSets ?? [...CATEGORIES]);
  const [wrapRef, size] = useSize<HTMLDivElement>();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const themeVersion = useThemeVersion();
  const [hover, setHover] = useState<{ mask: number; x: number; y: number } | null>(null);

  const subRegions = useMemo(() => {
    // Recompute exclusive counts restricted to the chosen sets: a contact in {personal, social} counts as "personal only" if social is not shown.
    const out: VennRegion[] = [];
    for (let mask = 1; mask < 1 << sets.length; mask++) {
      const combo = sets.filter((_, i) => mask & (1 << i));
      const full = regions.filter((r) => combo.every((s) => r.sets.includes(s)) && sets.every((s) => combo.includes(s) || !r.sets.includes(s)));
      const exclusive = full.reduce((n, r) => n + r.exclusive, 0);
      const inclusive = regions.find((r) => r.sets.length === combo.length && combo.every((s) => r.sets.includes(s)))?.inclusive ?? 0;
      out.push({ sets: combo, exclusive, inclusive, contactIds: [] });
    }
    return out;
  }, [regions, sets]);

  const shapes = useMemo(() => layout(sets, regions), [sets, regions]);

  // centroids by sampling
  const centroids = useMemo(() => {
    const acc = new Map<number, { x: number; y: number; n: number }>();
    for (let gx = 0; gx <= 1000; gx += 6)
      for (let gy = 0; gy <= 700; gy += 6) {
        let mask = 0;
        shapes.forEach((s, i) => inside(s, gx, gy) && (mask |= 1 << i));
        if (!mask) continue;
        const a = acc.get(mask) ?? { x: 0, y: 0, n: 0 };
        a.x += gx;
        a.y += gy;
        a.n++;
        acc.set(mask, a);
      }
    return new Map(Array.from(acc.entries()).map(([m, a]) => [m, { x: a.x / a.n, y: a.y / a.n, area: a.n }]));
  }, [shapes]);

  const maskFor = (gx: number, gy: number) => {
    let mask = 0;
    shapes.forEach((s, i) => inside(s, gx, gy) && (mask |= 1 << i));
    return mask;
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const { width, height } = size;
    if (!canvas || !width || !height) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext('2d')!;
    const colors = themeColors();
    const k = Math.min(width / 1000, height / 700);
    const ox = (width - 1000 * k) / 2;
    const oy = (height - 700 * k) / 2;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.save();
    ctx.translate(ox, oy);
    ctx.scale(k, k);

    const drawShape = (c: CanvasRenderingContext2D, s: Shape) => {
      c.beginPath();
      c.ellipse(s.cx, s.cy, s.rx, s.ry, s.rot, 0, Math.PI * 2);
    };

    // regions via offscreen compositing
    const off = document.createElement('canvas');
    off.width = 1000;
    off.height = 700;
    const oc = off.getContext('2d')!;
    for (let mask = 1; mask < 1 << shapes.length; mask++) {
      oc.globalCompositeOperation = 'source-over';
      oc.clearRect(0, 0, 1000, 700);
      const members = shapes.map((s, i) => (mask & (1 << i) ? s : null));
      let first = true;
      const cats = sets.filter((_, i) => mask & (1 << i));
      for (const s of members) {
        if (!s) continue;
        oc.globalCompositeOperation = first ? 'source-over' : 'source-in';
        oc.fillStyle = mixCategory(cats);
        drawShape(oc, s);
        oc.fill();
        first = false;
      }
      oc.globalCompositeOperation = 'destination-out';
      shapes.forEach((s, i) => {
        if (mask & (1 << i)) return;
        drawShape(oc, s);
        oc.fillStyle = '#000';
        oc.fill();
      });
      ctx.globalAlpha = hover?.mask === mask ? 0.85 : 0.45;
      ctx.drawImage(off, 0, 0);
    }
    ctx.globalAlpha = 1;
    // outlines
    shapes.forEach((s, i) => {
      drawShape(ctx, s);
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = categoryColor(sets[i]);
      ctx.stroke();
    });
    // set labels on the outside
    ctx.font = `600 22px ${getComputedStyle(document.body).fontFamily}`;
    ctx.textAlign = 'center';
    shapes.forEach((s, i) => {
      const r = subRegions.find((x) => x.sets.length === 1 && x.sets[0] === sets[i]);
      const total = regions.find((x) => x.sets.length === 1 && x.sets[0] === sets[i])?.inclusive ?? 0;
      let lx: number;
      let ly: number;
      if (shapes.length === 4) {
        // label at the upper tip of each ellipse's major axis
        const dx = Math.cos(s.rot);
        const dy = Math.sin(s.rot);
        const sign = dy < 0 ? 1 : -1;
        lx = s.cx + sign * dx * (s.rx + 30);
        ly = s.cy + sign * dy * (s.rx + 30) - 6;
      } else {
        const ang = Math.atan2(s.cy - 350, s.cx - 500);
        lx = s.cx + Math.cos(ang) * (Math.max(s.rx, s.ry) + 28);
        ly = s.cy + Math.sin(ang) * (Math.max(s.rx, s.ry) + 28);
      }
      ctx.fillStyle = categoryColor(sets[i]);
      ctx.fillText(`${CATEGORY_LABEL[sets[i]]} · ${total}`, lx, ly);
      void r;
    });
    // region counts
    ctx.font = `500 20px ${getComputedStyle(document.body).fontFamily}`;
    for (const [mask, c] of centroids) {
      const region = subRegions[mask - 1];
      if (!region || c.area < 20) continue;
      const label = String(region.exclusive);
      const w = ctx.measureText(label).width + 16;
      ctx.fillStyle = colors.surface;
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.roundRect(c.x - w / 2, c.y - 14, w, 28, 14);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = colors.onSurface;
      ctx.textBaseline = 'middle';
      ctx.fillText(label, c.x, c.y);
    }
    ctx.restore();
  }, [size, shapes, subRegions, sets, hover, centroids, regions, themeVersion]);

  const toGraph = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const k = Math.min(size.width / 1000, size.height / 700);
    const ox = (size.width - 1000 * k) / 2;
    const oy = (size.height - 700 * k) / 2;
    return { gx: (e.clientX - rect.left - ox) / k, gy: (e.clientY - rect.top - oy) / k, x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const hoverRegion = hover ? subRegions[hover.mask - 1] : null;

  return (
    <div className="stack" style={{ gap: 0 }}>
      <div className="row row--wrap" style={{ padding: '12px 16px' }}>
        <span className="label-lg muted">Circles:</span>
        {CATEGORIES.map((c) => (
          <Chip
            key={c}
            category={c}
            selected={sets.includes(c)}
            testId={`venn-set-${c}`}
            onClick={() => {
              const next = sets.includes(c) ? sets.filter((x) => x !== c) : [...CATEGORIES].filter((x) => x === c || sets.includes(x));
              if (next.length >= 2) setSets(next);
            }}
          >
            {CATEGORY_LABEL[c]}
          </Chip>
        ))}
        <span className="body-sm muted">{sets.length < 4 ? 'Circle areas are proportional to group sizes.' : 'Four-set Venn (ellipses, not area-proportional). Deselect a circle for a proportional view.'}</span>
      </div>
      <div ref={wrapRef} className="viz" style={{ height: 'calc(100vh - 350px)', minHeight: 440 }} data-testid="venn">
        <canvas
          ref={canvasRef}
          style={{ width: size.width, height: size.height, cursor: hover ? 'pointer' : 'default' }}
          role="img"
          aria-label="Venn diagram of relationship categories"
          onMouseMove={(e: React.MouseEvent<HTMLCanvasElement>) => {
            const { gx, gy, x, y } = toGraph(e);
            const mask = maskFor(gx, gy);
            setHover(mask ? { mask, x, y } : null);
          }}
          onMouseLeave={() => setHover(null)}
          onClick={(e: React.MouseEvent<HTMLCanvasElement>) => {
            const { gx, gy } = toGraph(e);
            const mask = maskFor(gx, gy);
            if (mask && onRegionClick) onRegionClick(sets.filter((_, i) => mask & (1 << i)));
          }}
        />
        {hover && hoverRegion ? (
          <div className="tooltip" style={{ left: hover.x, top: hover.y }}>
            <div style={{ fontWeight: 500 }}>{hoverRegion.sets.map((s) => CATEGORY_LABEL[s]).join(' ∩ ')}</div>
            <div>{hoverRegion.exclusive} people only here</div>
            {hoverRegion.sets.length > 1 ? <div style={{ opacity: 0.8 }}>{hoverRegion.inclusive} in all of these (any others too)</div> : null}
            <div style={{ opacity: 0.8 }}>Click to list them</div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function mixCategory(cats: Category[]): string {
  if (cats.length === 1) return categoryColor(cats[0]);
  // average the category colours
  const rgbs = cats.map((c) => {
    const hex = categoryColor(c);
    const n = parseInt(hex.replace('#', ''), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  });
  const avg = rgbs.reduce((a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], [0, 0, 0]).map((v) => Math.round(v / rgbs.length));
  return `rgb(${avg[0]},${avg[1]},${avg[2]})`;
}
