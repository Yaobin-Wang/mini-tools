import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = {
  ...process.env,
  TEMP: path.join(root, '.runtime/tmp'),
  TMP: path.join(root, '.runtime/tmp'),
  NPM_CONFIG_CACHE: path.join(root, '.runtime/npm-cache'),
  PLAYWRIGHT_BROWSERS_PATH: path.join(root, '.runtime/test-browsers'),
};
for (const p of [env.TEMP, env.NPM_CONFIG_CACHE, env.PLAYWRIGHT_BROWSERS_PATH])
  fs.mkdirSync(p, { recursive: true });
const invoke = (script, args = []) => {
  const r = spawnSync(process.execPath, [path.join(root, script), ...args], {
    cwd: root,
    env,
    stdio: 'inherit',
    windowsHide: true,
  });
  if (r.status !== 0) process.exit(r.status || 1);
};
switch (process.argv[2]) {
  case 'build':
    invoke('node_modules/typescript/bin/tsc', ['-b']);
    invoke('node_modules/vite/bin/vite.js', ['build']);
    break;
  case 'dev':
    invoke('node_modules/vite/bin/vite.js', [
      '--host',
      '127.0.0.1',
      '--port',
      '4173',
      '--strictPort',
    ]);
    break;
  case 'start':
    invoke('scripts/server.mjs');
    break;
  case 'test':
    invoke('node_modules/vitest/vitest.mjs', ['run']);
    break;
  case 'e2e':
    invoke('scripts/qa.mjs');
    invoke('scripts/qa-extended.mjs');
    invoke('scripts/qa-refinements.mjs');
    break;
  default:
    throw Error('Unknown command');
}
