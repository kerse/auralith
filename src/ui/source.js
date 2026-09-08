import { decodeFile } from '../audio/load.js';
import { setStatus } from './status.js';
export function mountSource(onLoaded, onLoading = () => {}) {
  document.querySelector('#source-controls').innerHTML = `<div class="source-row"><label class="file-button">Выбрать аудиофайл<input id="audio-file" type="file" accept=".wav,.mp3,.ogg,.m4a,audio/wav,audio/mpeg,audio/ogg,audio/mp4"></label><p id="file-info" class="muted">До 256 МБ · mono / stereo</p></div><p id="load-error" class="error" role="alert" hidden></p>`;
  const input = document.querySelector('#audio-file'), info = document.querySelector('#file-info'), error = document.querySelector('#load-error');
  input.setAttribute('aria-describedby', 'file-info load-error');
  input.addEventListener('change', async () => {
    const file = input.files[0]; if (!file) return;
    input.disabled = true; error.hidden = true; onLoading(true);
    const previous = info.textContent;
    info.textContent = `Декодирование: ${file.name}…`; setStatus('Декодирование аудио…');
    document.querySelector('#source-controls').setAttribute('aria-busy', 'true');
    try {
      const source = await decodeFile(file);
      await onLoaded(source);
      document.querySelector('#source-empty').hidden = true;
      info.textContent = `${source.name} · ${source.duration.toFixed(3)} с · ${source.sampleRate.toLocaleString('ru-RU')} Hz · ${source.channels.length === 1 ? 'Mono · 1 канал' : 'Stereo · 2 канала'}`;
      setStatus('Источник загружен');
    } catch (e) { info.textContent = previous; error.textContent = e.message; error.hidden = false; setStatus(e.message, true); }
    finally { input.disabled = false; input.value = ''; onLoading(false); document.querySelector('#source-controls').removeAttribute('aria-busy'); }
  });
}
