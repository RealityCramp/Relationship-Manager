import type { Category, Summary } from '@shared/types.ts';
import { CATEGORIES } from '@shared/types.ts';
import { CATEGORY_DESCRIPTION, CATEGORY_LABEL, formatDate } from '@shared/util.ts';
import { SOURCE_LABEL } from '@shared/graph.ts';
import { api, type Analytics } from '../lib/api.ts';
import { Link, useRouter } from '../lib/router.tsx';
import { useAsync, useSession, useWorkspace } from '../lib/store.tsx';
import { Banner, Button, Card, CategoryBadges, Empty, Loading, StrengthBar } from '../ui/components.tsx';
import { Icon } from '../ui/Icon.tsx';
import { ThemeToggle, TopBar } from '../App.tsx';
import { MiniBars } from '../viz/Timeline.tsx';

export function DashboardPage() {
  const ws = useWorkspace();
  const { user } = useSession();
  const { navigate } = useRouter();
  const summary = useAsync(() => api.summary(ws.id), [ws.id]);
  const analytics = useAsync(() => api.analytics(ws.id), [ws.id]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <>
      <TopBar title={`${greeting}, ${user?.name.split(' ')[0]}`} subtitle={ws.name} actions={<ThemeToggle />} />
      <div className="page">
        <div className="page__inner stack" style={{ gap: 24 }}>
          {summary.error ? <Banner kind="error" icon="error">{summary.error}</Banner> : null}
          {summary.loading || !summary.data ? (
            <Loading />
          ) : summary.data.contacts === 0 ? (
            <Card>
              <Empty icon="cloudUpload" title="Your network is empty" action={<Button icon="cloudUpload" onClick={() => navigate('/import')} data-testid="dashboard-import-cta">Import your first source</Button>}>
                Bring in LinkedIn, Facebook, X, your address book or email and the graph builds itself. Need a hand? Visit <Link to="/training">Learn</Link>.
              </Empty>
            </Card>
          ) : (
            <DashboardBody summary={summary.data} analytics={analytics.data} />
          )}
        </div>
      </div>
    </>
  );
}

