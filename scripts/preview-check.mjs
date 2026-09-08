import { chromium } from 'playwright';
import assert from 'node:assert/strict';
for (const channel of ['chrome', 'msedge']) {
  const browser = await chromium.launch({ channel });
  try {
    const page = await browser.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto('http://127.0.0.1:4173'); await page.locator('#audio-file').setInputFiles('tmp/fixtures/stereo.wav'); await page.waitForFunction(() => !document.querySelector('#audio-file').disabled);
    assert.equal(await page.locator('#result-loop').isChecked(), true);
    assert.equal(await page.locator('#preview').count(), 0);
    await page.waitForFunction(() => !document.querySelector('#result-play').disabled); await page.waitForFunction(() => Number.isFinite(document.querySelector('#result-audio').duration) && document.querySelector('#result-audio').duration > 0);
    assert.equal(await page.locator('#result-audio').evaluate(a => a.duration), 10);
    const waveBefore = await page.locator('#waveform').evaluate(c => c.toDataURL()), spectrumBefore = await page.locator('#spectrogram').evaluate(c => c.toDataURL());
    await page.locator('#result-play').click(); await page.waitForTimeout(200); assert.ok(await page.locator('#result-audio').evaluate(a => !a.paused && a.currentTime > 0));
    assert.notEqual(await page.locator('#waveform').evaluate(c => c.toDataURL()), waveBefore); assert.notEqual(await page.locator('#spectrogram').evaluate(c => c.toDataURL()), spectrumBefore);
    await page.locator('#result-play').click(); assert.equal(await page.locator('#result-audio').evaluate(a => a.paused), true);
    const current = await page.locator('#result-audio').evaluate(a => a.currentTime), waveBox = await page.locator('#waveform').boundingBox();
    await page.mouse.move(waveBox.x + waveBox.width * current / 10, waveBox.y + waveBox.height - 5); await page.mouse.down(); await page.mouse.move(waveBox.x + waveBox.width * .5, waveBox.y + waveBox.height - 5, { steps: 5 }); await page.mouse.up();
    assert.ok(Math.abs(await page.locator('#result-audio').evaluate(a => a.currentTime) - 5) < .6);
    await page.locator('#result-audio').evaluate(a => { a.currentTime = 0; });
    await page.locator('#result-audio').evaluate(a => { a.currentTime = a.duration - .05; });
    await page.locator('#result-play').click(); await page.waitForTimeout(250);
    assert.ok(await page.locator('#result-audio').evaluate(a => !a.paused && a.currentTime < 1));
    await page.locator('#result-play').click();
    await page.locator('#stretch').fill('500'); assert.equal(await page.locator('#result-play').isDisabled(), true);
    await page.locator('#preview-render-progress').waitFor({ state: 'visible' }); await page.locator('#cancel-preview').click();
    assert.equal(await page.locator('#result-play').isDisabled(), true); assert.equal(await page.locator('#status').textContent(), 'Processing cancelled');
    await page.locator('#pitch-shift').fill('1');
    await page.waitForFunction(() => !document.querySelector('#result-play').disabled); await page.waitForFunction(() => Number.isFinite(document.querySelector('#result-audio').duration) && document.querySelector('#result-audio').duration > 0);
    assert.equal(await page.locator('#result-audio').evaluate(a => a.duration), 20);
    assert.ok((await page.locator('#preview-note').textContent()).includes('first 20 seconds'));
    const energy = await page.locator('#result-audio').evaluate(async a => { const ctx = new AudioContext(); const b = await ctx.decodeAudioData(await (await fetch(a.src)).arrayBuffer()); const v = b.getChannelData(0).reduce((s, x) => s + x * x, 0); await ctx.close(); return v; });
    assert.ok(energy > 0); assert.deepEqual(errors, []); console.log(channel, 'automatic preview, play/pause, loop and 20s limit passed');
    await page.locator('#audio-file').setInputFiles('tmp/fixtures/stereo.m4a'); await page.waitForFunction(() => !document.querySelector('#audio-file').disabled);
    await page.locator('#target-duration').fill('10');
    await page.waitForFunction(() => !document.querySelector('#result-play').disabled); await page.waitForFunction(() => Number.isFinite(document.querySelector('#result-audio').duration) && document.querySelector('#result-audio').duration > 0);
    assert.equal(await page.locator('#result-audio').evaluate(a => a.duration), 10);
    assert.equal(await page.locator('#status').textContent(), 'Preview ready');
  } finally { await browser.close(); }
}
