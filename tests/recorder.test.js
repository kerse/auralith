import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyseFrame, joinChunks, MAX_RECORDING_BYTES } from '../src/audio/capture.js';

test('recorder joins PCM chunks without gaps', () => {
  const joined = joinChunks([new Float32Array([.1, -.2]), new Float32Array([.3])], 3);
  assert.deepEqual([...joined], [...new Float32Array([.1, -.2, .3])]);
});

test('live analysis identifies silence, voice and clipping', () => {
  const silence = analyseFrame(new Float32Array(64));
  assert.equal(silence.speaking, false); assert.equal(silence.clipping, false); assert.equal(silence.rmsDb, -96);
  const voice = analyseFrame(Float32Array.from({ length: 64 }, (_, index) => index % 2 ? .2 : -.2));
  assert.equal(voice.speaking, true); assert.equal(voice.clipping, false); assert.ok(voice.rmsDb > -15 && voice.rmsDb < -13);
  const clipped = analyseFrame(new Float32Array([0, .99, 0, -.4]));
  assert.equal(clipped.clipping, true); assert.ok(Math.abs(clipped.peak - .99) < 1e-6);
});

test('capture ceiling leaves headroom below decoded-file allocation', () => {
  assert.equal(MAX_RECORDING_BYTES, 64 * 1024 * 1024);
  assert.ok(MAX_RECORDING_BYTES * 3 <= 256 * 1024 * 1024);
});
