import { decodeFile } from '../audio/load.js';
import { paintSegment, frequencyAtRow } from '../audio/spectral-paint.js';
import { pcm16, wavHeader } from '../audio/wav.js';
import { BLOB_LIMIT, exportName } from './export.js';
import { t, translateError } from './i18n.js';
import { setStatus, setStatusKey } from './status.js';

const clock = seconds => `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toFixed(1).padStart(4, '0')}`;
const cloneChannels = channels => channels.map(channel => channel.slice());

export class SoundPaintApp {
  constructor(root) {
    this.root = root; this.zoom = 1; this.offset = 0; this.playhead = 0; this.undoStack = []; this.redoStack = [];
    root.innerHTML = `
      <div class="paint-source-row">
        <label class="file-button"><span id="paint-choose-label"></span><input id="paint-audio-file" type="file" accept=".wav,.mp3,.ogg,.m4a,audio/wav,audio/mpeg,audio/ogg,audio/mp4"></label>
        <p id="paint-file-info" class="muted"></p>
      </div>
      <p id="paint-load-error" class="error" role="alert" hidden></p>
      <div id="paint-empty" class="empty"><div class="empty-scale" aria-hidden="true"></div><p id="paint-empty-title"></p><p id="paint-empty-description" class="muted"></p></div>
      <div id="paint-workspace" hidden>
        <div class="paint-toolbar">
          <label><span id="paint-brush-label"></span><input id="paint-brush" type="range" min="2" max="64" value="18"><output id="paint-brush-value"></output></label>
          <label><span id="paint-strength-label"></span><input id="paint-strength" type="range" min="1" max="18" value="8"><output id="paint-strength-value"></output></label>
          <div class="paint-mode" role="group"><button id="paint-add" class="active" type="button"></button><button id="paint-subtract" class="secondary" type="button"></button></div>
          <button id="paint-undo" class="secondary" type="button">↶ <span></span></button><button id="paint-redo" class="secondary" type="button">↷ <span></span></button><button id="paint-reset" class="secondary" type="button"></button>
        </div>
        <div class="paint-view-heading"><strong id="paint-wave-label"></strong><span id="paint-time-readout"></span></div>
        <canvas id="paint-waveform" height="150" tabindex="0" role="img"></canvas>
        <div class="paint-view-heading"><strong id="paint-loudness-label"></strong><span>−72 dBFS — 0 dBFS</span></div>
        <canvas id="paint-loudness" height="86" tabindex="0" role="img"></canvas>
        <div class="paint-view-heading"><strong id="paint-spectrum-label"></strong><span id="paint-frequency-readout"></span></div>
        <canvas id="paint-spectrogram" height="270" tabindex="0" role="img"></canvas>
        <p id="paint-hint" class="hint"></p>
        <div class="paint-transport"><button id="paint-play" type="button" disabled></button><button id="paint-stop" class="secondary" type="button" disabled></button><label class="loop-control"><input id="paint-loop" type="checkbox"> <span id="paint-loop-label"></span></label><span id="paint-result-time"></span><button id="paint-export" class="secondary" type="button" disabled></button></div>
        <div id="paint-progress" hidden><progress id="paint-progress-bar" max="1" value="0"></progress><div class="preview-progress-meta"><span id="paint-progress-label"></span><button id="paint-cancel" class="text-button" type="button"></button></div></div>
        <audio id="paint-audio" preload="auto"></audio>
      </div>`;
    this.input = root.querySelector('#paint-audio-file'); this.audio = root.querySelector('#paint-audio');
    this.waveform = root.querySelector('#paint-waveform'); this.loudnessCanvas = root.querySelector('#paint-loudness'); this.spectrogram = root.querySelector('#paint-spectrogram');
    this.bind(); this.refreshLanguage();
    document.addEventListener('languagechange', () => this.refreshLanguage());
    this.resize = new ResizeObserver(() => this.drawAll()); [this.waveform, this.loudnessCanvas, this.spectrogram].forEach(canvas => this.resize.observe(canvas));
  }

  get visibleDuration() { return this.source ? this.source.duration / this.zoom : 0; }
  get mode() { return this.root.querySelector('#paint-add').classList.contains('active') ? 1 : -1; }

