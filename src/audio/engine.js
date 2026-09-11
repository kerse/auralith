// Auralith streaming spectral renderer. FFT and seeded RNG: ArrayPress, MIT.
import { fft } from '../../vendor/package/src/fft.js';
import { FastRNG, blockSeed } from '../../vendor/package/src/rng.js';
import { compileSpeedCurve } from './speed-curve.js';

const principalAngle = value => { let angle = value % (2 * Math.PI); if (angle > Math.PI) angle -= 2 * Math.PI; if (angle <= -Math.PI) angle += 2 * Math.PI; return angle; };

function spectralPeaks(magnitudes, half) {
  let maximum = 0, strongest = 1;
  for (let bin = 1; bin < half; bin++) if (magnitudes[bin] > maximum) { maximum = magnitudes[bin]; strongest = bin; }
  const threshold = maximum * .015, peaks = [];
  for (let bin = 1; bin < half; bin++) if (magnitudes[bin] >= threshold && magnitudes[bin] >= magnitudes[bin - 1] && magnitudes[bin] > magnitudes[bin + 1]) peaks.push(bin);
  return peaks.length ? peaks : [strongest];
}

function advancePhase(outputPhase, previousPhase, phase, bin, size, synthesisHop, analysisHop, first) {
  if (first) return phase;
  const omega = 2 * Math.PI * bin / size;
  if (analysisHop <= 1e-9) return principalAngle(outputPhase + omega * synthesisHop);
  const expectedInput = omega * analysisHop, deviation = principalAngle(phase - previousPhase - expectedInput);
  return principalAngle(outputPhase + (expectedInput + deviation) * synthesisHop / analysisHop);
}

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
function* renderMappedBlocks(channels, sampleRate, options, sourceIndexAtOutputSample) {
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
    const center = Math.max(0, Math.min(channels[0].length - 1, sourceIndexAtOutputSample(position + half, total)));
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

export function* renderBlocks(channels, sampleRate, options = {}) {
  yield* renderMappedBlocks(channels, sampleRate, options, (position, total) => position / total * channels[0].length);
}

export function* renderSpeedCurveBlocks(channels, sampleRate, options = {}) {
  validateAudio(channels, sampleRate);
  const sourceDuration = channels[0].length / sampleRate;
  const mapping = compileSpeedCurve(options.curve, sourceDuration, options.curveResolution || 8192);
  const total = Math.max(1, Math.round(mapping.duration * sampleRate));
  const outputTotal = options.limitSeconds === undefined ? total : Math.min(total, Math.max(1, Math.round(options.limitSeconds * sampleRate)));
  const n = options.quality === 'preview' ? 2048 : 4096, hop = n / 4, half = n / 2, preserveTransients = options.preserveTransients !== false;
  const window = Float32Array.from({ length: n }, (_, index) => .5 - .5 * Math.cos(2 * Math.PI * index / (n - 1)));
  const states = channels.map(() => ({ real: new Float32Array(n), imag: new Float32Array(n), magnitudes: new Float32Array(half + 1), phases: new Float64Array(half + 1), previousMagnitudes: new Float32Array(half + 1), previousPhase: new Float64Array(half + 1), outputPhase: new Float64Array(half + 1), ola: new Float32Array(n), lastTransient: -Infinity }));
  let previousInputStart = 0, firstWindow = true;
  for (let position = 0; position < outputTotal; position += hop) {
    const inputStart = mapping.sourceTimeAt(position / sampleRate) * sampleRate;
    const analysisHop = inputStart - previousInputStart;
    for (let channelIndex = 0; channelIndex < channels.length; channelIndex++) {
      const input = channels[channelIndex], state = states[channelIndex], { real, imag, magnitudes, phases, previousMagnitudes, previousPhase, outputPhase, ola } = state;
      for (let index = 0; index < n; index++) {
        const sourceIndex = inputStart + index, base = Math.floor(sourceIndex), fraction = sourceIndex - base;
        const a = base >= 0 && base < input.length ? input[base] : 0, b = base + 1 >= 0 && base + 1 < input.length ? input[base + 1] : 0;
        real[index] = (a + (b - a) * fraction) * window[index]; imag[index] = 0;
      }
      fft(real, imag, false);
      let positiveFlux = 0, previousEnergy = 0;
      for (let bin = 0; bin <= half; bin++) {
        const magnitude = Math.hypot(real[bin], imag[bin]); magnitudes[bin] = magnitude; phases[bin] = Math.atan2(imag[bin], real[bin]);
        positiveFlux += Math.max(0, magnitude - previousMagnitudes[bin]); previousEnergy += previousMagnitudes[bin];
      }
      // A spectral-flux onset gets the source phases for one frame. This keeps
      // a drum hit or consonant intact instead of stretching it into a shimmer.
      const transient = preserveTransients && !firstWindow && position - state.lastTransient >= hop * 2 && positiveFlux / Math.max(1e-9, previousEnergy) > .22;
      if (transient) state.lastTransient = position;
      if (transient) {
        for (let bin = 0; bin <= half; bin++) outputPhase[bin] = phases[bin];
      } else {
        const peaks = spectralPeaks(magnitudes, half);
        for (const peak of peaks) outputPhase[peak] = advancePhase(outputPhase[peak], previousPhase[peak], phases[peak], peak, n, hop, analysisHop, firstWindow);
        // Identity phase locking: only spectral peaks advance independently;
        // surrounding bins retain their original relative phase to that peak.
        let peakIndex = 0;
        for (let bin = 1; bin < half; bin++) {
          while (peakIndex + 1 < peaks.length && Math.abs(peaks[peakIndex + 1] - bin) <= Math.abs(peaks[peakIndex] - bin)) peakIndex++;
          const peak = peaks[peakIndex];
          if (bin !== peak) outputPhase[bin] = principalAngle(outputPhase[peak] + principalAngle(phases[bin] - phases[peak]));
        }
        outputPhase[0] = phases[0]; outputPhase[half] = phases[half];
      }
      for (let bin = 0; bin <= half; bin++) {
        previousPhase[bin] = phases[bin]; previousMagnitudes[bin] = magnitudes[bin];
        const outputReal = magnitudes[bin] * Math.cos(outputPhase[bin]), outputImag = magnitudes[bin] * Math.sin(outputPhase[bin]);
        real[bin] = outputReal; imag[bin] = bin === 0 || bin === half ? 0 : outputImag;
        if (bin > 0 && bin < half) { real[n - bin] = outputReal; imag[n - bin] = -outputImag; }
      }
      fft(real, imag, true);
      for (let index = 0; index < n; index++) ola[index] += real[index] * window[index];
    }
    const count = Math.min(hop, outputTotal - position), fadeFrames = Math.max(1, Math.min(sampleRate * .01, outputTotal / 2));
    const output = states.map(({ ola }) => Float32Array.from(ola.subarray(0, count), (value, index) => {
      const fade = Math.min(1, (position + index) / fadeFrames, (outputTotal - 1 - position - index) / fadeFrames);
      return value * Math.max(0, fade);
    }));
    yield { channels: output, position, total: outputTotal };
    for (const { ola } of states) { ola.copyWithin(0, hop); ola.fill(0, n - hop); }
    previousInputStart = inputStart; firstWindow = false;
  }
}
