/**
 * Builds web/public/training/index.json from the recorded videos and the guides in docs/training,
 * copies the guides so the app can serve them, and (optionally) muxes narration audio:
 * drop `training/narration/<video-id>.mp3` (or .m4a/.wav) next to the scripts and run
 * `npm run training:build` — the audio is added to the MP4 so the in-app player has a voice track.
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { VIDEOS } from './videos.ts';

const root = resolve(import.meta.dirname, '..');
const publicDir = resolve(root, 'web/public/training');
const guidesSrc = resolve(root, 'docs/training');
const narrationDir = resolve(root, 'training/narration');

export interface GuideMeta {
  id: string;
  title: string;
  description: string;
  path: string;
}

function guideMeta(file: string): GuideMeta {
  const md = readFileSync(resolve(guidesSrc, file), 'utf8');
  const title = /^#\s+(.+)$/m.exec(md)?.[1] ?? file;
  const description = md.split('\n').find((l) => l.trim() && !l.startsWith('#'))?.trim() ?? '';
  return { id: file.replace(/\.md$/, ''), title, description: description.slice(0, 160), path: `/training/guides/${file}` };
}

export function buildIndex() {
  mkdirSync(resolve(publicDir, 'guides'), { recursive: true });
  const guides = existsSync(guidesSrc) ? readdirSync(guidesSrc).filter((f) => f.endsWith('.md')).sort() : [];
  for (const g of guides) copyFileSync(resolve(guidesSrc, g), resolve(publicDir, 'guides', g));
  const videos = VIDEOS.filter((v) => existsSync(resolve(publicDir, `${v.id}.mp4`))).map((v) => {
    const mp4 = resolve(publicDir, `${v.id}.mp4`);
    const webm = resolve(publicDir, `${v.id}.webm`);
    const narration = existsSync(narrationDir) ? readdirSync(narrationDir).find((f) => f.startsWith(v.id + '.') && /\.(mp3|m4a|wav|aac)$/.test(f)) : undefined;
    if (narration) {
      muxAudio(mp4, resolve(narrationDir, narration));
      if (existsSync(webm)) muxAudio(webm, resolve(narrationDir, narration), 'libopus');
    }
    const duration = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', mp4]).toString().trim());
    const chaptersFile = resolve(publicDir, `${v.id}.chapters.json`);
    const chapters = existsSync(chaptersFile) ? (JSON.parse(readFileSync(chaptersFile, 'utf8')) as { time: number; title: string }[]) : [];
    return {
      id: v.id,
      title: v.title,
      description: v.description,
      level: v.level,
      duration: Math.round(duration),
      video: `/training/${v.id}.mp4`,
      videoWebm: existsSync(resolve(publicDir, `${v.id}.webm`)) ? `/training/${v.id}.webm` : null,
      captions: `/training/${v.id}.vtt`,
      poster: `/training/${v.id}.jpg`,
      guide: `/training/guides/${v.guide}.md`,
      chapters,
      narration: !!narration,
    };
  });
  const index = { generatedAt: new Date().toISOString(), videos, guides: guides.map(guideMeta) };
  writeFileSync(resolve(publicDir, 'index.json'), JSON.stringify(index, null, 2));
  console.log(`training index: ${videos.length} videos, ${guides.length} guides`);
  return index;
}

function muxAudio(mp4: string, audio: string, codec = 'aac') {
  const tmp = mp4.replace(/\.(mp4|webm)$/, '.tmp.$1');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', mp4, '-i', audio, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', codec, '-shortest', tmp]);
  copyFileSync(tmp, mp4);
  execFileSync('rm', ['-f', tmp]);
  console.log(`  muxed narration into ${mp4}`);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop()!)) buildIndex();
