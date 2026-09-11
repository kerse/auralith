import { test } from 'node:test';
import assert from 'node:assert/strict';
import { frequencyAtRow, gainAt, paintSegment, rowAtFrequency } from '../src/audio/spectral-paint.js';

test('spectral paint keeps a logarithmic frequency mapping round-trip stable', () => {
  const height = 160, nyquist = 24000;
  for (const frequency of [30, 100, 440, 1000, 8000, 22000]) {
    const row = rowAtFrequency(frequency, height, nyquist);
    assert.ok(Math.abs(frequencyAtRow(row, height, nyquist) - frequency) / frequency < .00001);
  }
});

test('a soft brush affects its centre more than its edge and respects gain limits', () => {
  const width = 20, height = 20, mask = new Float32Array(width * height);
  paintSegment(mask, width, height, { x: 10, y: 10 }, { x: 10, y: 10 }, 5, 12);
  assert.ok(mask[10 * width + 10] > mask[10 * width + 12]);
  assert.equal(mask[10 * width + 16], 0);
  paintSegment(mask, width, height, { x: 10, y: 10 }, { x: 10, y: 10 }, 5, 100);
  assert.equal(mask[10 * width + 10], 18);
});

test('gain interpolation stays within nearby painted values', () => {
  const mask = new Float32Array([0, 10, 10, 18]);
  assert.equal(gainAt(mask, 2, 2, 0, 0), 0);
  assert.ok(gainAt(mask, 2, 2, .5, .5) > 8 && gainAt(mask, 2, 2, .5, .5) < 12);
});
