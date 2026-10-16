import { useEffect, useRef, useState } from 'react';
import type { ImportJob, Source } from '@shared/types.ts';
import { guessSource } from '@shared/importers/index.ts';
import { formatDate } from '@shared/util.ts';
import { SOURCE_LABEL } from '@shared/graph.ts';
import { api, type ImportPreview } from '../lib/api.ts';
import { Link, useRouter } from '../lib/router.tsx';
import { useAsync, useToast, useWorkspace } from '../lib/store.tsx';
import { Banner, Button, Card, CategoryBadges, Loading, Progress, Switch } from '../ui/components.tsx';
import { Icon } from '../ui/Icon.tsx';
import { ThemeToggle, TopBar } from '../App.tsx';

interface SourceInfo {
  source: Source;
  name: string;
  color: string;
  letter: string;
  blurb: string;
  accepts: string;
  steps: string[];
  learn: string;
}

export const SOURCE_INFO: SourceInfo[] = [
  {
    source: 'linkedin',
    name: 'LinkedIn',
    color: '#0a66c2',
    letter: 'in',
    blurb: 'Your connections with company and position → Business circle.',
    accepts: '.csv',
    steps: ['On LinkedIn open Settings & Privacy → Data privacy → Get a copy of your data.', 'Choose "Connections" and request the archive.', 'Unzip the email attachment and drop Connections.csv here.'],
    learn: 'https://www.linkedin.com/help/linkedin/answer/a566336',
  },
  {
    source: 'facebook',
    name: 'Facebook',
    color: '#1877f2',
    letter: 'f',
    blurb: 'Your friends list → Personal circle.',
    accepts: '.json',
    steps: ['Open Facebook Settings → Your information → Download your information.', 'Pick "Friends and followers", format JSON, then create the file.', 'Unzip and drop friends_and_followers/friends.json here.'],
    learn: 'https://www.facebook.com/help/212802592074644',
  },
  {
    source: 'x',
    name: 'X',
    color: '#111111',
    letter: 'X',
    blurb: 'Followers and follows → Social circle.',
    accepts: '.js, .json, .csv',
    steps: ['On X open Settings → Your account → Download an archive of your data.', 'Unzip and drop data/follower.js and data/following.js here (IDs only).', 'Add an X API bearer token in Settings → Integrations to resolve names and avatars, or drop a CSV with username/name columns.'],
    learn: 'https://help.x.com/en/managing-your-account/how-to-download-your-x-archive',
  },
  {
    source: 'contacts',
    name: 'Contacts',
    color: '#34a853',
    letter: '@',
    blurb: 'Address book (vCard or CSV) → Personal / Business circles by email domain.',
    accepts: '.vcf, .csv',
    steps: ['Google Contacts: select all → Export → vCard or Google CSV.', 'iPhone/macOS Contacts: select all → File → Export → Export vCard.', 'Outlook: File → Open & Export → Import/Export → CSV.'],
    learn: 'https://support.google.com/contacts/answer/7199294',
  },
  {
    source: 'email',
    name: 'Email',
    color: '#ea4335',
    letter: '✉',
    blurb: 'Bidirectional threads from a mailbox export → every circle, by domain.',
    accepts: '.mbox, .eml',
    steps: ['Gmail: takeout.google.com → Mail → export as .mbox (you can limit to "Sent" + "Inbox" labels).', 'Apple Mail / Thunderbird: export a mailbox as .mbox.', 'Only people who both wrote to you and received mail from you are imported. Set "My email addresses" in Settings first.'],
    learn: 'https://support.google.com/accounts/answer/3024190',
  },
];

interface Loaded {
  filename: string;
  text: string;
  size: number;
}

