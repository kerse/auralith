import { decodeFile } from '../audio/load.js';
import { setStatus, setStatusKey } from './status.js';
import { t, translateError } from './i18n.js';

export function mountSource(onLoaded, onLoading = () => {}) {
  document.querySelector('#source-controls').innerHTML = `<div class="source-row"><label class="file-button"><span id="choose-file-label"></span><input id="audio-file" type="file" accept=".wav,.mp3,.ogg,.m4a,audio/wav,audio/mpeg,audio/ogg,audio/mp4"></label><p id="file-info" class="muted"></p></div><p id="load-error" class="error" role="alert" hidden></p>`;
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
