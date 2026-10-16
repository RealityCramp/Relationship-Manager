import { useMemo, useState } from 'react';
import type { Category, Contact, Source } from '@shared/types.ts';
import { CATEGORIES, SOURCES } from '@shared/types.ts';
import { CATEGORY_LABEL, formatDate } from '@shared/util.ts';
import { SOURCE_LABEL } from '@shared/graph.ts';
import { api } from '../lib/api.ts';
import { Link, useRouter } from '../lib/router.tsx';
import { useAsync, useToast, useWorkspace } from '../lib/store.tsx';
import { Avatar, Banner, Button, Card, CategoryBadges, CategoryChips, Chip, Dialog, Empty, IconButton, Loading, SearchBar, Select, StrengthBar, Switch, TextField } from '../ui/components.tsx';
import { Icon } from '../ui/Icon.tsx';
import { ThemeToggle, TopBar } from '../App.tsx';

type SortKey = 'strength' | 'name' | 'company' | 'recent' | 'interactions';

export function PeoplePage() {
  const ws = useWorkspace();
  const { search, navigate } = useRouter();
  const { show } = useToast();
  const [q, setQ] = useState(search.get('q') ?? '');
  const [categories, setCategories] = useState<Category[]>((search.get('categories')?.split(',').filter(Boolean) as Category[]) ?? []);
  const [exact, setExact] = useState(search.get('exact') === '1');
  const [source, setSource] = useState<Source | ''>((search.get('source') as Source) ?? '');
  const [company, setCompany] = useState(search.get('company') ?? '');
  const [tag, setTag] = useState(search.get('tag') ?? '');
  const [sort, setSort] = useState<SortKey>('strength');
  const [page, setPage] = useState(0);
  const [showDupes, setShowDupes] = useState(false);
  const [adding, setAdding] = useState(false);
  const pageSize = 50;

  const list = useAsync(() => api.contacts.list(ws.id), [ws.id]);
  const tags = useAsync(() => api.tags.list(ws.id), [ws.id]);

  const filtered = useMemo(() => {
    if (!list.data) return [];
    const needle = q.trim().toLowerCase();
    let rows = list.data.contacts.filter((c) => {
      if (categories.length) {
        if (exact) {
          if (c.categories.length !== categories.length || !categories.every((k) => c.categories.includes(k))) return false;
        } else if (!categories.every((k) => c.categories.includes(k))) return false;
      }
      if (source && !c.sources.some((s) => s.source === source)) return false;
      if (company && c.company !== company) return false;
      if (tag && !c.tags.includes(tag)) return false;
      if (needle && ![c.displayName, c.company ?? '', c.title ?? '', ...c.emails, c.notes].some((s) => s.toLowerCase().includes(needle))) return false;
      return true;
    });
    const cmp: Record<SortKey, (a: Contact, b: Contact) => number> = {
      strength: (a, b) => b.strength - a.strength,
      name: (a, b) => a.displayName.localeCompare(b.displayName),
      company: (a, b) => (a.company ?? '~').localeCompare(b.company ?? '~'),
      recent: (a, b) => (b.lastInteractionAt ?? '').localeCompare(a.lastInteractionAt ?? ''),
      interactions: (a, b) => b.interactionCount - a.interactionCount,
    };
    rows = [...rows].sort(cmp[sort]);
    return rows;
  }, [list.data, q, categories, exact, source, company, tag, sort]);

  const companies = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of list.data?.contacts ?? []) if (c.company) m.set(c.company, (m.get(c.company) ?? 0) + 1);
    return Array.from(m.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name);
  }, [list.data]);

  const pageRows = filtered.slice(page * pageSize, (page + 1) * pageSize);
  const exportCsv = () => {
    const header = ['Name', 'Emails', 'Phones', 'Company', 'Title', 'Location', 'Circles', 'Sources', 'Tags', 'Strength', 'Interactions', 'Last interaction'];
    const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
    const lines = [header.join(','), ...filtered.map((c) => [c.displayName, c.emails.join('; '), c.phones.join('; '), c.company ?? '', c.title ?? '', c.location ?? '', c.categories.join('; '), Array.from(new Set(c.sources.map((s) => s.source))).join('; '), c.tags.join('; '), String(c.strength), String(c.interactionCount), c.lastInteractionAt ?? ''].map(esc).join(','))];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'people.csv';
    a.click();
    show(`Exported ${filtered.length} people`);
  };

  return (
    <>
      <TopBar
        title="People"
        subtitle={list.data ? `${filtered.length} of ${list.data.total}` : undefined}
        actions={
          <>
            <IconButton icon="merge" label="Find duplicates" onClick={() => setShowDupes(true)} data-testid="find-duplicates" />
            <IconButton icon="download" label="Export CSV" onClick={exportCsv} data-testid="export-csv" />
            <ThemeToggle />
            <Button icon="personAdd" onClick={() => setAdding(true)} data-testid="add-person">
              Add person
            </Button>
          </>
        }
      />
      <div className="page">
        <div className="page__inner stack">
          <div className="row row--wrap">
            <div style={{ flex: 1, minWidth: 240, maxWidth: 420 }}>
              <SearchBar value={q} onChange={(v) => (setQ(v), setPage(0))} placeholder="Search people, companies, emails" />
            </div>
            <div style={{ width: 160 }}>
              <Select small value={source} onChange={(v) => (setSource(v as Source | ''), setPage(0))} options={[{ value: '', label: 'Any source' }, ...SOURCES.map((s) => ({ value: s, label: SOURCE_LABEL[s] }))]} />
            </div>
            <div style={{ width: 200 }}>
              <Select small value={company} onChange={(v) => (setCompany(v), setPage(0))} options={[{ value: '', label: 'Any company' }, ...companies.map((c) => ({ value: c, label: c }))]} />
            </div>
            {tags.data?.length ? (
              <div style={{ width: 160 }}>
                <Select small value={tag} onChange={(v) => (setTag(v), setPage(0))} options={[{ value: '', label: 'Any tag' }, ...tags.data.map((t) => ({ value: t.name, label: t.name }))]} />
              </div>
            ) : null}
            <div style={{ width: 170 }}>
              <Select small value={sort} onChange={(v) => setSort(v as SortKey)} options={[{ value: 'strength', label: 'Strongest first' }, { value: 'recent', label: 'Most recent' }, { value: 'interactions', label: 'Most interactions' }, { value: 'name', label: 'Name A–Z' }, { value: 'company', label: 'Company A–Z' }]} />
            </div>
          </div>
          <div className="row row--wrap">
            <CategoryChips value={categories} onChange={(v) => (setCategories(v), setPage(0))} />
            {categories.length ? <Switch checked={exact} onChange={setExact} label={<span className="body-sm">Only these circles (exact)</span>} /> : null}
            {(categories.length || source || company || tag || q) ? (
              <Button variant="text" size="sm" icon="close" onClick={() => (setCategories([]), setSource(''), setCompany(''), setTag(''), setQ(''), setExact(false), navigate('/people', { replace: true }))}>
                Clear filters
              </Button>
            ) : null}
          </div>

          {list.error ? <Banner kind="error" icon="error">{list.error}</Banner> : null}
          {list.loading ? (
            <Loading />
          ) : !filtered.length ? (
            <Card>
              <Empty title="No people match" action={list.data?.total === 0 ? <Button onClick={() => navigate('/import')}>Import a source</Button> : undefined}>
                {list.data?.total === 0 ? 'Import a source to get started.' : 'Try widening the filters.'}
              </Empty>
            </Card>
          ) : (
            <Card className="card--tight" style={{ padding: 0, overflow: 'hidden' }}>
              <table className="table" data-testid="people-table">
                <thead>
                  <tr>
                    <th style={{ width: 48 }} />
                    <th>Name</th>
                    <th>Company</th>
                    <th>Circles</th>
                    <th>Sources</th>
                    <th>Strength</th>
                    <th>Last contact</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((c) => (
                    <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/people/${c.id}`)} data-testid="person-row">
                      <td>
                        <Avatar contact={c} />
                      </td>
                      <td>
                        <div className="title-sm">{c.displayName}</div>
                        <div className="body-sm muted truncate" style={{ maxWidth: 260 }}>
                          {c.title ? `${c.title}` : c.emails[0] ?? ''}
                        </div>
                      </td>
                      <td className="truncate" style={{ maxWidth: 200 }}>
                        {c.company ?? <span className="muted">—</span>}
                      </td>
                      <td>
                        <CategoryBadges categories={c.categories} />
                      </td>
                      <td>
                        <span className="row" style={{ gap: 4 }}>
                          {Array.from(new Set(c.sources.map((s) => s.source))).map((s) => (
                            <span key={s} className="chip chip--sm" style={{ cursor: 'default' }} title={SOURCE_LABEL[s]}>
                              {SOURCE_LABEL[s]}
                            </span>
                          ))}
                        </span>
                      </td>
                      <td>
                        <span className="row" style={{ gap: 8 }}>
                          <StrengthBar value={c.strength} />
                          <span className="label-md muted">{c.interactionCount ? `${c.interactionCount}×` : ''}</span>
                        </span>
                      </td>
                      <td className="body-sm muted">{formatDate(c.lastInteractionAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtered.length > pageSize ? (
                <div className="row row--between" style={{ padding: 12 }}>
                  <span className="body-sm muted">
                    {page * pageSize + 1}–{Math.min(filtered.length, (page + 1) * pageSize)} of {filtered.length}
                  </span>
                  <span className="row">
                    <Button variant="text" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
                      Previous
                    </Button>
                    <Button variant="text" size="sm" disabled={(page + 1) * pageSize >= filtered.length} onClick={() => setPage(page + 1)}>
                      Next
                    </Button>
                  </span>
                </div>
              ) : null}
            </Card>
          )}
        </div>
      </div>
      {showDupes ? <DuplicatesDialog onClose={() => setShowDupes(false)} onMerged={() => list.reload()} /> : null}
      {adding ? (
        <AddPersonDialog
          onClose={() => setAdding(false)}
          onCreated={(c) => {
            setAdding(false);
            list.reload();
            navigate(`/people/${c.id}`);
          }}
        />
      ) : null}
    </>
  );
}

function DuplicatesDialog({ onClose, onMerged }: { onClose: () => void; onMerged: () => void }) {
  const ws = useWorkspace();
  const { show } = useToast();
  const dupes = useAsync(() => api.contacts.duplicates(ws.id), [ws.id]);
  const [busy, setBusy] = useState<string | null>(null);
  const merge = async (keep: Contact, other: Contact) => {
    setBusy(keep.id + other.id);
    try {
      await api.contacts.merge(ws.id, keep.id, other.id);
      show(`Merged ${other.displayName} into ${keep.displayName}`);
      dupes.reload();
      onMerged();
    } catch (e) {
      show((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  return (
    <Dialog open onClose={onClose} title="Possible duplicates" wide testId="duplicates-dialog" actions={<Button variant="text" onClick={onClose}>Close</Button>}>
      {dupes.loading ? (
        <Loading />
      ) : !dupes.data?.length ? (
        <Empty icon="checkCircle" title="No duplicates found">People are matched on email, social handles and exact names during import.</Empty>
      ) : (
        <div className="stack">
          {dupes.data.map((d) => (
            <div key={d.a.id + d.b.id} className="card card--outlined card--tight">
              <div className="body-sm muted mb-8">{d.reason}</div>
              <div className="grid grid--2">
                {[d.a, d.b].map((c, i) => (
                  <div key={c.id} className="row">
                    <Avatar contact={c} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="title-sm truncate">{c.displayName}</div>
                      <div className="body-sm muted truncate">
                        {c.company ?? '—'} · {Array.from(new Set(c.sources.map((s) => s.source))).map((s) => SOURCE_LABEL[s]).join(', ')}
                      </div>
                    </div>
                    <Button size="sm" variant="tonal" disabled={!!busy} onClick={() => merge(c, i === 0 ? d.b : d.a)} data-testid="merge-keep">
                      Keep this
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Dialog>
  );
}

export function AddPersonDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (c: Contact) => void }) {
  const ws = useWorkspace();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [title, setTitle] = useState('');
  const [cats, setCats] = useState<Category[]>(['personal']);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const c = await api.contacts.create(ws.id, { displayName: name, emails: email ? [email] : [], company: company || null, title: title || null, categories: cats });
      onCreated(c);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open
      onClose={onClose}
      title="Add a person"
      testId="add-person-dialog"
      actions={
        <>
          <Button variant="text" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!name.trim() || busy} data-testid="add-person-save">
            Add
          </Button>
        </>
      }
    >
      {error ? <Banner kind="error" icon="error">{error}</Banner> : null}
      <TextField label="Name" value={name} onChange={setName} required autoFocus testId="add-person-name" />
      <TextField label="Email" type="email" value={email} onChange={setEmail} />
      <div className="grid grid--2">
        <TextField label="Company" value={company} onChange={setCompany} />
        <TextField label="Title" value={title} onChange={setTitle} />
      </div>
      <div>
        <div className="field__label mb-8">Circles</div>
        <CategoryChips value={cats} onChange={setCats} allowEmpty={false} />
      </div>
    </Dialog>
  );
}

