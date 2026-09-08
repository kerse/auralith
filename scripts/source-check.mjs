import { chromium } from 'playwright';
import assert from 'node:assert/strict';
for (const channel of ['chrome', 'msedge']) {
  const browser = await chromium.launch({ channel });
  try {
    const page = await browser.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto('http://127.0.0.1:4173');
    for (const extension of ['wav', 'mp3', 'ogg', 'm4a']) {
      await page.locator('#audio-file').setInputFiles(`tmp/fixtures/stereo.${extension}`);
      await page.waitForFunction(() => !document.querySelector('#audio-file').disabled);
      assert.equal(await page.locator('#load-error').isVisible(), false);
      const info = await page.locator('#file-info').textContent(); assert.ok(info.includes(`stereo.${extension}`) && info.includes('2 канала')); console.log(channel, info);
    }
    await page.locator('#audio-file').setInputFiles({ name: 'corrupt.wav', mimeType: 'audio/wav', buffer: Buffer.from('broken audio') });
    await page.waitForFunction(() => !document.querySelector('#audio-file').disabled);
    assert.equal(await page.locator('#load-error').isVisible(), true);
    assert.ok((await page.locator('#file-info').textContent()).includes('stereo.m4a'));
    await page.locator('#audio-file').setInputFiles('tmp/fixtures/tone.wav');
    await page.waitForFunction(() => !document.querySelector('#audio-file').disabled);
    assert.ok((await page.locator('#file-info').textContent()).includes('1 канал')); assert.deepEqual(errors, []);
  } finally { await browser.close(); }
}
