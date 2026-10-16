import type { Page } from 'playwright';

/**
 * Helpers for recording narrated walkthroughs: an on-screen cursor, caption overlay,
 * title cards and a scene runner that collects WebVTT cue timings.
 */

export interface Cue {
  start: number;
  end: number;
  text: string;
}

export interface Chapter {
  time: number;
  title: string;
}

export class Recorder {
  cues: Cue[] = [];
  chapters: Chapter[] = [];
  private t0 = Date.now();
  private current: { text: string; start: number } | null = null;

  constructor(public page: Page) {}

  now() {
    return (Date.now() - this.t0) / 1000;
  }

  /** Installs the overlay elements (cursor + caption). Safe to call after every navigation. */
  async install() {
    await this.page.evaluate(() => {
      if (document.getElementById('__rec_cursor')) return;
      const style = document.createElement('style');
      style.textContent = `
        #__rec_cursor { position: fixed; z-index: 2147483000; width: 22px; height: 22px; pointer-events: none; transform: translate(-3px,-2px); transition: left 420ms cubic-bezier(.2,0,0,1), top 420ms cubic-bezier(.2,0,0,1); left: 50vw; top: 50vh; filter: drop-shadow(0 2px 4px rgba(0,0,0,.35)); }
        #__rec_cursor.click::after { content:''; position:absolute; left:-10px; top:-10px; width:40px; height:40px; border-radius:50%; border:3px solid #1a73e8; animation: __rec_ping 450ms ease-out forwards; }
        @keyframes __rec_ping { from { transform: scale(.3); opacity: .9 } to { transform: scale(1.3); opacity: 0 } }
        #__rec_caption { pointer-events: none; position: fixed; z-index: 2147482999; left: 50%; bottom: 36px; transform: translateX(-50%); max-width: 72vw; background: rgba(20,22,30,.86); color: #fff; font: 500 22px/30px 'Google Sans Flex','Roboto Flex',Roboto,system-ui,sans-serif; padding: 14px 24px; border-radius: 16px; letter-spacing: .1px; box-shadow: 0 6px 24px rgba(0,0,0,.35); backdrop-filter: blur(8px); opacity: 0; transition: opacity 250ms; text-align: center; }
        #__rec_caption.show { opacity: 1; }
        #__rec_title { position: fixed; inset: 0; z-index: 2147483001; display: grid; place-items: center; background: linear-gradient(135deg, #0b57d0, #6750a4); color: #fff; font-family: 'Google Sans Flex','Roboto Flex',Roboto,system-ui,sans-serif; opacity: 0; transition: opacity 400ms; pointer-events: none; }
        #__rec_title.show { opacity: 1; }
        #__rec_title h1 { font-size: 56px; line-height: 1.15; font-weight: 500; margin: 0 0 12px; letter-spacing: -.5px; }
        #__rec_title p { font-size: 22px; line-height: 1.4; opacity: .9; margin: 0; }
        #__rec_title .logo { width: 88px; height: 88px; border-radius: 24px; margin-bottom: 28px; box-shadow: 0 8px 32px rgba(0,0,0,.3); }
      `;
      document.head.appendChild(style);
      const cursor = document.createElement('div');
      cursor.id = '__rec_cursor';
      cursor.innerHTML = `<svg viewBox="0 0 24 24" width="22" height="22"><path d="M5.5 3.21V20.8c0 .45.54.67.85.35l4.86-4.86a.5.5 0 0 1 .35-.15h6.87c.45 0 .67-.54.35-.85L6.35 2.85a.5.5 0 0 0-.85.36z" fill="#fff" stroke="#202124" stroke-width="1.5" stroke-linejoin="round"/></svg>`;
      document.body.appendChild(cursor);
      const cap = document.createElement('div');
      cap.id = '__rec_caption';
      document.body.appendChild(cap);
      const title = document.createElement('div');
      title.id = '__rec_title';
      document.body.appendChild(title);
    });
  }

