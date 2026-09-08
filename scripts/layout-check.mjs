import { chromium } from 'playwright';
import assert from 'node:assert/strict';
for (const channel of ['chrome', 'msedge']) {
  const browser = await chromium.launch({ channel });
  try {
    const page = await browser.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
    for (const width of [1024, 1440, 1920]) {
      await page.setViewportSize({ width, height: 1000 }); await page.goto('http://127.0.0.1:4173');
      await page.locator('#audio-file').setInputFiles('tmp/fixtures/stereo.wav'); await page.waitForFunction(() => !document.querySelector('#audio-file').disabled);
      await page.locator('#stretch').fill('100'); await page.locator('#reverse-source').check();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      for (const id of ['target-duration', 'pitch-shift', 'preview', 'export-wav']) { await page.locator(`#${id}`).focus(); assert.equal(await page.locator(`#${id}`).evaluate(el => el === document.activeElement), true); }
      await page.screenshot({ path: `test-results/layout-${channel}-${width}.png`, fullPage: true });
    }
    assert.deepEqual(errors, []); console.log(channel, '1024/1440/1920 layout and keyboard focus passed');
  } finally { await browser.close(); }
}