  bind() {
    this.input.onchange = () => this.loadSelected();
    this.root.querySelector('#paint-add').onclick = () => this.setMode(1); this.root.querySelector('#paint-subtract').onclick = () => this.setMode(-1);
    this.root.querySelector('#paint-brush').oninput = () => this.refreshBrushReadout(); this.root.querySelector('#paint-strength').oninput = () => this.refreshBrushReadout();
    this.root.querySelector('#paint-undo').onclick = () => this.undo(); this.root.querySelector('#paint-redo').onclick = () => this.redo(); this.root.querySelector('#paint-reset').onclick = () => this.reset();
    this.root.querySelector('#paint-play').onclick = () => this.togglePlayback(); this.root.querySelector('#paint-stop').onclick = () => this.stop(true); this.root.querySelector('#paint-loop').onchange = event => { this.audio.loop = event.target.checked; };
    this.root.querySelector('#paint-export').onclick = () => this.exportWav(); this.root.querySelector('#paint-cancel').onclick = () => this.cancelRender(true);
    this.bindCanvas(this.waveform, 'seek'); this.bindCanvas(this.loudnessCanvas, 'seek'); this.bindCanvas(this.spectrogram, 'paint');
    for (const type of ['play', 'pause', 'ended', 'timeupdate']) this.audio.addEventListener(type, () => { this.updateTransport(); if (type === 'play') this.animatePlayhead(); if (type === 'ended' && !this.audio.loop) this.setPlayhead(this.source?.duration || 0, false); });
  }

  refreshLanguage() {
    const labels = {
      '#paint-choose-label': 'source.choose', '#paint-empty-title': 'paint.emptyTitle', '#paint-empty-description': 'paint.emptyDescription', '#paint-brush-label': 'paint.brush', '#paint-strength-label': 'paint.strength',
      '#paint-add': 'paint.add', '#paint-subtract': 'paint.subtract', '#paint-reset': 'paint.reset', '#paint-wave-label': 'wave.form', '#paint-loudness-label': 'paint.loudness', '#paint-spectrum-label': 'paint.spectrum',
      '#paint-hint': 'paint.hint', '#paint-loop-label': 'result.loop', '#paint-stop': 'result.stop', '#paint-export': 'result.export', '#paint-cancel': 'result.cancel'
    };
    for (const [selector, key] of Object.entries(labels)) this.root.querySelector(selector).textContent = t(key);
    this.root.querySelector('#paint-undo span').textContent = t('speed.undo'); this.root.querySelector('#paint-redo span').textContent = t('speed.redo');
    this.waveform.setAttribute('aria-label', t('paint.waveAria')); this.loudnessCanvas.setAttribute('aria-label', t('paint.loudnessAria')); this.spectrogram.setAttribute('aria-label', t('paint.spectrumAria'));
    if (this.loadingName) this.root.querySelector('#paint-file-info').textContent = t('source.decoding', { name: this.loadingName });
    else if (this.source) this.root.querySelector('#paint-file-info').textContent = this.sourceInfo();
    else this.root.querySelector('#paint-file-info').textContent = t('source.limit');
    this.refreshBrushReadout(); this.updateTransport();
  }

  refreshBrushReadout() {
    const brush = +this.root.querySelector('#paint-brush').value, strength = +this.root.querySelector('#paint-strength').value;
    this.root.querySelector('#paint-brush-value').textContent = `${brush} px`; this.root.querySelector('#paint-strength-value').textContent = `${strength} dB`;
    this.root.querySelector('#paint-add').classList.toggle('active', this.mode === 1); this.root.querySelector('#paint-subtract').classList.toggle('active', this.mode === -1);
    this.root.querySelector('#paint-add').classList.toggle('secondary', this.mode !== 1); this.root.querySelector('#paint-subtract').classList.toggle('secondary', this.mode !== -1);
  }

  setMode(mode) { this.root.querySelector('#paint-add').classList.toggle('active', mode === 1); this.root.querySelector('#paint-subtract').classList.toggle('active', mode === -1); this.refreshBrushReadout(); }
  sourceInfo() {
    const locale = document.documentElement.lang === 'ru' ? 'ru-RU' : document.documentElement.lang === 'sr' ? 'sr-Latn-RS' : 'en-US';
    return `${this.source.name} · ${this.source.duration.toFixed(3)} s · ${this.source.sampleRate.toLocaleString(locale)} Hz · ${this.source.channels.length === 1 ? t('source.mono') : t('source.stereo')}`;
  }

