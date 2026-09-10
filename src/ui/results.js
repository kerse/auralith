import { selectAudio } from '../audio/engine.js';
import { wavHeader, pcm16 } from '../audio/wav.js';
import { pingPongChannels, pingPongTime } from '../audio/playback.js';
import { setStatus, setStatusKey } from './status.js';
import { t, translateError } from './i18n.js';
const time = value => `${Math.floor(value / 60).toString().padStart(2, '0')}:${(value % 60).toFixed(1).padStart(4, '0')}`;
export class ResultControls {
  constructor({ getSource, getParameters, setBusy, waveform }) {
    Object.assign(this, { getSource, getParameters, setBusy, waveform });
    document.querySelector('#result-controls').innerHTML = `<div class="result-actions"><span id="export-slot"></span><button id="cancel-render" class="secondary" hidden></button></div><div id="render-progress" hidden><label id="progress-label-text" for="progress"></label><progress id="progress" max="1" value="0"></progress><span id="progress-label" role="status">0%</span></div><p id="preview-note" class="hint"></p><audio id="result-audio" preload="auto"></audio>`;
    document.querySelector('#preview-transport-slot').innerHTML = `<button id="result-play" disabled></button><span id="result-time">00:00.0 / 00:00.0</span>`;
    this.audio = document.querySelector('#result-audio'); this.audio.loop = true;
    this.cancelButton = document.querySelector('#cancel-render'); this.cancelButton.onclick = () => this.cancel();
    this.previewNoteKey = 'result.initial';
    this.refreshLanguage = () => { this.cancelButton.textContent = t('result.cancel'); document.querySelector('#cancel-preview').textContent = t('result.cancel'); document.querySelector('#progress-label-text').textContent = t('result.progress'); this.updatePlayLabel(); document.querySelector('#preview-note').textContent = t(this.previewNoteKey); };
    document.addEventListener('languagechange', this.refreshLanguage);
    this.refreshLanguage();
    document.querySelector('#result-play').onclick = () => this.togglePlayback();
    document.querySelector('#cancel-preview').onclick = () => this.cancelPreviewByUser();
    for (const id of ['result-loop', 'reverse-loop']) document.querySelector(`#${id}`).addEventListener('change', () => this.syncLoopMode());
    waveform.attachPreviewTransport({
      stop: () => this.stop(),
      toggle: () => this.togglePlayback(),
      seek: value => this.seekFromSourceTime(value),
      isPlaying: () => !this.audio.paused
    });
    for (const event of ['timeupdate', 'loadedmetadata', 'play', 'pause', 'ended']) this.audio.addEventListener(event, () => {
      this.updatePlayLabel();
      document.querySelector('#result-time').textContent = `${time(this.audio.currentTime)} / ${time(Number.isFinite(this.audio.duration) ? this.audio.duration : 0)}`;
      if (event === 'play') { this.waveform.stopSource(); this.waveform.playbackMode = 'preview'; this.waveform.lastMode = 'preview'; this.animatePlayhead(); }
      if (event === 'ended' && !this.audio.loop) this.waveform.setPlayhead(this.sourceTimeAt(this.audio.duration), false);
    });
  }
  updatePlayLabel() {
    const button = document.querySelector('#result-play'); if (!button) return;
    const ratio = this.previewOptions?.stretch;
    button.textContent = this.audio.paused ? t('result.playSlow', { value: Number.isFinite(ratio) ? formatRatio(ratio) : '—' }) : t('result.pauseSlow', { value: Number.isFinite(ratio) ? formatRatio(ratio) : '—' });
  }
  async togglePlayback() {
    try {
      if (this.audio.paused) { if (this.audio.ended) this.audio.currentTime = 0; await this.audio.play(); }
      else this.audio.pause();
    } catch (error) { setStatus(t('error.playback', { message: translateError(error.message) }), true); }
  }
  stop(reset = false) {
    this.audio.pause();
    if (reset && this.audio.src) this.audio.currentTime = 0;
    cancelAnimationFrame(this.playheadFrame);
  }
  reverseLoopEnabled() { return document.querySelector('#reverse-loop').checked; }
  loopEnabled() { return document.querySelector('#result-loop').checked || this.reverseLoopEnabled(); }
  syncLoopMode() {
    this.audio.loop = this.loopEnabled();
    if (this.previewData && this.previewReverseLoop !== this.reverseLoopEnabled()) this.setPreviewAudio(this.reverseLoopEnabled());
  }
  setPreviewAudio(reverseLoop = this.reverseLoopEnabled()) {
    const wasPlaying = !this.audio.paused;
    this.stop(); this.audio.removeAttribute('src'); this.audio.load();
    if (this.url) URL.revokeObjectURL(this.url);
    const channels = reverseLoop ? pingPongChannels(this.previewData.channels) : this.previewData.channels;
    const wav = new Blob([wavHeader(channels[0].length, channels.length, this.previewData.sampleRate), pcm16(channels)], { type: 'audio/wav' });
    this.url = URL.createObjectURL(wav); this.previewReverseLoop = reverseLoop; this.audio.src = this.url; this.audio.loop = this.loopEnabled(); this.audio.load();
    if (wasPlaying) this.audio.play().catch(() => {});
  }
  sourceTimeAt(resultTime) {
    if (!this.previewOptions) return this.waveform.start;
    const previewDuration = this.previewData ? this.previewData.channels[0].length / this.previewData.sampleRate : this.previewOptions.duration;
    const baseTime = this.reverseLoopEnabled() ? pingPongTime(resultTime, previewDuration) : resultTime;
    const p = Math.max(0, Math.min(1, baseTime / this.previewOptions.duration));
    return this.previewOptions.reverse ? this.previewOptions.end - p * (this.previewOptions.end - this.previewOptions.start) : this.previewOptions.start + p * (this.previewOptions.end - this.previewOptions.start);
  }
  seekFromSourceTime(value) {
    if (!this.audio.src || !this.previewOptions || !Number.isFinite(this.audio.duration)) return;
    const span = this.previewOptions.end - this.previewOptions.start;
    const fraction = this.previewOptions.reverse ? (this.previewOptions.end - value) / span : (value - this.previewOptions.start) / span;
    this.audio.currentTime = Math.max(0, Math.min(this.audio.duration, fraction * this.previewOptions.duration));
  }
  animatePlayhead() {
    cancelAnimationFrame(this.playheadFrame);
    const tick = () => {
      if (this.audio.paused) return;
      this.waveform.setPlayhead(this.sourceTimeAt(this.audio.currentTime), false, true);
      this.playheadFrame = requestAnimationFrame(tick);
    };
    this.playheadFrame = requestAnimationFrame(tick);
  }
  invalidate() {
    clearTimeout(this.previewTimer); this.previewGeneration = (this.previewGeneration || 0) + 1;
    this.cancelPreview();
    this.stop(); this.audio.removeAttribute('src'); this.audio.load(); this.previewData = null; this.previewReverseLoop = null;
    if (this.url) { URL.revokeObjectURL(this.url); this.url = null; }
    document.querySelector('#result-play').disabled = true;
    this.previewNoteKey = 'result.note.changed';
    document.querySelector('#preview-note').textContent = t(this.previewNoteKey);
    if (this.getSource()) setStatus(t(this.previewNoteKey));
    this.refresh(); this.schedulePreview();
  }
  refresh() {
    const unavailable = this.busy || this.loading || !this.getSource();
    if (this.exportButton) this.exportButton.disabled = unavailable;
    const play = document.querySelector('#result-play'); if (play) play.disabled = unavailable || this.renderingPreview || !this.url;
  }
  lock(value) {
    this.busy = value; this.setBusy(value); this.refresh();
    this.cancelButton.hidden = !value; document.querySelector('#render-progress').hidden = !value;
  }
  cancel() { if (this.cancelOverride) { this.cancelOverride(); return; } this.worker?.terminate(); this.rejectJob?.(new DOMException('Обработка отменена', 'AbortError')); }
  schedulePreview() {
    if (this.busy || this.loading || !this.getSource()) return;
    const generation = this.previewGeneration;
    this.previewTimer = setTimeout(() => this.preview(generation), 300);
  }
  cancelPreview() {
    this.previewWorker?.terminate(); this.previewWorker = null;
    this.previewReject?.(new DOMException('Preview superseded', 'AbortError')); this.previewReject = null;
    this.renderingPreview = false;
    const panel = document.querySelector('#preview-render-progress'); if (panel) panel.hidden = true;
  }
  cancelPreviewByUser() {
    if (!this.renderingPreview) return;
    clearTimeout(this.previewTimer); this.previewGeneration = (this.previewGeneration || 0) + 1; this.cancelPreview();
    this.previewNoteKey = 'result.note.cancelled'; document.querySelector('#preview-note').textContent = t(this.previewNoteKey); setStatusKey('status.cancelled'); this.refresh();
  }
  async preview(generation = this.previewGeneration) {
    if (this.busy || this.loading || generation !== this.previewGeneration) return;
    let worker;
    try {
      const options = this.getParameters(), source = this.getSource();
      if (!source) throw new Error(t('error.noSource'));
      this.renderingPreview = true; this.waveform.stop();
      document.querySelector('#result-play').disabled = true;
      const panel = document.querySelector('#preview-render-progress'), progress = document.querySelector('#preview-progress'), label = document.querySelector('#preview-progress-label');
      panel.hidden = false; progress.value = 0; label.textContent = t('result.preparing');
      setStatusKey('status.previewPreparing');
      const started = performance.now();
      const channels = selectAudio(source.channels, source.sampleRate, options.start, options.end, options.reverse);
      const data = await new Promise((resolve, reject) => {
        this.previewReject = reject;
        worker = this.previewWorker = new Worker(new URL('../audio/render-worker.js', import.meta.url), { type: 'module' });
        worker.onerror = () => reject(new Error(t('error.workerPreview')));
        worker.onmessage = ({ data }) => {
          if (data.type === 'error') reject(new Error(data.message));
          else if (data.type === 'done') resolve(data);
          else {
            progress.value = data.progress;
            const elapsed = (performance.now() - started) / 1000;
            const remaining = data.progress > .02 ? Math.max(0, elapsed * (1 - data.progress) / data.progress) : null;
            label.textContent = remaining === null ? `${Math.round(data.progress * 100)}%` : t('result.readyIn', { percent: Math.round(data.progress * 100), seconds: Math.ceil(remaining) });
          }
        };
        worker.postMessage({ channels, sampleRate: source.sampleRate, options }, channels.map(c => c.buffer));
      });
      if (generation !== this.previewGeneration) return;
      this.previewData = data; this.previewOptions = options; this.setPreviewAudio();
      document.querySelector('#result-play').disabled = false; this.updatePlayLabel();
      this.previewNoteKey = options.duration > 20 ? 'result.note.previewLong' : 'result.note.previewShort';
      document.querySelector('#preview-note').textContent = t(this.previewNoteKey);
      setStatusKey('status.previewReady');
    } catch (error) {
      if (error.name !== 'AbortError' && generation === this.previewGeneration) setStatus(translateError(error.message), true);
    } finally {
      worker?.terminate();
      if (this.previewWorker === worker) { this.previewWorker = null; this.previewReject = null; this.renderingPreview = false; document.querySelector('#preview-render-progress').hidden = true; }
    }
  }
}
const formatRatio = value => value >= 100 ? Math.round(value).toString() : Number(value.toFixed(2)).toString();
