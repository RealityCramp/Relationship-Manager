// Builds the web app (PWA) and the server bundle with esbuild. No bundler config files needed.
import * as esbuild from 'esbuild';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(import.meta.url), '../..');
const outWeb = resolve(root, 'dist/web');
const outServer = resolve(root, 'dist/server');
const watch = process.argv.includes('--watch');
const dev = watch || process.argv.includes('--dev');

export const webOptions = {
  entryPoints: [resolve(root, 'web/src/main.tsx')],
  bundle: true,
  format: 'esm',
  splitting: false,
  sourcemap: dev ? 'inline' : true,
  minify: !dev,
  target: ['es2022', 'chrome110', 'safari16', 'firefox110'],
  outdir: outWeb,
  entryNames: dev ? 'assets/[name]' : 'assets/[name].[hash]',
  assetNames: 'assets/[name].[hash]',
  loader: { '.svg': 'file', '.png': 'file', '.woff2': 'file' },
  metafile: true,
  define: { 'process.env.NODE_ENV': dev ? '"development"' : '"production"', __APP_VERSION__: JSON.stringify(JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).version) },
  jsx: 'automatic',
  logLevel: 'info',
  alias: { '@shared': resolve(root, 'shared/src') },
};

function listFiles(dir, base = dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...listFiles(p, base));
    else out.push('/' + relative(base, p).replace(/\\/g, '/'));
  }
  return out;
}

export async function buildWeb(result) {
  mkdirSync(outWeb, { recursive: true });
  cpSync(resolve(root, 'web/public'), outWeb, { recursive: true });
  const outputs = Object.keys(result.metafile.outputs).map((p) => '/' + relative(outWeb, resolve(root, p)).replace(/\\/g, '/'));
  const js = outputs.find((p) => p.endsWith('.js') && !p.endsWith('.map'));
  const css = outputs.find((p) => p.endsWith('.css'));
  let html = readFileSync(resolve(root, 'web/index.html'), 'utf8');
  html = html.replace('%SCRIPT%', js).replace('%STYLE%', css ? `<link rel="stylesheet" href="${css}">` : '');
  writeFileSync(resolve(outWeb, 'index.html'), html);
  // Service worker with a precache manifest of everything in dist/web (except large training media, which is cached on demand).
  const precache = listFiles(outWeb).filter((p) => !p.endsWith('.map') && !p.startsWith('/training/') && p !== '/sw.js');
  const version = Date.now().toString(36);
  await esbuild.build({
    entryPoints: [resolve(root, 'web/src/sw.ts')],
    bundle: true,
    format: 'iife',
    minify: !dev,
    outfile: resolve(outWeb, 'sw.js'),
    define: { __PRECACHE__: JSON.stringify(precache), __SW_VERSION__: JSON.stringify(version) },
    target: ['es2022'],
    logLevel: 'silent',
  });
}

export async function buildServer() {
  await esbuild.build({
    entryPoints: [resolve(root, 'server/src/server.ts')],
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: ['node22'],
    outfile: resolve(outServer, 'server.js'),
    sourcemap: true,
    alias: { '@shared': resolve(root, 'shared/src') },
    banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
    logLevel: 'info',
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  if (existsSync(outWeb)) rmSync(outWeb, { recursive: true, force: true });
  const result = await esbuild.build(webOptions);
  await buildWeb(result);
  await buildServer();
  console.log('Build complete → dist/web and dist/server');
}