  async loadSelected() {
    const file = this.input.files[0]; if (!file) return;
    const error = this.root.querySelector('#paint-load-error'); this.cancelRender(false); this.clearAudio(); this.input.disabled = true; error.hidden = true; this.loadingName = file.name; this.refreshLanguage(); setStatusKey('status.decoding');
    try {
      this.source = await decodeFile(file); this.processed = this.source; this.playhead = 0; this.zoom = 1; this.offset = 0; this.undoStack = []; this.redoStack = [];
      this.root.querySelector('#paint-empty').hidden = true; this.root.querySelector('#paint-workspace').hidden = false; this.root.querySelector('#paint-file-info').textContent = this.sourceInfo();
      await Promise.all([this.analyze(this.source), this.loadSpectrum()]); this.mask = new Float32Array(this.spectrumWidth * this.spectrumHeight); this.makeAudioUrl(this.processed.channels); this.drawAll(); setStatusKey('status.loaded');
    } catch (cause) { error.textContent = translateError(cause.message); error.hidden = false; setStatus(translateError(cause.message), true); }
    finally { this.loadingName = null; this.input.disabled = false; this.input.value = ''; this.refreshLanguage(); }
  }

  async analyze(source) {
    this.analysisWorker?.terminate();
    const data = await new Promise((resolve, reject) => {
      const worker = this.analysisWorker = new Worker(new URL('../visualization/analysis-worker.js', import.meta.url), { type: 'module' });
      worker.onmessage = ({ data }) => { worker.terminate(); resolve(data); }; worker.onerror = () => { worker.terminate(); reject(new Error(t('error.waveform'))); }; worker.postMessage({ channels: source.channels, loudness: true });
    });
    this.analysisWorker = null; this.peaks = data.peaks; this.loudness = data.loudness; this.drawAll();
  }

  async loadSpectrum() {
    this.spectrumWorker?.terminate();
    const data = await new Promise((resolve, reject) => {
      const worker = this.spectrumWorker = new Worker(new URL('../visualization/spectrogram-worker.js', import.meta.url), { type: 'module' });
      worker.onmessage = ({ data }) => { worker.terminate(); resolve(data); }; worker.onerror = () => { worker.terminate(); reject(new Error(t('error.spectrogram'))); }; worker.postMessage({ channels: this.source.channels, sampleRate: this.source.sampleRate });
    });
    this.spectrumWorker = null; this.spectrumWidth = data.width; this.spectrumHeight = data.height;
    this.spectrumBitmap = document.createElement('canvas'); this.spectrumBitmap.width = data.width; this.spectrumBitmap.height = data.height;
    this.spectrumBitmap.getContext('2d').putImageData(new ImageData(data.pixels, data.width, data.height), 0, 0);
  }

