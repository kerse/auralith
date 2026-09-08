import { chromium } from 'playwright';
import assert from 'node:assert/strict';
for (const channel of ['chrome', 'msedge']) {
  const browser = await chromium.launch({ channel });
  try {
    const page = await browser.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto('http://127.0.0.1:4173'); await page.locator('#audio-file').setInputFiles('tmp/fixtures/stereo.wav'); await page.waitForFunction(() => !document.querySelector('#audio-file').disabled);
    assert.equal(await page.locator('#result-loop').isChecked(), true);
    await page.locator('#preview').click(); await page.waitForFunction(() => !document.querySelector('#result-play').disabled);
    assert.equal(await page.locator('#result-audio').evaluate(a => a.duration), 10);
    await page.locator('#result-play').click(); await page.waitForTimeout(200); assert.ok(await page.locator('#result-audio').evaluate(a => !a.paused && a.currentTime > 0));
    await page.locator('#result-play').click(); assert.equal(await page.locator('#result-audio').evaluate(a => a.paused), true);
    await page.locator('#result-stop').click(); assert.equal(await page.locator('#result-audio').evaluate(a => a.currentTime), 0);
    await page.locator('#result-audio').evaluate(a => { a.currentTime = a.duration - .05; });
    await page.locator('#result-play').click(); await page.waitForTimeout(250);
    assert.ok(await page.locator('#result-audio').evaluate(a => !a.paused && a.currentTime < 1));
    await page.locator('#result-stop').click();
    await page.locator('#stretch').fill('500'); assert.equal(await page.locator('#result-play').isDisabled(), true);
    await page.locator('#preview').click(); await page.locator('#cancel-render').click(); await page.waitForFunction(() => !document.querySelector('#preview').disabled);
    assert.equal(await page.locator('#status').textContent(), 'Обработка отменена');
    await page.locator('#preview').click(); await page.waitForFunction(() => !document.querySelector('#result-play').disabled);
    assert.equal(await page.locator('#result-audio').evaluate(a => a.duration), 20);
    assert.ok((await page.locator('#preview-note').textContent()).includes('первые 20 секунд'));
    const energy = await page.locator('#result-audio').evaluate(async a => { const ctx = new AudioContext(); const b = await ctx.decodeAudioData(await (await fetch(a.src)).arrayBuffer()); const v = b.getChannelData(0).reduce((s, x) => s + x * x, 0); await ctx.close(); return v; });
    assert.ok(energy > 0); assert.deepEqual(errors, []); console.log(channel, 'preview, play/pause/stop, loop, cancel/retry and 20s limit passed');
    await page.locator('#audio-file').setInputFiles('tmp/fixtures/stereo.m4a'); await page.waitForFunction(() => !document.querySelector('#audio-file').disabled);
    await page.locator('#target-duration').fill('10');
    await page.locator('#preview').click(); await page.waitForFunction(() => !document.querySelector('#result-play').disabled);
    assert.equal(await page.locator('#result-audio').evaluate(a => a.duration), 10);
    assert.equal(await page.locator('#status').textContent(), 'Preview готов');
  } finally { await browser.close(); }
}
