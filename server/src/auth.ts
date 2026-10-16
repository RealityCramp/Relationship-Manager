import { createHmac, randomBytes, scryptSync, timingSafeEqual, createCipheriv, createDecipheriv, createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { HttpError, type Ctx } from './http.ts';

/* ---------- secrets ---------- */

export interface Secrets {
  jwtSecret: string;
  encryptionKey: Buffer;
}

/** Loads JWT/encryption secrets from env or a generated file in the data dir, so restarts keep sessions valid. */
export function loadSecrets(dataDir: string): Secrets {
  const file = join(dataDir, '.secrets.json');
  let stored: { jwtSecret?: string; encryptionKey?: string } = {};
  if (existsSync(file)) stored = JSON.parse(readFileSync(file, 'utf8'));
  const jwtSecret = process.env.JWT_SECRET || stored.jwtSecret || randomBytes(32).toString('hex');
  const encHex = process.env.ENCRYPTION_KEY || stored.encryptionKey || randomBytes(32).toString('hex');
  if (!process.env.JWT_SECRET || !process.env.ENCRYPTION_KEY) {
    mkdirSync(dataDir, { recursive: true });
    if (stored.jwtSecret !== jwtSecret || stored.encryptionKey !== encHex) writeFileSync(file, JSON.stringify({ jwtSecret, encryptionKey: encHex }), { mode: 0o600 });
  }
  return { jwtSecret, encryptionKey: createHash('sha256').update(encHex).digest() };
}

/* ---------- passwords ---------- */

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [, saltHex, hashHex] = stored.split('$');
  if (!saltHex || !hashHex) return false;
  const hash = scryptSync(password, Buffer.from(saltHex, 'hex'), 64, { N: 16384, r: 8, p: 1 });
  const expected = Buffer.from(hashHex, 'hex');
  return hash.length === expected.length && timingSafeEqual(hash, expected);
}

/* ---------- tokens (HS256 JWT) ---------- */

const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64url');

export function signToken(payload: Record<string, unknown>, secret: string, ttlSeconds = 60 * 60 * 24 * 30): string {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify({ ...payload, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + ttlSeconds }));
  const sig = createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${sig}`;
}

export function verifyToken(token: string, secret: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const expected = createHmac('sha256', secret).update(`${parts[0]}.${parts[1]}`).digest();
  const actual = Buffer.from(parts[2], 'base64url');
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as Record<string, unknown>;
    if (typeof payload.exp === 'number' && payload.exp < Date.now() / 1000) return null;
    return payload;
  } catch {
    return null;
  }
}

export const COOKIE = 'rm_session';

export function setSessionCookie(ctx: Ctx, token: string | null) {
  const secure = ctx.req.headers['x-forwarded-proto'] === 'https';
  const base = `${COOKIE}=${token ?? ''}; Path=/; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;
  ctx.res.setHeader('set-cookie', token ? `${base}; Max-Age=${60 * 60 * 24 * 30}` : `${base}; Max-Age=0`);
}

export function requireUser(ctx: Ctx): string {
  if (!ctx.userId) throw new HttpError(401, 'Sign in required');
  return ctx.userId;
}

/* ---------- field encryption (AES-256-GCM) for API keys ---------- */

export function encrypt(plain: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return `${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${enc.toString('base64url')}`;
}

export function decrypt(blob: string, key: Buffer): string {
  if (!blob) return '';
  const [ivB, tagB, dataB] = blob.split('.');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagB, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(dataB, 'base64url')), decipher.final()]).toString('utf8');
}
