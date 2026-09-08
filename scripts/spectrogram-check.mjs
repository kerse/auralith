import { chromium } from 'playwright';
import assert from 'node:assert/strict';
for (const channel of ['chrome', 'msedge']) {
  const browser = await chromium.launch({ channel });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1250 } }), errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto('http://127.0.0.1:4173');
    for (const name of ['voice_synthetic', 'metal', 'noise', 'tone', 'stereo']) {
      await page.locator('#audio-file').setInputFiles(`tmp/fixtures/${name}.wav`);
      await page.waitForFunction(() => !document.querySelector('#audio-file').disabled);
      assert.equal(await page.locator('#spectrogram').isVisible(), true);
      await page.screenshot({ path: `test-results/spectrogram-${channel}-${name}.png`, fullPage: true });
    }
    const b = await page.locator('#spectrogram').boundingBox();
    await page.mouse.move(b.x + 2, b.y + 80); await page.mouse.down(); await page.mouse.move(b.x + b.width * .25, b.y + 80, { steps: 4 }); await page.mouse.up();
    assert.ok(Math.abs(+await page.locator('#start-ms').inputValue() - 250) < 2);
    await page.locator('#zoom').fill('2'); await page.locator('#zoom').dispatchEvent('input');
    await page.locator('#scroll').fill('0.3'); await page.locator('#scroll').dispatchEvent('input');
    assert.deepEqual(errors, []); console.log(channel, 'five sources, shared selection and zoom passed');
  } finally { await browser.close(); }
}
