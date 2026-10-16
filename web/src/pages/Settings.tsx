import { useEffect, useState } from 'react';
import type { IntegrationPublic } from '@shared/types.ts';
import { formatDate } from '@shared/util.ts';
import { api } from '../lib/api.ts';
import { useRouter } from '../lib/router.tsx';
import { useAsync, useSession, useTheme, useToast, useWorkspace } from '../lib/store.tsx';
import { SEED_PRESETS } from '../theme/color.ts';
import { Banner, Button, Card, Dialog, Empty, IconButton, Loading, SegmentedButtons, Select, Tabs, TextField } from '../ui/components.tsx';
import { Icon } from '../ui/Icon.tsx';
import { APP_VERSION, ThemeToggle, TopBar } from '../App.tsx';

type Tab = 'profile' | 'workspace' | 'members' | 'integrations' | 'appearance' | 'data';

export function SettingsPage({ tab = 'workspace' }: { tab?: string }) {
  const { navigate } = useRouter();
  const t = (['profile', 'workspace', 'members', 'integrations', 'appearance', 'data'].includes(tab) ? tab : 'workspace') as Tab;
  useEffect(() => {
    document.title = 'Settings · Relationship Manager';
  }, []);
  return (
    <>
      <TopBar title="Settings" actions={<ThemeToggle />} />
      <div className="page">
        <div className="page__inner stack" style={{ gap: 20 }}>
          <Tabs
            value={t}
            onChange={(v) => navigate(`/settings/${v}`)}
            tabs={[
              { value: 'workspace', label: 'Workspace', icon: 'groups' },
              { value: 'members', label: 'Members', icon: 'personAdd' },
              { value: 'integrations', label: 'Integrations & API keys', icon: 'key' },
              { value: 'appearance', label: 'Appearance', icon: 'palette' },
              { value: 'profile', label: 'Profile', icon: 'person' },
              { value: 'data', label: 'Data', icon: 'description' },
            ]}
          />
          {t === 'workspace' ? <WorkspaceSettings /> : null}
          {t === 'members' ? <MembersSettings /> : null}
          {t === 'integrations' ? <IntegrationsSettings /> : null}
          {t === 'appearance' ? <AppearanceSettings /> : null}
          {t === 'profile' ? <ProfileSettings /> : null}
          {t === 'data' ? <DataSettings /> : null}
        </div>
      </div>
    </>
  );
}

/* ---------- workspace ---------- */

