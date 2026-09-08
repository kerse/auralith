import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-precise-memory-info'] });
try {
  const page = await browser.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => { window.showSaveFilePicker = async () => (await navigator.storage.getDirectory()).getFileHandle('hour-export.wav', { create: true }); });
  await page.goto('http://127.0.0.1:4173'); await page.locator('#audio-file').setInputFiles('tmp/fixtures/tone.wav'); await page.waitForFunction(() => !document.querySelector('#audio-file').disabled);
  await page.locator('#target-duration').fill('3600'); const start = Date.now(); await page.locator('#export-wav').click();
  let previous = '';
  while (await page.locator('#export-wav').isDisabled()) {
    if (Date.now() - start > 900000) throw new Error('Hour export timed out');
    await page.waitForTimeout(10000); const progress = await page.locator('#progress-label').textContent();
    if (progress !== previous) console.log(progress); previous = progress;
  }
  assert.ok((await page.locator('#status').textContent()).startsWith('WAV saved'));
  const report = await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory(), file = await (await root.getFileHandle('hour-export.wav')).getFile();
    const header = new DataView(await file.slice(0, 44).arrayBuffer());
    const samples = [];
    for (const second of [1, 900, 1800, 2700, 3599]) {
      const v = new DataView(await file.slice(44 + second * 48000 * 2, 44 + (second + 1) * 48000 * 2).arrayBuffer()); let energy = 0, peak = 0;
      for (let i = 0; i < v.byteLength; i += 2) { const sample = v.getInt16(i, true) / 32768; energy += sample * sample; peak = Math.max(peak, Math.abs(sample)); }
      samples.push({ second, rms: Math.sqrt(energy / (v.byteLength / 2)), peak });
    }
    const result = { bytes: file.size, frames: header.getUint32(40, true) / 2, sampleRate: header.getUint32(24, true), channels: header.getUint16(22, true), bits: header.getUint16(34, true), samples, finalMainThreadHeap: performance.memory?.usedJSHeapSize };
    await root.removeEntry('hour-export.wav'); return result;
  });
  Object.assign(report, { elapsedMs: Date.now() - start, browser: browser.version(), errors });
  assert.equal(report.bytes, 345600044); assert.equal(report.frames, 172800000); assert.equal(report.sampleRate, 48000); assert.equal(report.channels, 1); assert.equal(report.bits, 16);
  assert.ok(report.samples.every(s => s.rms > .01 && s.peak <= .921)); assert.deepEqual(errors, []);
  await writeFile('docs/final-hour-export.json', JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
} finally { await browser.close(); }
