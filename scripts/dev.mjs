// Development: rebuilds the web app on change and runs the API with auto-restart, on one port.
import * as esbuild from 'esbuild';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildWeb, webOptions } from './build.mjs';

const root = resolve(fileURLToPath(import.meta.url), '../..');
const port = process.env.PORT ?? '8787';

const ctx = await esbuild.context({
  ...webOptions,
  minify: false,
  sourcemap: 'inline',
  entryNames: 'assets/[name]',
  define: { ...webOptions.define, 'process.env.NODE_ENV': '"development"' },
  plugins: [
    {
      name: 'post-build',
      setup(build) {
        build.onEnd(async (result) => {
          if (result.errors.length) return;
          await buildWeb(result);
          console.log(`[web] rebuilt ${new Date().toLocaleTimeString()}`);
        });
      },
    },
  ],
});
await ctx.watch();

const server = spawn(process.execPath, ['--watch-path', resolve(root, 'server/src'), '--watch-path', resolve(root, 'shared/src'), '--import', 'tsx', resolve(root, 'server/src/server.ts')], {
  stdio: 'inherit',
  env: { ...process.env, PORT: port, NODE_NO_WARNINGS: '1' },
});
process.on('SIGINT', () => {
  server.kill();
  ctx.dispose().then(() => process.exit(0));
});
console.log(`\n  Relationship Manager dev → http://localhost:${port}\n`);
