import { useEffect, useState } from 'react';
import type { Category, Contact } from '@shared/types.ts';
import { CATEGORY_LABEL, formatDate } from '@shared/util.ts';
import { SOURCE_LABEL } from '@shared/graph.ts';
import { api, type ContactDetail } from '../lib/api.ts';
import { Link, useRouter } from '../lib/router.tsx';
import { useAsync, useToast, useWorkspace } from '../lib/store.tsx';
import { Avatar, Banner, Button, Card, CategoryBadges, CategoryChips, Chip, Dialog, IconButton, Loading, Menu, Select, Sheet, StrengthBar, TextField } from '../ui/components.tsx';
import { Icon } from '../ui/Icon.tsx';
import { ThemeToggle, TopBar } from '../App.tsx';
import { MiniBars } from '../viz/Timeline.tsx';

/** Full-page contact view. */
export function ContactPage({ id }: { id: string }) {
  const ws = useWorkspace();
  const { navigate } = useRouter();
  const { show } = useToast();
  const detail = useAsync(() => api.contacts.get(ws.id, id), [ws.id, id]);
  const [editing, setEditing] = useState(false);
  const [logging, setLogging] = useState(false);
  const [merging, setMerging] = useState(false);
  const canEdit = ws.role !== 'viewer';

  useEffect(() => {
    if (detail.data) document.title = `${detail.data.contact.displayName} · Relationship Manager`;
  }, [detail.data]);

  if (detail.error) return <><TopBar title="Person" back="/people" /><div className="page"><Banner kind="error" icon="error">{detail.error}</Banner></div></>;
  if (!detail.data) return <><TopBar title="Person" back="/people" /><Loading /></>;
  const { contact: c, interactions, relationships, timeline } = detail.data;

  const remove = async () => {
    if (!confirm(`Delete ${c.displayName}? This cannot be undone.`)) return;
    await api.contacts.remove(ws.id, c.id);
    show('Person deleted');
    navigate('/people');
  };

  return (
    <>
      <TopBar
        title={c.displayName}
        subtitle={[c.title, c.company].filter(Boolean).join(' · ') || c.emails[0]}
        back="/people"
        actions={
          <>
            <ThemeToggle />
            <Button variant="tonal" icon="hub" onClick={() => navigate(`/network?contact=${c.id}`)}>
              In graph
            </Button>
            {canEdit ? (
              <Menu
                trigger={(open) => <IconButton icon="more" label="More" onClick={open} data-testid="contact-more" />}
                items={[
                  { label: 'Edit details', icon: 'edit', onClick: () => setEditing(true) },
                  { label: 'Log an interaction', icon: 'event', onClick: () => setLogging(true) },
                  { label: 'Merge with…', icon: 'merge', onClick: () => setMerging(true) },
                  { label: 'Delete', icon: 'delete', onClick: remove, danger: true },
                ]}
              />
            ) : null}
          </>
        }
      />
      <div className="page">
        <div className="page__inner grid grid--3" style={{ alignItems: 'start' }}>
          <div className="stack" style={{ gridColumn: 'span 1' }}>
            <Card>
              <div className="row" style={{ alignItems: 'flex-start' }}>
                <Avatar contact={c} size="lg" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="title-lg">{c.displayName}</div>
                  <div className="body-md muted">{c.title ?? '—'}</div>
                  <div className="body-md muted">{c.company ?? ''}</div>
                </div>
              </div>
              <div className="divider" />
              <div className="stack" style={{ gap: 8 }}>
                <div className="row row--between">
                  <span className="label-lg">Strength</span>
                  <span className="row" style={{ gap: 8 }}>
                    <StrengthBar value={c.strength} />
                    <span className="label-md">{Math.round(c.strength * 100)}%</span>
                  </span>
                </div>
                <div className="row row--between">
                  <span className="label-lg">Interactions</span>
                  <span>{c.interactionCount}</span>
                </div>
                <div className="row row--between">
                  <span className="label-lg">Last contact</span>
                  <span>{formatDate(c.lastInteractionAt)}</span>
                </div>
                <div className="row row--between">
                  <span className="label-lg">Known since</span>
                  <span>{formatDate(c.createdAt)}</span>
                </div>
              </div>
            </Card>
            <CategoryCard contact={c} canEdit={canEdit} onChange={(updated) => detail.setData({ ...detail.data!, contact: updated })} />
            <Card title="Contact details">
              <div className="stack" style={{ gap: 8 }}>
                {c.emails.map((e) => (
                  <a key={e} className="row" href={`mailto:${e}`} style={{ color: 'inherit' }}>
                    <Icon name="mail" size={18} /> <span className="truncate">{e}</span>
                  </a>
                ))}
                {c.phones.map((p) => (
                  <a key={p} className="row" href={`tel:${p}`} style={{ color: 'inherit' }}>
                    <Icon name="phone" size={18} /> {p}
                  </a>
                ))}
                {c.location ? (
                  <span className="row">
                    <Icon name="place" size={18} /> {c.location}
                  </span>
                ) : null}
                {!c.emails.length && !c.phones.length && !c.location ? <span className="muted">No contact details yet.</span> : null}
              </div>
            </Card>
            <Card title="Sources">
              <div className="stack" style={{ gap: 8 }}>
                {c.sources.map((s) => (
                  <div key={s.id} className="row row--between">
                    <span className="row" style={{ gap: 8 }}>
                      <span className="chip chip--sm" style={{ cursor: 'default' }}>
                        {SOURCE_LABEL[s.source]}
                      </span>
                      <span className="body-sm muted">{s.handle ? `@${s.handle}` : s.externalId ?? ''}</span>
                    </span>
                    <span className="row" style={{ gap: 4 }}>
                      <span className="body-sm muted">{formatDate(s.importedAt)}</span>
                      {s.url ? (
                        <a href={s.url} target="_blank" rel="noreferrer" className="icon-btn" aria-label="Open profile">
                          <Icon name="openInNew" size={18} />
                        </a>
                      ) : null}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <div className="stack" style={{ gridColumn: 'span 2' }}>
            <TagsAndNotes contact={c} canEdit={canEdit} onChange={(updated) => detail.setData({ ...detail.data!, contact: updated })} />
            <Card title="Activity, last 24 months" action={canEdit ? <Button size="sm" variant="tonal" icon="add" onClick={() => setLogging(true)} data-testid="log-interaction">Log interaction</Button> : undefined}>
              <MiniBars data={timeline} />
              {interactions.length ? (
                <table className="table mt-16" data-testid="interactions-table">
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>Channel</th>
                      <th>Direction</th>
                      <th>Subject</th>
                    </tr>
                  </thead>
                  <tbody>
                    {interactions.slice(0, 30).map((i) => (
                      <tr key={i.id}>
                        <td className="body-sm muted" style={{ whiteSpace: 'nowrap' }}>
                          {formatDate(i.occurredAt)}
                        </td>
                        <td>{i.channel}</td>
                        <td>{i.direction === 'inbound' ? '← from them' : i.direction === 'outbound' ? '→ from you' : '↔ mutual'}</td>
                        <td className="truncate" style={{ maxWidth: 360 }}>
                          {i.subject || <span className="muted">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="body-sm muted mt-8">No interactions recorded. Import email to see threads here, or log one manually.</div>
              )}
            </Card>
            <Card title={`Connected people (${relationships.filter((r) => !r.other.isSelf).length})`}>
              <div className="list" data-testid="related-list">
                {relationships
                  .filter((r) => !r.other.isSelf)
                  .slice(0, 40)
                  .map((r) => (
                    <Link key={r.id} to={`/people/${r.other.id}`} className="list-item">
                      <Avatar name={r.other.name} category={r.other.categories[0]} />
                      <div className="list-item__body">
                        <div className="title-sm">{r.other.name}</div>
                        <div className="body-sm muted">{r.other.company ?? ''}</div>
                      </div>
                      <div className="list-item__meta">
                        <Chip category={r.kind} small>
                          {CATEGORY_LABEL[r.kind]}
                        </Chip>
                        <span className="body-sm muted">{r.origin === 'employer' ? 'same employer' : r.origin === 'email' ? 'email thread' : r.origin}</span>
                      </div>
                    </Link>
                  ))}
                {!relationships.filter((r) => !r.other.isSelf).length ? <span className="muted body-sm">No other connections yet — shared employers and email threads create them automatically.</span> : null}
              </div>
            </Card>
          </div>
        </div>
      </div>
      {editing ? <EditDialog contact={c} onClose={() => setEditing(false)} onSaved={(u) => (detail.setData({ ...detail.data!, contact: u }), setEditing(false))} /> : null}
      {logging ? <LogInteractionDialog contact={c} onClose={() => setLogging(false)} onSaved={() => (detail.reload(), setLogging(false))} /> : null}
      {merging ? <MergeDialog contact={c} onClose={() => setMerging(false)} onMerged={() => (detail.reload(), setMerging(false))} /> : null}
    </>
  );
}

function CategoryCard({ contact: c, canEdit, onChange }: { contact: Contact; canEdit: boolean; onChange: (c: Contact) => void }) {
  const ws = useWorkspace();
  const { show } = useToast();
  const [busy, setBusy] = useState(false);
  const set = async (cats: Category[] | null) => {
    setBusy(true);
    try {
      onChange(await api.contacts.update(ws.id, c.id, { categoryOverrides: cats }));
      show(cats ? 'Circles updated' : 'Back to automatic circles');
    } catch (e) {
      show((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card title="Circles" action={c.categoryOverrides && canEdit ? <Button size="sm" variant="text" disabled={busy} onClick={() => set(null)}>Reset to automatic</Button> : undefined} testId="circles-card">
      {canEdit ? <CategoryChips value={c.categories} onChange={(v) => set(v)} allowEmpty={false} /> : <CategoryBadges categories={c.categories} small={false} />}
      <div className="body-sm muted mt-8">{c.categoryOverrides ? 'Set manually.' : 'Inferred from sources and email domains. Tap to override.'}</div>
    </Card>
  );
}

function TagsAndNotes({ contact: c, canEdit, onChange }: { contact: Contact; canEdit: boolean; onChange: (c: Contact) => void }) {
  const ws = useWorkspace();
  const { show } = useToast();
  const [tag, setTag] = useState('');
  const [notes, setNotes] = useState(c.notes);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    setNotes(c.notes);
    setDirty(false);
  }, [c.id, c.notes]);
  const save = async (body: Partial<Contact>) => {
    try {
      onChange(await api.contacts.update(ws.id, c.id, body));
    } catch (e) {
      show((e as Error).message);
    }
  };
  return (
    <Card title="Tags & notes">
      <div className="chips mb-8" data-testid="tag-chips">
        {c.tags.map((t) => (
          <span key={t} className="chip chip--selected chip--input" style={{ cursor: 'default' }}>
            {t}
            {canEdit ? (
              <button type="button" className="icon-btn" style={{ width: 20, height: 20 }} aria-label={`Remove tag ${t}`} onClick={() => save({ tags: c.tags.filter((x) => x !== t) })}>
                <Icon name="close" size={14} />
              </button>
            ) : null}
          </span>
        ))}
        {canEdit ? (
          <form
            className="row"
            onSubmit={(e: React.FormEvent<HTMLFormElement>) => {
              e.preventDefault();
              if (!tag.trim()) return;
              save({ tags: [...c.tags, tag.trim()] });
              setTag('');
            }}
          >
            <input className="field__input field__input--sm" style={{ width: 160 }} placeholder="Add tag" value={tag} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTag(e.target.value)} data-testid="tag-input" />
          </form>
        ) : null}
      </div>
      <TextField label="Notes" value={notes} onChange={(v) => (setNotes(v), setDirty(true))} multiline disabled={!canEdit} testId="notes-input" />
      {dirty ? (
        <div className="row row--end mt-8">
          <Button size="sm" onClick={() => save({ notes }).then(() => setDirty(false))} data-testid="save-notes">
            Save notes
          </Button>
        </div>
      ) : null}
    </Card>
  );
}

function EditDialog({ contact: c, onClose, onSaved }: { contact: Contact; onClose: () => void; onSaved: (c: Contact) => void }) {
  const ws = useWorkspace();
  const [form, setForm] = useState({ displayName: c.displayName, emails: c.emails.join(', '), phones: c.phones.join(', '), company: c.company ?? '', title: c.title ?? '', location: c.location ?? '', avatarUrl: c.avatarUrl ?? '' });
  const [error, setError] = useState<string | null>(null);
  const f = (k: keyof typeof form) => (v: string) => setForm({ ...form, [k]: v });
  const save = async () => {
    try {
      onSaved(await api.contacts.update(ws.id, c.id, { displayName: form.displayName, emails: form.emails.split(',').map((s) => s.trim()).filter(Boolean), phones: form.phones.split(',').map((s) => s.trim()).filter(Boolean), company: form.company || null, title: form.title || null, location: form.location || null, avatarUrl: form.avatarUrl || null }));
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <Dialog open onClose={onClose} title="Edit details" testId="edit-dialog" actions={<><Button variant="text" onClick={onClose}>Cancel</Button><Button onClick={save} data-testid="edit-save">Save</Button></>}>
      {error ? <Banner kind="error" icon="error">{error}</Banner> : null}
      <TextField label="Name" value={form.displayName} onChange={f('displayName')} required testId="edit-name" />
      <TextField label="Emails (comma separated)" value={form.emails} onChange={f('emails')} />
      <TextField label="Phones (comma separated)" value={form.phones} onChange={f('phones')} />
      <div className="grid grid--2">
        <TextField label="Company" value={form.company} onChange={f('company')} testId="edit-company" />
        <TextField label="Title" value={form.title} onChange={f('title')} />
      </div>
      <TextField label="Location" value={form.location} onChange={f('location')} />
      <TextField label="Avatar URL" value={form.avatarUrl} onChange={f('avatarUrl')} />
    </Dialog>
  );
}

function LogInteractionDialog({ contact: c, onClose, onSaved }: { contact: Contact; onClose: () => void; onSaved: () => void }) {
  const ws = useWorkspace();
  const { show } = useToast();
  const [channel, setChannel] = useState('meeting');
  const [direction, setDirection] = useState('mutual');
  const [subject, setSubject] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const save = async () => {
    try {
      await api.contacts.addInteraction(ws.id, c.id, { channel, direction, subject, occurredAt: new Date(date).toISOString() });
      show('Interaction logged');
      onSaved();
    } catch (e) {
      show((e as Error).message);
    }
  };
  return (
    <Dialog open onClose={onClose} title={`Log an interaction with ${c.displayName}`} testId="log-dialog" actions={<><Button variant="text" onClick={onClose}>Cancel</Button><Button onClick={save} data-testid="log-save">Save</Button></>}>
      <div className="grid grid--2">
        <Select label="Channel" value={channel} onChange={setChannel} options={['meeting', 'call', 'email', 'message', 'note'].map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) }))} />
        <Select label="Direction" value={direction} onChange={setDirection} options={[{ value: 'mutual', label: 'Mutual' }, { value: 'inbound', label: 'They reached out' }, { value: 'outbound', label: 'I reached out' }]} />
      </div>
      <TextField label="What was it about?" value={subject} onChange={setSubject} testId="log-subject" />
      <TextField label="Date" type="date" value={date} onChange={setDate} />
    </Dialog>
  );
}

function MergeDialog({ contact: c, onClose, onMerged }: { contact: Contact; onClose: () => void; onMerged: () => void }) {
  const ws = useWorkspace();
  const { show } = useToast();
  const [q, setQ] = useState('');
  const results = useAsync(() => (q.trim().length >= 2 ? api.contacts.list(ws.id, { q: q.trim(), limit: '8' }) : Promise.resolve({ total: 0, contacts: [] })), [q]);
  const merge = async (other: Contact) => {
    if (!confirm(`Merge ${other.displayName} into ${c.displayName}? ${other.displayName} will be removed.`)) return;
    try {
      await api.contacts.merge(ws.id, c.id, other.id);
      show('Merged');
      onMerged();
    } catch (e) {
      show((e as Error).message);
    }
  };
  return (
    <Dialog open onClose={onClose} title={`Merge someone into ${c.displayName}`} testId="merge-dialog" actions={<Button variant="text" onClick={onClose}>Close</Button>}>
      <TextField label="Search for the duplicate" value={q} onChange={setQ} autoFocus testId="merge-search" />
      <div className="list">
        {results.data?.contacts
          .filter((x) => x.id !== c.id)
          .map((x) => (
            <button key={x.id} type="button" className="list-item" onClick={() => merge(x)} data-testid="merge-candidate">
              <Avatar contact={x} />
              <div className="list-item__body">
                <div className="title-sm">{x.displayName}</div>
                <div className="body-sm muted">{x.company ?? x.emails[0] ?? ''}</div>
              </div>
              <Icon name="merge" />
            </button>
          ))}
      </div>
    </Dialog>
  );
}

/** Compact side-sheet version used by the Network page. */
export function ContactSheet({ id, onClose, onNavigate }: { id: string; onClose: () => void; onNavigate: (id: string) => void }) {
  const ws = useWorkspace();
  const detail = useAsync<ContactDetail>(() => api.contacts.get(ws.id, id), [ws.id, id]);
  const c = detail.data?.contact;
  return (
    <Sheet open onClose={onClose} title={c?.displayName ?? '…'} actions={c ? <Link to={`/people/${c.id}`} className="btn btn--tonal btn--sm">Open</Link> : null}>
      {!detail.data || !c ? (
        <Loading />
      ) : (
        <div className="stack">
          <div className="row">
            <Avatar contact={c} size="lg" />
            <div style={{ minWidth: 0 }}>
              <div className="body-md">{c.title ?? ''}</div>
              <div className="body-md muted">{c.company ?? ''}</div>
              <div className="mt-8">
                <CategoryBadges categories={c.categories} />
              </div>
            </div>
          </div>
          <div className="row row--between">
            <span className="label-lg">Strength</span>
            <span className="row" style={{ gap: 8 }}>
              <StrengthBar value={c.strength} /> {Math.round(c.strength * 100)}%
            </span>
          </div>
          <div className="row row--between">
            <span className="label-lg">Interactions</span>
            <span>{c.interactionCount}</span>
          </div>
          <div className="row row--between">
            <span className="label-lg">Sources</span>
            <span className="body-sm">{Array.from(new Set(c.sources.map((s) => s.source))).map((s) => SOURCE_LABEL[s]).join(', ')}</span>
          </div>
          {c.emails.length ? <div className="body-sm muted truncate">{c.emails.join(' · ')}</div> : null}
          {c.isSelf ? null : (
            <>
              <MiniBars data={detail.data.timeline} />
              <div className="title-sm mt-8">Connected people</div>
              <div className="list">
                {detail.data.relationships
                  .filter((r) => !r.other.isSelf)
                  .slice(0, 12)
                  .map((r) => (
                    <button key={r.id} type="button" className="list-item" onClick={() => onNavigate(r.other.id)}>
                      <Avatar name={r.other.name} category={r.other.categories[0]} size="sm" />
                      <div className="list-item__body">
                        <div className="body-md truncate">{r.other.name}</div>
                      </div>
                      <span className={`dot dot--${r.kind}`} />
                    </button>
                  ))}
              </div>
            </>
          )}
        </div>
      )}
    </Sheet>
  );
}
