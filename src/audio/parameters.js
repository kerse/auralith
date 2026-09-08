export function parameters(selection, duration, pitch = 0, reverse = false) {
  const { start, end } = selection;
  if (!Number.isFinite(start + end) || start < 0 || end <= start) throw new Error('Некорректное выделение.');
  if (!Number.isFinite(duration) || duration < end - start || duration > 3600) throw new Error('Результат должен быть не короче фрагмента и не длиннее 3600 секунд.');
  if (!Number.isFinite(pitch) || Math.abs(pitch) > 24) throw new Error('Pitch должен быть от −24 до +24 semitones.');
  return Object.freeze({ start, end, duration, stretch: duration / (end - start), pitch, reverse: Boolean(reverse), seed: 1, engineVersion: 1 });
}
