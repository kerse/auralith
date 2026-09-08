import { fft } from '../../vendor/package/src/fft.js';
self.onmessage = ({ data: { channels, sampleRate } }) => {
  const n = 2048, height = 160, width = Math.min(2048, Math.max(32, Math.ceil(channels[0].length / 512)));
  const pixels = new Uint8ClampedArray(width * height * 4);
  const real = new Float32Array(n), imag = new Float32Array(n), power = new Float32Array(n / 2 + 1);
  const window = Float32Array.from({ length: n }, (_, i) => .5 - .5 * Math.cos(2 * Math.PI * i / n));
  for (let x = 0; x < width; x++) {
    power.fill(0);
    const center = Math.round((x + .5) / width * channels[0].length);
    for (const channel of channels) {
      for (let i = 0; i < n; i++) { real[i] = (channel[center + i - n / 2] || 0) * window[i]; imag[i] = 0; }
      fft(real, imag, false);
      for (let k = 0; k <= n / 2; k++) power[k] += (real[k] ** 2 + imag[k] ** 2) / channels.length;
    }
    for (let y = 0; y < height; y++) {
      const frequency = 30 * (sampleRate / 2 / 30) ** (1 - y / (height - 1));
      const bin = Math.min(n / 2, Math.max(1, Math.round(frequency * n / sampleRate)));
      const db = 10 * Math.log10(Math.max(1e-12, power[bin] / (n * n / 16)));
      const value = Math.max(0, Math.min(1, (db + 90) / 90));
      // Dark green → ochre → cream; the scale is fixed across files.
      const stops = [[25, 51, 47], [61, 112, 95], [185, 145, 68], [251, 231, 176]];
      const part = Math.min(2, Math.floor(value * 3)), t = value * 3 - part, offset = (y * width + x) * 4;
      for (let rgb = 0; rgb < 3; rgb++) pixels[offset + rgb] = stops[part][rgb] * (1 - t) + stops[part + 1][rgb] * t;
      pixels[offset + 3] = 255;
    }
  }
  self.postMessage({ pixels, width, height }, [pixels.buffer]);
};
