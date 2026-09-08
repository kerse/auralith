import { setStatusKey } from './src/ui/status.js';
import { mountSource } from './src/ui/source.js';
import { Waveform } from './src/visualization/waveform.js';
import { loadSpectrogram } from './src/visualization/spectrogram.js';
import { ProcessingControls } from './src/ui/processing.js';
import { ResultControls } from './src/ui/results.js';
import { ExportControls } from './src/ui/export.js';
import { initI18n, t } from './src/ui/i18n.js';

let source = null;
let results;
initI18n();
const processing = new ProcessingControls(() => results?.invalidate());
const waveform = new Waveform(selection => processing.setSelection(selection));
function setBusy(busy) {
  waveform.locked = busy; processing.locked = busy;
  processing.fields.disabled = busy || !source || (waveform.end - waveform.start > 3600);
  document.querySelectorAll('#selection-controls input, #source-play, #audio-file').forEach(input => { input.disabled = busy; });
}
results = new ResultControls({ getSource: () => source, getParameters: () => processing.getParameters(), setBusy, stopSource: () => waveform.stop() });
new ExportControls(results);
mountSource(async loaded => { await waveform.load(loaded); source = loaded; await loadSpectrogram(waveform, loaded); }, loading => {
  results.loading = loading; if (loading) { results.invalidate(); waveform.stop(); } setBusy(loading); results.refresh();
});
document.querySelector('#selection-controls').addEventListener('input', () => results.invalidate());

setStatusKey('status.ready');
document.documentElement.dataset.appReady = 'true';
