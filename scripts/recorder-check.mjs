import { chromium } from 'playwright';
import assert from 'node:assert/strict';

for (const channel of ['chrome', 'msedge']) {
  const browser = await chromium.launch({ channel, headless: true, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  try {
    const context = await browser.newContext({ permissions: ['microphone'] });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:4173');
    await page.evaluate(() => {
      window.__recorderStops = 0; window.__recorderCloses = 0;
      const stop = MediaStreamTrack.prototype.stop, close = AudioContext.prototype.close;
      MediaStreamTrack.prototype.stop = function () { window.__recorderStops += 1; return stop.call(this); };
      AudioContext.prototype.close = function () { window.__recorderCloses += 1; return close.call(this); };
    });
    await page.locator('#record-audio').click();
    await page.locator('#recorder-panel').waitFor({ state: 'visible' });
    await page.waitForTimeout(500);
    assert.match(await page.locator('#record-time').textContent(), /^00:0[0-9]\.[0-9]$/);
    assert.equal(await page.locator('#record-stop').isEnabled(), true);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'record-stop');
    assert.ok((await page.locator('#recorder-canvas').getAttribute('aria-label'))?.length);
    assert.equal(await page.locator('#record-level').getAttribute('id'), await page.locator('label[for="record-level"]').getAttribute('for'));
    await page.locator('#record-stop').click();
    await page.locator('#recorder-panel').waitFor({ state: 'hidden' });
    await page.waitForFunction(() => document.querySelector('#wave-panel') && !document.querySelector('#wave-panel').hidden);
    assert.match(await page.locator('#file-info').textContent(), /Recording .*\.wav/);
    assert.equal(await page.locator('#load-error').isVisible(), false);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'record-audio');
    assert.ok(await page.evaluate(() => window.__recorderStops > 0 && window.__recorderCloses > 0));

    const previousInfo = await page.locator('#file-info').textContent();
    await page.locator('#record-audio').click();
    await page.locator('#recorder-panel').waitFor({ state: 'visible' });
    await page.waitForTimeout(150);
    await page.locator('#record-cancel').click();
    await page.locator('#recorder-panel').waitFor({ state: 'hidden' });
    assert.equal(await page.locator('#file-info').textContent(), previousInfo);
    assert.equal(await page.locator('#wave-panel').isVisible(), true);
    assert.ok(await page.evaluate(() => window.__recorderStops > 1 && window.__recorderCloses > 1));
    assert.deepEqual(errors, []);
    console.log(channel, 'microphone recording passed');
  } finally { await browser.close(); }
}

const deniedBrowser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await deniedBrowser.newPage();
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => { throw new DOMException('Denied', 'NotAllowedError'); } } });
  });
  await page.goto('http://127.0.0.1:4173');
  await page.locator('#record-audio').click();
  await page.locator('#load-error').waitFor({ state: 'visible' });
  assert.match(await page.locator('#load-error').textContent(), /blocked/i);
  assert.equal(await page.locator('#record-audio').isEnabled(), true);
  assert.equal(await page.locator('#audio-file').isEnabled(), true);
  await page.locator('#record-audio').click();
  await page.locator('#load-error').waitFor({ state: 'visible' });
} finally { await deniedBrowser.close(); }
