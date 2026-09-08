import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
for (const channel of ['chrome', 'msedge']) {
  const browser = await chromium.launch({ channel });
  try {
    const page = await browser.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
    // Exercise the real FileSystemWritableFileStream via OPFS, replacing only the OS picker.
    await page.addInitScript(() => { window.showSaveFilePicker = async () => (await navigator.storage.getDirectory()).getFileHandle('export-test.wav', { create: true }); });
    await page.goto('http://127.0.0.1:4173'); await page.locator('#audio-file').setInputFiles('tmp/fixtures/stereo.wav'); await page.waitForFunction(() => !document.querySelector('#audio-file').disabled);
    await page.locator('#target-duration').fill('10'); await page.locator('#export-wav').click(); await page.waitForFunction(() => document.querySelector('#status').textContent.startsWith('WAV сохранён'));
    const inspect = () => page.evaluate(async () => {
      const root = await navigator.storage.getDirectory(), file = await (await root.getFileHandle('export-test.wav')).getFile(), bytes = await file.arrayBuffer(), view = new DataView(bytes);
      const ctx = new AudioContext(), decoded = await ctx.decodeAudioData(bytes.slice(0)); let peak = 0; for (const c of [decoded.getChannelData(0), decoded.getChannelData(1)]) for (const value of c) peak = Math.max(peak, Math.abs(value)); await ctx.close();
      return { bytes: bytes.byteLength, channels: view.getUint16(22, true), bits: view.getUint16(34, true), duration: decoded.duration, peak, hash: [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].join(',') };
    });
    const first = await inspect(); assert.equal(first.bytes, 1920044); assert.equal(first.channels, 2); assert.equal(first.bits, 16); assert.equal(first.duration, 10); assert.ok(first.peak <= .921 && first.peak > .1);
    await page.locator('#export-wav').click(); await page.waitForFunction(() => !document.querySelector('#export-wav').disabled); assert.equal((await inspect()).hash, first.hash);
    await page.locator('#target-duration').fill('100'); await page.locator('#export-wav').click(); await page.locator('#cancel-render').click(); await page.waitForFunction(() => !document.querySelector('#export-wav').disabled);
    assert.equal(await page.locator('#status').textContent(), 'Экспорт отменён'); assert.equal((await inspect()).hash, first.hash);
    await page.evaluate(() => { window.showSaveFilePicker = undefined; }); await page.locator('#target-duration').fill('10');
    const pending = page.waitForEvent('download'); await page.locator('#export-wav').click(); const download = await pending; await download.saveAs(`test-results/export-${channel}.wav`);
    const wav = await readFile(`test-results/export-${channel}.wav`); assert.equal(wav.length, 1920044); assert.equal(download.suggestedFilename(), 'stereo_auralith.wav');
    await page.waitForFunction(() => !document.querySelector('#export-wav').disabled);
    await page.locator('#target-duration').fill('3600'); await page.locator('#export-wav').click(); assert.ok((await page.locator('#status').textContent()).includes('128 МБ'));
    await page.evaluate(async () => (await navigator.storage.getDirectory()).removeEntry('export-test.wav'));
    assert.deepEqual(errors, []); console.log(channel, 'streamed WAV, repeatability, cancel preserves old file, download and limit passed', first);
  } finally { await browser.close(); }
}