  bindCanvas(canvas, action) {
    canvas.addEventListener('pointerdown', event => {
      if (!this.source || this.rendering) return;
      if (event.button === 1) { this.panDrag = { x: event.clientX, offset: this.offset }; canvas.setPointerCapture(event.pointerId); event.preventDefault(); return; }
      if (event.button !== 0) return;
      if (action === 'paint') { this.cancelRender(false); this.strokeBefore = this.mask.slice(); this.stroke = true; this.paintAt(event, null); }
      else { this.seekDrag = true; this.setPlayhead(this.timeAt(canvas, event), true); }
      canvas.setPointerCapture(event.pointerId); event.preventDefault();
    });
    canvas.addEventListener('pointermove', event => {
      if (!this.source) return;
      if (this.panDrag) { this.offset = Math.max(0, Math.min(this.source.duration - this.visibleDuration, this.panDrag.offset - (event.clientX - this.panDrag.x) / canvas.clientWidth * this.visibleDuration)); this.drawAll(); return; }
      if (this.seekDrag) { this.setPlayhead(this.timeAt(canvas, event), true); return; }
      if (this.stroke) this.paintAt(event, this.lastBrush);
      if (action === 'paint') { this.hoverBrush = this.brushPoint(event); this.updateSpectrumReadout(this.hoverBrush); this.drawSpectrogram(); }
    });
    const finish = () => {
      if (this.stroke) { this.stroke = false; this.hoverBrush = null; this.undoStack.push(this.strokeBefore); if (this.undoStack.length > 24) this.undoStack.shift(); this.redoStack = []; this.renderMask(); }
      this.panDrag = null; this.seekDrag = false; this.lastBrush = null; this.drawAll();
    };
    canvas.addEventListener('pointerup', finish); canvas.addEventListener('pointercancel', finish); canvas.addEventListener('lostpointercapture', finish);
    canvas.addEventListener('pointerleave', () => { if (!this.stroke) { this.hoverBrush = null; this.root.querySelector('#paint-frequency-readout').textContent = ''; this.drawSpectrogram(); } });
    canvas.addEventListener('wheel', event => { if (!this.source) return; event.preventDefault(); if (event.ctrlKey) this.setZoom(this.zoom * Math.exp(-event.deltaY * .0025), this.timeAt(canvas, event)); else { const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY; this.panBy(delta / 500 * this.visibleDuration * (event.shiftKey ? 2 : 1)); } }, { passive: false });
    canvas.addEventListener('dblclick', () => this.setZoom(1, 0));
  }

  timeAt(canvas, event) { const rect = canvas.getBoundingClientRect(); return Math.max(0, Math.min(this.source.duration, this.offset + (event.clientX - rect.left) / Math.max(1, rect.width) * this.visibleDuration)); }
  brushPoint(event) {
    const rect = this.spectrogram.getBoundingClientRect(), time = this.timeAt(this.spectrogram, event);
    return { x: time / this.source.duration * (this.spectrumWidth - 1), y: Math.max(0, Math.min(this.spectrumHeight - 1, (event.clientY - rect.top) / Math.max(1, rect.height) * (this.spectrumHeight - 1))) };
  }
  updateSpectrumReadout(point) {
    const time = point.x / Math.max(1, this.spectrumWidth - 1) * this.source.duration;
    const frequency = frequencyAtRow(point.y, this.spectrumHeight, this.source.sampleRate / 2);
    this.root.querySelector('#paint-frequency-readout').textContent = `${clock(time)} · ${frequency >= 1000 ? `${(frequency / 1000).toFixed(1)} kHz` : `${Math.round(frequency)} Hz`}`;
  }
  paintAt(event, previous) {
    const next = this.brushPoint(event), brushPixels = +this.root.querySelector('#paint-brush').value;
    const radius = Math.max(1, brushPixels / Math.max(1, this.spectrogram.clientHeight) * this.spectrumHeight / 2);
    const pressure = event.pointerType === 'pen' && event.pressure > 0 ? event.pressure : 1;
    const strength = +this.root.querySelector('#paint-strength').value * this.mode * pressure;
    paintSegment(this.mask, this.spectrumWidth, this.spectrumHeight, previous || next, next, radius, strength); this.lastBrush = next; this.hoverBrush = next; this.updateSpectrumReadout(next); this.drawSpectrogram();
  }

  setZoom(next, anchorTime) {
    if (!this.source) return;
    const oldVisible = this.visibleDuration, anchor = Math.max(this.offset, Math.min(this.offset + oldVisible, anchorTime)), fraction = oldVisible ? (anchor - this.offset) / oldVisible : .5;
    this.zoom = Math.max(1, Math.min(128, next)); this.offset = Math.max(0, Math.min(this.source.duration - this.visibleDuration, anchor - fraction * this.visibleDuration)); this.drawAll();
  }
  panBy(seconds) { if (!this.source || this.zoom === 1) return; this.offset = Math.max(0, Math.min(this.source.duration - this.visibleDuration, this.offset + seconds)); this.drawAll(); }

  undo() { if (!this.undoStack.length || this.rendering) return; this.redoStack.push(this.mask.slice()); this.mask = this.undoStack.pop(); this.renderMask(); }
  redo() { if (!this.redoStack.length || this.rendering) return; this.undoStack.push(this.mask.slice()); this.mask = this.redoStack.pop(); this.renderMask(); }
  reset() { if (!this.source || this.rendering || !this.mask.some(value => value !== 0)) return; this.undoStack.push(this.mask.slice()); this.redoStack = []; this.mask.fill(0); this.renderMask(); }

