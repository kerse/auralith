export function wavHeader(frames, channels, sampleRate) {
  const size = frames * channels * 2;
  if (!Number.isSafeInteger(size) || size < 0 || size > 0xffffffff - 36) throw new Error('WAV превышает лимит RIFF.');
  const buffer = new ArrayBuffer(44), v = new DataView(buffer);
  const text = (at, s) => { for (let i = 0; i < s.length; i++) v.setUint8(at + i, s.charCodeAt(i)); };
  text(0, 'RIFF'); v.setUint32(4, 36 + size, true); text(8, 'WAVE'); text(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, channels, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * channels * 2, true);
  v.setUint16(32, channels * 2, true); v.setUint16(34, 16, true); text(36, 'data'); v.setUint32(40, size, true);
  return buffer;
}

export function pcm16(channels, gain = 1) {
  const out = new ArrayBuffer(channels[0].length * channels.length * 2), view = new DataView(out);
  let offset = 0;
  for (let i = 0; i < channels[0].length; i++) for (const channel of channels) {
    const value = channel[i] * gain;
    if (!Number.isFinite(value)) throw new Error('DSP выдал некорректный отсчёт.');
    const sample = Math.max(-1, Math.min(1, value));
    view.setInt16(offset, Math.round(sample * (sample < 0 ? 32768 : 32767)), true); offset += 2;
  }
  return out;
}
