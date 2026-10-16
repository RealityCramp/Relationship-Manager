import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export interface Ctx {
  req: IncomingMessage;
  res: ServerResponse;
  method: string;
  path: string;
  params: Record<string, string>;
  query: URLSearchParams;
  cookies: Record<string, string>;
  body: unknown;
  /** populated by auth middleware */
  userId?: string;
  state: Record<string, unknown>;
}

export type Handler = (ctx: Ctx) => Promise<unknown> | unknown;

interface Route {
  method: string;
  pattern: RegExp;
  keys: string[];
  handler: Handler;
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.vtt': 'text/vtt; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json',
};

export class Router {
  private routes: Route[] = [];
  constructor(private prefix = '') {}

  add(method: string, path: string, handler: Handler) {
    const keys: string[] = [];
    const pattern = new RegExp(
      '^' +
        (this.prefix + path).replace(/\/:([a-zA-Z]+)/g, (_, k: string) => {
          keys.push(k);
          return '/([^/]+)';
        }) +
        '/?$',
    );
    this.routes.push({ method, pattern, keys, handler });
    return this;
  }
  get = (p: string, h: Handler) => this.add('GET', p, h);
  post = (p: string, h: Handler) => this.add('POST', p, h);
  put = (p: string, h: Handler) => this.add('PUT', p, h);
  patch = (p: string, h: Handler) => this.add('PATCH', p, h);
  delete = (p: string, h: Handler) => this.add('DELETE', p, h);

  match(method: string, path: string): { route: Route; params: Record<string, string> } | null {
    for (const route of this.routes) {
      if (route.method !== method) continue;
      const m = route.pattern.exec(path);
      if (!m) continue;
      const params: Record<string, string> = {};
      route.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
      return { route, params };
    }
    return null;
  }
}

export interface ServerOptions {
  router: Router;
  staticDir?: string;
  /** Called before every API route (auth). May set ctx.userId. */
  before?: (ctx: Ctx) => Promise<void> | void;
  maxBodyBytes?: number;
  logger?: (line: string) => void;
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

export async function readBody(req: IncomingMessage, max: number): Promise<unknown> {
  const type = req.headers['content-type'] ?? '';
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > max) throw new HttpError(413, `Request body larger than ${Math.round(max / 1024 / 1024)} MB`);
    chunks.push(chunk as Buffer);
  }
  if (!chunks.length) return undefined;
  const text = Buffer.concat(chunks).toString('utf8');
  if (type.includes('application/json')) {
    try {
      return JSON.parse(text);
    } catch {
      throw new HttpError(400, 'Invalid JSON body');
    }
  }
  return text;
}

export function sendJson(res: ServerResponse, status: number, data: unknown, headers: Record<string, string> = {}) {
  const body = JSON.stringify(data ?? null);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers });
  res.end(body);
}

function serveStatic(root: string, urlPath: string, res: ServerResponse, req?: IncomingMessage): boolean {
  const safe = normalize(decodeURIComponent(urlPath)).replace(/^(\.\.[/\\])+/, '');
  let file = join(root, safe);
  if (!file.startsWith(root)) return false;
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!existsSync(file) || !statSync(file).isFile()) return false;
  const ext = extname(file).toLowerCase();
  const immutable = /\.[a-f0-9]{8,}\.(js|css)$/i.test(file) || /\/assets\//.test(file);
  const size = statSync(file).size;
  const headers: Record<string, string | number> = {
    'content-type': MIME[ext] ?? 'application/octet-stream',
    'cache-control': immutable ? 'public, max-age=31536000, immutable' : ext === '.html' || file.endsWith('sw.js') ? 'no-cache' : 'public, max-age=3600',
    'accept-ranges': 'bytes',
  };
  // HTTP Range requests so <video> can seek and resume.
  const range = req?.headers.range;
  const m = range ? /^bytes=(\d*)-(\d*)$/.exec(range) : null;
  if (m && (m[1] || m[2])) {
    let start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
    let end = m[1] && m[2] ? Number(m[2]) : size - 1;
    if (!m[1]) end = size - 1;
    if (start >= size || end >= size || start > end) {
      res.writeHead(416, { 'content-range': `bytes */${size}` });
      res.end();
      return true;
    }
    res.writeHead(206, { ...headers, 'content-range': `bytes ${start}-${end}/${size}`, 'content-length': end - start + 1 });
    if (req?.method === 'HEAD') res.end();
    else createReadStream(file, { start, end }).pipe(res);
    return true;
  }
  res.writeHead(200, { ...headers, 'content-length': size });
  if (req?.method === 'HEAD') res.end();
  else createReadStream(file).pipe(res);
  return true;
}

