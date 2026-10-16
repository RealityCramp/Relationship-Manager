import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Category, Source } from '@shared/types.ts';
import { CATEGORIES, SOURCES } from '@shared/types.ts';
import { CATEGORY_LABEL } from '@shared/util.ts';
import { SOURCE_LABEL } from '@shared/graph.ts';
import { api } from '../lib/api.ts';
import { useRouter } from '../lib/router.tsx';
import { useAsync, useWorkspace } from '../lib/store.tsx';
import { Banner, Chip, Loading, SearchBar, Select, Switch } from '../ui/components.tsx';
import { Icon, type IconName } from '../ui/Icon.tsx';
import { ThemeToggle, TopBar } from '../App.tsx';
import { ForceGraph, type ClusterMode } from '../viz/ForceGraph.tsx';
import { Venn } from '../viz/Venn.tsx';
import { ChordView } from '../viz/Chord.tsx';
import { SankeyView } from '../viz/Sankey.tsx';
import { RadialTreeView, TreemapView } from '../viz/Hierarchy.tsx';
import { ActivityView } from '../viz/Timeline.tsx';
import { ContactSheet } from './Contact.tsx';

type View = 'graph' | 'venn' | 'chord' | 'flow' | 'treemap' | 'radial' | 'activity';
const VIEWS: { value: View; label: string; icon: IconName; help: string }[] = [
  { value: 'graph', label: 'Graph', icon: 'hub', help: 'Force-directed map of who connects to whom' },
  { value: 'venn', label: 'Venn', icon: 'venn', help: 'How your circles overlap' },
  { value: 'chord', label: 'Chord', icon: 'donut', help: 'Shared people between circles' },
  { value: 'flow', label: 'Flow', icon: 'insights', help: 'Sources → circles → companies' },
  { value: 'treemap', label: 'Treemap', icon: 'gridView', help: 'Companies and people by strength' },
  { value: 'radial', label: 'Radial', icon: 'bubble', help: 'Hierarchical tree around you' },
  { value: 'activity', label: 'Activity', icon: 'timeline', help: 'Interactions over time' },
];

