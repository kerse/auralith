self.onmessage = ({ data }) => {
  const { channels, loudness: includeLoudness = false } = data;
  const bins = Math.min(65536, channels[0].length), step = channels[0].length / bins;
  const peaks = channels.map(channel => {
    const min = new Float32Array(bins), max = new Float32Array(bins);
    for (let b = 0; b < bins; b++) {
      let lo = 1, hi = -1;
      for (let i = Math.floor(b * step); i < Math.floor((b + 1) * step); i++) { lo = Math.min(lo, channel[i]); hi = Math.max(hi, channel[i]); }
      min[b] = lo; max[b] = hi;
    }
    return { min, max };
  });
  let loudness;
  if (includeLoudness) {
    const windows = Math.min(4096, Math.max(128, Math.ceil(channels[0].length / 1024)));
    loudness = new Float32Array(windows);
    const step = channels[0].length / windows;
    for (let window = 0; window < windows; window++) {
      let energy = 0, count = 0;
      const from = Math.floor(window * step), to = Math.max(from + 1, Math.floor((window + 1) * step));
      for (const channel of channels) for (let index = from; index < to; index++) { const value = channel[index] || 0; energy += value * value; count++; }
      loudness[window] = 20 * Math.log10(Math.max(1e-6, Math.sqrt(energy / Math.max(1, count))));
    }
  }
  const transfers = peaks.flatMap(p => [p.min.buffer, p.max.buffer]);
  if (loudness) transfers.push(loudness.buffer);
  self.postMessage({ peaks, loudness }, transfers);
};
