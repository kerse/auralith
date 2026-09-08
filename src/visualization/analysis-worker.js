self.onmessage = ({ data }) => {
  const { channels } = data;
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
  self.postMessage({ peaks }, peaks.flatMap(p => [p.min.buffer, p.max.buffer]));
};
