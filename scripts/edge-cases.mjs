import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { wavHeader, pcm16 } from '../src/audio/wav.js';
for (const channel of ['chrome', 'msedge']) {
  const browser = await chromium.launch({ channel });
  try {
    const page = await browser.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto('http://127.0.0.1:4173');
    await page.locator('#audio-file').setInputFiles('tmp/fixtures/voice.wav'); await page.waitForFunction(() => !document.querySelector('#audio-file').disabled); assert.equal(await page.locator('#load-error').isVisible(), false);
    await page.locator('body').click({ position: { x: 1, y: 1 } }); const tabOrder = [];
    for (let i = 0; i < 25; i++) { await page.keyboard.press('Tab'); tabOrder.push(await page.evaluate(() => document.activeElement.id)); }
    for (const id of ['audio-file', 'start-ms', 'end-ms', 'target-duration', 'pitch-shift', 'preview', 'export-wav', 'result-loop']) assert.ok(tabOrder.includes(id), `${channel}: Tab missed ${id}`);
    await page.locator('#target-duration').fill('10'); await page.locator('#preview').focus(); await page.keyboard.press('Enter'); await page.waitForFunction(() => !document.querySelector('#result-play').disabled);
    await page.locator('#result-play').focus(); await page.keyboard.press('Space'); assert.equal(await page.locator('#result-audio').evaluate(a => a.paused), false); await page.locator('#result-stop').click();
    await page.evaluate(() => { window.writeAborted = false; window.showSaveFilePicker = async () => ({ createWritable: async () => ({ write: async bytes => { if (bytes.byteLength > 44) throw new DOMException('Test disk quota exceeded', 'QuotaExceededError'); }, close: async () => { throw new Error('Unexpected commit'); }, abort: async () => { window.writeAborted = true; } }) }); });
    await page.locator('#export-wav').click(); await page.waitForFunction(() => !document.querySelector('#export-wav').disabled); assert.ok((await page.locator('#status').textContent()).includes('quota exceeded')); assert.equal(await page.evaluate(() => window.writeAborted), true);
    await page.locator('#audio-file').setInputFiles('tmp/fixtures/long.wav'); await page.waitForFunction(() => !document.querySelector('#audio-file').disabled, null, { timeout: 60000 });
    assert.ok((await page.locator('#file-info').textContent()).includes('3601.000')); assert.ok((await page.locator('#parameter-error').textContent()).includes('Сократите')); assert.equal(await page.locator('#stretch').isDisabled(), true);
    await page.locator('#end-min').fill('0'); await page.locator('#end-min').press('Tab'); assert.equal(await page.locator('#stretch').isDisabled(), false);
    const samples = Float32Array.from({ length: 480 }, (_, i) => .3 * Math.sin(i * 2 * Math.PI * 440 / 48000));
    await page.locator('#audio-file').setInputFiles({ name: 'short.wav', mimeType: 'audio/wav', buffer: Buffer.concat([Buffer.from(wavHeader(480, 1, 48000)), Buffer.from(pcm16([samples]))]) }); await page.waitForFunction(() => !document.querySelector('#audio-file').disabled);
    await page.locator('#stretch').fill('500'); await page.locator('#pitch-shift').fill('12'); await page.locator('#reverse-source').check(); await page.locator('#preview').click(); await page.waitForFunction(() => !document.querySelector('#result-play').disabled); assert.equal(await page.locator('#result-audio').evaluate(a => a.duration), 5);
    await page.locator('#audio-file').setInputFiles({ name: 'empty.wav', mimeType: 'audio/wav', buffer: Buffer.alloc(0) }); await page.waitForFunction(() => !document.querySelector('#audio-file').disabled); assert.ok((await page.locator('#load-error').textContent()).includes('пуст'));
    const oversized = await page.evaluate(async () => { const { decodeFile } = await import('/src/audio/load.js'); try { await decodeFile({ name: 'big.wav', size: 268435457, arrayBuffer: () => { throw new Error('Should not read'); } }); } catch (e) { return e.message; } }); assert.ok(oversized.includes('256'));
    assert.deepEqual(errors, []); console.log(channel, 'speech, Tab/Enter/Space, write failure, long source, 10ms x500, empty/oversize passed');
  } finally { await browser.close(); }
}
