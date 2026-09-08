import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parameters } from '../src/audio/parameters.js';
test('parameters are deterministic, immutable and independent', () => { const range = { start: .2, end: .7 }; const a = parameters(range, 100, -12, true); assert.equal(a.stretch, 100 / (.7 - .2)); assert.equal(a.duration, parameters(range, 100, 12, false).duration); assert.deepEqual(a, parameters(range, 100, -12, true)); assert.ok(Object.isFrozen(a)); });
test('duration and pitch bounds', () => { for (const duration of [NaN, 0, .5, 3601]) assert.throws(() => parameters({ start: 0, end: 1 }, duration)); assert.equal(parameters({ start: 0, end: 1 }, 3600).stretch, 3600); assert.throws(() => parameters({ start: 0, end: 1 }, 10, 25)); });
