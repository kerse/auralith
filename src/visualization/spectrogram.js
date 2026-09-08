import { t } from '../ui/i18n.js';

export async function loadSpectrogram(waveform, source) {
  const slot = document.querySelector('#spectrogram-slot');
  waveform.drawSpectrogram = null;
  slot.innerHTML = `<p class="muted" role="status">${t('spectrogram.calculating')}</p>`;
  try {
    const data = await new Promise((resolve, reject) => {
      const worker = new Worker(new URL('./spectrogram-worker.js', import.meta.url), { type: 'module' });
      worker.onmessage = ({ data }) => { worker.terminate(); resolve(data); };
      worker.onerror = () => { worker.terminate(); reject(new Error(t('error.spectrogram'))); };
      worker.postMessage({ channels: source.channels, sampleRate: source.sampleRate });
    });
    const bitmap = document.createElement('canvas'); bitmap.width = data.width; bitmap.height = data.height;
    bitmap.getContext('2d').putImageData(new ImageData(data.pixels, data.width, data.height), 0, 0);
    const render = () => {
      slot.innerHTML = `<div class="view-toolbar"><span>${t('spectrogram.title')}</span><span class="spectral-legend">−90 dB <i></i> 0 dB</span></div><canvas id="spectrogram" aria-label="${t('spectrogram.aria')}"></canvas><p class="hint">${t('spectrogram.hint', { width: data.width })}${data.width === 2048 ? t('spectrogram.overview') : ''}</p>`;
      const canvas = document.querySelector('#spectrogram'); waveform.bindPointer(canvas);
      waveform.drawSpectrogram = () => {
      const width = canvas.clientWidth, height = 160, dpr = devicePixelRatio || 1;
      canvas.width = Math.round(width * dpr); canvas.height = height * dpr; canvas.style.height = `${height}px`;
      const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr);
      ctx.drawImage(bitmap, waveform.offset / source.duration * data.width, 0, waveform.visibleDuration / source.duration * data.width, data.height, 0, 0, width, height);
      waveform.drawSelection(ctx, width, height);
      ctx.font = '12px Consolas';
      for (const frequency of [30, 100, 1000, 10000]) {
        if (frequency >= source.sampleRate / 2) continue;
        const y = Math.max(12, Math.min(height - 4, height * (1 - Math.log(frequency / 30) / Math.log(source.sampleRate / 2 / 30))));
        const label = frequency >= 1000 ? `${frequency / 1000} kHz` : `${frequency} Hz`;
        ctx.fillStyle = '#19332fee'; ctx.fillRect(3, y - 11, 64, 15); ctx.fillStyle = '#f8f4e9'; ctx.fillText(label, 7, y);
      }
      };
      waveform.drawSpectrogram();
    };
    if (waveform.refreshSpectrogramLanguage) document.removeEventListener('languagechange', waveform.refreshSpectrogramLanguage);
    waveform.refreshSpectrogramLanguage = render;
    document.addEventListener('languagechange', render);
    render();
  } catch (error) { slot.textContent = error.message; }
}
