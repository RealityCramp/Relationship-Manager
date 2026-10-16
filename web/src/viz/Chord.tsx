import { useMemo, useState } from 'react';
import { chord, ribbon } from 'd3-chord';
import { arc } from 'd3-shape';
import type { Category } from '@shared/types.ts';
import { CATEGORY_LABEL } from '@shared/util.ts';
import { categoryColor, useSize, useThemeVersion } from './common.ts';

/** Chord diagram: how much the four circles overlap. The diagonal (people in only one circle) is shown as a self-loop. */
export function ChordView({ labels, matrix, onPick }: { labels: Category[]; matrix: number[][]; onPick?: (a: Category, b: Category | null) => void }) {
  const [wrapRef, size] = useSize<HTMLDivElement>();
  useThemeVersion();
  const [hover, setHover] = useState<{ i: number; j: number | null; x: number; y: number } | null>(null);
  const side = Math.max(320, Math.min(size.width, size.height));
  const outer = side / 2 - 96;
  const inner = outer - 22;

  const chords = useMemo(() => chord().padAngle(0.06).sortSubgroups((a, b) => b - a)(matrix), [matrix]);
  const arcGen = arc<{ startAngle: number; endAngle: number }>().innerRadius(inner).outerRadius(outer);
  const ribbonGen = ribbon().radius(inner - 2) as unknown as (d: unknown) => string;
  const total = matrix.flat().reduce((a, b) => a + b, 0);

  return (
    <div ref={wrapRef} className="viz" style={{ height: 'calc(100vh - 290px)', minHeight: 480 }} data-testid="chord">
      {total === 0 ? (
        <div className="empty">No data yet</div>
      ) : (
        <svg viewBox={`${-side / 2} ${-side / 2} ${side} ${side}`} role="img" aria-label="Chord diagram of category overlaps" style={{ width: '100%', height: '100%' }}>
          <g>
            {chords.map((c, idx) => {
              const dim = hover && !(hover.i === c.source.index || hover.i === c.target.index);
              const isSelf = c.source.index === c.target.index;
              return (
                <path
                  key={idx}
                  d={ribbonGen(c)}
                  fill={categoryColor(labels[c.source.index])}
                  opacity={dim ? 0.08 : isSelf ? 0.35 : 0.55}
                  stroke={categoryColor(labels[c.target.index])}
                  strokeOpacity={dim ? 0.1 : 0.6}
                  style={{ cursor: 'pointer', transition: 'opacity 200ms' }}
                  onMouseMove={(e: React.MouseEvent<SVGPathElement>) => {
                    const r = e.currentTarget.ownerSVGElement!.getBoundingClientRect();
                    setHover({ i: c.source.index, j: c.target.index, x: e.clientX - r.left, y: e.clientY - r.top });
                  }}
                  onMouseLeave={() => setHover(null)}
                  onClick={() => onPick?.(labels[c.source.index], isSelf ? null : labels[c.target.index])}
                />
              );
            })}
          </g>
          <g>
            {chords.groups.map((g) => {
              const mid = (g.startAngle + g.endAngle) / 2;
              const lx = Math.sin(mid) * (outer + 18);
              const ly = -Math.cos(mid) * (outer + 18);
              const right = lx >= 0;
              return (
                <g key={g.index}>
                  <path d={arcGen(g) ?? ''} fill={categoryColor(labels[g.index])} opacity={hover && hover.i !== g.index ? 0.4 : 1} style={{ cursor: 'pointer' }} onMouseEnter={() => setHover({ i: g.index, j: null, x: 0, y: 0 })} onMouseLeave={() => setHover(null)} onClick={() => onPick?.(labels[g.index], null)} />
                  <text x={lx} y={ly} textAnchor={right ? 'start' : 'end'} dominantBaseline="middle" style={{ fontSize: 14, fontWeight: 500 }}>
                    {CATEGORY_LABEL[labels[g.index]]} · {g.value}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      )}
      {hover && hover.j !== null ? (
        <div className="tooltip" style={{ left: hover.x, top: hover.y }}>
          {hover.i === hover.j ? (
            <div>
              <strong>{matrix[hover.i][hover.i]}</strong> people are only {CATEGORY_LABEL[labels[hover.i]]}
            </div>
          ) : (
            <div>
              <strong>{matrix[hover.i][hover.j]}</strong> people are both {CATEGORY_LABEL[labels[hover.i]]} and {CATEGORY_LABEL[labels[hover.j]]}
            </div>
          )}
          <div style={{ opacity: 0.8 }}>Click to list them</div>
        </div>
      ) : null}
      <div className="viz__legend">
        <span>Ribbon width = people shared between two circles · self-loops = people in one circle only</span>
      </div>
    </div>
  );
}
