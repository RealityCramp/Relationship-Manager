import { useMemo, useState } from 'react';
import { sankey, sankeyLinkHorizontal, sankeyJustify, type SankeyNode, type SankeyLink } from 'd3-sankey';
import type { Category } from '@shared/types.ts';
import { CATEGORY_LABEL } from '@shared/util.ts';
import { SOURCE_LABEL } from '@shared/graph.ts';
import { categoryColor, themeColors, useSize, useThemeVersion } from './common.ts';

type NodeDatum = { id: string; label: string; kind: 'source' | 'category' | 'company' };
type LinkDatum = { source: string; target: string; value: number };

const SOURCE_COLORS: Record<string, string> = { linkedin: '#0a66c2', facebook: '#1877f2', x: '#111111', contacts: '#34a853', email: '#ea4335', manual: '#9aa0a6' };

/** Source → Circle → Company flow. */
export function SankeyView({ nodes, links, onPick }: { nodes: NodeDatum[]; links: LinkDatum[]; onPick?: (node: NodeDatum) => void }) {
  const [wrapRef, size] = useSize<HTMLDivElement>();
  const themeVersion = useThemeVersion();
  const [hover, setHover] = useState<string | null>(null);
  const colors = themeColors();

  const graph = useMemo(() => {
    const width = Math.max(600, size.width);
    const height = Math.max(400, size.height);
    if (!nodes.length) return null;
    const gen = sankey<NodeDatum, LinkDatum>()
      .nodeId((d) => d.id)
      .nodeWidth(16)
      .nodePadding(10)
      .nodeAlign(sankeyJustify)
      .extent([
        [20, 24],
        [width - 20, height - 24],
      ]);
    return gen({ nodes: nodes.map((n) => ({ ...n })), links: links.map((l) => ({ ...l })) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, links, size.width, size.height, themeVersion]);

  const colorFor = (n: NodeDatum) => (n.kind === 'category' ? categoryColor(n.label as Category) : n.kind === 'source' ? SOURCE_COLORS[n.label] ?? colors.secondary : colors.tertiary);
  const labelFor = (n: NodeDatum) => (n.kind === 'category' ? CATEGORY_LABEL[n.label as Category] : n.kind === 'source' ? SOURCE_LABEL[n.label as keyof typeof SOURCE_LABEL] ?? n.label : n.label);
  const path = sankeyLinkHorizontal<NodeDatum, LinkDatum>();

  return (
    <div ref={wrapRef} className="viz" style={{ height: 'calc(100vh - 290px)', minHeight: 480 }} data-testid="sankey">
      {!graph ? (
        <div className="empty">No data yet</div>
      ) : (
        <svg viewBox={`0 0 ${Math.max(600, size.width)} ${Math.max(400, size.height)}`} role="img" aria-label="Sankey diagram from sources to circles to companies" style={{ width: '100%', height: '100%' }}>
          <g fill="none">
            {graph.links.map((l, i) => {
              const s = l.source as SankeyNode<NodeDatum, LinkDatum> & NodeDatum;
              const t = l.target as SankeyNode<NodeDatum, LinkDatum> & NodeDatum;
              const active = hover && (s.id === hover || t.id === hover);
              return (
                <path key={i} d={path(l) ?? ''} stroke={colorFor(s)} strokeWidth={Math.max(1, l.width ?? 1)} strokeOpacity={hover ? (active ? 0.7 : 0.06) : 0.3} style={{ transition: 'stroke-opacity 200ms' }}>
                  <title>
                    {labelFor(s)} → {labelFor(t)}: {l.value}
                  </title>
                </path>
              );
            })}
          </g>
          <g>
            {graph.nodes.map((n) => (
              <g key={n.id} transform={`translate(${n.x0},${n.y0})`} onMouseEnter={() => setHover(n.id)} onMouseLeave={() => setHover(null)} onClick={() => onPick?.(n)} style={{ cursor: 'pointer' }}>
                <rect width={(n.x1 ?? 0) - (n.x0 ?? 0)} height={Math.max(1, (n.y1 ?? 0) - (n.y0 ?? 0))} rx={4} fill={colorFor(n)} />
                <text x={n.kind === 'company' ? -8 : (n.x1 ?? 0) - (n.x0 ?? 0) + 8} y={((n.y1 ?? 0) - (n.y0 ?? 0)) / 2} dominantBaseline="middle" textAnchor={n.kind === 'company' ? 'end' : 'start'} style={{ fontSize: 12, fontWeight: 500 }}>
                  {labelFor(n)} ({n.value})
                </text>
              </g>
            ))}
          </g>
        </svg>
      )}
      <div className="viz__hint" style={{ left: 'auto', right: 16 }}>Sources → circles → companies (top 12) · hover to trace</div>
    </div>
  );
}

export type { SankeyLink };
