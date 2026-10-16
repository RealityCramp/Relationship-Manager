import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from './app.ts';

const here = dirname(fileURLToPath(import.meta.url));
// Works both from source (server/src) and from the bundled dist/server/server.js
const root = existsSync(resolve(here, '../../web')) ? resolve(here, '../..') : resolve(here, '../..');
const dataDir = resolve(process.env.DATA_DIR ?? resolve(root, 'data'));
const staticDir = process.env.STATIC_DIR ?? resolve(root, 'dist/web');
const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? '0.0.0.0';

const { server } = buildApp({ dbPath: process.env.DB_PATH ?? resolve(dataDir, 'relationship-manager.db'), dataDir, staticDir });

server.listen(port, host, () => {
  console.log(`Relationship Manager API listening on http://localhost:${port}`);
  console.log(`  data: ${dataDir}`);
  console.log(`  web:  ${existsSync(staticDir) ? staticDir : '(not built — run npm run build)'}`);
});