export function createApp(opts: ServerOptions) {
  const max = opts.maxBodyBytes ?? 256 * 1024 * 1024;
  const log = opts.logger ?? ((l: string) => console.log(l));
  return createServer(async (req, res) => {
    const started = Date.now();
    const url = new URL(req.url ?? '/', 'http://localhost');
    const method = (req.method ?? 'GET').toUpperCase();
    const path = url.pathname;
    try {
      if (path.startsWith('/api/')) {
        if (method === 'OPTIONS') {
          res.writeHead(204, corsHeaders(req));
          res.end();
          return;
        }
        const matched = opts.router.match(method, path);
        if (!matched) throw new HttpError(404, `No route ${method} ${path}`);
        const ctx: Ctx = {
          req,
          res,
          method,
          path,
          params: matched.params,
          query: url.searchParams,
          cookies: parseCookies(req.headers.cookie),
          body: await readBody(req, max),
          state: {},
        };
        if (opts.before) await opts.before(ctx);
        const result = await matched.route.handler(ctx);
        if (!res.writableEnded) sendJson(res, result === undefined ? 204 : 200, result, corsHeaders(req));
      } else if (opts.staticDir) {
        if (!serveStatic(opts.staticDir, path, res, req)) {
          // SPA fallback
          if (!serveStatic(opts.staticDir, '/index.html', res)) {
            res.writeHead(404, { 'content-type': 'text/plain' });
            res.end('Web app not built. Run `npm run build`.');
          }
        }
      } else {
        res.writeHead(404);
        res.end();
      }
    } catch (err) {
      const e = err instanceof HttpError ? err : new HttpError(500, (err as Error).message || 'Internal error');
      if (e.status >= 500) console.error(err);
      if (!res.writableEnded) sendJson(res, e.status, { error: e.message, details: e.details ?? null }, corsHeaders(req));
    } finally {
      if (path.startsWith('/api/')) log(`${method} ${path} ${res.statusCode} ${Date.now() - started}ms`);
    }
  });
}

function corsHeaders(req: IncomingMessage): Record<string, string> {
  const origin = req.headers.origin;
  if (!origin) return {};
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-credentials': 'true',
    'access-control-allow-headers': 'content-type, authorization',
    'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    vary: 'Origin',
  };
}

/** Tiny runtime validation helpers (no zod needed). */
export const v = {
  str(x: unknown, name: string, opts: { min?: number; max?: number; optional?: boolean } = {}): string {
    if (x === undefined || x === null) {
      if (opts.optional) return '';
      throw new HttpError(400, `${name} is required`);
    }
    if (typeof x !== 'string') throw new HttpError(400, `${name} must be a string`);
    const s = x.trim();
    if (opts.min !== undefined && s.length < opts.min) throw new HttpError(400, `${name} must be at least ${opts.min} characters`);
    if (opts.max !== undefined && s.length > opts.max) throw new HttpError(400, `${name} must be at most ${opts.max} characters`);
    return s;
  },
  strArr(x: unknown, name: string): string[] {
    if (x === undefined || x === null) return [];
    if (!Array.isArray(x) || !x.every((i) => typeof i === 'string')) throw new HttpError(400, `${name} must be an array of strings`);
    return x.map((s) => s.trim()).filter(Boolean);
  },
  oneOf<T extends string>(x: unknown, name: string, values: readonly T[]): T {
    if (typeof x !== 'string' || !values.includes(x as T)) throw new HttpError(400, `${name} must be one of ${values.join(', ')}`);
    return x as T;
  },
  num(x: unknown, name: string, def?: number): number {
    if (x === undefined || x === null) {
      if (def !== undefined) return def;
      throw new HttpError(400, `${name} is required`);
    }
    const n = Number(x);
    if (Number.isNaN(n)) throw new HttpError(400, `${name} must be a number`);
    return n;
  },
  obj(x: unknown, name = 'body'): Record<string, unknown> {
    if (!x || typeof x !== 'object' || Array.isArray(x)) throw new HttpError(400, `${name} must be an object`);
    return x as Record<string, unknown>;
  },
  email(x: unknown, name = 'email'): string {
    const s = v.str(x, name).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) throw new HttpError(400, `${name} must be a valid email address`);
    return s;
  },
};
