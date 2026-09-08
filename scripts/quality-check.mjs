import { fixtures } from './sound-fixtures.mjs';
import { renderBlocks } from '../src/audio/engine.js';
import { mkdir, writeFile } from 'node:fs/promises';
await mkdir('test-results', { recursive: true });
const report = [];
for (const [name, channels] of Object.entries(fixtures(16000, .5))) for (const ratio of [10, 100, 500]) {
  let count = 0, energy = 0, peak = 0, maxJump = 0, last = 0, finite = true;
  const start = performance.now();
  for (const block of renderBlocks(channels, 16000, { duration: .5 * ratio })) {
    for (const v of block.channels[0]) { finite &&= Number.isFinite(v); count++; energy += v * v; peak = Math.max(peak, Math.abs(v)); maxJump = Math.max(maxJump, Math.abs(v - last)); last = v; }
  }
  const row = { name, ratio, finite, rms: Math.sqrt(energy / count), peak, maxJump, frames: count, elapsedMs: Math.round(performance.now() - start) };
  if (!finite || row.rms < .001 || count !== 8000 * ratio) throw new Error(JSON.stringify(row));
  report.push(row);
}
await writeFile('test-results/quality.json', JSON.stringify(report, null, 2)); console.log(report);
