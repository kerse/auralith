import { chromium } from 'playwright';
import assert from 'node:assert/strict';
for (const channel of ['chrome', 'msedge']) {
  const browser = await chromium.launch({ channel });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } }), errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto('http://127.0.0.1:4173'); await page.locator('#audio-file').setInputFiles('tmp/fixtures/stereo.wav');
    await page.waitForFunction(() => !document.querySelector('#audio-file').disabled);
    await page.locator('#start-ms').fill('200'); await page.locator('#start-ms').press('Tab');
    await page.locator('#end-ms').fill('800'); await page.locator('#end-ms').press('Tab');
    // End starts at 1 second, so set seconds before the final milliseconds.
    await page.locator('#end-sec').fill('0'); await page.locator('#end-sec').press('Tab');
    await page.locator('#end-ms').fill('800'); await page.locator('#end-ms').press('Tab');
    assert.equal(await page.locator('#selection-length').textContent(), 'Фрагмент: 0.600 с');
    const box = await page.locator('#waveform').boundingBox();
    await page.mouse.move(box.x + box.width * .5, box.y + 60); await page.mouse.down(); await page.mouse.move(box.x + box.width * .6, box.y + 60, { steps: 5 }); await page.mouse.up();
    assert.equal(await page.locator('#selection-length').textContent(), 'Фрагмент: 0.600 с');
    await page.evaluate(async () => (await import('/src/ui/status.js')).setStatus('Нужен непустой mono или stereo источник.', true));
    await page.locator('#start-ms').fill('300'); await page.locator('#start-ms').press('Tab');
    assert.equal(await page.locator('#status').textContent(), 'Параметры изменены. Нажмите Preview для нового прослушивания.');
    assert.equal(await page.locator('#status').evaluate(node => node.classList.contains('error')), false);
    const start = +await page.locator('#start-ms').inputValue(); assert.ok(start >= 295 && start <= 305);
    await page.locator('#start-sec').fill('10'); await page.locator('#start-sec').press('Tab'); assert.equal(await page.locator('#selection-error').isVisible(), true);
    await page.locator('#start-sec').fill('0'); await page.locator('#start-sec').press('Tab');
    await page.locator('#source-play').click(); await page.waitForTimeout(100); assert.ok((await page.locator('#source-play').textContent()).includes('Остановить')); await page.locator('#source-play').click();
    await page.locator('#start-ms').fill('500'); await page.locator('#start-ms').press('Tab');
    await page.locator('#end-ms').fill('505'); await page.locator('#end-ms').press('Tab');
    await page.mouse.move(box.x + box.width * .505, box.y + 60); await page.mouse.down(); await page.mouse.move(box.x + box.width * .7, box.y + 60, { steps: 4 }); await page.mouse.up();
    assert.equal(await page.locator('#start-ms').inputValue(), '500');
    assert.ok(Math.abs(+await page.locator('#end-ms').inputValue() - 700) <= 1);
    await page.locator('#start-ms').fill('500'); await page.locator('#start-ms').press('Tab');
    await page.locator('#end-ms').fill('500.021'); await page.locator('#end-ms').press('Tab');
    assert.ok((await page.locator('#selection-length').textContent()).includes('1 отсч.'));
    assert.notEqual(await page.locator('#start-ms').inputValue(), await page.locator('#end-ms').inputValue());
    await page.locator('#zoom').fill('4'); await page.locator('#zoom').dispatchEvent('input'); assert.equal(await page.locator('#scroll').isEnabled(), true);
    await page.screenshot({ path: `test-results/selection-${channel}.png`, fullPage: true }); assert.deepEqual(errors, []); console.log(channel, 'selection, move, invalid fields, source play and zoom passed');
  } finally { await browser.close(); }
}