  async renderMask() {
    if (!this.source) return;
    this.cancelRender(false); this.renderVersion = (this.renderVersion || 0) + 1; const version = this.renderVersion;
    if (!this.mask.some(value => value !== 0)) {
      this.stop(); this.rendering = true; this.updateTransport();
      try { this.processed = this.source; await this.analyze(this.source); if (version !== this.renderVersion) return; this.makeAudioUrl(this.source.channels); this.drawAll(); setStatusKey('status.previewReady'); }
      finally { if (version === this.renderVersion) { this.rendering = false; this.updateTransport(); } }
      return;
    }
    this.stop(); this.rendering = true;
    const panel = this.root.querySelector('#paint-progress'), bar = this.root.querySelector('#paint-progress-bar'), label = this.root.querySelector('#paint-progress-label'); panel.hidden = false; bar.value = 0; label.textContent = t('paint.rendering'); this.updateTransport(); setStatus(t('paint.rendering'));
    const worker = this.renderWorker = new Worker(new URL('../audio/spectral-paint-worker.js', import.meta.url), { type: 'module' });
    try {
      const rendered = await new Promise((resolve, reject) => {
        worker.onerror = () => reject(new Error(t('error.workerPreview')));
        worker.onmessage = ({ data }) => { if (data.type === 'progress') { bar.value = data.progress; label.textContent = `${Math.round(data.progress * 100)}%`; } else if (data.type === 'done') resolve(data.channels); else if (data.type === 'error') reject(new Error(data.message)); };
        const channels = cloneChannels(this.source.channels), mask = this.mask.slice(); worker.postMessage({ channels, sampleRate: this.source.sampleRate, mask, width: this.spectrumWidth, height: this.spectrumHeight }, [...channels.map(channel => channel.buffer), mask.buffer]);
      });
      if (version !== this.renderVersion) return;
      this.processed = { ...this.source, channels: rendered }; await this.analyze(this.processed); this.makeAudioUrl(rendered); this.drawAll(); setStatusKey('status.previewReady');
    } catch (cause) { if (version === this.renderVersion && cause.name !== 'AbortError') setStatus(translateError(cause.message), true); }
    finally { worker.terminate(); if (this.renderWorker === worker) { this.renderWorker = null; this.rendering = false; panel.hidden = true; this.updateTransport(); } }
  }

  cancelRender(byUser) {
    if (!this.renderWorker) return;
    this.renderVersion = (this.renderVersion || 0) + 1; this.renderWorker.terminate(); this.renderWorker = null; this.rendering = false; this.root.querySelector('#paint-progress').hidden = true; this.updateTransport();
    if (byUser) setStatusKey('status.cancelled');
  }

  makeAudioUrl(channels) {
    this.clearAudio(); const wav = new Blob([wavHeader(channels[0].length, channels.length, this.source.sampleRate), pcm16(channels)], { type: 'audio/wav' });
    this.audioUrl = URL.createObjectURL(wav); this.audio.src = this.audioUrl; this.audio.loop = this.root.querySelector('#paint-loop').checked; this.audio.load(); this.updateTransport();
  }
  clearAudio() { this.audio.pause(); this.audio.removeAttribute('src'); this.audio.load(); if (this.audioUrl) URL.revokeObjectURL(this.audioUrl); this.audioUrl = null; }
  async togglePlayback() { try { if (this.audio.paused) { if (this.audio.ended) this.audio.currentTime = 0; await this.audio.play(); } else this.audio.pause(); } catch (cause) { setStatus(t('error.playback', { message: translateError(cause.message) }), true); } }
  stop(reset = false) { this.audio.pause(); cancelAnimationFrame(this.playheadFrame); if (reset && this.audio.src) { this.audio.currentTime = 0; this.setPlayhead(0, false); } }
  setPlayhead(time, updateAudio = false) { if (!this.source) return; this.playhead = Math.max(0, Math.min(this.source.duration, time)); if (updateAudio && this.audio.src) this.audio.currentTime = this.playhead; this.drawAll(); this.updateTransport(); }
  animatePlayhead() { cancelAnimationFrame(this.playheadFrame); const tick = () => { if (this.audio.paused) return; this.setPlayhead(this.audio.currentTime, false); this.playheadFrame = requestAnimationFrame(tick); }; this.playheadFrame = requestAnimationFrame(tick); }
  updateTransport() {
    const play = this.root.querySelector('#paint-play'), stop = this.root.querySelector('#paint-stop'), exportButton = this.root.querySelector('#paint-export'); if (!play) return;
    play.textContent = this.audio.paused ? t('result.play') : t('result.pause'); play.disabled = !this.audio.src || this.rendering; stop.disabled = !this.audio.src; exportButton.disabled = !this.processed || this.rendering;
    this.root.querySelector('#paint-result-time').textContent = `${clock(this.playhead || 0)} / ${clock(this.source?.duration || 0)}`; this.root.querySelector('#paint-time-readout').textContent = `${clock(this.offset)} — ${clock(this.offset + (this.visibleDuration || 0))}`;
  }

