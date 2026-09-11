import { fft } from '../../vendor/package/src/fft.js';
import { gainAt, rowAtFrequency } from './spectral-paint.js';

self.onmessage = ({ data }) => {
  try {
    const { channels, sampleRate, mask, width, height } = data;
    const length = channels[0].length, n = 2048, hop = n / 4, half = n / 2;
    const window = Float32Array.from({ length: n }, (_, index) => .5 - .5 * Math.cos(2 * Math.PI * index / (n - 1)));
    const output = channels.map(() => new Float32Array(length)), normalization = new Float32Array(length);
    const frames = Math.ceil((length + n - hop * 2) / hop), first = -n + hop;
    let lastProgress = 0;
    for (let frame = 0, start = first; start < length; frame++, start += hop) {
      const center = Math.max(0, Math.min(length - 1, start + n / 2)), x = center / Math.max(1, length - 1) * (width - 1);
      for (let channelIndex = 0; channelIndex < channels.length; channelIndex++) {
        const real = new Float32Array(n), imag = new Float32Array(n), input = channels[channelIndex];
        for (let index = 0; index < n; index++) {
          const sourceIndex = start + index;
          real[index] = (sourceIndex >= 0 && sourceIndex < length ? input[sourceIndex] : 0) * window[index];
        }
        fft(real, imag, false);
        for (let bin = 0; bin <= half; bin++) {
          const row = rowAtFrequency(bin * sampleRate / n, height, sampleRate / 2);
          const gain = 10 ** (gainAt(mask, width, height, x, row) / 20);
          real[bin] *= gain; imag[bin] *= gain;
          if (bin > 0 && bin < half) { real[n - bin] = real[bin]; imag[n - bin] = -imag[bin]; }
        }
        fft(real, imag, true);
        for (let index = 0; index < n; index++) {
          const target = start + index;
          if (target < 0 || target >= length) continue;
          output[channelIndex][target] += real[index] * window[index];
          if (channelIndex === 0) normalization[target] += window[index] * window[index];
        }
      }
      if (performance.now() - lastProgress > 50) { self.postMessage({ type: 'progress', progress: Math.min(1, (frame + 1) / Math.max(1, frames)) }); lastProgress = performance.now(); }
    }
    for (const channel of output) for (let index = 0; index < length; index++) channel[index] = normalization[index] > 1e-8 ? channel[index] / normalization[index] : 0;
    self.postMessage({ type: 'done', channels }, output.map(channel => channel.buffer));
  } catch (error) { self.postMessage({ type: 'error', message: error.message || 'Spectral paint failed.' }); }
};
