import { connect as tlsConnect, type TLSSocket } from 'node:tls';
import { parseHeaders, parseAddresses, decodeRfc2047, type MailMessage } from '@shared/importers/email.ts';

/**
 * A deliberately small IMAP client: enough to log in, find the inbox and sent folders,
 * and fetch message headers. No external dependencies.
 */
export class ImapClient {
  private socket!: TLSSocket;
  private buffer = Buffer.alloc(0);
  private tagCounter = 0;
  private waiters: { tag: string; resolve: (lines: string[]) => void; reject: (e: Error) => void; lines: string[] }[] = [];

  constructor(
    private host: string,
    private port = 993,
  ) {}

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = tlsConnect({ host: this.host, port: this.port, servername: this.host }, () => undefined);
      const onGreeting = (chunk: Buffer) => {
        if (chunk.toString().startsWith('* OK') || chunk.toString().startsWith('* PREAUTH')) {
          this.socket.off('data', onGreeting);
          this.socket.on('data', (d: Buffer) => this.onData(d));
          resolve();
        }
      };
      this.socket.on('data', onGreeting);
      this.socket.once('error', reject);
      this.socket.setTimeout(60_000, () => this.socket.destroy(new Error('IMAP timeout')));
    });
  }

  private onData(chunk: Buffer) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    // Split into logical lines, honouring {n} literals.
    for (;;) {
      const nl = this.buffer.indexOf('\r\n');
      if (nl < 0) return;
      let line = this.buffer.subarray(0, nl).toString('utf8');
      let consumed = nl + 2;
      let lit = /\{(\d+)\}$/.exec(line);
      while (lit) {
        const n = Number(lit[1]);
        if (this.buffer.length < consumed + n) return; // wait for the whole literal
        const literal = this.buffer.subarray(consumed, consumed + n).toString('utf8');
        consumed += n;
        const next = this.buffer.indexOf('\r\n', consumed);
        if (next < 0) return;
        line = line.slice(0, lit.index) + '\u0000' + literal + '\u0000' + this.buffer.subarray(consumed, next).toString('utf8');
        consumed = next + 2;
        lit = /\{(\d+)\}$/.exec(line);
      }
      this.buffer = this.buffer.subarray(consumed);
      this.handleLine(line);
    }
  }

  private handleLine(line: string) {
    const w = this.waiters[0];
    if (!w) return;
    if (line.startsWith(w.tag + ' ')) {
      this.waiters.shift();
      const status = line.slice(w.tag.length + 1);
      if (status.startsWith('OK')) w.resolve(w.lines);
      else w.reject(new Error(status.replace(/^(NO|BAD)\s*/, '').trim() || 'IMAP command failed'));
    } else w.lines.push(line);
  }

  command(cmd: string): Promise<string[]> {
    const tag = `A${String(++this.tagCounter).padStart(4, '0')}`;
    return new Promise((resolve, reject) => {
      this.waiters.push({ tag, resolve, reject, lines: [] });
      this.socket.write(`${tag} ${cmd}\r\n`);
    });
  }

  async login(user: string, pass: string) {
    const q = (s: string) => `"${s.replace(/(["\\])/g, '\\$1')}"`;
    await this.command(`LOGIN ${q(user)} ${q(pass)}`);
  }

  async listFolders(): Promise<{ name: string; flags: string[] }[]> {
    const lines = await this.command('LIST "" "*"');
    return lines
      .map((l) => /^\* LIST \(([^)]*)\) (?:"[^"]*"|NIL) (?:"((?:[^"\\]|\\.)*)"|(\S+))/.exec(l))
      .filter((m): m is RegExpExecArray => !!m)
      .map((m) => ({ flags: m[1].split(' ').filter(Boolean), name: (m[2] ?? m[3]).replace(/\\"/g, '"') }));
  }

  async select(folder: string): Promise<number> {
    const lines = await this.command(`SELECT "${folder.replace(/"/g, '\\"')}"`);
    const exists = lines.map((l) => /^\* (\d+) EXISTS/.exec(l)).find(Boolean);
    return exists ? Number(exists[1]) : 0;
  }

  async searchSince(date: Date): Promise<number[]> {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const d = `${date.getUTCDate()}-${months[date.getUTCMonth()]}-${date.getUTCFullYear()}`;
    const lines = await this.command(`SEARCH SINCE ${d}`);
    return lines.flatMap((l) => (l.startsWith('* SEARCH') ? l.slice(8).trim().split(/\s+/).filter(Boolean).map(Number) : []));
  }

  /** Fetches headers for a set of sequence numbers, in batches. */
  async fetchHeaders(seqs: number[], onProgress?: (done: number) => void): Promise<MailMessage[]> {
    const out: MailMessage[] = [];
    const sorted = [...seqs].sort((a, b) => a - b);
    for (let i = 0; i < sorted.length; i += 200) {
      const batch = sorted.slice(i, i + 200);
      const set = compressSet(batch);
      const lines = await this.command(`FETCH ${set} (BODY.PEEK[HEADER.FIELDS (FROM TO CC SUBJECT DATE MESSAGE-ID IN-REPLY-TO REFERENCES)])`);
      for (const l of lines) {
        const lit = l.indexOf('\u0000');
        if (lit < 0) continue;
        const headerText = l.slice(lit + 1, l.lastIndexOf('\u0000'));
        const h = parseHeaders(headerText);
        const from = parseAddresses(h.get('from') ?? '');
        const id = (h.get('message-id') ?? '').replace(/^<|>$/g, '') || `imap:${this.host}:${i}:${out.length}`;
        const date = new Date((h.get('date') ?? '').replace(/\s*\([^)]*\)\s*$/, ''));
        out.push({
          id,
          from,
          to: parseAddresses(h.get('to') ?? ''),
          cc: parseAddresses(h.get('cc') ?? ''),
          subject: decodeRfc2047(h.get('subject') ?? ''),
          date: Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString(),
          inReplyTo: h.get('in-reply-to')?.trim().split(/\s+/)[0]?.replace(/^<|>$/g, '') ?? null,
          references: (h.get('references') ?? '').split(/\s+/).filter(Boolean).map((s) => s.replace(/^<|>$/g, '')),
        });
      }
      onProgress?.(Math.min(sorted.length, i + 200));
    }
    return out;
  }

  async logout() {
    try {
      await this.command('LOGOUT');
    } catch {
      /* ignore */
    }
    this.socket.destroy();
  }
}

function compressSet(nums: number[]): string {
  const parts: string[] = [];
  let start = nums[0];
  let prev = nums[0];
  for (const n of nums.slice(1)) {
    if (n === prev + 1) {
      prev = n;
      continue;
    }
    parts.push(start === prev ? `${start}` : `${start}:${prev}`);
    start = prev = n;
  }
  parts.push(start === prev ? `${start}` : `${start}:${prev}`);
  return parts.join(',');
}

export interface ImapOptions {
  host: string;
  port?: number;
  user: string;
  password: string;
  /** How far back to scan. Default 730 days. */
  days?: number;
  onProgress?: (msg: string) => void;
}

/** Connects, scans INBOX + the sent folder, returns header-only messages. */
export async function fetchImapMessages(opts: ImapOptions): Promise<MailMessage[]> {
  const client = new ImapClient(opts.host, opts.port ?? 993);
  await client.connect();
  try {
    await client.login(opts.user, opts.password);
    const folders = await client.listFolders();
    const sent = folders.find((f) => f.flags.some((fl) => /\\Sent/i.test(fl))) ?? folders.find((f) => /sent/i.test(f.name));
    const targets = ['INBOX', ...(sent ? [sent.name] : [])];
    const since = new Date(Date.now() - (opts.days ?? 730) * 86400000);
    const all: MailMessage[] = [];
    for (const folder of targets) {
      const count = await client.select(folder);
      if (!count) continue;
      const seqs = await client.searchSince(since);
      opts.onProgress?.(`${folder}: ${seqs.length} messages`);
      all.push(...(await client.fetchHeaders(seqs)));
    }
    return all;
  } finally {
    await client.logout();
  }
}

export async function testImap(opts: Pick<ImapOptions, 'host' | 'port' | 'user' | 'password'>): Promise<{ folders: string[] }> {
  const client = new ImapClient(opts.host, opts.port ?? 993);
  await client.connect();
  try {
    await client.login(opts.user, opts.password);
    return { folders: (await client.listFolders()).map((f) => f.name) };
  } finally {
    await client.logout();
  }
}
