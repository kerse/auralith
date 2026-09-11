import { chromium } from 'playwright';
import assert from 'node:assert/strict';

for (const channel of ['chrome', 'msedge']) {
  const browser = await chromium.launch({ channel, headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1250 } }), errors = [];
    page.on('pageerror', error => errors.push(error.message)); page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.addInitScript(() => { window.showSaveFilePicker = async () => (await navigator.storage.getDirectory()).getFileHandle('sound-paint-test.wav', { create: true }); });
    await page.goto('http://127.0.0.1:4173'); await page.waitForSelector('html[data-app-ready="true"]');
    await page.locator('#sound-paint-tab').click(); assert.equal(await page.locator('#sound-paint-mode').isVisible(), true);
    await page.locator('#paint-new-duration').fill('1'); await page.locator('#paint-create-blank').click();
    await page.waitForFunction(() => !document.querySelector('#paint-play').disabled && document.querySelector('#paint-spectrogram').width > 0);
    assert.equal(await page.locator('#paint-base-blank').evaluate(button => button.classList.contains('active')), true); assert.equal(await page.locator('#paint-loudness').isVisible(), true);
    await page.locator('#paint-generate').click(); assert.equal(await page.locator('#paint-generate').evaluate(button => button.classList.contains('active')), true);
    const spectrum = await page.locator('#paint-spectrogram').boundingBox();
    await page.mouse.move(spectrum.x + spectrum.width * .28, spectrum.y + spectrum.height * .3); await page.mouse.down(); await page.mouse.move(spectrum.x + spectrum.width * .5, spectrum.y + spectrum.height * .42, { steps: 5 }); await page.mouse.up();
    await page.waitForFunction(() => document.querySelector('#paint-play').disabled || !document.querySelector('#paint-progress').hidden);
    await page.waitForFunction(() => document.querySelector('#paint-progress').hidden && !document.querySelector('#paint-play').disabled);
    await page.waitForFunction(() => !!document.querySelector('#sound-paint-app').dataset.audioVersion);
    const spectrumVersion = await page.locator('#sound-paint-app').getAttribute('data-audio-version');
    const waveform = await page.locator('#paint-waveform').boundingBox(); await page.mouse.move(waveform.x + waveform.width * .08, waveform.y + waveform.height * .7); await page.mouse.down(); await page.mouse.move(waveform.x + waveform.width * .34, waveform.y + waveform.height * .25, { steps: 5 }); await page.mouse.up(); await page.waitForFunction(previous => document.querySelector('#sound-paint-app').dataset.audioVersion !== previous, spectrumVersion);
    const waveformVersion = await page.locator('#sound-paint-app').getAttribute('data-audio-version');
    const loudness = await page.locator('#paint-loudness').boundingBox(); await page.mouse.move(loudness.x + loudness.width * .4, loudness.y + loudness.height * .7); await page.mouse.down(); await page.mouse.move(loudness.x + loudness.width * .7, loudness.y + loudness.height * .35, { steps: 4 }); await page.mouse.up(); await page.waitForFunction(previous => document.querySelector('#sound-paint-app').dataset.audioVersion !== previous, waveformVersion);
    const rms = await page.evaluate(async () => { const response = await fetch(document.querySelector('#paint-audio').src), bytes = await response.arrayBuffer(), context = new AudioContext(), audio = await context.decodeAudioData(bytes), data = audio.getChannelData(0); let sum = 0; for (const value of data) sum += value * value; await context.close(); return Math.sqrt(sum / data.length); }); assert.ok(rms > .001, `blank canvas stayed silent: ${rms}`);
    await page.locator('#paint-undo').click(); await page.waitForFunction(() => document.querySelector('#paint-progress').hidden && !document.querySelector('#paint-play').disabled);
    await page.locator('#paint-redo').click(); await page.waitForFunction(() => document.querySelector('#paint-progress').hidden && !document.querySelector('#paint-play').disabled);
    await page.locator('#paint-add').click(); assert.equal(await page.locator('#paint-add').evaluate(button => button.classList.contains('active')), true);
    await page.locator('#paint-play').click(); await page.waitForTimeout(150); assert.equal(await page.locator('#paint-audio').evaluate(audio => audio.paused), false); await page.locator('#paint-stop').click();
    await page.locator('#paint-export').click(); await page.waitForFunction(() => document.querySelector('#status').textContent.includes('WAV saved'));
    const result = await page.evaluate(async () => { const root = await navigator.storage.getDirectory(), file = await (await root.getFileHandle('sound-paint-test.wav')).getFile(), bytes = await file.arrayBuffer(); await root.removeEntry('sound-paint-test.wav'); return { size: bytes.byteLength }; });
    assert.ok(result.size > 44); assert.deepEqual(errors, []);
    for (const width of [390, 768, 1440]) { await page.setViewportSize({ width, height: 1000 }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true); }
    await page.screenshot({ path: `test-results/sound-paint-${channel}.png`, fullPage: true }); console.log(channel, 'Sound Paint load, brush, reconstruction, undo/redo, playback and WAV export passed', result);
  } finally { await browser.close(); }
}
