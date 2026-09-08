import { decodeFile } from '../audio/load.js';
import { setStatus, setStatusKey } from './status.js';
import { t, translateError } from './i18n.js';
import { MicrophoneRecorder } from './recorder.js';

export function mountSource(onLoaded, onLoading = () => {}) {
  document.querySelector('#source-controls').innerHTML = `<div class="source-row"><div class="source-actions"><label class="file-button"><span id="choose-file-label"></span><input id="audio-file" type="file" accept=".wav,.mp3,.ogg,.m4a,audio/wav,audio/mpeg,audio/ogg,audio/mp4"></label><button id="record-audio" class="secondary record-button" type="button"></button></div><p id="file-info" class="muted"></p></div><section id="recorder-panel" class="recorder-panel" aria-labelledby="recorder-title" hidden><div class="recorder-heading"><span><i class="record-lamp" aria-hidden="true"></i><strong id="recorder-title"></strong></span><time id="record-time">00:00.0</time></div><canvas id="recorder-canvas" height="190" role="img"></canvas><div class="recorder-readout"><div class="level-field"><label id="recorder-level-label" for="record-level"></label><progress id="record-level" max="1" value="0"></progress><output id="record-db">−96.0 dBFS</output></div><output id="record-state" data-state="silence" aria-live="polite"></output><div class="recorder-actions"><button id="record-stop" type="button"></button><button id="record-cancel" class="secondary" type="button"></button></div></div></section><p id="load-error" class="error" role="alert" hidden></p>`;
  const input = document.querySelector('#audio-file'), info = document.querySelector('#file-info'), error = document.querySelector('#load-error');
  let currentSource = null, loadingName = null, lastError = null;
  const refreshLanguage = () => {
    document.querySelector('#choose-file-label').textContent = t('source.choose');
    if (loadingName) info.textContent = t('source.decoding', { name: loadingName });
    else if (currentSource) info.textContent = formatSource(currentSource);
    else if (!lastError) info.textContent = t('source.limit');
    if (lastError) error.textContent = translateError(lastError);
  };
  const formatSource = source => `${source.name} · ${source.duration.toFixed(3)} ${localeUnit()} · ${source.sampleRate.toLocaleString(localeCode())} Hz · ${source.channels.length === 1 ? t('source.mono') : t('source.stereo')}`;
  const localeCode = () => document.documentElement.lang === 'ru' ? 'ru-RU' : document.documentElement.lang === 'sr' ? 'sr-Latn-RS' : 'en-US';
  const localeUnit = () => document.documentElement.lang === 'ru' ? 'с' : 's';
  document.addEventListener('languagechange', refreshLanguage);
  input.setAttribute('aria-describedby', 'file-info load-error');
  new MicrophoneRecorder({
    onRecorded: async recorded => { await onLoaded(recorded); currentSource = recorded; loadingName = null; info.textContent = formatSource(recorded); },
    onCaptureState: recording => { onLoading(recording); if (!recording && currentSource) info.textContent = formatSource(currentSource); }
  });
  refreshLanguage();
  input.addEventListener('change', async () => {
    const file = input.files[0]; if (!file) return;
    input.disabled = true; error.hidden = true; lastError = null; loadingName = file.name; onLoading(true);
    refreshLanguage(); setStatusKey('status.decoding');
    document.querySelector('#source-controls').setAttribute('aria-busy', 'true');
    try {
      const source = await decodeFile(file);
      await onLoaded(source);
      currentSource = source; loadingName = null;
      document.querySelector('#source-empty').hidden = true;
      info.textContent = formatSource(source);
      setStatusKey('status.loaded');
    } catch (e) { loadingName = null; lastError = e.message; info.textContent = currentSource ? formatSource(currentSource) : t('source.limit'); error.textContent = translateError(e.message); error.hidden = false; setStatus(translateError(e.message), true); }
    finally { input.disabled = false; input.value = ''; onLoading(false); document.querySelector('#source-controls').removeAttribute('aria-busy'); }
  });
}
