// Auralith streaming spectral renderer. FFT and seeded RNG: ArrayPress, MIT.
import { fft } from '../../vendor/package/src/fft.js';
import { FastRNG, blockSeed } from '../../vendor/package/src/rng.js';

export function validateAudio(channels, sampleRate) {
  if (!Array.isArray(channels) || channels.length < 1 || channels.length > 2 || !channels.every(c => c instanceof Float32Array && c.length === channels[0].length) || !channels[0].length) throw new Error('Нужен непустой mono или stereo источник.');
  if (!Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 192000) throw new Error('Sample rate должен быть от 8000 до 192000 Hz.');
}

export function selectAudio(channels, sampleRate, start, end, reverse = false) {
  validateAudio(channels, sampleRate);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end > channels[0].length / sampleRate || end <= start) throw new Error('Некорректные границы фрагмента.');
  const first = Math.floor(start * sampleRate), last = Math.min(channels[0].length, Math.round(end * sampleRate));
  if (last <= first) throw new Error('Выделите хотя бы один отсчёт.');
  return channels.map(c => { const copy = c.slice(first, last); return reverse ? copy.reverse() : copy; });
}

/** Bounded memory: input + FFT/OLA state + one hop. Never allocates full output.
 * Magnitude-domain pitch mapping deliberately discards bins above Nyquist.
 * Shared random rotations preserve stereo phase relationships at zero shift.
 */
export function* renderBlocks(channels, sampleRate, options = {}) {
  validateAudio(channels, sampleRate);
  const { duration, pitch = 0, seed = 1, quality = 'export' } = options;
  if (!Number.isFinite(duration) || duration <= 0 || duration > 3600) throw new Error('Длительность должна быть больше 0 и не больше 1 часа.');
  if (!Number.isFinite(pitch) || Math.abs(pitch) > 24 || !Number.isSafeInteger(seed)) throw new Error('Некорректный pitch или seed.');
  const total = Math.max(1, Math.round(duration * sampleRate));
  const outputTotal = options.limitSeconds === undefined ? total : Math.min(total, Math.max(1, Math.round(options.limitSeconds * sampleRate)));
  if (!Number.isFinite(outputTotal) || outputTotal < 1) throw new Error('Некорректное ограничение preview.');
  const n = quality === 'preview' ? 2048 : 8192;
  const hop = n / 4, half = n / 2, factor = 2 ** (pitch / 12);
  const window = Float32Array.from({ length: n }, (_, i) => .5 - .5 * Math.cos(2 * Math.PI * i / n));
  const state = channels.map(() => ({ real: new Float32Array(n), imag: new Float32Array(n), mag: new Float32Array(half + 1), phase: new Float32Array(half + 1), ola: new Float32Array(n) }));
  // Three preroll windows eliminate startup OLA discontinuities.
  for (let position = -3 * hop; position < outputTotal; position += hop) {
    const center = Math.max(0, Math.min(channels[0].length - 1, (position + half) / total * channels[0].length));
    for (let ch = 0; ch < channels.length; ch++) {
      const { real, imag, mag, phase, ola } = state[ch];
      const input = channels[ch];
      for (let i = 0; i < n; i++) {
        const index = Math.round(center + i - half);
        real[i] = (index >= 0 && index < input.length ? input[index] : 0) * window[i];
        imag[i] = 0;
      }
      fft(real, imag, false);
      for (let k = 0; k <= half; k++) { mag[k] = Math.hypot(real[k], imag[k]); phase[k] = Math.atan2(imag[k], real[k]); }
      real.fill(0); imag.fill(0);
      const rng = new FastRNG(blockSeed(seed, position / hop));
      for (let k = 1; k < half; k++) {
        const source = k / factor, a = Math.floor(source), t = source - a;
        const angle = rng.unit() * 2 * Math.PI + (phase[Math.min(half, Math.round(source))] || 0);
        const amplitude = source < half ? Math.sqrt(((1 - t) * mag[a] ** 2 + t * mag[a + 1] ** 2) / factor) : 0;
        real[k] = amplitude * Math.cos(angle); imag[k] = amplitude * Math.sin(angle);
        real[n - k] = real[k]; imag[n - k] = -imag[k];
      }
      fft(real, imag, true);
      for (let i = 0; i < n; i++) ola[i] += real[i] * window[i];
    }
    if (position >= 0) {
      const count = Math.min(hop, outputTotal - position);
      const output = state.map(({ ola }) => Float32Array.from(ola.subarray(0, count), (v, i) => {
        const fade = Math.min(1, (position + i) / Math.max(1, Math.min(sampleRate * .01, outputTotal / 2)), (outputTotal - 1 - position - i) / Math.max(1, Math.min(sampleRate * .01, outputTotal / 2)));
        return v * Math.max(0, fade);
      }));
      yield { channels: output, position, total: outputTotal };
    }
    for (const { ola } of state) { ola.copyWithin(0, hop); ola.fill(0, n - hop); }
  }
}