function WorkspaceSettings() {
  const ws = useWorkspace();
  const { refresh, selectWorkspace, workspaces } = useSession();
  const { show } = useToast();
  const { search, navigate } = useRouter();
  const [name, setName] = useState(ws.name);
  const [selfEmails, setSelfEmails] = useState(ws.selfEmails.join(', '));
  const [domains, setDomains] = useState(ws.corporateDomains.join(', '));
  const [creating, setCreating] = useState(search.get('new') === '1');
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setName(ws.name);
    setSelfEmails(ws.selfEmails.join(', '));
    setDomains(ws.corporateDomains.join(', '));
  }, [ws]);
  const split = (s: string) => s.split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean);
  const save = async () => {
    setBusy(true);
    try {
      await api.workspaces.update(ws.id, { name, selfEmails: split(selfEmails), corporateDomains: split(domains) });
      await refresh();
      show('Workspace saved — circles recomputed');
    } catch (e) {
      show((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const create = async () => {
    try {
      const w = await api.workspaces.create({ name: newName });
      await refresh();
      selectWorkspace(w.id);
      setCreating(false);
      navigate('/settings/workspace', { replace: true });
      show(`Created ${w.name}`);
    } catch (e) {
      show((e as Error).message);
    }
  };
  const remove = async () => {
    if (!confirm(`Delete workspace "${ws.name}" and everything in it?`)) return;
    try {
      await api.workspaces.remove(ws.id);
      await refresh();
      show('Workspace deleted');
    } catch (e) {
      show((e as Error).message);
    }
  };
  const readOnly = ws.role === 'viewer';
  return (
    <div className="grid grid--3" style={{ alignItems: 'start' }}>
      <Card title="This workspace" style={{ gridColumn: 'span 2' }}>
        <div className="stack">
          <TextField label="Name" value={name} onChange={setName} disabled={readOnly} testId="ws-name" />
          <TextField label="My email addresses" value={selfEmails} onChange={setSelfEmails} help="Comma separated. Used to tell sent from received mail and to detect bidirectional threads." disabled={readOnly} testId="ws-self-emails" />
          <TextField label="Corporate email domains" value={domains} onChange={setDomains} help="e.g. acme.com — people with these domains (or that company name) go into the Corporate circle." disabled={readOnly} testId="ws-domains" />
          {!readOnly ? (
            <div className="row">
              <Button onClick={save} disabled={busy} data-testid="ws-save">
                Save
              </Button>
              <span className="body-sm muted">Your role: {ws.role}</span>
            </div>
          ) : (
            <Banner>You have view-only access to this workspace.</Banner>
          )}
        </div>
      </Card>
      <div className="stack">
        <Card title="Workspaces">
          <div className="stack" style={{ gap: 6 }}>
            {workspaces.map((w) => (
              <button key={w.id} type="button" className="list-item" aria-selected={w.id === ws.id} onClick={() => selectWorkspace(w.id)}>
                <Icon name="groups" />
                <div className="list-item__body">
                  <div className="title-sm">{w.name}</div>
                  <div className="body-sm muted">{w.role}</div>
                </div>
              </button>
            ))}
          </div>
          <Button variant="tonal" icon="add" className="mt-8" onClick={() => setCreating(true)} data-testid="ws-new">
            New workspace
          </Button>
        </Card>
        {ws.role === 'owner' ? (
          <Card title="Danger zone" variant="outlined">
            <Button variant="danger-text" icon="delete" onClick={remove}>
              Delete this workspace
            </Button>
          </Card>
        ) : null}
      </div>
      <Dialog open={creating} onClose={() => setCreating(false)} title="New workspace" testId="ws-create-dialog" actions={<><Button variant="text" onClick={() => setCreating(false)}>Cancel</Button><Button onClick={create} disabled={!newName.trim()} data-testid="ws-create">Create</Button></>}>
        <p className="body-md muted">Workspaces keep separate networks — for example one for you and one shared with your team.</p>
        <TextField label="Name" value={newName} onChange={setNewName} autoFocus testId="ws-create-name" />
      </Dialog>
    </div>
  );
}

/* ---------- members ---------- */

function MembersSettings() {
  const ws = useWorkspace();
  const { user } = useSession();
  const { show } = useToast();
  const data = useAsync(() => api.workspaces.members(ws.id), [ws.id]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('editor');
  const [link, setLink] = useState<string | null>(null);
  const invite = async () => {
    try {
      const r = await api.workspaces.invite(ws.id, email, role);
      if (r.joined) show(`${email} added to the workspace`);
      else {
        setLink(`${location.origin}${r.link}`);
        show('Invite created — share the link');
      }
      setEmail('');
      data.reload();
    } catch (e) {
      show((e as Error).message);
    }
  };
  const isOwner = ws.role === 'owner';
  return (
    <div className="grid grid--3" style={{ alignItems: 'start' }}>
      <Card title="Members" style={{ gridColumn: 'span 2' }} testId="members-card">
        {data.loading ? (
          <Loading />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.data?.members.map((m) => (
                <tr key={m.userId} data-testid="member-row">
                  <td>{m.name}{m.userId === user?.id ? ' (you)' : ''}</td>
                  <td className="muted">{m.email}</td>
                  <td>
                    {isOwner && m.userId !== ws.ownerId ? (
                      <select className="field__input field__input--sm" value={m.role} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => api.workspaces.setRole(ws.id, m.userId, e.target.value).then(() => data.reload())} aria-label="Role">
                        <option value="editor">editor</option>
                        <option value="viewer">viewer</option>
                      </select>
                    ) : (
                      m.role
                    )}
                  </td>
                  <td>
                    {m.userId !== ws.ownerId && (isOwner || m.userId === user?.id) ? (
                      <IconButton icon="close" label="Remove" onClick={() => confirm(`Remove ${m.name}?`) && api.workspaces.removeMember(ws.id, m.userId).then(() => data.reload())} />
                    ) : null}
                  </td>
                </tr>
              ))}
              {data.data?.invites.map((i) => (
                <tr key={i.id} className="muted" data-testid="invite-row">
                  <td>Invited · {formatDate(i.createdAt)}</td>
                  <td>{i.email}</td>
                  <td>{i.role}</td>
                  <td className="row">
                    {i.token ? <IconButton icon="copy" label="Copy invite link" onClick={() => navigator.clipboard.writeText(`${location.origin}/invite/${i.token}`).then(() => show('Link copied'))} /> : null}
                    {isOwner ? <IconButton icon="close" label="Revoke" onClick={() => api.workspaces.revokeInvite(ws.id, i.id).then(() => data.reload())} /> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      {isOwner ? (
        <Card title="Invite someone">
          <div className="stack">
            <TextField label="Email" type="email" value={email} onChange={setEmail} testId="invite-email" />
            <Select label="Role" value={role} onChange={setRole} options={[{ value: 'editor', label: 'Editor — can import and edit' }, { value: 'viewer', label: 'Viewer — read only' }]} />
            <Button onClick={invite} disabled={!email} icon="personAdd" data-testid="invite-send">
              Invite
            </Button>
            {link ? (
              <Banner icon="link" action={<Button size="sm" variant="text" onClick={() => navigator.clipboard.writeText(link).then(() => show('Link copied'))}>Copy</Button>}>
                <span className="body-sm mono" style={{ wordBreak: 'break-all' }} data-testid="invite-link">
                  {link}
                </span>
              </Banner>
            ) : null}
            <div className="body-sm muted">If they already have an account they're added immediately. Otherwise they sign up with the link.</div>
          </div>
        </Card>
      ) : null}
    </div>
  );
}

/* ---------- integrations ---------- */

function IntegrationsSettings() {
  const ws = useWorkspace();
  const { show } = useToast();
  const providers = useAsync(() => api.providers(), []);
  const integrations = useAsync(() => api.integrations.list(ws.id), [ws.id]);
  const [adding, setAdding] = useState<string | null>(null);
  const [editing, setEditing] = useState<IntegrationPublic | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, string>>({});
  const canEdit = ws.role !== 'viewer';

  const test = async (it: IntegrationPublic) => {
    setBusy(it.id);
    try {
      const r = await api.integrations.test(ws.id, it.id);
      setDetail({ ...detail, [it.id]: r.detail });
      show(r.detail);
      integrations.reload();
    } catch (e) {
      show((e as Error).message);
      integrations.reload();
    } finally {
      setBusy(null);
    }
  };
  const sync = async (it: IntegrationPublic) => {
    setBusy(it.id);
    try {
      const r = await api.integrations.sync(ws.id, it.id);
      show(`Synced: ${r.jobs.map((j) => `${j.source} +${j.stats.created}`).join(', ') || 'nothing new'}`);
      integrations.reload();
    } catch (e) {
      show((e as Error).message);
      integrations.reload();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="stack" style={{ gap: 20 }}>
      <Banner icon="lock">API keys and passwords are encrypted at rest with AES-256-GCM and never sent back to the browser. Use app passwords or short-lived tokens where possible.</Banner>
      <Card title="Connected" testId="integrations-card">
        {integrations.loading ? (
          <Loading />
        ) : !integrations.data?.length ? (
          <Empty icon="key" title="No integrations yet">Add one below to sync directly from your accounts.</Empty>
        ) : (
          <div className="stack">
            {integrations.data.map((it) => (
              <div key={it.id} className="card card--outlined card--tight row" data-testid={`integration-${it.provider}`}>
                <Icon name={it.status === 'ok' ? 'checkCircle' : it.status === 'error' ? 'error' : 'key'} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="title-sm">{it.label}</div>
                  <div className="body-sm muted truncate">
                    {Object.entries(it.config).map(([k, v]) => `${k}: ${v}`).join(' · ')}
                    {Object.keys(it.secretsSet).length ? ` · secrets: ${Object.keys(it.secretsSet).filter((k) => it.secretsSet[k]).join(', ')}` : ''}
                  </div>
                  <div className="body-sm muted">
                    {it.lastSyncAt ? `Last sync ${formatDate(it.lastSyncAt)}` : 'Never synced'}
                    {it.lastError ? <span style={{ color: 'var(--md-sys-color-error)' }}> · {it.lastError}</span> : null}
                    {detail[it.id] ? <span> · {detail[it.id]}</span> : null}
                  </div>
                </div>
                {canEdit ? (
                  <>
                    <Button size="sm" variant="outlined" disabled={busy === it.id} onClick={() => test(it)} data-testid="integration-test">
                      Test
                    </Button>
                    <Button size="sm" variant="tonal" icon="sync" disabled={busy === it.id} onClick={() => sync(it)} data-testid="integration-sync">
                      Sync now
                    </Button>
                    <IconButton icon="edit" label="Edit" onClick={() => setEditing(it)} />
                    <IconButton icon="delete" label="Remove" onClick={() => confirm(`Remove ${it.label}?`) && api.integrations.remove(ws.id, it.id).then(() => integrations.reload())} data-testid="integration-delete" />
                  </>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Card>
      {canEdit ? (
        <section>
          <h2 className="title-md mb-8">Add a connector</h2>
          <div className="grid grid--auto" data-testid="provider-tiles">
            {providers.data?.map((p) => (
              <button key={p.provider} type="button" className="source-tile" onClick={() => setAdding(p.provider)} data-testid={`provider-${p.provider}`}>
                <span className="title-md">{p.name}</span>
                <span className="body-sm" style={{ opacity: 0.8 }}>
                  {p.description}
                </span>
                <span className="label-sm muted">Feeds: {p.feeds.join(', ')}</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}
      {adding && providers.data ? <IntegrationDialog spec={providers.data.find((p) => p.provider === adding)!} onClose={() => setAdding(null)} onSaved={() => (setAdding(null), integrations.reload())} /> : null}
      {editing && providers.data ? <IntegrationDialog spec={providers.data.find((p) => p.provider === editing.provider)!} existing={editing} onClose={() => setEditing(null)} onSaved={() => (setEditing(null), integrations.reload())} /> : null}
    </div>
  );
}

function IntegrationDialog({ spec, existing, onClose, onSaved }: { spec: { provider: string; name: string; docs: string; fields: { key: string; label: string; secret?: boolean; placeholder?: string; help?: string; required?: boolean }[] }; existing?: IntegrationPublic; onClose: () => void; onSaved: () => void }) {
  const ws = useWorkspace();
  const [label, setLabel] = useState(existing?.label ?? spec.name);
  const [values, setValues] = useState<Record<string, string>>(existing?.config ?? {});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      if (existing) await api.integrations.update(ws.id, existing.id, { label, config: values });
      else await api.integrations.create(ws.id, { provider: spec.provider, label, config: values });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onClose={onClose} title={existing ? `Edit ${existing.label}` : `Connect ${spec.name}`} testId="integration-dialog" actions={<><Button variant="text" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={busy} data-testid="integration-save">{existing ? 'Save' : 'Connect'}</Button></>}>
      {error ? <Banner kind="error" icon="error">{error}</Banner> : null}
      <TextField label="Label" value={label} onChange={setLabel} />
      {spec.fields.map((f) => (
        <TextField key={f.key} label={f.label} type={f.secret ? 'password' : 'text'} value={values[f.key] ?? ''} onChange={(v) => setValues({ ...values, [f.key]: v })} placeholder={f.placeholder} help={existing && f.secret && existing.secretsSet[f.key] && !values[f.key] ? 'Saved — leave blank to keep' : f.help} required={f.required && !existing} testId={`field-${f.key}`} />
      ))}
      <a className="body-sm" href={spec.docs} target="_blank" rel="noreferrer">
        Where do I get these? <Icon name="openInNew" size={14} />
      </a>
    </Dialog>
  );
}

/* ---------- appearance ---------- */

function AppearanceSettings() {
  const { seed, setSeed, mode, setMode } = useTheme();
  return (
    <div className="grid grid--2" style={{ alignItems: 'start' }}>
      <Card title="Theme">
        <SegmentedButtons value={mode} onChange={setMode} options={[{ value: 'light', label: 'Light', icon: 'light' }, { value: 'dark', label: 'Dark', icon: 'dark' }, { value: 'system', label: 'System' }]} />
      </Card>
      <Card title="Accent colour" testId="appearance-seed">
        <p className="body-md muted">Pick a seed colour — the whole palette is derived from it, Material You style.</p>
        <div className="row row--wrap">
          {SEED_PRESETS.map((p) => (
            <button key={p.value} type="button" aria-label={p.name} title={p.name} aria-pressed={seed === p.value} onClick={() => setSeed(p.value)} style={{ width: 40, height: 40, borderRadius: 20, background: p.value, outline: seed === p.value ? '3px solid var(--md-sys-color-on-surface)' : 'none', outlineOffset: 2 }} data-testid={`seed-${p.value.slice(1)}`} />
          ))}
          <label className="row body-sm muted" style={{ gap: 8 }}>
            Custom
            <input type="color" value={seed} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSeed(e.target.value)} aria-label="Custom seed colour" />
          </label>
        </div>
      </Card>
    </div>
  );
}

/* ---------- profile ---------- */

function ProfileSettings() {
  const { user, refresh } = useSession();
  const { show } = useToast();
  const [name, setName] = useState(user?.name ?? '');
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const save = async () => {
    try {
      await api.auth.update({ name, ...(password ? { password, currentPassword: current } : {}) });
      await refresh();
      setPassword('');
      setCurrent('');
      show('Profile saved');
    } catch (e) {
      show((e as Error).message);
    }
  };
  return (
    <div className="grid grid--2" style={{ alignItems: 'start' }}>
      <Card title="Profile">
        <div className="stack">
          <TextField label="Name" value={name} onChange={setName} testId="profile-name" />
          <TextField label="Email" value={user?.email ?? ''} onChange={() => undefined} disabled />
          <Button onClick={save} data-testid="profile-save">
            Save
          </Button>
        </div>
      </Card>
      <Card title="Change password">
        <div className="stack">
          <TextField label="Current password" type="password" value={current} onChange={setCurrent} />
          <TextField label="New password" type="password" value={password} onChange={setPassword} help="At least 8 characters" />
          <Button variant="tonal" onClick={save} disabled={!password || !current}>
            Update password
          </Button>
        </div>
      </Card>
    </div>
  );
}

/* ---------- data ---------- */

function DataSettings() {
  const ws = useWorkspace();
  const { show } = useToast();
  const [exporting, setExporting] = useState(false);
  const exportJson = async () => {
    setExporting(true);
    try {
      const data = await api.exportAll(ws.id);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${ws.name.replace(/\s+/g, '-').toLowerCase()}-export.json`;
      a.click();
      show('Export downloaded');
    } catch (e) {
      show((e as Error).message);
    } finally {
      setExporting(false);
    }
  };
  return (
    <div className="grid grid--2" style={{ alignItems: 'start' }}>
      <Card title="Export">
        <p className="body-md muted">Download everything in this workspace — people, relationships, interactions and tags — as JSON.</p>
        <Button icon="download" onClick={exportJson} disabled={exporting} data-testid="export-json">
          Export workspace
        </Button>
      </Card>
      <Card title="About">
        <div className="stack" style={{ gap: 4 }}>
          <div className="row row--between">
            <span className="muted">Version</span>
            <span className="mono">{APP_VERSION}</span>
          </div>
          <div className="row row--between">
            <span className="muted">Storage</span>
            <span>SQLite on the server · cached offline in this browser</span>
          </div>
          <div className="row row--between">
            <span className="muted">Source</span>
            <a href="https://github.com/RealityCramp/Relationship-Manager" target="_blank" rel="noreferrer">
              GitHub
            </a>
          </div>
        </div>
      </Card>
    </div>
  );
}
