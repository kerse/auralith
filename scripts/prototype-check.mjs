import { chromium } from 'playwright';
import { writeFile, mkdir } from 'node:fs/promises';
import { wavHeader, pcm16 } from '../src/audio/wav.js';
await mkdir('tmp', { recursive: true });
const sr = 48000, tone = Float32Array.from({ length: sr }, (_, i) => .3 * Math.sin(2 * Math.PI * 440 * i / sr));
await writeFile('tmp/tone.wav', Buffer.concat([Buffer.from(wavHeader(sr, 1, sr)), Buffer.from(pcm16([tone]))]));
for (const channel of ['chrome', 'msedge']) {
  const browser = await chromium.launch({ channel });
  try {
    const page = await browser.newPage(); const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('http://127.0.0.1:4173/prototype.html');
    await page.locator('#file').setInputFiles('tmp/tone.wav');
    await page.locator('#end').fill('.5'); await page.locator('#pitch').fill('12'); await page.locator('#reverse').check();
    await page.locator('#render').click(); await page.locator('#download').waitFor({ state: 'visible' });
    const data = await page.evaluate(async () => {
      const audio = document.querySelector('audio');
      const response = await fetch(audio.src), buffer = await response.arrayBuffer();
      const ctx = new AudioContext(), decoded = await ctx.decodeAudioData(buffer.slice(0));
      const result = { duration: decoded.duration, channels: decoded.numberOfChannels, bytes: buffer.byteLength, energy: decoded.getChannelData(0).reduce((s, v) => s + v * v, 0) };
      await ctx.close(); return result;
    });
    if (errors.length || data.duration !== 5 || data.channels !== 1 || data.energy <= 0) throw new Error(JSON.stringify({ errors, data }));
    const download = page.waitForEvent('download'); await page.locator('#download').click(); await (await download).saveAs(`test-results/prototype-${channel}.wav`);
    console.log(channel, data);
  } finally { await browser.close(); }
}
