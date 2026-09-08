import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
const only = process.argv[2];
const results = only ? JSON.parse(await readFile('docs/release-check.json', 'utf8')).results.filter(r => r.script !== only) : [];
for (const script of ['browser-smoke', 'source-check', 'selection-check', 'spectrogram-check', 'processing-check', 'preview-check', 'export-check', 'layout-check', 'edge-cases']) {
  if (only && script !== only) continue;
  const start = Date.now();
  const result = await new Promise(resolve => { const child = spawn(process.execPath, [`scripts/${script}.mjs`], { windowsHide: true }); let log = ''; child.stdout.on('data', data => { log += data; process.stdout.write(data); }); child.stderr.on('data', data => { log += data; process.stderr.write(data); }); child.on('close', code => resolve({ script, code, elapsedMs: Date.now() - start, log })); child.on('error', e => resolve({ script, code: -1, log: e.message })); });
  results.push(result);
}
await writeFile('docs/release-check.json', JSON.stringify({ date: new Date().toISOString(), results }, null, 2));
if (results.some(r => r.code !== 0)) process.exitCode = 1;
