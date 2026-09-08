import { selectAudio } from '../audio/engine.js';
import { wavHeader, pcm16 } from '../audio/wav.js';
import { setStatus, setStatusKey } from './status.js';
import { t, translateError } from './i18n.js';
const time = value => `${Math.floor(value / 60).toString().padStart(2, '0')}:${(value % 60).toFixed(1).padStart(4, '0')}`;
export class ResultControls {
  constructor({ getSource, getParameters, setBusy, stopSource }) {
    Object.assign(this, { getSource, getParameters, setBusy, stopSource });
    document.querySelector('#result-controls').innerHTML = `<div class="result-actions"><button id="preview" disabled></button><button id="cancel-render" class="secondary" hidden></button><span id="export-slot"></span></div><div id="render-progress" hidden><label id="progress-label-text" for="progress"></label><progress id="progress" max="1" value="0"></progress><span id="progress-label" role="status">0%</span></div><p id="preview-note" class="hint"></p><audio id="result-audio" preload="auto"></audio><div class="player"><button id="result-play" disabled></button><button id="result-stop" class="secondary" disabled></button><label><input id="result-loop" type="checkbox" checked> <span id="loop-label"></span></label><span id="result-time">00:00.0 / 00:00.0</span></div>`;
    this.audio = document.querySelector('#result-audio'); this.audio.loop = true;
    this.previewButton = document.querySelector('#preview'); this.cancelButton = document.querySelector('#cancel-render');
    this.previewButton.onclick = () => this.preview(); this.cancelButton.onclick = () => this.cancel();
    this.previewNoteKey = 'result.initial';
    this.refreshLanguage = () => { this.previewButton.textContent = t('result.preview'); this.cancelButton.textContent = t('result.cancel'); document.querySelector('#progress-label-text').textContent = t('result.progress'); document.querySelector('#result-stop').textContent = t('result.stop'); document.querySelector('#loop-label').textContent = t('result.loop'); document.querySelector('#result-play').textContent = this.audio.paused ? t('result.play') : t('result.pause'); document.querySelector('#preview-note').textContent = t(this.previewNoteKey); };
    document.addEventListener('languagechange', this.refreshLanguage);
    this.refreshLanguage();
    document.querySelector('#result-play').onclick = async () => { try { if (this.audio.paused) await this.audio.play(); else this.audio.pause(); } catch (error) { setStatus(t('error.playback', { message: translateError(error.message) }), true); } };
    document.querySelector('#result-stop').onclick = () => this.stop();
    document.querySelector('#result-loop').onchange = e => { this.audio.loop = e.target.checked; };
    for (const event of ['timeupdate', 'loadedmetadata', 'play', 'pause', 'ended']) this.audio.addEventListener(event, () => {
      document.querySelector('#result-play').textContent = this.audio.paused ? t('result.play') : t('result.pause');
      document.querySelector('#result-time').textContent = `${time(this.audio.currentTime)} / ${time(Number.isFinite(this.audio.duration) ? this.audio.duration : 0)}`;
    });
  }
  stop() { this.audio.pause(); if (this.audio.src) this.audio.currentTime = 0; }
  invalidate() {
    if (this.busy) return;
    this.stop(); this.audio.removeAttribute('src'); this.audio.load();
    if (this.url) { URL.revokeObjectURL(this.url); this.url = null; }
    document.querySelector('#result-play').disabled = true; document.querySelector('#result-stop').disabled = true;
    this.previewNoteKey = 'result.note.changed';
    document.querySelector('#preview-note').textContent = t(this.previewNoteKey);
    // The footer is global. Clear an error left by an earlier render once the
    // user changes the input that will be rendered next.
    if (this.getSource()) setStatus(t(this.previewNoteKey));
    this.refresh();
  }
  refresh() { this.previewButton.disabled = this.busy || this.loading || !this.getSource(); if (this.exportButton) this.exportButton.disabled = this.previewButton.disabled; }
  lock(value) {
    this.busy = value; this.setBusy(value); this.refresh();
    this.cancelButton.hidden = !value; document.querySelector('#render-progress').hidden = !value;
  }
  cancel() { if (this.cancelOverride) { this.cancelOverride(); return; } this.worker?.terminate(); this.rejectJob?.(new DOMException('Обработка отменена', 'AbortError')); }
  async preview() {
    if (this.busy || this.loading) return;
    try {
      const options = this.getParameters(), source = this.getSource();
      if (!source) throw new Error(t('error.noSource'));
      this.invalidate(); this.stopSource(); this.lock(true);
      document.querySelector('#progress').value = 0; document.querySelector('#progress-label').textContent = '0%';
      setStatusKey('status.previewPreparing');
      const channels = selectAudio(source.channels, source.sampleRate, options.start, options.end, options.reverse);
      const data = await new Promise((resolve, reject) => {
        this.rejectJob = reject;
        const worker = this.worker = new Worker(new URL('../audio/render-worker.js', import.meta.url), { type: 'module' });
        worker.onerror = () => reject(new Error(t('error.workerPreview')));
        worker.onmessage = ({ data }) => {
          if (data.type === 'error') reject(new Error(data.message));
          else if (data.type === 'done') resolve(data);
          else { document.querySelector('#progress').value = data.progress; document.querySelector('#progress-label').textContent = `${Math.round(data.progress * 100)}%`; }
        };
        worker.postMessage({ channels, sampleRate: source.sampleRate, options }, channels.map(c => c.buffer));
      });
      const wav = new Blob([wavHeader(data.channels[0].length, data.channels.length, data.sampleRate), pcm16(data.channels)], { type: 'audio/wav' });
      this.url = URL.createObjectURL(wav); this.audio.src = this.url;
      document.querySelector('#result-play').disabled = false; document.querySelector('#result-stop').disabled = false;
      this.previewNoteKey = options.duration > 20 ? 'result.note.previewLong' : 'result.note.previewShort';
      document.querySelector('#preview-note').textContent = t(this.previewNoteKey);
      setStatusKey('status.previewReady');
    } catch (error) { error.name === 'AbortError' ? setStatusKey('status.cancelled') : setStatus(translateError(error.message), true); }
    finally { this.worker?.terminate(); this.worker = null; this.rejectJob = null; this.lock(false); }
  }
}
