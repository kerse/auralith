export function reverseChannels(channels) {
  return channels.map(channel => Float32Array.from(channel, (_, index) => channel[channel.length - 1 - index]));
}

/**
 * Creates one seamless forward/backward cycle. The endpoints are not repeated:
 * [1, 2, 3, 4] becomes [1, 2, 3, 4, 3, 2].
 */
export function pingPongChannels(channels) {
  return channels.map(channel => {
    if (channel.length < 2) return channel.slice();
    const output = new Float32Array(channel.length * 2 - 2);
    output.set(channel);
    for (let index = 1; index < channel.length - 1; index++) output[channel.length - 1 + index] = channel[channel.length - 1 - index];
    return output;
  });
}

export function pingPongTime(time, duration) {
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  const cycle = Math.max(0, 2 * duration);
  const offset = ((time % cycle) + cycle) % cycle;
  return offset <= duration ? offset : cycle - offset;
}
