import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useRouter } from '../lib/router.tsx';
import { useAsync } from '../lib/store.tsx';
import { fmtTime, parseVtt, renderMarkdown } from '../lib/markdown.ts';
import { Banner, Button, Card, IconButton, Loading, Tabs } from '../ui/components.tsx';
import { Icon } from '../ui/Icon.tsx';
import { ThemeToggle, TopBar } from '../App.tsx';

export interface TrainingVideo {
  id: string;
  title: string;
  description: string;
  duration: number;
  video: string;
  videoWebm?: string | null;
  captions: string;
  poster: string;
  guide: string;
  chapters: { time: number; title: string }[];
  level: 'start' | 'core' | 'advanced';
}

export interface TrainingIndex {
  generatedAt: string;
  videos: TrainingVideo[];
  guides: { id: string; title: string; description: string; path: string }[];
}

async function loadIndex(): Promise<TrainingIndex> {
  const res = await fetch('/training/index.json');
  if (!res.ok) throw new Error('Training materials are not built yet. Run `npm run training:build`.');
  return res.json();
}

export function TrainingPage({ id }: { id?: string }) {
  const index = useAsync(loadIndex, []);
  const { navigate } = useRouter();
  const [tab, setTab] = useState<'videos' | 'guides'>('videos');
  useEffect(() => {
    document.title = 'Learn · Relationship Manager';
  }, []);
  if (id && index.data) {
    const v = index.data.videos.find((x) => x.id === id);
    const g = index.data.guides.find((x) => x.id === id);
    if (v) return <VideoPlayerPage video={v} all={index.data.videos} />;
    if (g) return <GuidePage guide={g} />;
  }
  return (
    <>
      <TopBar title="Learn" subtitle="Short videos and written guides for every part of the app" actions={<ThemeToggle />} />
      <div className="page">
        <div className="page__inner stack" style={{ gap: 20 }}>
          {index.error ? <Banner kind="error" icon="error">{index.error}</Banner> : null}
          {index.loading ? <Loading /> : null}
          {index.data ? (
            <>
              <Tabs value={tab} onChange={setTab} tabs={[{ value: 'videos', label: `Videos (${index.data.videos.length})`, icon: 'play' }, { value: 'guides', label: `Guides (${index.data.guides.length})`, icon: 'description' }]} />
              {tab === 'videos' ? (
                <div className="grid grid--3" data-testid="video-grid">
                  {index.data.videos.map((v) => (
                    <Card key={v.id} className="video-card" onClick={() => navigate(`/training/${v.id}`)} testId={`video-${v.id}`}>
                      <div className="video-card__thumb">
                        <img src={v.poster} alt="" loading="lazy" />
                        <span className="video-card__play">
                          <Icon name="play" />
                        </span>
                        <span className="chip chip--sm" style={{ position: 'absolute', right: 8, bottom: 8, background: 'rgba(0,0,0,.6)', color: '#fff', borderColor: 'transparent' }}>
                          {fmtTime(v.duration)}
                        </span>
                      </div>
                      <div className="video-card__body">
                        <div className="label-sm muted" style={{ textTransform: 'uppercase' }}>
                          {v.level === 'start' ? 'Getting started' : v.level === 'core' ? 'Core' : 'Advanced'}
                        </div>
                        <div className="title-md">{v.title}</div>
                        <div className="body-sm muted mt-8">{v.description}</div>
                      </div>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="grid grid--3" data-testid="guide-grid">
                  {index.data.guides.map((g) => (
                    <Card key={g.id} onClick={() => navigate(`/training/${g.id}`)} testId={`guide-${g.id}`}>
                      <div className="row">
                        <Icon name="description" />
                        <div className="title-md">{g.title}</div>
                      </div>
                      <div className="body-sm muted mt-8">{g.description}</div>
                    </Card>
                  ))}
                </div>
              )}
            </>
          ) : null}
        </div>
      </div>
    </>
  );
}

function VideoPlayerPage({ video, all }: { video: TrainingVideo; all: TrainingVideo[] }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [cues, setCues] = useState<{ start: number; end: number; text: string }[]>([]);
  const [time, setTime] = useState(0);
  const [speaking, setSpeaking] = useState(false);
  const guide = useAsync(() => fetch(video.guide).then((r) => (r.ok ? r.text() : '')), [video.guide]);
  const { navigate } = useRouter();

  useEffect(() => {
    fetch(video.captions)
      .then((r) => r.text())
      .then((t) => setCues(parseVtt(t)))
      .catch(() => setCues([]));
    return () => window.speechSynthesis?.cancel();
  }, [video.captions]);

  const current = useMemo(() => cues.findIndex((c) => time >= c.start && time < c.end), [cues, time]);
  const idx = all.findIndex((v) => v.id === video.id);
  const next = all[idx + 1];

  const readAloud = () => {
    if (!('speechSynthesis' in window)) return;
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    const u = new SpeechSynthesisUtterance(cues.map((c) => c.text).join(' '));
    u.rate = 1;
    u.onend = () => setSpeaking(false);
    setSpeaking(true);
    window.speechSynthesis.speak(u);
  };

  return (
    <>
      <TopBar title={video.title} subtitle={video.description} back="/training" actions={<ThemeToggle />} />
      <div className="page">
        <div className="page__inner grid grid--3" style={{ alignItems: 'start' }}>
          <div className="stack" style={{ gridColumn: 'span 2' }}>
            <div className="player">
              <video ref={videoRef} controls playsInline poster={video.poster} onTimeUpdate={(e: React.SyntheticEvent<HTMLVideoElement>) => setTime(e.currentTarget.currentTime)} data-testid="training-video" crossOrigin="anonymous">
                <source src={video.video} type="video/mp4" />
                {video.videoWebm ? <source src={video.videoWebm} type="video/webm" /> : null}
                <track kind="captions" src={video.captions} srcLang="en" label="English" default />
              </video>
            </div>
            <div className="row row--wrap">
              {video.chapters.map((c) => (
                <Button key={c.time} size="sm" variant="tonal" onClick={() => videoRef.current && ((videoRef.current.currentTime = c.time), videoRef.current.play())}>
                  {fmtTime(c.time)} · {c.title}
                </Button>
              ))}
            </div>
            {guide.data ? (
              <Card title="Written guide">
                <div className="prose" dangerouslySetInnerHTML={{ __html: renderMarkdown(guide.data) }} />
              </Card>
            ) : null}
          </div>
          <div className="stack">
            <Card title="Transcript" action={'speechSynthesis' in window ? <IconButton icon={speaking ? 'stop' : 'volume'} label={speaking ? 'Stop reading' : 'Read aloud'} onClick={readAloud} data-testid="read-aloud" /> : undefined}>
              <div className="transcript" data-testid="transcript">
                {cues.map((c, i) => (
                  <button key={i} type="button" className="transcript__cue" aria-current={i === current} onClick={() => videoRef.current && ((videoRef.current.currentTime = c.start), videoRef.current.play())}>
                    <span className="transcript__time">{fmtTime(c.start)}</span>
                    <span className="body-md">{c.text}</span>
                  </button>
                ))}
                {!cues.length ? <span className="muted body-sm">No transcript available.</span> : null}
              </div>
            </Card>
            {next ? (
              <Card title="Up next" onClick={() => navigate(`/training/${next.id}`)}>
                <div className="row">
                  <Icon name="play" />
                  <div>
                    <div className="title-sm">{next.title}</div>
                    <div className="body-sm muted">{fmtTime(next.duration)}</div>
                  </div>
                </div>
              </Card>
            ) : null}
            <Card title="More">
              <div className="stack" style={{ gap: 4 }}>
                {all.map((v) => (
                  <Link key={v.id} to={`/training/${v.id}`} className="list-item" aria-selected={v.id === video.id}>
                    <span className="label-md muted" style={{ width: 36 }}>
                      {fmtTime(v.duration)}
                    </span>
                    <span className="body-md">{v.title}</span>
                  </Link>
                ))}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}

function GuidePage({ guide }: { guide: { id: string; title: string; path: string } }) {
  const md = useAsync(() => fetch(guide.path).then((r) => r.text()), [guide.path]);
  return (
    <>
      <TopBar title={guide.title} back="/training" actions={<ThemeToggle />} />
      <div className="page">
        <div className="page__inner">
          <Card>{md.data ? <div className="prose" data-testid="guide-body" dangerouslySetInnerHTML={{ __html: renderMarkdown(md.data) }} /> : <Loading />}</Card>
        </div>
      </div>
    </>
  );
}