export function ImportPage() {
  const ws = useWorkspace();
  const { navigate } = useRouter();
  const { show } = useToast();
  const [source, setSource] = useState<Source | null>(null);
  const [files, setFiles] = useState<Loaded[]>([]);
  const [previews, setPreviews] = useState<(ImportPreview & { filename: string })[]>([]);
  const [bidirectional, setBidirectional] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [results, setResults] = useState<ImportJob[] | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const jobs = useAsync(() => api.imports.list(ws.id), [ws.id, results]);
  const integrations = useAsync(() => api.integrations.list(ws.id), [ws.id]);
  const info = SOURCE_INFO.find((s) => s.source === source);
  const step = results ? 4 : previews.length ? 3 : files.length ? 2 : source ? 2 : 1;

  useEffect(() => {
    document.title = 'Import · Relationship Manager';
  }, []);

  const loadFiles = async (list: FileList | File[]) => {
    const loaded: Loaded[] = [];
    for (const f of Array.from(list)) {
      if (f.size > 200 * 1024 * 1024) {
        show(`${f.name} is larger than 200 MB — split the export first.`);
        continue;
      }
      const text = await f.text();
      loaded.push({ filename: f.name, text, size: f.size });
      if (!source) {
        const g = guessSource(f.name, text.slice(0, 4000));
        if (g) setSource(g);
      }
    }
    setFiles((prev) => [...prev, ...loaded]);
    setPreviews([]);
    setResults(null);
  };

  const preview = async () => {
    if (!source) return;
    setBusy('Reading files…');
    try {
      const out: (ImportPreview & { filename: string })[] = [];
      for (const f of files) out.push({ ...(await api.imports.preview(ws.id, { source, filename: f.filename, text: f.text, bidirectionalOnly: bidirectional })), filename: f.filename });
      setPreviews(out);
    } catch (e) {
      show((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const run = async () => {
    if (!source) return;
    setBusy('Importing…');
    try {
      const out: ImportJob[] = [];
      for (const f of files) out.push(await api.imports.run(ws.id, { source, filename: f.filename, text: f.text, bidirectionalOnly: bidirectional }));
      setResults(out);
      show(`Imported ${out.reduce((n, j) => n + (j.stats.created ?? 0), 0)} new people`, { label: 'View network', onClick: () => navigate('/network') });
    } catch (e) {
      show((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const reset = () => {
    setSource(null);
    setFiles([]);
    setPreviews([]);
    setResults(null);
  };

  const sync = async (id: string) => {
    setBusy('Syncing…');
    try {
      const r = await api.integrations.sync(ws.id, id);
      setResults(r.jobs);
      integrations.reload();
      show(`Synced ${r.jobs.length} source${r.jobs.length === 1 ? '' : 's'}`);
    } catch (e) {
      show((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <TopBar title="Import" subtitle="Bring your connections together" actions={<ThemeToggle />} />
      <div className="page">
        <div className="page__inner stack" style={{ gap: 20 }}>
          <div className="steps" data-testid="import-steps">
            {['Choose a source', 'Add files', 'Review', 'Done'].map((label, i) => (
              <span key={label} className="steps__step" aria-current={step === i + 1 ? 'step' : undefined} data-done={step > i + 1}>
                <span className="steps__num">{step > i + 1 ? <Icon name="check" size={16} /> : i + 1}</span>
                {label}
                {i < 3 ? <Icon name="chevronRight" size={18} /> : null}
              </span>
            ))}
          </div>

          {results ? (
            <Card testId="import-results">
              <div className="row" style={{ alignItems: 'flex-start' }}>
                <Icon name="checkCircle" size={40} />
                <div style={{ flex: 1 }}>
                  <h2 className="headline-sm">Import complete</h2>
                  <table className="table mt-8">
                    <thead>
                      <tr>
                        <th>Source</th>
                        <th>Parsed</th>
                        <th>New people</th>
                        <th>Merged into existing</th>
                        <th>Interactions</th>
                        <th>Relationships</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.map((j) => (
                        <tr key={j.id}>
                          <td>{SOURCE_LABEL[j.source]}</td>
                          <td>{j.stats.parsed}</td>
                          <td data-testid="result-created">{j.stats.created}</td>
                          <td>{j.stats.merged}</td>
                          <td>{j.stats.interactions}</td>
                          <td>{j.stats.relationships}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {results.flatMap((j) => j.stats.warnings ?? []).length ? (
                    <div className="stack mt-16" style={{ gap: 6 }}>
                      {results.flatMap((j) => j.stats.warnings ?? []).slice(0, 6).map((w, i) => (
                        <Banner key={i} icon="warning">{w}</Banner>
                      ))}
                    </div>
                  ) : null}
                  <div className="row mt-16">
                    <Button icon="hub" onClick={() => navigate('/network')} data-testid="results-view-network">
                      View the network
                    </Button>
                    <Button variant="tonal" onClick={reset}>
                      Import another source
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          ) : (
            <>
              <section>
                <h2 className="title-md mb-8">1. Choose a source</h2>
                <div className="grid grid--sources" data-testid="source-tiles">
                  {SOURCE_INFO.map((s) => (
                    <button key={s.source} type="button" className="source-tile" aria-pressed={source === s.source} onClick={() => (setSource(s.source), setPreviews([]))} data-testid={`source-${s.source}`}>
                      <span className="source-tile__icon" style={{ background: s.color }}>
                        {s.letter}
                      </span>
                      <span className="title-md">{s.name}</span>
                      <span className="body-sm" style={{ opacity: 0.8 }}>
                        {s.blurb}
                      </span>
                      <span className="label-sm" style={{ opacity: 0.7 }}>
                        Accepts {s.accepts}
                      </span>
                    </button>
                  ))}
                </div>
              </section>

              <section className="grid grid--3" style={{ alignItems: 'start' }}>
                <div style={{ gridColumn: 'span 2' }} className="stack">
                  <h2 className="title-md">2. Add your export file{files.length === 1 ? '' : 's'}</h2>
                  <div
                    className={`dropzone ${dragging ? 'dropzone--active' : ''}`}
                    onDragOver={(e: React.DragEvent<HTMLDivElement>) => (e.preventDefault(), setDragging(true))}
                    onDragLeave={() => setDragging(false)}
                    onDrop={(e: React.DragEvent<HTMLDivElement>) => {
                      e.preventDefault();
                      setDragging(false);
                      void loadFiles(e.dataTransfer.files);
                    }}
                    onClick={() => fileInput.current?.click()}
                    role="button"
                    tabIndex={0}
                    data-testid="dropzone"
                  >
                    <Icon name="cloudUpload" />
                    <div className="title-md">Drop files here or click to browse</div>
                    <div className="body-sm">{info ? `${info.name}: ${info.accepts}` : 'CSV, JSON, JS, VCF, MBOX or EML — the source is detected automatically'}</div>
                    <input ref={fileInput} type="file" multiple hidden onChange={(e: React.ChangeEvent<HTMLInputElement>) => e.target.files && loadFiles(e.target.files)} data-testid="file-input" accept=".csv,.json,.js,.vcf,.mbox,.eml,.txt" />
                  </div>
                  {files.length ? (
                    <div className="stack" style={{ gap: 6 }} data-testid="file-list">
                      {files.map((f, i) => (
                        <div key={f.filename + i} className="row card card--outlined card--tight">
                          <Icon name="description" />
                          <span style={{ flex: 1 }} className="truncate">
                            {f.filename}
                          </span>
                          <span className="body-sm muted">{(f.size / 1024).toFixed(0)} KB</span>
                          <Button variant="text" size="sm" onClick={() => (setFiles(files.filter((_, j) => j !== i)), setPreviews([]))}>
                            Remove
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {source === 'email' ? (
                    <Card variant="outlined" className="card--tight">
                      <Switch checked={bidirectional} onChange={(v) => (setBidirectional(v), setPreviews([]))} label={<span className="body-md">Only people I've exchanged mail with in both directions (recommended)</span>} />
                      <div className="body-sm muted mt-8">
                        Your own addresses: {ws.selfEmails.join(', ') || 'none set'} · <Link to="/settings/workspace">change</Link>
                      </div>
                    </Card>
                  ) : null}
                  <div className="row">
                    <Button disabled={!source || !files.length || !!busy} onClick={preview} data-testid="preview-button">
                      Review before importing
                    </Button>
                    <Button variant="tonal" disabled={!source || !files.length || !!busy} onClick={run} data-testid="import-now-button">
                      Import now
                    </Button>
                    {busy ? (
                      <span className="row body-sm muted">
                        <Progress /> {busy}
                      </span>
                    ) : null}
                  </div>
                  {previews.length ? (
                    <Card testId="import-preview">
                      <h3 className="title-md mb-8">3. Review</h3>
                      {previews.map((p) => (
                        <div key={p.filename} className="stack mb-16">
                          <div className="row">
                            <strong>{p.filename}</strong>
                            <span className="muted">
                              · {p.total} people{p.interactions ? ` · ${p.interactions} interactions` : ''}
                            </span>
                          </div>
                          {p.warnings.map((w, i) => (
                            <Banner key={i} icon="warning">{w}</Banner>
                          ))}
                          {p.sample.length ? (
                            <table className="table">
                              <thead>
                                <tr>
                                  <th>Name</th>
                                  <th>Company / title</th>
                                  <th>Email</th>
                                  <th>Circles</th>
                                </tr>
                              </thead>
                              <tbody>
                                {p.sample.slice(0, 10).map((s, i) => (
                                  <tr key={i}>
                                    <td>{s.displayName}</td>
                                    <td className="muted">{[s.company, s.title].filter(Boolean).join(' · ')}</td>
                                    <td className="muted">{s.emails?.[0] ?? ''}</td>
                                    <td>
                                      <CategoryBadges categories={s.categories ?? []} />
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          ) : null}
                        </div>
                      ))}
                      <Button onClick={run} disabled={!!busy} data-testid="confirm-import">
                        Import {previews.reduce((n, p) => n + p.total, 0)} people
                      </Button>
                    </Card>
                  ) : null}
                </div>
                <div className="stack">
                  {info ? (
                    <Card title={`How to export from ${info.name}`}>
                      <ol className="body-md" style={{ paddingLeft: 20, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {info.steps.map((s) => (
                          <li key={s}>{s}</li>
                        ))}
                      </ol>
                      <a className="btn btn--text btn--sm mt-8" href={info.learn} target="_blank" rel="noreferrer">
                        Official help <Icon name="openInNew" />
                      </a>
                    </Card>
                  ) : (
                    <Card title="Tips">
                      <ul className="body-md" style={{ paddingLeft: 20, margin: 0 }}>
                        <li>People are matched across sources by email, handle and name, so importing several sources enriches the same person.</li>
                        <li>Re-importing a file is safe — nothing is duplicated.</li>
                        <li>
                          Set your corporate email domains in <Link to="/settings/workspace">Settings</Link> so colleagues land in the Corporate circle.
                        </li>
                      </ul>
                    </Card>
                  )}
                  <Card title="Connected accounts" action={<Link to="/settings/integrations" className="btn btn--text btn--sm">Manage</Link>}>
                    {integrations.data?.length ? (
                      <div className="stack" style={{ gap: 8 }}>
                        {integrations.data.map((it) => (
                          <div key={it.id} className="row row--between">
                            <div style={{ minWidth: 0 }}>
                              <div className="title-sm truncate">{it.label}</div>
                              <div className="body-sm muted">{it.lastSyncAt ? `Last sync ${formatDate(it.lastSyncAt)}` : 'Never synced'}</div>
                            </div>
                            <Button size="sm" variant="tonal" icon="sync" disabled={!!busy} onClick={() => sync(it.id)} data-testid={`sync-${it.provider}`}>
                              Sync
                            </Button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="body-sm muted">
                        Add an IMAP mailbox, Google, Microsoft 365, X or Facebook connector with your own API keys to sync without downloading files. <Link to="/settings/integrations">Set up</Link>
                      </div>
                    )}
                  </Card>
                </div>
              </section>
            </>
          )}

          <Card title="Import history">
            {jobs.loading ? (
              <Loading />
            ) : jobs.data?.length ? (
              <table className="table" data-testid="import-history">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Source</th>
                    <th>Parsed</th>
                    <th>New</th>
                    <th>Merged</th>
                    <th>Interactions</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.data.map((j) => (
                    <tr key={j.id}>
                      <td className="muted body-sm">{formatDate(j.createdAt)}</td>
                      <td>{SOURCE_LABEL[j.source]}</td>
                      <td>{j.stats.parsed ?? 0}</td>
                      <td>{j.stats.created ?? 0}</td>
                      <td>{j.stats.merged ?? 0}</td>
                      <td>{j.stats.interactions ?? 0}</td>
                      <td>{j.status === 'error' ? <span style={{ color: 'var(--md-sys-color-error)' }}>{j.error}</span> : j.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <span className="muted">Nothing imported yet.</span>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
