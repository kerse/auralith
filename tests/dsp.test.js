import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderBlocks, selectAudio } from '../src/audio/engine.js';
import { wavHeader, pcm16 } from '../src/audio/wav.js';
import { fft } from '../vendor/package/src/fft.js';

const sr = 16000;
const tone = (frequency, seconds = .25) => Float32Array.from({ length: sr * seconds }, (_, i) => .3 * Math.sin(2 * Math.PI * frequency * i / sr));
function collect(channels, options) { const out = channels.map(() => new Float32Array(Math.round(options.duration * sr))); for (const b of renderBlocks(channels, sr, options)) b.channels.forEach((c, i) => out[i].set(c, b.position)); return out; }
function dominant(data) { const n = 8192, real = data.slice(Math.floor(data.length / 2), Math.floor(data.length / 2) + n), imag = new Float32Array(n); for (let i = 0; i < n; i++) real[i] *= .5 - .5 * Math.cos(2 * Math.PI * i / n); fft(real, imag, false); let best = 1; for (let i = 2; i < n / 2; i++) if (Math.hypot(real[i], imag[i]) > Math.hypot(real[best], imag[best])) best = i; return best * sr / n; }
for (const ratio of [10, 100, 500]) test(`stretch x${ratio}: length, pitch, finite non-silent stereo`, () => {
  const output = collect([tone(440), tone(660)], { duration: .25 * ratio });
  assert.equal(output[0].length, sr * .25 * ratio);
  for (const [ch, expected] of [[output[0], 440], [output[1], 660]]) {
    assert.ok(Math.abs(dominant(ch) - expected) < 12);
    let energy = 0; for (const v of ch) { assert.ok(Number.isFinite(v)); energy += v * v; }
    assert.ok(Math.sqrt(energy / ch.length) > .01);
  }
});
for (const pitch of [-12, 12]) test(`pitch ${pitch} independent of length`, () => { const out = collect([tone(440)], { duration: 3, pitch }); assert.equal(out[0].length, sr * 3); assert.ok(Math.abs(dominant(out[0]) - 440 * 2 ** (pitch / 12)) < 12); });
test('determinism, stereo phase and source immutability', () => {
  const left = tone(440), right = left.map(v => -v), saved = left.slice();
  const a = collect([left, right], { duration: 1, seed: 9 }), b = collect([left, right], { duration: 1, seed: 9 });
  assert.deepEqual(a, b); assert.deepEqual(left, saved);
  for (let i = 0; i < a[0].length; i++) assert.ok(Math.abs(a[0][i] + a[1][i]) < .00001);
});
test('selection reverse precedes processing and never mutates source', () => { const input = new Float32Array([1, 2, 3, 4]); assert.deepEqual([...selectAudio([input], sr, 1 / sr, 4 / sr, true)[0]], [4, 3, 2]); assert.deepEqual([...input], [1, 2, 3, 4]); });
test('tiny fragments, silence and invalid parameters', () => {
  const out = collect([new Float32Array([1])], { duration: .01 }); assert.ok(out[0].every(Number.isFinite));
  assert.ok(collect([new Float32Array(100)], { duration: 1 })[0].every(v => v === 0));
  for (const duration of [NaN, 0, -1, 3601]) assert.throws(() => [...renderBlocks([tone(440)], sr, { duration })]);
});
test('PCM16 WAV header and interleaving', () => { const h = new DataView(wavHeader(2, 2, sr)); assert.equal(h.getUint32(40, true), 8); assert.equal(h.getUint16(22, true), 2); const p = new DataView(pcm16([new Float32Array([1, 0]), new Float32Array([-1, .5])])); assert.equal(p.getInt16(0, true), 32767); assert.equal(p.getInt16(2, true), -32768); assert.equal(p.getInt16(6, true), 16384); });
test('limited preview preserves time mapping of full render', () => {
  const input = [tone(440)];
  const full = [...renderBlocks(input, sr, { duration: 3, quality: 'preview' })];
  const limited = [...renderBlocks(input, sr, { duration: 3, quality: 'preview', limitSeconds: 1 })];
  assert.equal(limited.reduce((n, b) => n + b.channels[0].length, 0), sr);
  for (let i = 0; i < limited.length - 2; i++) assert.deepEqual(limited[i].channels, full[i].channels);
});
