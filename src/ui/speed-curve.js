import { decodeFile } from '../audio/load.js';
import { compileSpeedCurve } from '../audio/speed-curve.js';
import { pcm16, wavHeader } from '../audio/wav.js';
import { SpeedCurveEditor } from '../visualization/speed-curve-editor.js';
import { BLOB_LIMIT, exportName } from './export.js';
import { t, translateError } from './i18n.js';
import { setStatus, setStatusKey } from './status.js';

const clock = value => `${Math.floor(value / 60).toString().padStart(2, '0')}:${(value % 60).toFixed(1).padStart(4, '0')}`;
const cloneChannels = channels => channels.map(channel => channel.slice());

export class SpeedCurveApp {
  constructor(root) {
    this.root = root;
    root.innerHTML = `
      <div class="speed-source-row">
        <label class="file-button"><span id="speed-choose-label"></span><input id="speed-audio-file" type="file" accept=".wav,.mp3,.ogg,.m4a,audio/wav,audio/mpeg,audio/ogg,audio/mp4"></label>
        <p id="speed-file-info" class="muted"></p>
      </div>
      <p id="speed-load-error" class="error" role="alert" hidden></p>
      <div id="speed-empty" class="empty"><div class="empty-scale" aria-hidden="true"></div><p id="speed-empty-title"></p><p id="speed-empty-description" class="muted"></p></div>
      <div id="speed-workspace" hidden>
        <div class="curve-toolbar">
          <label><span id="speed-preset-label"></span><select id="speed-preset"><option value="linear">Linear</option><option value="ramp-up">Ramp up</option><option value="ramp-down">Ramp down</option><option value="sine">Sine</option><option value="zigzag">Zigzag</option><option value="pulse">Pulse</option></select></label>
          <button id="speed-undo" class="secondary" type="button">↶ <span></span></button><button id="speed-redo" class="secondary" type="button">↷ <span></span></button>
          <button id="speed-smooth" class="secondary" type="button"></button><button id="speed-corner" class="secondary" type="button"></button>
          <button id="speed-delete" class="secondary" type="button"></button><button id="speed-reset" class="secondary" type="button"></button>
        </div>
        <canvas id="speed-curve-canvas" height="300" tabindex="0" role="img"></canvas>
        <p id="speed-editor-hint" class="hint"></p>
        <div class="speed-readout" aria-live="polite"><span><small id="speed-current-label"></small><strong id="speed-current">1×</strong></span><span><small id="speed-source-duration-label"></small><strong id="speed-source-duration">—</strong></span><span><small id="speed-result-duration-label"></small><strong id="speed-result-duration">—</strong></span></div>
        <div class="speed-wave-heading"><strong id="speed-wave-label"></strong><span id="speed-source-position">00:00.0 / 00:00.0</span></div>
        <canvas id="speed-waveform" height="150" tabindex="0" role="img"></canvas>
        <div class="speed-transport">
          <button id="speed-play" type="button" disabled></button>
          <label class="loop-control"><input id="speed-loop" type="checkbox"> <span id="speed-loop-label"></span></label>
          <label class="loop-control"><input id="speed-preserve-attacks" type="checkbox" checked> <span id="speed-preserve-attacks-label"></span></label>
          <span id="speed-result-time">00:00.0 / 00:00.0</span>
          <button id="speed-export" class="secondary" type="button" disabled></button>
        </div>
        <div id="speed-preview-progress" hidden><progress id="speed-preview-bar" max="1" value="0"></progress><div class="preview-progress-meta"><span id="speed-preview-label"></span><button id="speed-cancel-preview" class="text-button" type="button"></button></div></div>
        <div id="speed-export-progress" hidden><progress id="speed-export-bar" max="1" value="0"></progress><div class="preview-progress-meta"><span id="speed-export-label"></span><button id="speed-cancel-export" class="text-button" type="button"></button></div></div>
        <p id="speed-note" class="hint"></p><audio id="speed-audio" preload="auto"></audio>
      </div>`;
    this.input = root.querySelector('#speed-audio-file'); this.audio = root.querySelector('#speed-audio'); this.audio.loop = false;
    this.waveform = root.querySelector('#speed-waveform'); this.editor = new SpeedCurveEditor(root.querySelector('#speed-curve-canvas'), () => this.curveChanged());
    this.resize = new ResizeObserver(() => this.drawWaveform()); this.resize.observe(this.waveform);
    this.bind(); this.refreshLanguage(); document.addEventListener('languagechange', () => this.refreshLanguage());
  }

