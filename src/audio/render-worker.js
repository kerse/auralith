import { renderBlocks, renderSpeedCurveBlocks } from './engine.js';
import { compileSpeedCurve } from './speed-curve.js';
self.onmessage = ({ data }) => {
  try {
    const { channels, sampleRate, options } = data;
    const curveMode = Array.isArray(options.curve);
    const duration = curveMode ? compileSpeedCurve(options.curve, channels[0].length / sampleRate).duration : options.duration;
    const frames = Math.max(1, Math.round(Math.min(20, duration) * sampleRate));
    const output = channels.map(() => new Float32Array(frames));
    let peak = 0, lastProgress = 0;
    const renderer = curveMode ? renderSpeedCurveBlocks : renderBlocks;
    for (const block of renderer(channels, sampleRate, { ...options, quality: 'preview', limitSeconds: 20 })) {
      block.channels.forEach((c, i) => { output[i].set(c, block.position); for (const value of c) { if (!Number.isFinite(value)) throw new Error('Некорректный выход DSP.'); peak = Math.max(peak, Math.abs(value)); } });
      if (performance.now() - lastProgress > 60) { self.postMessage({ type: 'progress', progress: (block.position + block.channels[0].length) / block.total }); lastProgress = performance.now(); }
    }
    const gain = peak > 0 ? Math.min(16, .92 / peak) : 1;
    for (const channel of output) for (let i = 0; i < channel.length; i++) channel[i] *= gain;
    self.postMessage({ type: 'done', channels: output, sampleRate, duration }, output.map(c => c.buffer));
  } catch (error) { self.postMessage({ type: 'error', message: error.message }); }
};