function DashboardBody({ summary: data, analytics }: { summary: Summary; analytics: Analytics | null }) {
  const { navigate } = useRouter();
  const summary = { data };
  return (
            <>
              <div className="grid grid--4" data-testid="stat-cards">
                <Stat label="People" value={summary.data.contacts} icon="people" onClick={() => navigate('/people')} />
                <Stat label="Relationships" value={summary.data.relationships} icon="hub" onClick={() => navigate('/network')} />
                <Stat label="Interactions" value={summary.data.interactions} icon="forum" onClick={() => navigate('/network?view=timeline')} />
                <Stat label="Companies" value={summary.data.companies.length} icon="business" onClick={() => navigate('/network?view=treemap')} />
              </div>

              <div className="grid grid--4" data-testid="category-cards">
                {CATEGORIES.map((c) => (
                  <Card key={c} category={c} onClick={() => navigate(`/network?category=${c}`)} testId={`category-card-${c}`}>
                    <div className="row row--between">
                      <span className="title-md">{CATEGORY_LABEL[c]}</span>
                      <Icon name={ICON_FOR[c]} />
                    </div>
                    <div className="display-sm" style={{ margin: '8px 0 4px' }}>
                      {summary.data.byCategory[c]}
                    </div>
                    <div className="body-sm" style={{ opacity: 0.85 }}>
                      {CATEGORY_DESCRIPTION[c]}
                    </div>
                  </Card>
                ))}
              </div>

              <div className="grid grid--3">
                <Card title="Activity, last 24 months" action={<Link to="/network?view=timeline" className="btn btn--text btn--sm">Details</Link>} className="span-2" style={{ gridColumn: 'span 2' }}>
                  {analytics ? <MiniBars data={analytics.timeline} /> : <Loading />}
                </Card>
                <Card title="Sources">
                  <div className="stack" style={{ gap: 8 }}>
                    {Object.entries(summary.data.bySource)
                      .filter(([, n]) => n > 0)
                      .map(([s, n]) => (
                        <div key={s} className="row" style={{ gap: 8 }}>
                          <span className="label-lg" style={{ width: 80 }}>
                            {SOURCE_LABEL[s as keyof typeof SOURCE_LABEL]}
                          </span>
                          <span className="strength" style={{ flex: 1, width: 'auto' }}>
                            <span style={{ width: `${(n / Math.max(1, summary.data?.contacts ?? 1)) * 100}%` }} />
                          </span>
                          <span className="label-md muted" style={{ width: 36, textAlign: 'right' }}>
                            {n}
                          </span>
                        </div>
                      ))}
                    {Object.values(summary.data.bySource).every((n) => n === 0) ? <span className="muted">No sources yet</span> : null}
                  </div>
                </Card>
              </div>

              <div className="grid grid--3">
                <Card title="Strongest relationships" action={<Link to="/people" className="btn btn--text btn--sm">All people</Link>} style={{ gridColumn: 'span 2' }}>
                  <div className="list">
                    {analytics?.topContacts.slice(0, 8).map((c) => (
                      <Link key={c.id} to={`/people/${c.id}`} className="list-item">
                        <div className="list-item__body">
                          <div className="title-sm">{c.name}</div>
                          <CategoryBadges categories={c.categories} />
                        </div>
                        <div className="list-item__meta">
                          <span className="label-md muted">{c.interactionCount} interactions</span>
                          <StrengthBar value={c.strength} />
                        </div>
                      </Link>
                    ))}
                  </div>
                </Card>
                <Card title="Top companies">
                  <div className="stack" style={{ gap: 6 }}>
                    {summary.data.companies.slice(0, 8).map((co) => (
                      <Link key={co.name} to={`/people?company=${encodeURIComponent(co.name)}`} className="row row--between" style={{ color: 'inherit' }}>
                        <span className="truncate">{co.name}</span>
                        <span className="label-md muted">{co.count}</span>
                      </Link>
                    ))}
                  </div>
                </Card>
              </div>

              <Card title="Recent imports" action={<Link to="/import" className="btn btn--tonal btn--sm">Import more</Link>}>
                {summary.data.recentImports.length ? (
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Source</th>
                        <th>When</th>
                        <th>Parsed</th>
                        <th>New</th>
                        <th>Merged</th>
                        <th>Interactions</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.data.recentImports.map((j) => (
                        <tr key={j.id}>
                          <td>{SOURCE_LABEL[j.source]}</td>
                          <td>{formatDate(j.createdAt)}</td>
                          <td>{j.stats.parsed ?? 0}</td>
                          <td>{j.stats.created ?? 0}</td>
                          <td>{j.stats.merged ?? 0}</td>
                          <td>{j.stats.interactions ?? 0}</td>
                          <td>{j.status === 'done' ? <span className="row" style={{ gap: 4, color: 'var(--cat-personal)' }}><Icon name="checkCircle" size={18} /> Done</span> : j.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <span className="muted">No imports yet.</span>
                )}
              </Card>
            </>
  );
}

const ICON_FOR: Record<Category, 'person' | 'work' | 'business' | 'public'> = { personal: 'person', business: 'work', corporate: 'business', social: 'public' };

function Stat({ label, value, icon, onClick }: { label: string; value: number; icon: 'people' | 'hub' | 'forum' | 'business'; onClick: () => void }) {
  return (
    <Card variant="elevated" onClick={onClick}>
      <div className="row row--between muted">
        <span className="label-lg">{label}</span>
        <Icon name={icon} />
      </div>
      <div className="display-sm" style={{ marginTop: 8 }}>
        {value.toLocaleString()}
      </div>
    </Card>
  );
}