export function NetworkPage() {
  const ws = useWorkspace();
  const { search, navigate } = useRouter();
  const view = (search.get('view') as View) || 'graph';
  const category = (search.get('category') as Category) || '';
  const source = (search.get('source') as Source) || '';
  const q = search.get('q') ?? '';
  const [minStrength, setMinStrength] = useState(0);
  const [cluster, setCluster] = useState<ClusterMode>('none');
  const [labels, setLabels] = useState(true);
  const [selected, setSelected] = useState<string | null>(search.get('contact'));

  const setParam = (k: string, v: string | null) => {
    const p = new URLSearchParams(search.toString());
    if (v) p.set(k, v);
    else p.delete(k);
    navigate(`/network?${p.toString()}`, { replace: true });
  };

  const graph = useAsync(() => api.graph(ws.id, { category: category || undefined, source: source || undefined, q: q || undefined }), [ws.id, category, source, q]);
  const analytics = useAsync(() => api.analytics(ws.id, { category: category || undefined, source: source || undefined, q: q || undefined }), [ws.id, category, source, q]);

  const filteredGraph = useMemo(() => {
    if (!graph.data) return null;
    if (!minStrength) return graph.data;
    const keep = new Set(graph.data.nodes.filter((n) => n.isSelf || n.strength >= minStrength).map((n) => n.id));
    return { nodes: graph.data.nodes.filter((n) => keep.has(n.id)), links: graph.data.links.filter((l) => keep.has(l.source) && keep.has(l.target)) };
  }, [graph.data, minStrength]);

  const onSelect = useCallback((id: string | null) => setSelected(id), []);
  useEffect(() => {
    document.title = `Network · ${VIEWS.find((v) => v.value === view)?.label ?? ''} · Relationship Manager`;
  }, [view]);

  const listPeople = (params: Record<string, string>) => navigate(`/people?${new URLSearchParams(params).toString()}`);

  return (
    <>
      <TopBar title="Network" subtitle={VIEWS.find((v) => v.value === view)?.help} actions={<ThemeToggle />} />
      <div className="page">
        <div className="page__inner stack" style={{ gap: 12 }}>
          <div className="tabs" role="tablist" data-testid="view-tabs">
            {VIEWS.map((v) => (
              <button key={v.value} type="button" role="tab" className="tab" aria-selected={view === v.value} onClick={() => setParam('view', v.value)} data-testid={`view-${v.value}`}>
                <Icon name={v.icon} />
                {v.label}
              </button>
            ))}
          </div>

          <div className="row row--wrap" data-testid="network-filters">
            <div className="chips">
              <Chip selected={!category} onClick={() => setParam('category', null)} testId="lens-all">
                All circles
              </Chip>
              {CATEGORIES.map((c) => (
                <Chip key={c} category={c} selected={category === c} onClick={() => setParam('category', category === c ? null : c)} testId={`lens-${c}`}>
                  {CATEGORY_LABEL[c]}
                </Chip>
              ))}
            </div>
            <div style={{ width: 170 }}>
              <Select small value={source} onChange={(v) => setParam('source', v || null)} options={[{ value: '', label: 'Any source' }, ...SOURCES.map((s) => ({ value: s, label: SOURCE_LABEL[s] }))]} />
            </div>
            <div style={{ flex: 1, minWidth: 200, maxWidth: 360 }}>
              <SearchBar small value={q} onChange={(v) => setParam('q', v || null)} placeholder="Filter by name, company, email" />
            </div>
            {view === 'graph' ? (
              <>
                <label className="row body-sm muted" style={{ gap: 8, minWidth: 180 }}>
                  Min strength
                  <input type="range" min={0} max={0.9} step={0.05} value={minStrength} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMinStrength(Number(e.target.value))} aria-label="Minimum strength" />
                  {Math.round(minStrength * 100)}%
                </label>
                <div style={{ width: 160 }}>
                  <Select small value={cluster} onChange={(v) => setCluster(v as ClusterMode)} options={[{ value: 'none', label: 'Natural layout' }, { value: 'category', label: 'Cluster by circle' }, { value: 'company', label: 'Cluster by company' }]} />
                </div>
                <Switch checked={labels} onChange={setLabels} label={<span className="body-sm">Labels</span>} />
              </>
            ) : null}
          </div>

          {graph.error ? <Banner kind="error" icon="error">{graph.error}</Banner> : null}

          {view === 'graph' ? (
            filteredGraph ? (
              <div className="row" style={{ alignItems: 'stretch', gap: 16 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <ForceGraph graph={filteredGraph} cluster={cluster} showLabels={labels} selectedId={selected} onSelect={onSelect} highlightCategory={null} />
                  <div className="body-sm muted mt-8">
                    {filteredGraph.nodes.length - 1} people · {filteredGraph.links.length} relationships
                  </div>
                </div>
              </div>
            ) : (
              <Loading label="Building graph…" />
            )
          ) : null}

          {view === 'venn' ? analytics.data ? <Venn regions={analytics.data.venn} onRegionClick={(sets) => listPeople({ categories: sets.join(','), exact: '1' })} /> : <Loading /> : null}
          {view === 'chord' ? analytics.data ? <ChordView labels={analytics.data.chord.labels} matrix={analytics.data.chord.matrix} onPick={(a, b) => listPeople({ categories: b ? `${a},${b}` : a, exact: b ? '' : '1' })} /> : <Loading /> : null}
          {view === 'flow' ? (
            analytics.data ? (
              <SankeyView
                nodes={analytics.data.sankey.nodes}
                links={analytics.data.sankey.links}
                onPick={(n) => {
                  if (n.kind === 'category') listPeople({ categories: n.label });
                  else if (n.kind === 'source') listPeople({ source: n.label });
                  else if (!/^(Other companies|No company)$/.test(n.label)) listPeople({ company: n.label });
                }}
              />
            ) : (
              <Loading />
            )
          ) : null}
          {view === 'treemap' ? analytics.data ? <TreemapView tree={analytics.data.hierarchy} onPick={(id) => setSelected(id)} /> : <Loading /> : null}
          {view === 'radial' ? analytics.data ? <RadialTreeView tree={analytics.data.hierarchy} onPick={(id) => setSelected(id)} /> : <Loading /> : null}
          {view === 'activity' ? analytics.data ? <div className="viz"><ActivityView timeline={analytics.data.timeline} histogram={analytics.data.strengthHistogram} heat={analytics.data.sourcesByCategory} /></div> : <Loading /> : null}
        </div>
      </div>
      {selected ? <ContactSheet id={selected} onClose={() => setSelected(null)} onNavigate={(id) => setSelected(id)} /> : null}
    </>
  );
}
