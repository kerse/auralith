const MIN_FREQUENCY = 30;

export function frequencyAtRow(row, height, nyquist) {
  if (nyquist <= MIN_FREQUENCY) return nyquist;
  return MIN_FREQUENCY * (nyquist / MIN_FREQUENCY) ** (1 - row / Math.max(1, height - 1));
}

export function rowAtFrequency(frequency, height, nyquist) {
  if (frequency <= MIN_FREQUENCY || nyquist <= MIN_FREQUENCY) return height - 1;
  return Math.max(0, Math.min(height - 1, (1 - Math.log(frequency / MIN_FREQUENCY) / Math.log(nyquist / MIN_FREQUENCY)) * (height - 1)));
}

export function gainAt(mask, width, height, x, y) {
  const left = Math.max(0, Math.min(width - 1, Math.floor(x))), right = Math.min(width - 1, left + 1);
  const top = Math.max(0, Math.min(height - 1, Math.floor(y))), bottom = Math.min(height - 1, top + 1);
  const tx = Math.max(0, Math.min(1, x - left)), ty = Math.max(0, Math.min(1, y - top));
  const a = mask[top * width + left] * (1 - tx) + mask[top * width + right] * tx;
  const b = mask[bottom * width + left] * (1 - tx) + mask[bottom * width + right] * tx;
  return a * (1 - ty) + b * ty;
}

export function paintSegment(mask, width, height, from, to, radius, delta, limit = 18) {
  const minX = Math.max(0, Math.floor(Math.min(from.x, to.x) - radius)), maxX = Math.min(width - 1, Math.ceil(Math.max(from.x, to.x) + radius));
  const minY = Math.max(0, Math.floor(Math.min(from.y, to.y) - radius)), maxY = Math.min(height - 1, Math.ceil(Math.max(from.y, to.y) + radius));
  const dx = to.x - from.x, dy = to.y - from.y, lengthSquared = dx * dx + dy * dy;
  for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
    let ratio = 0;
    if (lengthSquared) ratio = Math.max(0, Math.min(1, ((x - from.x) * dx + (y - from.y) * dy) / lengthSquared));
    const px = from.x + dx * ratio, py = from.y + dy * ratio, distance = Math.hypot(x - px, y - py);
    if (distance > radius) continue;
    const softness = (1 - distance / Math.max(.001, radius)) ** 2;
    const index = y * width + x;
    mask[index] = Math.max(-limit, Math.min(limit, mask[index] + delta * softness));
  }
}
