// Capture keeps chunks, a joined PCM buffer, and temporary analysis-worker copies.
// Its ceiling stays below the file decoder's 256 MiB limit to bound peak memory.
export const MAX_RECORDING_BYTES = 64 * 1024 * 1024;

const db = value => value > 0 ? Math.max(-96, 20 * Math.log10(value)) : -96;

export function analyseFrame(samples) {
  let sum = 0, peak = 0;
  for (const sample of samples) { const absolute = Math.abs(sample); sum += sample * sample; peak = Math.max(peak, absolute); }
  const rms = samples.length ? Math.sqrt(sum / samples.length) : 0;
  return { rms, peak, rmsDb: db(rms), peakDb: db(peak), speaking: rms > .004, clipping: peak >= .985 };
}

export function joinChunks(chunks, length) {
  const result = new Float32Array(length);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
  return result;
}