  bind() {
    this.input.addEventListener('change', () => this.loadSelected());
    this.root.querySelector('#speed-preset').addEventListener('change', event => this.editor.setPreset(event.target.value));
    this.root.querySelector('#speed-undo').onclick = () => this.editor.undo(); this.root.querySelector('#speed-redo').onclick = () => this.editor.redo();
    this.root.querySelector('#speed-smooth').onclick = () => this.editor.shapeSelected('smooth'); this.root.querySelector('#speed-corner').onclick = () => this.editor.shapeSelected('corner');
    this.root.querySelector('#speed-delete').onclick = () => this.editor.deleteSelected(); this.root.querySelector('#speed-reset').onclick = () => { this.root.querySelector('#speed-preset').value = 'linear'; this.editor.reset(); };
    this.root.querySelector('#speed-play').onclick = () => this.togglePlayback(); this.root.querySelector('#speed-loop').onchange = event => { this.audio.loop = event.target.checked; };
    this.root.querySelector('#speed-preserve-attacks').onchange = () => this.invalidatePreview();
    this.root.querySelector('#speed-cancel-preview').onclick = () => this.cancelPreview(true); this.root.querySelector('#speed-cancel-export').onclick = () => this.cancelExport();
    this.root.querySelector('#speed-export').onclick = () => this.exportWav();
    this.waveform.addEventListener('pointerdown', event => this.seekWaveform(event));
    this.waveform.addEventListener('keydown', event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { const delta = (event.key === 'ArrowLeft' ? -1 : 1) * (event.shiftKey ? 1 : .1); this.seekSourceTime(this.sourceTime + delta); event.preventDefault(); } });
    for (const event of ['loadedmetadata', 'play', 'pause', 'ended', 'timeupdate']) this.audio.addEventListener(event, () => {
      this.updateTransport();
      if (event === 'play') this.animatePlayhead();
      if (event === 'ended' && !this.audio.loop) this.seekSourceTime(this.source?.duration || 0, false);
    });
  }

  refreshLanguage() {
    const values = {
      '#speed-choose-label': 'source.choose', '#speed-empty-title': 'speed.emptyTitle', '#speed-empty-description': 'speed.emptyDescription', '#speed-preset-label': 'speed.preset',
      '#speed-delete': 'speed.delete', '#speed-reset': 'speed.reset', '#speed-editor-hint': 'speed.hint', '#speed-current-label': 'speed.current',
      '#speed-smooth': 'speed.smooth', '#speed-corner': 'speed.corner',
      '#speed-source-duration-label': 'speed.sourceDuration', '#speed-result-duration-label': 'speed.resultDuration', '#speed-wave-label': 'wave.form',
      '#speed-loop-label': 'result.loop', '#speed-preserve-attacks-label': 'speed.preserveAttacks', '#speed-export': 'result.export', '#speed-cancel-preview': 'result.cancel', '#speed-cancel-export': 'result.cancel'
    };
    for (const [selector, key] of Object.entries(values)) this.root.querySelector(selector).textContent = t(key);
    this.root.querySelector('#speed-undo span').textContent = t('speed.undo'); this.root.querySelector('#speed-redo span').textContent = t('speed.redo');
    this.editor.canvas.setAttribute('aria-label', t('speed.curveAria')); this.waveform.setAttribute('aria-label', t('speed.waveAria'));
    if (this.loadingName) this.root.querySelector('#speed-file-info').textContent = t('source.decoding', { name: this.loadingName });
    else if (this.source) this.root.querySelector('#speed-file-info').textContent = this.sourceInfo();
    else this.root.querySelector('#speed-file-info').textContent = t('source.limit');
    this.updateTransport(); this.updateReadout();
  }

  sourceInfo() {
    const locale = document.documentElement.lang === 'ru' ? 'ru-RU' : document.documentElement.lang === 'sr' ? 'sr-Latn-RS' : 'en-US';
    return `${this.source.name} · ${this.source.duration.toFixed(3)} s · ${this.source.sampleRate.toLocaleString(locale)} Hz · ${this.source.channels.length === 1 ? t('source.mono') : t('source.stereo')}`;
  }

  async loadSelected() {
    const file = this.input.files[0]; if (!file) return;
    const error = this.root.querySelector('#speed-load-error'); this.cancelPreview(false); this.clearAudio(); this.input.disabled = true; error.hidden = true; this.loadingName = file.name; this.refreshLanguage(); setStatusKey('status.decoding');
    try {
      const source = await decodeFile(file); this.stop(true); this.source = source; this.sourceTime = 0;
      this.root.querySelector('#speed-empty').hidden = true; this.root.querySelector('#speed-workspace').hidden = false; this.root.querySelector('#speed-file-info').textContent = this.sourceInfo();
      await this.analyze(); this.rebuildMapping(); setStatusKey('status.loaded'); this.schedulePreview();
    } catch (cause) { error.textContent = translateError(cause.message); error.hidden = false; setStatus(translateError(cause.message), true); }
    finally { this.loadingName = null; this.input.disabled = false; this.input.value = ''; this.refreshLanguage(); }
  }

  async analyze() {
    this.analysisWorker?.terminate();
    this.peaks = await new Promise((resolve, reject) => {
      const worker = this.analysisWorker = new Worker(new URL('../visualization/analysis-worker.js', import.meta.url), { type: 'module' });
      worker.onmessage = ({ data }) => { worker.terminate(); resolve(data.peaks); }; worker.onerror = () => { worker.terminate(); reject(new Error(t('error.waveform'))); };
      worker.postMessage({ channels: this.source.channels });
    });
    this.analysisWorker = null; this.drawWaveform();
  }

  curveChanged() { if (!this.source) return; this.rebuildMapping(); this.invalidatePreview(); }
  rebuildMapping() {
    const error = this.root.querySelector('#speed-load-error');
    try { this.mapping = compileSpeedCurve(this.editor.value, this.source.channels[0].length / this.source.sampleRate); error.hidden = true; }
    catch (cause) { this.mapping = null; error.textContent = translateError(cause.message); error.hidden = false; }
    this.updateReadout(); this.updateTransport(); this.drawWaveform();
  }
  updateReadout() {
    const speed = this.mapping ? this.mapping.speedAt(this.sourceTime || 0) : 1;
    this.root.querySelector('#speed-current').textContent = `${Number(speed.toFixed(2))}×`;
    this.root.querySelector('#speed-source-duration').textContent = this.source ? clock(this.source.duration) : '—';
    this.root.querySelector('#speed-result-duration').textContent = this.mapping ? clock(this.mapping.duration) : '—';
    this.root.querySelector('#speed-source-position').textContent = `${clock(this.sourceTime || 0)} / ${clock(this.source?.duration || 0)}`;
    this.editor.setPlayhead(this.source ? (this.sourceTime || 0) / this.source.duration : 0);
  }

  drawWaveform() {
    if (!this.source || !this.peaks || this.root.querySelector('#speed-workspace').hidden) return;
    const canvas = this.waveform, width = canvas.clientWidth || 800, height = this.source.channels.length === 2 ? 170 : 130, dpr = devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr); canvas.style.height = `${height}px`;
    const context = canvas.getContext('2d'); context.scale(dpr, dpr); context.fillStyle = '#ebeede'; context.fillRect(0, 0, width, height); const lane = height / this.peaks.length;
    this.peaks.forEach(({ min, max }, channel) => { const middle = lane * (channel + .5); context.strokeStyle = '#28584c'; context.lineWidth = 1; context.beginPath(); for (let x = 0; x < width; x++) { const a = Math.floor(x / width * min.length), b = Math.min(min.length, Math.max(a + 1, Math.ceil((x + 1) / width * min.length))); let lo = 0, hi = 0; for (let index = a; index < b; index++) { lo = Math.min(lo, min[index]); hi = Math.max(hi, max[index]); } context.moveTo(x + .5, middle - hi * lane * .42); context.lineTo(x + .5, middle - lo * lane * .42); } context.stroke(); });
    const x = (this.sourceTime || 0) / this.source.duration * width; context.strokeStyle = '#172dc4'; context.lineWidth = 2; context.beginPath(); context.moveTo(x, 0); context.lineTo(x, height); context.stroke();
  }
  seekWaveform(event) { if (!this.source || event.button !== 0) return; const rect = this.waveform.getBoundingClientRect(); this.seekSourceTime((event.clientX - rect.left) / rect.width * this.source.duration); }
  seekSourceTime(value, updateAudio = true) {
    if (!this.source) return; this.sourceTime = Math.max(0, Math.min(this.source.duration, value));
    if (updateAudio && this.mapping && this.audio.src) this.audio.currentTime = Math.min(this.audio.duration || 0, this.mapping.resultTimeAt(this.sourceTime));
    this.updateReadout(); this.drawWaveform();
  }

  invalidatePreview() {
    clearTimeout(this.previewTimer); this.cancelPreview(false); this.stop(); this.clearAudio(); this.root.querySelector('#speed-play').disabled = true;
    this.root.querySelector('#speed-note').textContent = t('speed.changed'); this.schedulePreview();
  }
  renderOptions() { return { curve: this.editor.value, preserveTransients: this.root.querySelector('#speed-preserve-attacks').checked }; }
  schedulePreview() { if (!this.source || !this.mapping || this.exporting) return; this.previewTimer = setTimeout(() => this.preview(), 350); }
  cancelPreview(byUser = false) {
    clearTimeout(this.previewTimer); this.previewWorker?.terminate(); this.previewReject?.(new DOMException('Preview superseded', 'AbortError')); this.previewWorker = null; this.previewReject = null; this.previewing = false; this.root.querySelector('#speed-preview-progress').hidden = true;
    if (byUser) { this.root.querySelector('#speed-note').textContent = t('result.note.cancelled'); setStatusKey('status.cancelled'); }
  }
  clearAudio() { this.audio.pause(); this.audio.removeAttribute('src'); this.audio.load(); if (this.url) URL.revokeObjectURL(this.url); this.url = null; }
  async preview() {
    if (!this.source || !this.mapping || this.previewing || this.exporting) return;
    const panel = this.root.querySelector('#speed-preview-progress'), bar = this.root.querySelector('#speed-preview-bar'), label = this.root.querySelector('#speed-preview-label');
    this.previewing = true; panel.hidden = false; bar.value = 0; label.textContent = t('result.preparing'); this.root.querySelector('#speed-play').disabled = true; setStatusKey('status.previewPreparing');
    const worker = this.previewWorker = new Worker(new URL('../audio/render-worker.js', import.meta.url), { type: 'module' });
    try {
      const data = await new Promise((resolve, reject) => {
        this.previewReject = reject;
        worker.onerror = () => reject(new Error(t('error.workerPreview')));
        worker.onmessage = ({ data }) => { if (data.type === 'error') reject(new Error(data.message)); else if (data.type === 'done') resolve(data); else { bar.value = data.progress; label.textContent = `${Math.round(data.progress * 100)}%`; } };
        const channels = cloneChannels(this.source.channels); worker.postMessage({ channels, sampleRate: this.source.sampleRate, options: this.renderOptions() }, channels.map(channel => channel.buffer));
      });
      if (this.previewWorker !== worker) return;
      this.clearAudio(); const wav = new Blob([wavHeader(data.channels[0].length, data.channels.length, data.sampleRate), pcm16(data.channels)], { type: 'audio/wav' });
      this.url = URL.createObjectURL(wav); this.audio.src = this.url; this.audio.loop = this.root.querySelector('#speed-loop').checked; this.audio.load();
      this.root.querySelector('#speed-play').disabled = false; this.root.querySelector('#speed-note').textContent = this.mapping.duration > 20 ? t('result.note.previewLong') : t('result.note.previewShort'); setStatusKey('status.previewReady');
    } catch (cause) { if (cause.name !== 'AbortError' && this.previewWorker === worker) setStatus(translateError(cause.message), true); }
    finally { worker.terminate(); if (this.previewWorker === worker) { this.previewWorker = null; this.previewReject = null; this.previewing = false; panel.hidden = true; } }
  }

  async togglePlayback() {
    try { if (this.audio.paused) { if (this.audio.ended) this.audio.currentTime = 0; await this.audio.play(); } else this.audio.pause(); }
    catch (cause) { setStatus(t('error.playback', { message: translateError(cause.message) }), true); }
  }
  stop(reset = false) { this.audio.pause(); cancelAnimationFrame(this.playheadFrame); if (reset && this.audio.src) { this.audio.currentTime = 0; this.seekSourceTime(0, false); } }
  animatePlayhead() {
    cancelAnimationFrame(this.playheadFrame);
    const tick = () => { if (this.audio.paused || !this.mapping) return; this.seekSourceTime(this.mapping.sourceTimeAt(this.audio.currentTime), false); this.playheadFrame = requestAnimationFrame(tick); };
    this.playheadFrame = requestAnimationFrame(tick);
  }
  updateTransport() {
    const play = this.root.querySelector('#speed-play'); if (!play) return;
    play.textContent = this.audio.paused ? t('result.play') : t('result.pause'); play.disabled = !this.audio.src || this.previewing || this.exporting;
    this.root.querySelector('#speed-result-time').textContent = `${clock(this.audio.currentTime || 0)} / ${clock(Number.isFinite(this.audio.duration) ? this.audio.duration : 0)}`;
    this.root.querySelector('#speed-export').disabled = !this.source || !this.mapping || this.previewing || this.exporting;
  }

  cancelExport() { this.exportCancelled = true; this.exportWorker?.terminate(); this.exportReject?.(new DOMException('Экспорт отменён', 'AbortError')); }
  async exportWav() {
    if (!this.source || !this.mapping || this.exporting) return;
    let writer, completed = false, bytesWritten = 44, downloadUrl; const parts = []; this.exportCancelled = false; this.exporting = true; this.cancelPreview(false); this.stop(); this.updateTransport();
    const panel = this.root.querySelector('#speed-export-progress'), bar = this.root.querySelector('#speed-export-bar'), label = this.root.querySelector('#speed-export-label'); panel.hidden = false; bar.value = 0; label.textContent = t('export.choose');
    try {
      const frames = Math.max(1, Math.round(this.mapping.duration * this.source.sampleRate)), header = wavHeader(frames, this.source.channels.length, this.source.sampleRate), size = 44 + frames * this.source.channels.length * 2, name = exportName(this.source.name).replace('_auralith.wav', '_speed-curve.wav');
      if (!window.showSaveFilePicker && size > BLOB_LIMIT) throw new Error(t('error.exportLimit'));
      if (window.showSaveFilePicker) { const handle = await window.showSaveFilePicker({ suggestedName: name, types: [{ description: 'WAV audio', accept: { 'audio/wav': ['.wav'] } }] }); writer = await handle.createWritable(); }
      else writer = { write: async bytes => parts.push(bytes), close: async () => {}, abort: async () => { parts.length = 0; } };
      await writer.write(header); setStatusKey('export.processing'); const worker = this.exportWorker = new Worker(new URL('../audio/export-worker.js', import.meta.url), { type: 'module' });
      await new Promise((resolve, reject) => {
        this.exportReject = reject; worker.onerror = () => reject(new Error(t('error.workerExport')));
        worker.onmessage = async ({ data }) => { try { if (data.type === 'error') reject(new Error(data.message)); else if (data.type === 'done') resolve(); else if (data.type === 'chunk') { await writer.write(data.bytes); bytesWritten += data.bytes.byteLength; worker.postMessage({ type: 'ack' }); } else { bar.value = data.progress; label.textContent = `${data.phase} · ${Math.round(data.progress * 100)}%`; } } catch (cause) { reject(cause); } };
        const channels = cloneChannels(this.source.channels); worker.postMessage({ channels, sampleRate: this.source.sampleRate, options: this.renderOptions() }, channels.map(channel => channel.buffer));
      });
      if (this.exportCancelled) throw new DOMException('Экспорт отменён', 'AbortError'); if (bytesWritten !== size) throw new Error(t('error.exportSize'));
      label.textContent = t('export.saving'); bar.value = 1; await writer.close(); completed = true;
      if (parts.length) { downloadUrl = URL.createObjectURL(new Blob(parts, { type: 'audio/wav' })); const link = document.createElement('a'); link.href = downloadUrl; link.download = name; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(downloadUrl), 60000); setStatusKey('export.download', { name, size: (size / 1048576).toFixed(1) }); }
      else setStatusKey('export.saved', { name, size: (size / 1048576).toFixed(1) });
    } catch (cause) { cause.name === 'AbortError' ? setStatusKey('status.exportCancelled') : setStatus(t('error.export', { message: translateError(cause.message) }), true); }
    finally { this.exportWorker?.terminate(); this.exportWorker = null; this.exportReject = null; if (writer && !completed) { try { await writer.abort(); } catch {} } this.exporting = false; panel.hidden = true; this.updateTransport(); this.schedulePreview(); }
  }
}
