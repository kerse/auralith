import { renderBlocks, selectAudio } from './engine.js';
import { wavHeader, pcm16 } from './wav.js';
const $ = id => document.getElementById(id);
let url;
$('render').onclick = async () => {
  $('render').disabled = true;
  let context;
  try {
    const file = $('file').files[0];
    if (!file) throw new Error('Выберите WAV.');
    context = new AudioContext();
    const audio = await context.decodeAudioData(await file.arrayBuffer());
    const start = +$('start').value, end = +$('end').value;
    const channels = selectAudio(Array.from({ length: audio.numberOfChannels }, (_, i) => audio.getChannelData(i)), audio.sampleRate, start, end, $('reverse').checked);
    const options = { duration: (end - start) * +$('ratio').value, pitch: +$('pitch').value, seed: 1 };
    if (options.duration > 60) throw new Error('Прототип ограничен 60 секундами; часовой тест выполняется потоковым benchmark.');
    const parts = [wavHeader(Math.round(options.duration * audio.sampleRate), channels.length, audio.sampleRate)];
    for (const block of renderBlocks(channels, audio.sampleRate, options)) {
      parts.push(pcm16(block.channels, .7));
      $('status').textContent = `${Math.round((block.position + block.channels[0].length) / block.total * 100)}%`;
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    if (url) URL.revokeObjectURL(url);
    url = URL.createObjectURL(new Blob(parts, { type: 'audio/wav' }));
    $('audio').src = url; $('download').href = url; $('download').download = 'prototype_auralith.wav'; $('download').hidden = false;
  } catch (error) { $('status').textContent = error.message; }
  finally { await context?.close(); $('render').disabled = false; }
};
