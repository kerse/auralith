import { fft } from '../../vendor/package/src/fft.js';
import { gainAt, rowAtFrequency } from './spectral-paint.js';

self.onmessage = ({ data }) => {
  try {
    const { channels, sampleRate, mask, synthMask, waveform, loudness, baseMode, width, height } = data;
    const length = channels[0].length, n = 2048, hop = n / 4, half = n / 2;
    const window = Float32Array.from({ length: n }, (_, index) => .5 - .5 * Math.cos(2 * Math.PI * index / (n - 1)));
    const output = channels.map(() => new Float32Array(length)), normalization = new Float32Array(length);
    const generatedPhase = new Float64Array(half + 1), frames = Math.ceil((length + n - hop * 2) / hop), first = -n + hop;
    let lastProgress = 0;
    for (let frame = 0, start = first; start < length; frame++, start += hop) {
      const center = Math.max(0, Math.min(length - 1, start + n / 2)), x = center / Math.max(1, length - 1) * (width - 1);
      for (let channelIndex = 0; channelIndex < channels.length; channelIndex++) {
        const real = new Float32Array(n), imag = new Float32Array(n), input = channels[channelIndex];
        for (let index = 0; index < n; index++) {
          const sourceIndex = start + index;
          if (sourceIndex < 0 || sourceIndex >= length) continue;
          const drawPosition = sourceIndex / Math.max(1, length - 1) * (waveform.length - 1), drawLeft = Math.floor(drawPosition), drawRight = Math.min(waveform.length - 1, drawLeft + 1), drawFraction = drawPosition - drawLeft;
          const drawn = waveform[drawLeft] * (1 - drawFraction) + waveform[drawRight] * drawFraction;
          real[index] = ((baseMode === 'blank' ? 0 : input[sourceIndex]) + drawn) * window[index];
        }
        fft(real, imag, false);
        for (let bin = 0; bin <= half; bin++) {
          const row = rowAtFrequency(bin * sampleRate / n, height, sampleRate / 2);
          const gain = 10 ** (gainAt(mask, width, height, x, row) / 20);
          real[bin] *= gain; imag[bin] *= gain;
          const synthesis = gainAt(synthMask, width, height, x, row);
          if (synthesis > 1e-4) {
            const phase = channelIndex === 0 ? generatedPhase[bin] += 2 * Math.PI * bin * hop / n : generatedPhase[bin];
            const magnitude = synthesis * .2 * n / 4;
            real[bin] += magnitude * Math.cos(phase); imag[bin] += magnitude * Math.sin(phase);
          }
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
    for (const channel of output) for (let index = 0; index < length; index++) {
      const envelopePosition = index / Math.max(1, length - 1) * (loudness.length - 1), envelopeLeft = Math.floor(envelopePosition), envelopeRight = Math.min(loudness.length - 1, envelopeLeft + 1), envelopeFraction = envelopePosition - envelopeLeft;
      const gainDb = loudness[envelopeLeft] * (1 - envelopeFraction) + loudness[envelopeRight] * envelopeFraction;
      channel[index] = (normalization[index] > 1e-8 ? channel[index] / normalization[index] : 0) * 10 ** (gainDb / 20);
    }
    self.postMessage({ type: 'done', channels: output }, output.map(channel => channel.buffer));
  } catch (error) { self.postMessage({ type: 'error', message: error.message || 'Spectral paint failed.' }); }
};