  async title(heading: string, sub: string, holdMs = 2600) {
    await this.install();
    await this.page.evaluate(
      ([h, s]) => {
        const el = document.getElementById('__rec_title')!;
        el.innerHTML = `<div style="text-align:center"><img class="logo" src="/icons/icon.svg" alt=""><h1>${h}</h1><p>${s}</p></div>`;
        el.classList.add('show');
      },
      [heading, sub],
    );
    await this.page.waitForTimeout(holdMs);
    await this.page.evaluate(() => document.getElementById('__rec_title')!.classList.remove('show'));
    await this.page.waitForTimeout(450);
  }

  async chapter(title: string) {
    this.chapters.push({ time: Math.max(0, Math.round(this.now())), title });
  }

  /** Shows a caption and records it as a VTT cue until the next caption. */
  async say(text: string, holdMs?: number) {
    await this.install();
    this.endCue();
    this.current = { text, start: this.now() };
    await this.page.evaluate((t) => {
      const el = document.getElementById('__rec_caption')!;
      el.textContent = t;
      el.classList.add('show');
    }, text);
    // reading time: ~2.9 words/second with a floor
    const words = text.split(/\s+/).length;
    await this.page.waitForTimeout(holdMs ?? Math.max(1800, Math.round((words / 2.9) * 1000)));
  }

  private endCue() {
    if (this.current) {
      this.cues.push({ start: this.current.start, end: this.now(), text: this.current.text });
      this.current = null;
    }
  }

  async pause(ms: number) {
    await this.page.waitForTimeout(ms);
  }

  async finish() {
    this.endCue();
    await this.page.evaluate(() => document.getElementById('__rec_caption')?.classList.remove('show')).catch(() => undefined);
    await this.page.waitForTimeout(600);
  }

  /** Moves the fake cursor to an element and clicks it. */
  async click(selector: string, opts: { delay?: number; position?: { x: number; y: number } } = {}) {
    const loc = this.page.locator(selector).first();
    await loc.waitFor({ state: 'visible', timeout: 15000 });
    await loc.scrollIntoViewIfNeeded();
    const box = (await loc.boundingBox())!;
    const x = opts.position ? box.x + opts.position.x : box.x + box.width / 2;
    const y = opts.position ? box.y + opts.position.y : box.y + box.height / 2;
    await this.moveCursor(x, y);
    await this.page.waitForTimeout(opts.delay ?? 250);
    await this.page.evaluate(() => {
      const c = document.getElementById('__rec_cursor');
      c?.classList.remove('click');
      void c?.offsetWidth;
      c?.classList.add('click');
    });
    await this.page.mouse.click(x, y);
    await this.page.waitForTimeout(350);
    await this.install();
  }

  async moveCursor(x: number, y: number) {
    await this.install();
    await this.page.evaluate(
      ([x, y]) => {
        const c = document.getElementById('__rec_cursor')!;
        c.style.left = `${x}px`;
        c.style.top = `${y}px`;
      },
      [x, y],
    );
    await this.page.mouse.move(x, y);
    await this.page.waitForTimeout(450);
  }

  async hover(selector: string) {
    const loc = this.page.locator(selector).first();
    const box = (await loc.boundingBox())!;
    await this.moveCursor(box.x + box.width / 2, box.y + box.height / 2);
  }

  /** Types into a field one character at a time so it reads naturally on video. */
  async type(selector: string, text: string, perChar = 45) {
    await this.click(selector);
    await this.page.locator(selector).first().fill('');
    await this.page.keyboard.type(text, { delay: perChar });
    await this.page.waitForTimeout(300);
  }

  async goto(path: string) {
    await this.page.goto(path);
    await this.page.waitForLoadState('networkidle').catch(() => undefined);
    await this.install();
    await this.page.waitForTimeout(500);
  }

  async scroll(dy: number) {
    await this.page.mouse.wheel(0, dy);
    await this.page.waitForTimeout(600);
  }
}

export function toVtt(cues: Cue[]): string {
  const fmt = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = (s % 60).toFixed(3).padStart(6, '0');
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${sec}`;
  };
  return ['WEBVTT', '', ...cues.map((c, i) => `${i + 1}\n${fmt(c.start)} --> ${fmt(Math.max(c.start + 0.5, c.end))}\n${c.text}\n`)].join('\n');
}
