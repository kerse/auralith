import { validateAudio } from './engine.js';
export const MAX_FILE_BYTES = 256 * 1024 * 1024;
export const MAX_DECODED_BYTES = 256 * 1024 * 1024;

export async function decodeFile(file) {
  if (!file || !file.size) throw new Error('Файл пуст. Выберите аудиозапись.');
  if (file.size > MAX_FILE_BYTES) throw new Error('Файл больше 256 МБ. Выберите более короткую запись.');
  if (!/\.(wav|mp3|ogg|m4a)$/i.test(file.name)) throw new Error('Поддерживаются WAV, MP3, OGG и M4A.');
  const bytes = await file.arrayBuffer();
  // For PCM WAV, keep the original rate and reject oversized decoded allocation early.
  let rate = 48000;
  const view = new DataView(bytes);
  if (bytes.byteLength >= 44 && view.getUint32(0) === 0x52494646 && view.getUint32(8) === 0x57415645) {
    let offset = 12;
    while (offset + 8 <= bytes.byteLength) {
      const size = view.getUint32(offset + 4, true);
      if (view.getUint32(offset) === 0x666d7420 && size >= 16 && offset + 24 <= bytes.byteLength) {
        rate = view.getUint32(offset + 12, true);
        const bits = view.getUint16(offset + 22, true);
        if (bits && file.size * 32 / bits > MAX_DECODED_BYTES) throw new Error('После декодирования WAV превысит лимит 256 МБ.');
        break;
      }
      offset += 8 + size + (size % 2);
    }
  }
  if (rate < 8000 || rate > 192000) throw new Error('Поддерживается sample rate от 8000 до 192000 Hz.');
  const context = new AudioContext({ sampleRate: rate });
  try {
    let buffer;
    try { buffer = await context.decodeAudioData(bytes); }
    catch { throw new Error('Не удалось декодировать файл. Он повреждён или его кодек не поддерживается браузером. Попробуйте WAV.'); }
    const decodedChannels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
    validateAudio(decodedChannels, buffer.sampleRate);
    if (buffer.length * buffer.numberOfChannels * 4 > MAX_DECODED_BYTES) throw new Error('Декодированное аудио превышает 256 МБ. Выберите более короткую запись.');
    // AudioBuffer belongs to this short-lived decoding context. Keep application-owned
    // PCM instead: workers and the player then read the same stable sample arrays.
    const channels = decodedChannels.map(channel => new Float32Array(channel));
    return { name: file.name, channels, sampleRate: buffer.sampleRate, duration: buffer.duration };
  } finally { await context.close(); }
}
