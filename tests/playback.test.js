import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pingPongChannels, pingPongTime, reverseChannels } from '../src/audio/playback.js';

test('reverse playback copies channels without touching the source', () => {
  const source = new Float32Array([1, 2, 3, 4]);
  assert.deepEqual([...reverseChannels([source])[0]], [4, 3, 2, 1]);
  assert.deepEqual([...source], [1, 2, 3, 4]);
});

test('reverse loop returns through the interior without repeating endpoints', () => {
  const source = new Float32Array([1, 2, 3, 4]);
  assert.deepEqual([...pingPongChannels([source])[0]], [1, 2, 3, 4, 3, 2]);
  assert.deepEqual([...pingPongChannels([new Float32Array([7])])[0]], [7]);
});

test('reverse-loop playhead moves forward then backward', () => {
  assert.equal(pingPongTime(.25, 1), .25);
  assert.equal(pingPongTime(1, 1), 1);
  assert.equal(pingPongTime(1.25, 1), .75);
  assert.equal(pingPongTime(2.25, 1), .25);
});