  async exportWav() {
    if (!this.processed || this.exporting) return;
    this.exporting = true; this.updateTransport();
    try {
      const frames = this.processed.channels[0].length, size = 44 + frames * this.processed.channels.length * 2, name = exportName(this.source.name).replace('_auralith.wav', '_sound-paint.wav');
      if (!window.showSaveFilePicker && size > BLOB_LIMIT) throw new Error(t('error.exportLimit'));
      const bytes = [wavHeader(frames, this.processed.channels.length, this.source.sampleRate), pcm16(this.processed.channels)];
      if (window.showSaveFilePicker) { const handle = await window.showSaveFilePicker({ suggestedName: name, types: [{ description: 'WAV audio', accept: { 'audio/wav': ['.wav'] } }] }); const writer = await handle.createWritable(); for (const part of bytes) await writer.write(part); await writer.close(); setStatus(t('export.saved', { name, size: (size / 1024 / 1024).toFixed(1) })); }
      else { const url = URL.createObjectURL(new Blob(bytes, { type: 'audio/wav' })), link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); setStatus(t('export.download', { name, size: (size / 1024 / 1024).toFixed(1) })); }
    } catch (cause) { if (cause.name !== 'AbortError') setStatus(translateError(cause.message), true); }
    finally { this.exporting = false; this.updateTransport(); }
  }

  prepareCanvas(canvas, height) {
    const width = canvas.clientWidth || 800, dpr = devicePixelRatio || 1; canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr); canvas.style.height = `${height}px`; const context = canvas.getContext('2d'); context.scale(dpr, dpr); context.fillStyle = '#ebeede'; context.fillRect(0, 0, width, height); return { context, width, height };
  }
  drawAll() { this.drawWaveform(); this.drawLoudness(); this.drawSpectrogram(); this.updateTransport(); }
  drawWaveform() {
    if (!this.source || !this.peaks || this.root.querySelector('#paint-workspace').hidden) return;
    const { context, width, height } = this.prepareCanvas(this.waveform, this.processed.channels.length === 2 ? 160 : 126), lane = height / this.peaks.length;
    this.peaks.forEach(({ min, max }, channel) => { const middle = lane * (channel + .5); context.strokeStyle = '#28584c'; context.lineWidth = 1; context.beginPath(); for (let x = 0; x < width; x++) { const left = (this.offset + x / width * this.visibleDuration) / this.source.duration * min.length, right = (this.offset + (x + 1) / width * this.visibleDuration) / this.source.duration * min.length; let lo = 0, hi = 0; for (let index = Math.floor(left); index < Math.min(min.length, Math.max(Math.floor(left) + 1, Math.ceil(right))); index++) { lo = Math.min(lo, min[index]); hi = Math.max(hi, max[index]); } context.moveTo(x + .5, middle - hi * lane * .42); context.lineTo(x + .5, middle - lo * lane * .42); } context.stroke(); context.fillStyle = '#63665b'; context.font = '11px Consolas'; context.fillText(this.peaks.length === 1 ? t('wave.mono') : channel ? 'R' : 'L', 6, middle - lane * .28); });
    this.drawPlayhead(context, width, height);
  }
  drawLoudness() {
    if (!this.source || !this.loudness || this.root.querySelector('#paint-workspace').hidden) return;
    const { context, width, height } = this.prepareCanvas(this.loudnessCanvas, 82); context.beginPath();
    for (let x = 0; x <= width; x++) { const position = (this.offset + x / width * this.visibleDuration) / this.source.duration * (this.loudness.length - 1), index = Math.max(0, Math.min(this.loudness.length - 1, Math.round(position))), db = Math.max(-72, Math.min(0, this.loudness[index])), y = height - 6 - (db + 72) / 72 * (height - 16); x ? context.lineTo(x, y) : context.moveTo(x, y); }
    context.lineTo(width, height - 5); context.lineTo(0, height - 5); context.closePath(); context.fillStyle = '#28584c33'; context.fill(); context.strokeStyle = '#28584c'; context.lineWidth = 1.5; context.stroke(); context.strokeStyle = '#aa4626'; context.setLineDash([4, 4]); context.beginPath(); context.moveTo(0, 7); context.lineTo(width, 7); context.stroke(); context.setLineDash([]); this.drawPlayhead(context, width, height);
  }
  drawSpectrogram() {
    if (!this.source || !this.spectrumBitmap || !this.mask || this.root.querySelector('#paint-workspace').hidden) return;
    const { context, width, height } = this.prepareCanvas(this.spectrogram, 270), sourceX = this.offset / this.source.duration * this.spectrumWidth, sourceWidth = this.visibleDuration / this.source.duration * this.spectrumWidth;
    context.drawImage(this.spectrumBitmap, sourceX, 0, sourceWidth, this.spectrumHeight, 0, 0, width, height);
    const overlay = document.createElement('canvas'); overlay.width = width; overlay.height = height; const image = overlay.getContext('2d').createImageData(width, height), pixels = image.data;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const mx = Math.max(0, Math.min(this.spectrumWidth - 1, Math.round(sourceX + x / width * sourceWidth)));
      const my = Math.max(0, Math.min(this.spectrumHeight - 1, Math.round(y / height * (this.spectrumHeight - 1))));
      const gain = this.mask[my * this.spectrumWidth + mx];
      if (Math.abs(gain) < .1) continue;
      const index = (y * width + x) * 4, alpha = Math.min(210, Math.round(Math.abs(gain) / 18 * 190));
      pixels[index] = gain > 0 ? 248 : 16; pixels[index + 1] = gain > 0 ? 209 : 48; pixels[index + 2] = gain > 0 ? 67 : 43; pixels[index + 3] = alpha;
    }
    overlay.getContext('2d').putImageData(image, 0, 0); context.drawImage(overlay, 0, 0, width, height); this.drawFrequencyLabels(context, width, height); this.drawPlayhead(context, width, height);
    if (this.hoverBrush) { const brush = +this.root.querySelector('#paint-brush').value, x = (this.hoverBrush.x / (this.spectrumWidth - 1) * this.source.duration - this.offset) / this.visibleDuration * width, y = this.hoverBrush.y / (this.spectrumHeight - 1) * height; context.strokeStyle = '#fbe7b0'; context.lineWidth = 1.5; context.beginPath(); context.arc(x, y, brush / 2, 0, Math.PI * 2); context.stroke(); }
  }
  drawFrequencyLabels(context, width, height) {
    context.font = '11px Consolas';
    for (const frequency of [30, 100, 1000, 10000]) { if (frequency >= this.source.sampleRate / 2) continue; const ratio = Math.log(frequency / 30) / Math.log(this.source.sampleRate / 2 / 30), y = height * (1 - ratio); context.fillStyle = '#19332fd9'; context.fillRect(3, Math.max(0, y - 11), 54, 14); context.fillStyle = '#f8f4e9'; context.fillText(frequency >= 1000 ? `${frequency / 1000}k` : `${frequency}`, 7, Math.max(10, y)); }
  }
  drawPlayhead(context, width, height) { const x = (this.playhead - this.offset) / this.visibleDuration * width; if (x < -2 || x > width + 2) return; context.strokeStyle = '#172dc4'; context.lineWidth = 2; context.beginPath(); context.moveTo(x, 0); context.lineTo(x, height); context.stroke(); }
  draw() { this.drawAll(); }
}
