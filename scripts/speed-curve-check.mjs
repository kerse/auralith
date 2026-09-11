import { chromium } from 'playwright';
import assert from 'node:assert/strict';

for (const channel of ['chrome', 'msedge']) {
  const browser = await chromium.launch({ channel, headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } }), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.addInitScript(() => { window.showSaveFilePicker = async () => (await navigator.storage.getDirectory()).getFileHandle('speed-curve-test.wav', { create: true }); });
    await page.goto('http://127.0.0.1:4173'); await page.waitForSelector('html[data-app-ready="true"]');
    await page.locator('#speed-curve-tab').click();
    assert.equal(await page.locator('#speed-curve-mode').isVisible(), true); assert.equal(await page.locator('#stretch-source').isHidden(), true);
    await page.locator('#speed-audio-file').setInputFiles('tmp/fixtures/stereo.wav'); await page.waitForFunction(() => !document.querySelector('#speed-audio-file').disabled);
    await page.waitForFunction(() => !document.querySelector('#speed-play').disabled); await page.waitForFunction(() => Number.isFinite(document.querySelector('#speed-audio').duration));
    assert.equal(await page.locator('#speed-preserve-attacks').isChecked(), true);
    await page.locator('#speed-preserve-attacks').uncheck(); await page.waitForFunction(() => !document.querySelector('#speed-play').disabled); await page.locator('#speed-preserve-attacks').check(); await page.waitForFunction(() => !document.querySelector('#speed-play').disabled);
    assert.ok(Math.abs(await page.locator('#speed-audio').evaluate(audio => audio.duration) - 1) < .01);
    await page.locator('#speed-preset').selectOption('ramp-up'); await page.waitForFunction(() => !document.querySelector('#speed-play').disabled);
    const mappedDuration = await page.locator('#speed-result-duration').textContent(); assert.notEqual(mappedDuration, '00:01.0');
    const curve = page.locator('#speed-curve-canvas'), box = await curve.boundingBox();
    await page.mouse.click(box.x + box.width * .55, box.y + box.height * .35); await page.locator('#speed-smooth').click(); await page.locator('#speed-corner').click(); await page.waitForFunction(() => !document.querySelector('#speed-play').disabled);
    await page.locator('#speed-play').click(); await page.waitForTimeout(250);
    assert.equal(await page.locator('#speed-audio').evaluate(audio => audio.paused), false);
    assert.notEqual(await page.locator('#speed-source-position').textContent(), '00:00.0 / 00:01.0');
    await page.locator('#speed-play').click();
    await page.locator('#speed-export').click(); await page.waitForFunction(() => document.querySelector('#status').textContent.startsWith('WAV saved'));
    const result = await page.evaluate(async () => { const root = await navigator.storage.getDirectory(), file = await (await root.getFileHandle('speed-curve-test.wav')).getFile(), bytes = await file.arrayBuffer(), context = new AudioContext(), decoded = await context.decodeAudioData(bytes.slice(0)); const duration = decoded.duration; await context.close(); await root.removeEntry('speed-curve-test.wav'); return { size: bytes.byteLength, duration }; });
    assert.ok(result.size > 44 && result.duration > 0); assert.deepEqual(errors, []);
    for (const width of [390, 768, 1440]) { await page.setViewportSize({ width, height: 1000 }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true); }
    await page.screenshot({ path: `test-results/speed-curve-${channel}.png`, fullPage: true });
    console.log(channel, 'Speed Curve tab, editing, pitch-locked preview, playhead and WAV export passed', result);
  } finally { await browser.close(); }
}
