import { chromium } from 'playwright';
import assert from 'node:assert/strict';
for (const channel of ['chrome', 'msedge']) {
  const browser = await chromium.launch({ channel });
  try {
    const page = await browser.newPage(); await page.goto('http://127.0.0.1:4173'); await page.locator('#audio-file').setInputFiles('tmp/fixtures/tone.wav'); await page.waitForFunction(() => !document.querySelector('#audio-file').disabled);
    await page.locator('#stretch').fill('500'); assert.equal(await page.locator('#target-duration').inputValue(), '500');
    await page.locator('#target-duration').fill('30'); assert.equal(await page.locator('#stretch').inputValue(), '30');
    await page.locator('#pitch-shift').fill('-12'); assert.equal(await page.locator('#target-duration').inputValue(), '30');
    await page.locator('#reverse-source').check(); assert.ok((await page.locator('#parameter-note').textContent()).includes('Reverse включён'));
    await page.locator('#start-ms').fill('500'); await page.locator('#start-ms').press('Tab'); assert.equal(await page.locator('#target-duration').inputValue(), '15');
    await page.locator('#target-duration').fill('3601'); assert.equal(await page.locator('#parameter-error').isVisible(), true);
    await page.locator('#target-duration').fill('3600'); assert.equal(await page.locator('#stretch').inputValue(), '7200'); assert.equal(await page.locator('#parameter-error').isVisible(), false);
    const longRange = await page.evaluate(async () => {
      const { ProcessingControls } = await import('/src/ui/processing.js');
      const controls = new ProcessingControls(); controls.setSelection({ start: 0, end: 3601 });
      let rejects = false; try { controls.getParameters(); } catch { rejects = true; }
      const disabled = document.querySelector('#process-fields').disabled;
      const message = document.querySelector('#parameter-error').textContent;
      const agrees = +document.querySelector('#target-duration').value === 3601 * +document.querySelector('#stretch').value;
      controls.setSelection({ start: 0, end: 1 });
      return { rejects, disabled, message, agrees, recovered: controls.getParameters().duration === 1 };
    });
    assert.ok(longRange.rejects && longRange.disabled && longRange.agrees && longRange.recovered && longRange.message.includes('Сократите'));
    console.log(channel, 'bidirectional duration/stretch, pitch, reverse and bounds passed');
  } finally { await browser.close(); }
}
