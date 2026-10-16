import { useState } from 'react';
import type { Category, Source } from '@shared/types.ts';
import { CATEGORIES, SOURCES } from '@shared/types.ts';
import { CATEGORY_LABEL } from '@shared/util.ts';
import { SOURCE_LABEL } from '@shared/graph.ts';
import { categoryColor, formatMonth } from './common.ts';

/** Compact monthly bars used on the dashboard. */
export function MiniBars({ data }: { data: { month: string; count: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  const [hover, setHover] = useState<number | null>(null);
  return (
    <div>
      <div className="bars" role="img" aria-label="Monthly interactions">
        {data.map((d, i) => (
          <div key={d.month} style={{ height: `${(d.count / max) * 100}%` }} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} title={`${formatMonth(d.month)}: ${d.count}`}>
            {hover === i ? (
              <span className="tooltip" style={{ bottom: '100%', left: '50%', transform: 'translate(-50%, -6px)', whiteSpace: 'nowrap' }}>
                {formatMonth(d.month)} · {d.count}
              </span>
            ) : null}
          </div>
        ))}
      </div>
      <div className="row row--between body-sm muted" style={{ marginTop: 6 }}>
        <span>{formatMonth(data[0]?.month ?? '')}</span>
        <span>{formatMonth(data[data.length - 1]?.month ?? '')}</span>
      </div>
    </div>
  );
}

/** Full activity view: monthly bars, strength histogram, and a sources × categories heatmap. */
export function ActivityView({ timeline, histogram, heat }: { timeline: { month: string; count: number }[]; histogram: { bucket: string; count: number }[]; heat: Record<Category, Record<Source, number>> }) {
  const maxHeat = Math.max(1, ...CATEGORIES.flatMap((c) => SOURCES.map((s) => heat[c][s])));
  const maxHist = Math.max(1, ...histogram.map((h) => h.count));
  return (
    <div className="stack" style={{ gap: 24, padding: 24 }} data-testid="activity-view">
      <section>
        <h3 className="title-md" style={{ marginBottom: 12 }}>
          Interactions per month
        </h3>
        <div style={{ height: 200 }}>
          <div className="bars" style={{ height: 180 }}>
            {timeline.map((d) => {
              const max = Math.max(1, ...timeline.map((x) => x.count));
              return <div key={d.month} style={{ height: `${(d.count / max) * 100}%` }} title={`${formatMonth(d.month)}: ${d.count}`} />;
            })}
          </div>
          <div className="row row--between body-sm muted" style={{ marginTop: 6 }}>
            {timeline.filter((_, i) => i % 6 === 0).map((d) => (
              <span key={d.month}>{formatMonth(d.month)}</span>
            ))}
          </div>
        </div>
      </section>

      <div className="grid grid--2">
        <section>
          <h3 className="title-md" style={{ marginBottom: 12 }}>
            Relationship strength distribution
          </h3>
          <div className="bars" style={{ height: 140 }}>
            {histogram.map((h) => (
              <div key={h.bucket} style={{ height: `${(h.count / maxHist) * 100}%`, background: 'var(--md-sys-color-tertiary)' }} title={`${h.bucket}: ${h.count} people`} />
            ))}
          </div>
          <div className="row row--between body-sm muted" style={{ marginTop: 6 }}>
            <span>Weak</span>
            <span>Strong</span>
          </div>
        </section>
        <section>
          <h3 className="title-md" style={{ marginBottom: 12 }}>
            Where each circle comes from
          </h3>
          <table className="table" style={{ fontSize: 13 }}>
            <thead>
              <tr>
                <th />
                {SOURCES.filter((s) => s !== 'manual').map((s) => (
                  <th key={s} style={{ textAlign: 'center' }}>
                    {SOURCE_LABEL[s]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CATEGORIES.map((c) => (
                <tr key={c}>
                  <td className="label-lg">
                    <span className={`dot dot--${c}`} style={{ marginRight: 8 }} />
                    {CATEGORY_LABEL[c]}
                  </td>
                  {SOURCES.filter((s) => s !== 'manual').map((s) => {
                    const v = heat[c][s];
                    const t = v / maxHeat;
                    return (
                      <td key={s} style={{ textAlign: 'center', padding: 4 }}>
                        <div style={{ borderRadius: 8, padding: '8px 4px', background: v ? categoryColor(c) : 'transparent', opacity: v ? 0.25 + t * 0.75 : 1, color: v ? '#fff' : 'inherit', fontWeight: 500 }}>{v || '·'}</div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}
