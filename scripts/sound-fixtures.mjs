import { mkdir, writeFile } from 'node:fs/promises';
import { wavHeader, pcm16 } from '../src/audio/wav.js';
export function fixtures(sampleRate = 48000, seconds = 1) {
  const count = sampleRate * seconds;
  let state = 1234;
  const noise = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 2147483648 - 1; };
  return {
    tone: [Float32Array.from({ length: count }, (_, i) => .3 * Math.sin(2 * Math.PI * 440 * i / sampleRate))],
    voice_synthetic: [Float32Array.from({ length: count }, (_, i) => { const t = i / sampleRate; return (.14 * Math.sin(2 * Math.PI * 120 * t) + .09 * Math.sin(2 * Math.PI * 720 * t) + .06 * Math.sin(2 * Math.PI * 1200 * t)) * (.7 + .3 * Math.sin(2 * Math.PI * 3 * t)); })],
    metal: [Float32Array.from({ length: count }, (_, i) => { const t = i / sampleRate; return Math.exp(-6 * t) * (.25 * Math.sin(2 * Math.PI * 883 * t) + .15 * Math.sin(2 * Math.PI * 1471 * t) + .1 * noise()); })],
    noise: [Float32Array.from({ length: count }, () => .2 * noise())],
    stereo: [Float32Array.from({ length: count }, (_, i) => .3 * Math.sin(2 * Math.PI * 440 * i / sampleRate)), Float32Array.from({ length: count }, (_, i) => .2 * Math.sin(2 * Math.PI * 660 * i / sampleRate))],
  };
}
if (process.argv[1]?.endsWith('sound-fixtures.mjs')) {
  await mkdir('tmp/fixtures', { recursive: true });
  for (const [name, channels] of Object.entries(fixtures())) await writeFile(`tmp/fixtures/${name}.wav`, Buffer.concat([Buffer.from(wavHeader(channels[0].length, channels.length, 48000)), Buffer.from(pcm16(channels))]));
  console.log('WAV fixtures: tmp/fixtures; voice_synthetic is a synthetic voiced test, not a human recording.');
}
