import { renderBlocks, renderSpeedCurveBlocks } from './engine.js';
import { pcm16 } from './wav.js';
let acknowledge;
self.onmessage = async ({ data }) => {
  if (data.type === 'ack') { acknowledge?.(); acknowledge = null; return; }
  try {
    const { channels, sampleRate, options } = data;
    const renderer = Array.isArray(options.curve) ? renderSpeedCurveBlocks : renderBlocks;
    let peak = 0, lastProgress = 0;
    const progress = (block, pass) => {
      if (performance.now() - lastProgress > 80) {
        self.postMessage({ type: 'progress', phase: pass ? 'Формирование WAV' : 'Обработка: анализ уровня', progress: (pass + (block.position + block.channels[0].length) / block.total) / 2 }); lastProgress = performance.now();
      }
    };
    // First pass finds a shared peak, without storing the hour-long signal.
    for (const block of renderer(channels, sampleRate, { ...options, quality: 'export' })) {
      for (const channel of block.channels) for (const value of channel) { if (!Number.isFinite(value)) throw new Error('DSP выдал некорректный отсчёт.'); peak = Math.max(peak, Math.abs(value)); }
      progress(block, 0);
    }
    const gain = peak > 0 ? Math.min(16, .92 / peak) : 1;
    const send = async bytes => {
      const ack = new Promise(resolve => { acknowledge = resolve; });
      self.postMessage({ type: 'chunk', bytes }, [bytes.buffer]);
      await ack; // One outstanding packet; writer controls backpressure.
    };
    let pending = new Uint8Array(1048576), used = 0;
    for (const block of renderer(channels, sampleRate, { ...options, quality: 'export' })) {
      const bytes = new Uint8Array(pcm16(block.channels, gain));
      if (used + bytes.length > pending.length) { await send(pending.subarray(0, used)); pending = new Uint8Array(1048576); used = 0; }
      pending.set(bytes, used); used += bytes.length; progress(block, 1);
    }
    if (used) await send(pending.subarray(0, used));
    self.postMessage({ type: 'done', peak, gain });
  } catch (error) { self.postMessage({ type: 'error', message: error.message }); }
};
