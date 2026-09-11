export const MIN_SPEED = 0.1;
export const MAX_SPEED = 4;
export const MAX_RESULT_DURATION = 3600;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const cubic = (a, b, c, d, u) => {
  const v = 1 - u;
  return v ** 3 * a + 3 * v ** 2 * u * b + 3 * v * u ** 2 * c + u ** 3 * d;
};

export function linearCurve(speeds = [1, 1]) {
  const points = speeds.map((speed, index) => ({ x: index / (speeds.length - 1), speed: clamp(speed, MIN_SPEED, MAX_SPEED) }));
  return withLinearHandles(points);
}

export function withLinearHandles(points) {
  const output = points.map(point => ({ x: point.x, speed: point.speed, left: point.left, right: point.right }));
  for (let index = 0; index < output.length - 1; index++) {
    const a = output[index], b = output[index + 1];
    a.right = { x: a.x + (b.x - a.x) / 3, speed: a.speed + (b.speed - a.speed) / 3 };
    b.left = { x: a.x + 2 * (b.x - a.x) / 3, speed: a.speed + 2 * (b.speed - a.speed) / 3 };
  }
  return output;
}

export function smoothCurve(points) {
  const output = points.map(point => ({ x: point.x, speed: point.speed }));
  for (let index = 0; index < output.length; index++) {
    const point = output[index], previous = output[Math.max(0, index - 1)], next = output[Math.min(output.length - 1, index + 1)];
    const slope = (next.speed - previous.speed) / Math.max(1e-9, next.x - previous.x);
    if (index > 0) {
      const dx = (point.x - previous.x) / 3;
      point.left = { x: point.x - dx, speed: clamp(point.speed - slope * dx, MIN_SPEED, MAX_SPEED) };
    }
    if (index < output.length - 1) {
      const dx = (next.x - point.x) / 3;
      point.right = { x: point.x + dx, speed: clamp(point.speed + slope * dx, MIN_SPEED, MAX_SPEED) };
    }
  }
  return output;
}

export function shapeCurvePoint(input, selectedIndex, mode) {
  const points = sanitizeCurve(input), index = Math.max(0, Math.min(points.length - 1, selectedIndex)), point = points[index], previous = points[index - 1], next = points[index + 1];
  if (mode === 'smooth') {
    const before = previous || point, after = next || point, slope = (after.speed - before.speed) / Math.max(1e-9, after.x - before.x);
    if (previous) { const dx = (point.x - previous.x) / 3; point.left = { x: point.x - dx, speed: clamp(point.speed - slope * dx, MIN_SPEED, MAX_SPEED) }; }
    if (next) { const dx = (next.x - point.x) / 3; point.right = { x: point.x + dx, speed: clamp(point.speed + slope * dx, MIN_SPEED, MAX_SPEED) }; }
  } else if (mode === 'corner') {
    if (previous) point.left = { x: point.x - (point.x - previous.x) / 3, speed: point.speed - (point.speed - previous.speed) / 3 };
    if (next) point.right = { x: point.x + (next.x - point.x) / 3, speed: point.speed + (next.speed - point.speed) / 3 };
  } else throw new Error('Неизвестный режим точки кривой.');
  return sanitizeCurve(points);
}

export function sanitizeCurve(input) {
  if (!Array.isArray(input) || input.length < 2) throw new Error('Кривая скорости должна содержать хотя бы две точки.');
  const points = input.map(point => ({
    x: clamp(Number(point.x), 0, 1),
    speed: clamp(Number(point.speed), MIN_SPEED, MAX_SPEED),
    left: point.left && { x: Number(point.left.x), speed: Number(point.left.speed) },
    right: point.right && { x: Number(point.right.x), speed: Number(point.right.speed) }
  })).sort((a, b) => a.x - b.x);
  if (points.some(point => !Number.isFinite(point.x + point.speed))) throw new Error('Кривая скорости содержит некорректные значения.');
  points[0].x = 0; points.at(-1).x = 1;
  for (let index = 1; index < points.length; index++) {
    if (points[index].x - points[index - 1].x < 1e-6) throw new Error('Точки кривой должны иметь разные позиции.');
  }
  for (let index = 0; index < points.length - 1; index++) {
    const a = points[index], b = points[index + 1], dx = b.x - a.x;
    a.right ||= { x: a.x + dx / 3, speed: a.speed + (b.speed - a.speed) / 3 };
    b.left ||= { x: a.x + 2 * dx / 3, speed: a.speed + 2 * (b.speed - a.speed) / 3 };
    a.right.x = clamp(Number(a.right.x), a.x, b.x);
    a.right.speed = clamp(Number(a.right.speed), MIN_SPEED, MAX_SPEED);
    b.left.x = clamp(Number(b.left.x), a.x, b.x);
    b.left.speed = clamp(Number(b.left.speed), MIN_SPEED, MAX_SPEED);
    if (!Number.isFinite(a.right.x + a.right.speed + b.left.x + b.left.speed)) throw new Error('Ручки кривой содержат некорректные значения.');
    if (a.right.x > b.left.x) { const middle = (a.right.x + b.left.x) / 2; a.right.x = middle; b.left.x = middle; }
  }
  return points;
}

