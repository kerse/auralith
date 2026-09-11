import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileSpeedCurve, curvePreset, evaluateSpeed, linearCurve, sanitizeCurve, shapeCurvePoint } from '../src/audio/speed-curve.js';
import { renderSpeedCurveBlocks } from '../src/audio/engine.js';
import { fft } from '../vendor/package/src/fft.js';

const sampleRate = 8000;
const tone = (frequency, seconds = 1) => Float32Array.from({ length: sampleRate * seconds }, (_, index) => .25 * Math.sin(2 * Math.PI * frequency * index / sampleRate));
function dominant(data) { const size = 2048, real = data.slice(Math.max(0, Math.floor((data.length - size) / 2)), Math.max(0, Math.floor((data.length - size) / 2)) + size), imag = new Float32Array(size); for (let index = 0; index < size; index++) real[index] *= .5 - .5 * Math.cos(2 * Math.PI * index / size); fft(real, imag, false); let best = 2; for (let index = 3; index < size / 2; index++) if (Math.hypot(real[index], imag[index]) > Math.hypot(real[best], imag[best])) best = index; return best * sampleRate / size; }

test('constant speed produces the expected duration and reversible time mapping', () => {
  for (const speed of [.25, 1, 2, 4]) {
    const mapping = compileSpeedCurve(linearCurve([speed, speed]), 12);
    assert.ok(Math.abs(mapping.duration - 12 / speed) < 1e-8);
    for (const sourceTime of [0, 1.25, 6, 11.9, 12]) {
      const resultTime = mapping.resultTimeAt(sourceTime);
      assert.ok(Math.abs(mapping.sourceTimeAt(resultTime) - sourceTime) < .001);
    }
  }
});

test('Bezier evaluation follows handles and remains inside allowed speed bounds', () => {
  const curve = sanitizeCurve([
    { x: 0, speed: 1, right: { x: .2, speed: 4 } },
    { x: 1, speed: 1, left: { x: .8, speed: 4 } }
  ]);
  assert.ok(evaluateSpeed(curve, .5) > 3);
  assert.equal(sanitizeCurve([{ x: 0, speed: 0 }, { x: 1, speed: 99 }])[0].speed, .1);
  assert.equal(sanitizeCurve([{ x: 0, speed: 0 }, { x: 1, speed: 99 }])[1].speed, 4);
  const crossed = sanitizeCurve([{ x: 0, speed: 1, right: { x: .9, speed: 2 } }, { x: 1, speed: 1, left: { x: .1, speed: .5 } }]);
  assert.equal(crossed[0].right.x, crossed[1].left.x); assert.ok(Number.isFinite(evaluateSpeed(crossed, .5)));
});

test('presets have fixed endpoints and valid ordered points', () => {
  for (const name of ['linear', 'ramp-up', 'ramp-down', 'sine', 'zigzag', 'pulse']) {
    const points = sanitizeCurve(curvePreset(name));
    assert.equal(points[0].x, 0); assert.equal(points.at(-1).x, 1);
    assert.ok(points.every((point, index) => !index || point.x > points[index - 1].x));
  }
});

test('selected point can switch between smooth and corner geometry', () => {
  const input = sanitizeCurve([{ x: 0, speed: .5 }, { x: .5, speed: 2 }, { x: 1, speed: 1 }]);
  const smooth = shapeCurvePoint(input, 1, 'smooth'), corner = shapeCurvePoint(input, 1, 'corner');
  const leftSmoothSlope = (smooth[1].speed - smooth[1].left.speed) / (smooth[1].x - smooth[1].left.x), rightSmoothSlope = (smooth[1].right.speed - smooth[1].speed) / (smooth[1].right.x - smooth[1].x);
  assert.ok(Math.abs(leftSmoothSlope - rightSmoothSlope) < 1e-8);
  const leftCornerSlope = (corner[1].speed - corner[1].left.speed) / (corner[1].x - corner[1].left.x), rightCornerSlope = (corner[1].right.speed - corner[1].speed) / (corner[1].right.x - corner[1].x);
  assert.ok(Math.abs(leftCornerSlope - rightCornerSlope) > .1);
});

test('speed curve renderer keeps source immutable and emits the mapped length', () => {
  const source = tone(440), saved = source.slice(), curve = linearCurve([2, 2]);
  const blocks = [...renderSpeedCurveBlocks([source], sampleRate, { curve, quality: 'preview' })];
  assert.equal(blocks.at(-1).position + blocks.at(-1).channels[0].length, sampleRate / 2);
  assert.deepEqual(source, saved);
  assert.ok(blocks.some(block => block.channels[0].some(value => value !== 0)));
  assert.ok(blocks.every(block => block.channels[0].every(Number.isFinite)));
});

test('speed curve renderer preserves pitch while speed changes', () => {
  for (const speed of [.5, 2]) {
    const output = new Float32Array(Math.round(sampleRate / speed));
    for (const block of renderSpeedCurveBlocks([tone(440)], sampleRate, { curve: linearCurve([speed, speed]), quality: 'preview' })) output.set(block.channels[0], block.position);
    assert.ok(Math.abs(dominant(output) - 440) < 16);
  }
});

test('smooth, zigzag and pulse curves render finite audio at the mapped duration', () => {
  const source = tone(330, .2);
  for (const name of ['sine', 'zigzag', 'pulse']) {
    const curve = curvePreset(name), mapping = compileSpeedCurve(curve, source.length / sampleRate); let frames = 0;
    for (const block of renderSpeedCurveBlocks([source], sampleRate, { curve, quality: 'preview' })) { frames += block.channels[0].length; assert.ok(block.channels[0].every(Number.isFinite)); }
    assert.equal(frames, Math.round(mapping.duration * sampleRate));
  }
});

test('result duration over one hour is rejected', () => {
  assert.throws(() => compileSpeedCurve(linearCurve([.1, .1]), 361));
});
