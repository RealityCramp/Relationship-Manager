import { useMemo, useState } from 'react';
import { hierarchy as d3hierarchy, treemap, treemapSquarify, cluster, type HierarchyNode, type HierarchyRectangularNode, type HierarchyPointNode } from 'd3-hierarchy';
import { linkRadial } from 'd3-shape';
import type { Category } from '@shared/types.ts';
import { CATEGORY_LABEL } from '@shared/util.ts';
import type { TreeNode } from '@shared/graph.ts';
import { categoryColor, mixColor, themeColors, useSize, useThemeVersion } from './common.ts';
import { Button } from '../ui/components.tsx';

/** Treemap: Circle → Company → Person, sized by relationship strength. Click a company to zoom in. */
export function TreemapView({ tree, onPick }: { tree: TreeNode; onPick?: (id: string) => void }) {
  const [wrapRef, size] = useSize<HTMLDivElement>();
  const themeVersion = useThemeVersion();
  const [focus, setFocus] = useState<string[]>([]); // path of names
  const colors = themeColors();

  const root = useMemo(() => {
    let node: TreeNode = tree;
    for (const name of focus) {
      const next = node.children?.find((c) => c.name === name);
      if (!next) break;
      node = next;
    }
    const w = Math.max(400, size.width);
    const h = Math.max(300, size.height);
    const h2 = d3hierarchy<TreeNode>(node)
      .sum((d) => d.value ?? 0)
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
    return treemap<TreeNode>().size([w, h]).paddingOuter(4).paddingTop((d) => (d.depth === 0 ? 0 : 22)).paddingInner(3).tile(treemapSquarify).round(true)(h2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tree, focus, size.width, size.height, themeVersion]);

  const leaves = root.leaves();
  const groups = root.descendants().filter((d) => d.depth > 0 && d.children);
  const catOf = (d: HierarchyNode<TreeNode>): Category => d.data.category ?? (d.parent ? catOf(d.parent) : 'personal');

  return (
    <div className="stack" style={{ gap: 0 }}>
      <div className="row" style={{ padding: '12px 16px', flexWrap: 'wrap' }}>
        <Button variant={focus.length ? 'tonal' : 'text'} size="sm" onClick={() => setFocus([])} data-testid="treemap-root">
          All circles
        </Button>
        {focus.map((f, i) => (
          <span key={f} className="row" style={{ gap: 4 }}>
            <span className="muted">›</span>
            <Button variant="text" size="sm" onClick={() => setFocus(focus.slice(0, i + 1))}>
              {CATEGORY_LABEL[f as Category] ?? f}
            </Button>
          </span>
        ))}
        <span className="body-sm muted" style={{ marginLeft: 'auto' }}>
          Box size = relationship strength · click a group to zoom
        </span>
      </div>
      <div ref={wrapRef} className="viz" style={{ height: 'calc(100vh - 350px)', minHeight: 440 }} data-testid="treemap">
        <svg viewBox={`0 0 ${Math.max(400, size.width)} ${Math.max(300, size.height)}`} style={{ width: '100%', height: '100%' }} role="img" aria-label="Treemap of circles, companies and people">
          {groups.map((g) => {
            const r = g as HierarchyRectangularNode<TreeNode>;
            const c = catOf(g);
            return (
              <g key={g.data.name + g.depth} onClick={() => setFocus([...focus, ...g.ancestors().reverse().slice(1).map((a) => a.data.name)])} style={{ cursor: 'pointer' }}>
                <rect x={r.x0} y={r.y0} width={Math.max(0, r.x1 - r.x0)} height={Math.max(0, r.y1 - r.y0)} rx={10} fill={categoryColor(c, '-container')} opacity={g.depth === 1 ? 0.5 : 0.9} />
                {r.x1 - r.x0 > 50 ? (
                  <text x={r.x0 + 8} y={r.y0 + 15} style={{ fontSize: 12, fontWeight: 600, fill: categoryColor(c, '-on-container') }}>
                    {(CATEGORY_LABEL[g.data.name as Category] ?? g.data.name).slice(0, Math.floor((r.x1 - r.x0) / 7))} · {g.leaves().length}
                  </text>
                ) : null}
              </g>
            );
          })}
          {leaves.map((l) => {
            const r = l as HierarchyRectangularNode<TreeNode>;
            const c = catOf(l);
            const w = r.x1 - r.x0;
            const h = r.y1 - r.y0;
            return (
              <g key={(l.data.id ?? l.data.name) + r.x0} onClick={() => l.data.id && onPick?.(l.data.id)} style={{ cursor: l.data.id ? 'pointer' : 'default' }}>
                <rect x={r.x0} y={r.y0} width={Math.max(0, w)} height={Math.max(0, h)} rx={6} fill={mixColor(categoryColor(c), colors.surface, 0.15)} opacity={0.9}>
                  <title>{l.data.name}</title>
                </rect>
                {w > 60 && h > 18 ? (
                  <text x={r.x0 + 6} y={r.y0 + 14} style={{ fontSize: 11, fill: '#fff', fontWeight: 500 }}>
                    {l.data.name.slice(0, Math.floor(w / 6.5))}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

/** Radial dendrogram: Circle → Company → Person. */
export function RadialTreeView({ tree, onPick }: { tree: TreeNode; onPick?: (id: string) => void }) {
  const [wrapRef, size] = useSize<HTMLDivElement>();
  const themeVersion = useThemeVersion();
  const colors = themeColors();
  const [hover, setHover] = useState<string | null>(null);
  const side = Math.max(500, Math.min(size.width, size.height));
  const radius = side / 2 - 110;

  const root = useMemo(() => {
    const h = d3hierarchy<TreeNode>(tree).sort((a, b) => (b.height - a.height) || a.data.name.localeCompare(b.data.name));
    return cluster<TreeNode>().size([2 * Math.PI, radius]).separation((a, b) => (a.parent === b.parent ? 1 : 2) / a.depth)(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tree, radius, themeVersion]);

  const catOf = (d: HierarchyNode<TreeNode>): Category => d.data.category ?? (d.parent ? catOf(d.parent) : 'personal');
  const link = linkRadial<unknown, HierarchyPointNode<TreeNode>>()
    .angle((d) => d.x)
    .radius((d) => d.y) as unknown as (d: { source: HierarchyPointNode<TreeNode>; target: HierarchyPointNode<TreeNode> }) => string;
  const many = root.leaves().length > 220;

  return (
    <div ref={wrapRef} className="viz" style={{ height: 'calc(100vh - 290px)', minHeight: 520 }} data-testid="radial">
      <svg viewBox={`${-side / 2} ${-side / 2} ${side} ${side}`} style={{ width: '100%', height: '100%' }} role="img" aria-label="Radial tree of circles, companies and people">
        <g fill="none" strokeOpacity={0.35}>
          {root.links().map((l, i) => (
            <path key={i} d={link(l)} stroke={categoryColor(catOf(l.target))} strokeWidth={l.target.children ? 1.5 : 0.8} />
          ))}
        </g>
        <g>
          {root.descendants().map((d, i) => {
            const isLeaf = !d.children;
            const angle = (d.x * 180) / Math.PI - 90;
            const flip = d.x >= Math.PI;
            const label = d.depth === 0 ? '' : d.depth === 1 ? CATEGORY_LABEL[d.data.name as Category] ?? d.data.name : d.data.name;
            const show = d.depth <= 2 || !many || hover === d.data.id;
            return (
              <g key={i} transform={`rotate(${angle}) translate(${d.y},0)`} onClick={() => d.data.id && onPick?.(d.data.id)} onMouseEnter={() => setHover(d.data.id ?? null)} onMouseLeave={() => setHover(null)} style={{ cursor: d.data.id ? 'pointer' : 'default' }}>
                <circle r={d.depth === 0 ? 10 : d.depth === 1 ? 7 : isLeaf ? 3 : 4.5} fill={d.depth === 0 ? colors.primary : categoryColor(catOf(d))} />
                {show && label ? (
                  <text dy="0.32em" x={isLeaf || d.depth > 1 ? (flip ? -8 : 8) : flip ? -12 : 12} textAnchor={flip ? 'end' : 'start'} transform={flip ? 'rotate(180)' : undefined} style={{ fontSize: d.depth === 1 ? 14 : d.depth === 2 ? 11 : 9.5, fontWeight: d.depth <= 2 ? 600 : 400, paintOrder: 'stroke', stroke: colors.surface, strokeWidth: 3 }}>
                    {label}
                  </text>
                ) : null}
              </g>
            );
          })}
        </g>
      </svg>
      <div className="viz__legend">
        <span>Centre: you · ring 1: circles · ring 2: companies · leaves: people{many ? ' (hover to reveal names)' : ''}</span>
      </div>
    </div>
  );
}
