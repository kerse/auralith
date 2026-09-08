import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
await mkdir('test-results', { recursive: true });
for (const channel of ['chrome', 'msedge']) {
  const browser = await chromium.launch({ channel, headless: true, args: ['--enable-precise-memory-info'] });
  try {
    const page = await browser.newPage(); page.on('console', m => console.log(channel, m.text())); await page.goto('http://127.0.0.1:4173');
    const result = await page.evaluate(async () => {
      const { renderBlocks } = await import('/src/audio/engine.js');
      const { wavHeader, pcm16 } = await import('/src/audio/wav.js');
      const sr = 48000, input = [Float32Array.from({ length: sr }, (_, i) => .3 * Math.sin(2 * Math.PI * 440 * i / sr))];
      input.push(input[0].map((v, i) => .2 * Math.sin(2 * Math.PI * 660 * i / sr)));
      const results = [];
      for (const duration of [10, 100, 500, 3600]) {
        const start = performance.now(), before = performance.memory?.usedJSHeapSize;
        let peakHeap = before || 0, count = 0, sum = 0, max = 0;
        const handle = await (await navigator.storage.getDirectory()).getFileHandle('auralith-benchmark.wav', { create: true });
        const writer = await handle.createWritable(); await writer.write(wavHeader(duration * sr, 2, sr));
        let pending = new Uint8Array(1048576), used = 0;
        for (const block of renderBlocks(input, sr, { duration })) {
          const bytes = new Uint8Array(pcm16(block.channels, .7));
          if (used + bytes.length > pending.length) { await writer.write(pending.subarray(0, used)); used = 0; }
          pending.set(bytes, used); used += bytes.length;
          count += block.channels[0].length;
          for (const v of block.channels[0]) { sum += v * v; max = Math.max(max, Math.abs(v)); }
          peakHeap = Math.max(peakHeap, performance.memory?.usedJSHeapSize || 0);
        }
        if (used) await writer.write(pending.subarray(0, used));
        await writer.close(); const file = await handle.getFile();
        const header = new DataView(await file.slice(0, 44).arrayBuffer());
        results.push({ duration, elapsedMs: Math.round(performance.now() - start), frames: count, bytes: file.size, headerFrames: header.getUint32(40, true) / 4, rms: Math.sqrt(sum / count), peak: max, heapBefore: before, peakHeap });
        console.log(JSON.stringify(results.at(-1)));
        await (await navigator.storage.getDirectory()).removeEntry('auralith-benchmark.wav');
      }
      return results;
    });
    const report = { browser: channel, version: browser.version(), results: result };
    await writeFile(`test-results/benchmark-${channel}.json`, JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
  } finally { await browser.close(); }
}