function segmentAt(points, x) {
  let low = 0, high = points.length - 2;
  while (low < high) {
    const middle = Math.floor((low + high + 1) / 2);
    if (points[middle].x <= x) low = middle; else high = middle - 1;
  }
  return Math.min(points.length - 2, low);
}

function evaluateSanitized(points, sourceFraction) {
  const x = clamp(sourceFraction, 0, 1), index = segmentAt(points, x), a = points[index], b = points[index + 1];
  if (x <= a.x) return a.speed;
  if (x >= b.x) return b.speed;
  let low = 0, high = 1;
  for (let iteration = 0; iteration < 28; iteration++) {
    const middle = (low + high) / 2;
    if (cubic(a.x, a.right.x, b.left.x, b.x, middle) < x) low = middle; else high = middle;
  }
  const u = (low + high) / 2;
  return clamp(cubic(a.speed, a.right.speed, b.left.speed, b.speed, u), MIN_SPEED, MAX_SPEED);
}

export function evaluateSpeed(input, sourceFraction) {
  return evaluateSanitized(sanitizeCurve(input), sourceFraction);
}

export function compileSpeedCurve(input, sourceDuration, resolution = 8192) {
  if (!Number.isFinite(sourceDuration) || sourceDuration <= 0) throw new Error('Длительность источника должна быть больше нуля.');
  const points = sanitizeCurve(input), steps = Math.max(64, Math.min(65536, Math.round(resolution)));
  const resultTimes = new Float64Array(steps + 1), speeds = new Float64Array(steps + 1);
  for (let index = 0; index <= steps; index++) speeds[index] = evaluateSanitized(points, index / steps);
  for (let index = 1; index <= steps; index++) {
    const midpointSpeed = evaluateSanitized(points, (index - .5) / steps);
    resultTimes[index] = resultTimes[index - 1] + sourceDuration / steps / midpointSpeed;
  }
  const duration = resultTimes[steps];
  if (!Number.isFinite(duration) || duration <= 0 || duration > MAX_RESULT_DURATION) throw new Error('Результат Speed Curve должен быть не длиннее 1 часа.');
  const locate = (array, value) => {
    let low = 0, high = array.length - 1;
    while (low + 1 < high) { const middle = (low + high) >> 1; if (array[middle] <= value) low = middle; else high = middle; }
    return low;
  };
  return Object.freeze({
    points,
    sourceDuration,
    duration,
    speedAt(sourceTime) { return evaluateSanitized(points, clamp(sourceTime / sourceDuration, 0, 1)); },
    resultTimeAt(sourceTime) {
      const fraction = clamp(sourceTime / sourceDuration, 0, 1), position = fraction * steps, index = Math.min(steps - 1, Math.floor(position));
      return resultTimes[index] + (resultTimes[index + 1] - resultTimes[index]) * (position - index);
    },
    sourceTimeAt(resultTime) {
      const value = clamp(resultTime, 0, duration), index = Math.min(steps - 1, locate(resultTimes, value)), span = resultTimes[index + 1] - resultTimes[index];
      return (index + (span ? (value - resultTimes[index]) / span : 0)) / steps * sourceDuration;
    }
  });
}

export function curvePreset(name) {
  if (name === 'ramp-up') return linearCurve([.35, 2]);
  if (name === 'ramp-down') return linearCurve([2, .35]);
  if (name === 'zigzag') return withLinearHandles(Array.from({ length: 9 }, (_, index) => ({ x: index / 8, speed: index % 2 ? 2 : .4 })));
  if (name === 'pulse') return withLinearHandles([
    { x: 0, speed: .5 }, { x: .23, speed: .5 }, { x: .25, speed: 2 }, { x: .48, speed: 2 },
    { x: .5, speed: .5 }, { x: .73, speed: .5 }, { x: .75, speed: 2 }, { x: .98, speed: 2 }, { x: 1, speed: .5 }
  ]);
  if (name === 'sine') return smoothCurve(Array.from({ length: 17 }, (_, index) => ({ x: index / 16, speed: 1.2 + .8 * Math.sin(index / 16 * Math.PI * 4) })));
  return linearCurve();
}
