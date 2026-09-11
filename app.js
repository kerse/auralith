import { mountSource } from './src/ui/source.js';
import { Waveform } from './src/visualization/waveform.js';
import { loadSpectrogram } from './src/visualization/spectrogram.js';
import { ProcessingControls } from './src/ui/processing.js';
import { ResultControls } from './src/ui/results.js';
import { ExportControls } from './src/ui/export.js';
import { initI18n, t } from './src/ui/i18n.js';
import { SpeedCurveApp } from './src/ui/speed-curve.js';
import { SoundPaintApp } from './src/ui/sound-paint.js';

let source = null;
let results;
initI18n();
const processing = new ProcessingControls(() => results?.invalidate());
const waveform = new Waveform(selection => processing.setSelection(selection));
function setBusy(busy) {
  waveform.locked = busy; processing.locked = busy;
  processing.fields.disabled = busy || !source || (waveform.end - waveform.start > 3600);
  document.querySelectorAll('#selection-controls input, #source-play, #result-play, #audio-file').forEach(input => { input.disabled = busy; });
}
results = new ResultControls({ getSource: () => source, getParameters: () => processing.getParameters(), setBusy, waveform });
new ExportControls(results);
const speedCurve = new SpeedCurveApp(document.querySelector('#speed-curve-app'));
const soundPaint = new SoundPaintApp(document.querySelector('#sound-paint-app'));
mountSource(async loaded => { await waveform.load(loaded); source = loaded; results.invalidate(); await loadSpectrogram(waveform, loaded); }, loading => {
  results.loading = loading; if (loading) { results.invalidate(); waveform.stop(); } setBusy(loading); results.refresh(); if (!loading) results.schedulePreview();
});
document.querySelector('#selection-controls').addEventListener('input', () => results.invalidate());

const tabs = [document.querySelector('#stretch-tab'), document.querySelector('#speed-curve-tab'), document.querySelector('#sound-paint-tab')];
function selectMode(mode) {
  const speed = mode === 'speed';
  const paint = mode === 'paint';
  waveform.stop(); results.stop(); speedCurve.stop(); soundPaint.stop();
  document.querySelectorAll('.stretch-mode').forEach(element => { element.hidden = speed || paint; });
  document.querySelector('#speed-curve-mode').hidden = !speed;
  document.querySelector('#sound-paint-mode').hidden = !paint;
  tabs.forEach((tab, index) => { const active = mode === 'stretch' ? index === 0 : speed ? index === 1 : index === 2; tab.classList.toggle('active', active); tab.setAttribute('aria-selected', String(active)); tab.tabIndex = active ? 0 : -1; });
  document.body.dataset.mode = mode;
  if (speed) { speedCurve.editor.draw(); speedCurve.drawWaveform(); }
  if (paint) soundPaint.draw();
}
tabs.forEach((tab, index) => {
  tab.onclick = () => selectMode(index === 1 ? 'speed' : index === 2 ? 'paint' : 'stretch');
  tab.onkeydown = event => { if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return; const next = tabs[(index + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length]; next.focus(); next.click(); event.preventDefault(); };
});
selectMode('stretch');

document.documentElement.dataset.appReady = 'true';
