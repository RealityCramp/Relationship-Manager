import { mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

/** Starts every run from an empty database. */
export default function globalSetup() {
  const dir = resolve(process.cwd(), 'e2e/.tmp');
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
}
