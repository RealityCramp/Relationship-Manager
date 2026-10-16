import { useEffect, useMemo, useRef, useState } from 'react';
import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type SimulationLinkDatum, type SimulationNodeDatum } from 'd3-force';
import { select } from 'd3-selection';
import { zoom, zoomIdentity, type ZoomTransform } from 'd3-zoom';
import { drag } from 'd3-drag';
import 'd3-transition';
import type { Category, Graph, GraphNode } from '@shared/types.ts';
import { CATEGORIES } from '@shared/types.ts';
import { CATEGORY_LABEL, hashString } from '@shared/util.ts';
import { categoryColor, themeColors, useSize, useThemeVersion } from './common.ts';
import { IconButton } from '../ui/components.tsx';

type Node = GraphNode & SimulationNodeDatum & { r: number; color: string };
type Link = SimulationLinkDatum<Node> & { kind: Category; strength: number; origin: string };

export type ClusterMode = 'none' | 'category' | 'company';

interface Props {
  graph: Graph;
  cluster: ClusterMode;
  showLabels: boolean;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  highlightCategory?: Category | null;
}

/** Force-directed network rendered on a canvas (fast for thousands of nodes) with pan, zoom, drag and hover. */
export function ForceGraph({ graph, cluster, showLabels, selectedId, onSelect, highlightCategory }: Props) {
  const [wrapRef, size] = useSize<HTMLDivElement>();
  const sizeRef = useRef(size);
  sizeRef.current = size;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const themeVersion = useThemeVersion();
  const [hover, setHover] = useState<{ node: Node; x: number; y: number } | null>(null);
  const transformRef = useRef<ZoomTransform>(zoomIdentity);
  const simRef = useRef<ReturnType<typeof forceSimulation<Node>> | null>(null);
  const nodesRef = useRef<Node[]>([]);
  const linksRef = useRef<Link[]>([]);
  const drawRef = useRef<() => void>(() => undefined);
  const zoomRef = useRef<ReturnType<typeof zoom<HTMLCanvasElement, unknown>> | null>(null);
  const fitRef = useRef<() => void>(() => undefined);

  // Build simulation data when the graph changes (keeps positions for nodes that persist).
  const data = useMemo(() => {
    const prev = new Map(nodesRef.current.map((n) => [n.id, n]));
    const nodes: Node[] = graph.nodes.map((n) => {
      const old = prev.get(n.id);
      const primary = n.categories[0] ?? 'personal';
      return { ...n, r: n.isSelf ? 18 : 4 + n.strength * 9, color: categoryColor(primary), x: old?.x, y: old?.y, vx: 0, vy: 0 };
    });
    const ids = new Set(nodes.map((n) => n.id));
    const links: Link[] = graph.links.filter((l) => ids.has(l.source) && ids.has(l.target)).map((l) => ({ source: l.source, target: l.target, kind: l.kind, strength: l.strength, origin: l.origin }));
    return { nodes, links };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph, themeVersion]);

  const neighbors = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const l of graph.links) {
      if (!m.has(l.source)) m.set(l.source, new Set());
      if (!m.has(l.target)) m.set(l.target, new Set());
      m.get(l.source)!.add(l.target);
      m.get(l.target)!.add(l.source);
    }
    return m;
  }, [graph]);

  // (Re)start simulation
  useEffect(() => {
    const { width, height } = size;
    if (!width || !height) return;
    nodesRef.current = data.nodes;
    linksRef.current = data.links;
    const self = data.nodes.find((n) => n.isSelf);
    if (self) {
      self.fx = 0;
      self.fy = 0;
    }
    const companies = Array.from(new Set(data.nodes.map((n) => n.company).filter(Boolean))) as string[];
    const clusterCenter = (n: Node): [number, number] => {
      if (cluster === 'category') {
        const i = CATEGORIES.indexOf(n.categories[0] ?? 'personal');
        const a = (i / CATEGORIES.length) * Math.PI * 2 - Math.PI / 2;
        const R = Math.min(width, height) * 0.3;
        return [Math.cos(a) * R, Math.sin(a) * R];
      }
      if (cluster === 'company') {
        if (!n.company) return [0, 0];
        const i = companies.indexOf(n.company);
        const a = (hashString(n.company) % 360) * (Math.PI / 180);
        const R = Math.min(width, height) * (0.22 + ((i * 37) % 100) / 400);
        return [Math.cos(a) * R, Math.sin(a) * R];
      }
      return [0, 0];
    };
    const sim = forceSimulation<Node>(data.nodes)
      .force('link', forceLink<Node, Link>(data.links).id((d) => d.id).distance((l) => 70 + (1 - l.strength) * 140).strength((l) => (l.origin === 'employer' ? 0.1 : 0.2 + l.strength * 0.4)))
      .force('charge', forceManyBody<Node>().strength((d) => (d.isSelf ? -2500 : -140 - d.strength * 160)).theta(0.9).distanceMax(900))
      .force('collide', forceCollide<Node>().radius((d) => d.r + 6).iterations(2))
      .force('center', forceCenter(0, 0).strength(0.02))
      .alphaDecay(0.03)
      .velocityDecay(0.35);
    if (cluster !== 'none') {
      sim.force('x', forceX<Node>((d) => clusterCenter(d)[0]).strength(0.12)).force('y', forceY<Node>((d) => clusterCenter(d)[1]).strength(0.12));
    } else {
      sim.force('x', forceX(0).strength(0.015)).force('y', forceY(0).strength(0.015));
    }
    let fits = 0;
    sim.on('tick', () => {
      drawRef.current();
      const a = sim.alpha();
      if ((fits === 0 && a < 0.3) || (fits === 1 && a < 0.06)) {
        fits++;
        fitRef.current();
      }
    });
    simRef.current = sim;
    return () => {
      sim.stop();
    };
  }, [data, cluster, size.width, size.height]);

  // Zoom + drag + hover handlers
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const sel = select(canvas);
    const z = zoom<HTMLCanvasElement, unknown>()
      .scaleExtent([0.1, 8])
      .on('zoom', (ev) => {
        transformRef.current = ev.transform;
        drawRef.current();
      });
    zoomRef.current = z;
    sel.call(z);
    const toGraph = (x: number, y: number) => {
      const t = transformRef.current;
      const rect = canvas.getBoundingClientRect();
      return [t.invertX(x - rect.left - rect.width / 2), t.invertY(y - rect.top - rect.height / 2)] as [number, number];
    };
    const find = (cx: number, cy: number): Node | undefined => {
      const [gx, gy] = toGraph(cx, cy);
      const t = transformRef.current;
      return simRef.current?.find(gx, gy, 14 / t.k);
    };
    const d = drag<HTMLCanvasElement, unknown>()
      .container(canvas)
      .subject((ev) => find(ev.sourceEvent.clientX, ev.sourceEvent.clientY) as unknown as Node)
      .on('start', (ev) => {
        const n = ev.subject as Node;
        if (!ev.active) simRef.current?.alphaTarget(0.3).restart();
        n.fx = n.x;
        n.fy = n.y;
      })
      .on('drag', (ev) => {
        const n = ev.subject as Node;
        const [gx, gy] = toGraph(ev.sourceEvent.clientX, ev.sourceEvent.clientY);
        n.fx = gx;
        n.fy = gy;
      })
      .on('end', (ev) => {
        const n = ev.subject as Node;
        if (!ev.active) simRef.current?.alphaTarget(0);
        if (!n.isSelf) {
          n.fx = null;
          n.fy = null;
        }
      });
    sel.call(d);
    const onMove = (e: MouseEvent) => {
      const n = find(e.clientX, e.clientY);
      const rect = canvas.getBoundingClientRect();
      setHover(n ? { node: n, x: e.clientX - rect.left, y: e.clientY - rect.top } : null);
      canvas.style.cursor = n ? 'pointer' : 'grab';
    };
    const onClick = (e: MouseEvent) => {
      const n = find(e.clientX, e.clientY);
      onSelect(n ? n.id : null);
    };
    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('click', onClick);
    canvas.addEventListener('mouseleave', () => setHover(null));
    return () => {
      canvas.removeEventListener('mousemove', onMove);
      canvas.removeEventListener('click', onClick);
      sel.on('.zoom', null).on('.drag', null);
    };
  }, [onSelect]);

  // Draw
  useEffect(() => {
    drawRef.current = () => {
      const canvas = canvasRef.current;
      const { width, height } = size;
      if (!canvas || !width || !height) return;
      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
        canvas.width = width * dpr;
        canvas.height = height * dpr;
      }
      const ctx = canvas.getContext('2d')!;
      const t = transformRef.current;
      const colors = themeColors();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.translate(width / 2 + t.x, height / 2 + t.y);
      ctx.scale(t.k, t.k);

      const focus = hover?.node.id ?? selectedId;
      const focusSet = focus ? new Set([focus, ...(neighbors.get(focus) ?? [])]) : null;

      // links
      ctx.lineCap = 'round';
      for (const l of linksRef.current) {
        const s = l.source as Node;
        const tg = l.target as Node;
        if (s.x === undefined || tg.x === undefined) continue;
        const dim = (focusSet && !(focusSet.has(s.id) && focusSet.has(tg.id))) || (highlightCategory && l.kind !== highlightCategory && l.origin !== 'employer');
        ctx.globalAlpha = dim ? 0.05 : l.origin === 'employer' ? 0.18 : 0.25 + l.strength * 0.4;
        ctx.strokeStyle = categoryColor(l.kind);
        ctx.lineWidth = (l.origin === 'employer' ? 0.6 : 0.8 + l.strength * 1.6) / Math.sqrt(t.k);
        if (l.origin === 'employer') ctx.setLineDash([3 / t.k, 4 / t.k]);
        else ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(s.x!, s.y!);
        ctx.lineTo(tg.x!, tg.y!);
        ctx.stroke();
      }
      ctx.setLineDash([]);

      // nodes
      const labelNodes: Node[] = [];
      const labelBudget = nodesRef.current.length < 60 ? Infinity : Math.round(22 * t.k * t.k);
      const rank = new Map(nodesRef.current.filter((n) => !n.isSelf).sort((a, b) => b.strength - a.strength).map((n, i) => [n.id, i] as const));
      for (const n of nodesRef.current) {
        if (n.x === undefined) continue;
        const dimmed = (focusSet && !focusSet.has(n.id)) || (highlightCategory && !n.categories.includes(highlightCategory) && !n.isSelf);
        ctx.globalAlpha = dimmed ? 0.18 : 1;
        ctx.beginPath();
        ctx.arc(n.x!, n.y!, n.r, 0, Math.PI * 2);
        if (n.isSelf) {
          ctx.fillStyle = colors.primary;
          ctx.fill();
          ctx.lineWidth = 3 / t.k;
          ctx.strokeStyle = colors.surface;
          ctx.stroke();
        } else {
          ctx.fillStyle = n.color;
          ctx.fill();
          if (n.categories.length > 1) {
            // ring segments for multiple categories
            let a0 = -Math.PI / 2;
            const step = (Math.PI * 2) / n.categories.length;
            ctx.lineWidth = 2.2 / Math.sqrt(t.k);
            for (const c of n.categories) {
              ctx.beginPath();
              ctx.arc(n.x!, n.y!, n.r + 1.6, a0, a0 + step);
              ctx.strokeStyle = categoryColor(c);
              ctx.stroke();
              a0 += step;
            }
          }
        }
        if (n.id === selectedId || n.id === hover?.node.id) {
          ctx.beginPath();
          ctx.arc(n.x!, n.y!, n.r + 5, 0, Math.PI * 2);
          ctx.lineWidth = 2 / t.k;
          ctx.strokeStyle = colors.onSurface;
          ctx.stroke();
        }
        if (n.isSelf || n.id === selectedId || n.id === hover?.node.id || (showLabels && (rank.get(n.id) ?? Infinity) < labelBudget && !dimmed)) labelNodes.push(n);
      }

      // labels
      ctx.globalAlpha = 1;
      ctx.font = `${Math.max(11, 12 / t.k)}px ${getComputedStyle(document.body).fontFamily}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (const n of labelNodes) {
        const label = n.name;
        const w = ctx.measureText(label).width + 10 / t.k;
        const h = 16 / t.k;
        const x = n.x! - w / 2;
        const y = n.y! + n.r + 4 / t.k;
        ctx.fillStyle = colors.surface;
        ctx.globalAlpha = 0.85;
        roundRect(ctx, x, y, w, h, 6 / t.k);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = colors.onSurface;
        ctx.fillText(label, n.x!, y + 2 / t.k);
      }
    };
    drawRef.current();
  }, [size, hover, selectedId, showLabels, neighbors, highlightCategory, themeVersion]);

  const zoomBy = (k: number) => {
    const canvas = canvasRef.current;
    if (canvas && zoomRef.current) select(canvas).transition().duration(300).call(zoomRef.current.scaleBy, k);
  };
  const fit = () => {
    const canvas = canvasRef.current;
    if (!canvas || !zoomRef.current) return;
    const { width: W, height: H } = sizeRef.current;
    if (!W || !H) return;
    const xs = nodesRef.current.map((n) => n.x ?? 0);
    const ys = nodesRef.current.map((n) => n.y ?? 0);
    if (!xs.length) return;
    const w = Math.max(...xs) - Math.min(...xs) + 80;
    const h = Math.max(...ys) - Math.min(...ys) + 80;
    const k = Math.min(1.5, 0.9 * Math.min(W / w, H / h));
    const cx = (Math.max(...xs) + Math.min(...xs)) / 2;
    const cy = (Math.max(...ys) + Math.min(...ys)) / 2;
    select(canvas).transition().duration(500).call(zoomRef.current.transform, zoomIdentity.scale(k).translate(-cx, -cy));
  };

  fitRef.current = fit;

  return (
    <div ref={wrapRef} className="viz viz--tall" data-testid="force-graph">
      <canvas ref={canvasRef} style={{ width: size.width, height: size.height }} aria-label="Network graph" role="img" />
      <div className="viz__toolbar">
        <IconButton icon="zoomIn" label="Zoom in" onClick={() => zoomBy(1.4)} />
        <IconButton icon="zoomOut" label="Zoom out" onClick={() => zoomBy(1 / 1.4)} />
        <IconButton icon="center" label="Fit to view" onClick={fit} />
        <IconButton icon="refresh" label="Re-run layout" onClick={() => simRef.current?.alpha(0.8).restart()} />
      </div>
      <div className="viz__hint">Drag to pan · scroll to zoom · drag a node to pin it while moving</div>
      <div className="viz__legend">
        {CATEGORIES.map((c) => (
          <span key={c}>
            <span className={`dot dot--${c}`} /> {CATEGORY_LABEL[c]}
          </span>
        ))}
        <span>
          <span className="dot" style={{ background: 'var(--md-sys-color-primary)' }} /> You
        </span>
        <span style={{ opacity: 0.7 }}>dashed = same employer</span>
      </div>
      {hover ? (
        <div className="tooltip" style={{ left: hover.x, top: hover.y }}>
          <div style={{ fontWeight: 500 }}>{hover.node.name}</div>
          {hover.node.company ? <div>{hover.node.company}</div> : null}
          <div style={{ opacity: 0.8 }}>
            {hover.node.categories.map((c) => CATEGORY_LABEL[c]).join(' · ')} · {Math.round(hover.node.strength * 100)}%
          </div>
        </div>
      ) : null}
    </div>
  );
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
