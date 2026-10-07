import http from 'node:http';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  out = path.join(root, '.runtime/test-results');
process.env.TEMP = path.join(root, '.runtime/tmp');
process.env.TMP = process.env.TEMP;
const fake = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ app: 'port-test-other-application' }));
});
await new Promise((ok, no) => {
  fake.on('error', no);
  fake.listen(4173, '127.0.0.1', ok);
});
const child = spawn(
  'powershell.exe',
  [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    path.join(root, 'scripts/start.ps1'),
    '-NoBrowser',
  ],
  { cwd: root, env: process.env, windowsHide: true },
);
let output = '';
child.stdout.on('data', (b) => (output += b));
child.stderr.on('data', (b) => (output += b));
const exitCode = await new Promise((ok) => child.on('exit', ok));
await new Promise((ok) => fake.close(ok));
if (exitCode !== 1) throw Error('Port conflict was not rejected: ' + output);
await fs.writeFile(
  path.join(out, 'port-result.json'),
  JSON.stringify(
    {
      passed: true,
      exitCode,
      output,
      notes:
        'An owned temporary HTTP server occupied 4173. Launcher rejected it without changing ports or stopping the occupant.',
    },
    null,
    2,
  ),
);
console.log('PASS port conflict rejected; occupant untouched');
