import { setStatus } from '../ui/status.js';
import { t } from '../ui/i18n.js';

export class Waveform {
  constructor(onSelection = () => {}) {
    this.onSelection = onSelection;
    this.zoom = 1; this.offset = 0; this.playhead = 0; this.lastMode = 'source';
    document.querySelector('#visualizations').innerHTML = `<div id="wave-panel" hidden>
      <div class="view-toolbar"><span id="wave-form-label"></span><label><span id="zoom-label"></span> <input id="zoom" type="range" min="1" max="128" step="any" value="1"></label><label class="scroll-label"><span id="scroll-label"></span> <input id="scroll" type="range" min="0" max="1" step=".001" value="0" disabled></label><button id="navigation-help" class="icon-button secondary" type="button" aria-haspopup="dialog">?</button></div>
      <canvas id="waveform" height="200" tabindex="0"></canvas><div id="spectrogram-slot"></div>
      <div class="transport"><div class="transport-buttons"><button id="source-play" type="button"></button><span id="preview-transport-slot"></span><label class="loop-control"><input id="result-loop" type="checkbox" checked> <span id="loop-label"></span></label></div><div id="preview-render-progress" hidden><progress id="preview-progress" max="1" value="0"></progress><div class="preview-progress-meta"><span id="preview-progress-label" role="status"></span><button id="cancel-preview" class="text-button" type="button"></button></div></div></div>
      <p id="wave-hint" class="hint"></p>
      <dialog id="navigation-dialog" class="help-dialog"><form method="dialog"><div class="dialog-heading"><h3 id="navigation-title"></h3><button id="navigation-close-icon" class="icon-button secondary" value="close">×</button></div><dl id="navigation-shortcuts"></dl><button id="navigation-close" value="close"></button></form></dialog>
    </div>`;
    this.canvas = document.querySelector('#waveform');
    document.querySelector('#selection-controls').innerHTML = `<div id="selection-panel" hidden><div class="selection-row">${['start', 'end'].map((bound, i) => `<fieldset><legend>${i ? '<span data-bound="end"></span>' : '<span data-bound="start"></span>'}</legend>${[['min', 59], ['sec', 59], ['ms', 999]].map(([unit, max]) => `<label><input id="${bound}-${unit}" type="number" min="0" max="${unit === 'min' ? 9999 : max}" step="1" value="0"> <span data-unit="${unit}"></span></label>`).join('')}</fieldset>`).join('')}<span id="selection-length" class="muted"></span></div><p id="selection-error" class="error" role="alert" hidden></p></div>`;
    for (const bound of ['start', 'end']) for (const unit of ['min', 'sec', 'ms']) {
      const input = document.querySelector(`#${bound}-${unit}`); input.setAttribute('aria-describedby', 'selection-error');
      if (unit === 'ms') { input.step = '.001'; input.max = '999.999'; }
      input.addEventListener('change', () => this.readFields());
    }
    document.querySelector('#source-play').onclick = () => this.toggleSource().catch(e => setStatus(e.message, true));
    document.querySelector('#result-loop').addEventListener('change', () => { if (this.node) this.startSourceAt(this.playhead); });
    const dialog = document.querySelector('#navigation-dialog');
    document.querySelector('#navigation-help').onclick = () => dialog.showModal();
    dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
    this.refreshLanguage = () => {
      document.querySelector('#wave-form-label').textContent = t('wave.form'); document.querySelector('#zoom-label').textContent = t('wave.zoom'); document.querySelector('#scroll-label').textContent = t('wave.scroll');
      document.querySelector('#wave-hint').textContent = t('wave.hint'); this.canvas.setAttribute('aria-label', t('wave.aria'));
      document.querySelector('[data-bound="start"]').textContent = t('wave.start'); document.querySelector('[data-bound="end"]').textContent = t('wave.end');
      for (const unit of ['min', 'sec', 'ms']) document.querySelector(`[data-unit="${unit}"]`).textContent = t(`wave.${unit}`);
      document.querySelector('#loop-label').textContent = t('result.loop'); document.querySelector('#navigation-help').setAttribute('aria-label', t('wave.help'));
      document.querySelector('#navigation-title').textContent = t('wave.helpTitle'); document.querySelector('#navigation-close').textContent = t('wave.helpClose'); document.querySelector('#navigation-close-icon').setAttribute('aria-label', t('wave.helpClose'));
      document.querySelector('#navigation-shortcuts').innerHTML = [['zoom', 'Ctrl + wheel'], ['scroll', 'wheel'], ['fastScroll', 'Shift + wheel'], ['pan', t('wave.middleDrag')], ['fit', 'F'], ['fitSelection', 'Shift + F'], ['play', 'Space'], ['seek', t('wave.dragPlayhead')]].map(([key, value]) => `<div><dt>${t(`wave.help.${key}`)}</dt><dd><kbd>${value}</kbd></dd></div>`).join('');
      this.updateSourceLabel(); if (this.source) this.updateFields(); this.draw();
    };
    document.addEventListener('languagechange', this.refreshLanguage);
    document.querySelector('#zoom').oninput = e => this.setZoom(+e.target.value, this.playhead || this.start || 0);
    document.querySelector('#scroll').oninput = e => { this.offset = +e.target.value; this.draw(); };
    this.bindPointer(this.canvas); this.bindNavigation(this.canvas);
    this.resize = new ResizeObserver(() => this.draw()); this.resize.observe(this.canvas);
    document.addEventListener('keydown', e => this.onKeyDown(e)); this.refreshLanguage();
  }

  get visibleDuration() { return this.source ? this.source.duration / this.zoom : 0; }
  attachPreviewTransport(transport) { this.previewTransport = transport; }
  async load(source) {
    this.stop(); this.worker?.terminate();
    const peaks = await new Promise((resolve, reject) => {
      const worker = this.worker = new Worker(new URL('./analysis-worker.js', import.meta.url), { type: 'module' });
      worker.onmessage = ({ data }) => { worker.terminate(); resolve(data.peaks); }; worker.onerror = () => { worker.terminate(); reject(new Error(t('error.waveform'))); }; worker.postMessage({ channels: source.channels });
    });
    this.source = source; this.playbackBuffer = null; this.peaks = peaks; this.start = 0; this.end = source.duration; this.playhead = 0; this.zoom = 1; this.offset = 0;
    document.querySelector('#wave-panel').hidden = false; document.querySelector('#selection-panel').hidden = false; document.querySelector('#zoom').value = 1; document.querySelector('#selection-error').hidden = true; this.updateScroll(); this.changed();
  }
  setZoom(nextZoom, anchorTime) {
    if (!this.source) return;
    const oldVisible = this.visibleDuration, anchor = Math.max(this.offset, Math.min(this.offset + oldVisible, anchorTime)), fraction = oldVisible ? (anchor - this.offset) / oldVisible : .5;
    this.zoom = Math.max(1, Math.min(128, nextZoom)); this.offset = Math.max(0, Math.min(this.source.duration - this.visibleDuration, anchor - fraction * this.visibleDuration));
    document.querySelector('#zoom').value = this.zoom; this.updateScroll(); this.draw();
  }
  fitSelection() { if (!this.source) return; const duration = this.end - this.start; this.zoom = Math.max(1, Math.min(128, this.source.duration / duration)); this.offset = Math.max(0, Math.min(this.source.duration - this.visibleDuration, this.start)); document.querySelector('#zoom').value = this.zoom; this.updateScroll(); this.draw(); }
  fitAll() { if (this.source) this.setZoom(1, 0); }
  updateScroll() { const scroll = document.querySelector('#scroll'); scroll.max = Math.max(0, this.source.duration - this.visibleDuration); scroll.step = Math.max(.000001, this.source.duration / 100000); scroll.value = this.offset; scroll.disabled = this.zoom === 1; }
  panBy(seconds) { if (!this.source || this.zoom === 1) return; this.offset = Math.max(0, Math.min(this.source.duration - this.visibleDuration, this.offset + seconds)); this.updateScroll(); this.draw(); }
  changed() { this.stop(); this.playhead = Math.max(this.start, Math.min(this.end, this.playhead)); this.updateFields(); this.draw(); this.onSelection({ start: this.start, end: this.end }); }
  updateFields() {
    for (const bound of ['start', 'end']) { const micros = Math.round(this[bound] * 1000000); document.querySelector(`#${bound}-min`).value = Math.floor(micros / 60000000); document.querySelector(`#${bound}-sec`).value = Math.floor(micros / 1000000) % 60; document.querySelector(`#${bound}-ms`).value = (micros % 1000000) / 1000; }
    const duration = this.end - this.start, samples = Math.max(1, Math.round(duration * this.source.sampleRate)); document.querySelector('#selection-length').textContent = duration < .001 ? t(samples === 1 ? 'wave.fragmentMsOne' : 'wave.fragmentMs', { value: (duration * 1000).toFixed(3), samples }) : t('wave.fragment', { value: duration.toFixed(3) });
  }
  readFields() {
    const error = document.querySelector('#selection-error'), read = bound => ['min', 'sec', 'ms'].reduce((sum, unit, i) => { const input = document.querySelector(`#${bound}-${unit}`); if (!input.checkValidity() || input.value === '' || !Number.isFinite(+input.value) || (unit !== 'ms' && !Number.isInteger(+input.value))) return NaN; return sum + +input.value * [60, 1, .001][i]; }, 0);
    const rawStart = read('start'), rawEnd = read('end'), start = Math.round(rawStart * this.source.sampleRate) / this.source.sampleRate, end = Math.round(rawEnd * this.source.sampleRate) / this.source.sampleRate;
    if (!Number.isFinite(start + end) || rawStart < 0 || rawEnd > this.source.duration + .0000005 || end > this.source.duration || Math.round((end - start) * this.source.sampleRate) < 1) { error.textContent = t('error.selection'); error.hidden = false; return; }
    error.hidden = true; this.start = start; this.end = end; this.changed();
  }

  timeAt(canvas, e) { const rect = canvas.getBoundingClientRect(); return Math.max(0, Math.min(this.source.duration, this.offset + (e.clientX - rect.left) / rect.width * this.visibleDuration)); }
  bindPointer(canvas) {
    canvas.addEventListener('pointerdown', e => {
      if (!this.source || this.locked) return;
      if (e.button === 1) { this.panDrag = { x: e.clientX, offset: this.offset }; canvas.setPointerCapture(e.pointerId); e.preventDefault(); return; }
      if (e.button !== 0) return;
      const value = this.timeAt(canvas, e), rect = canvas.getBoundingClientRect(), playheadX = (this.playhead - this.offset) / this.visibleDuration * rect.width;
      const boundaryTolerance = this.visibleDuration * 12 / canvas.clientWidth, onBoundary = Math.min(Math.abs(value - this.start), Math.abs(value - this.end)) <= boundaryTolerance;
      const nearPlayhead = Math.abs(e.clientX - rect.left - playheadX) <= 7 && (!onBoundary || e.clientY - rect.top >= rect.height - 18);
      if (nearPlayhead) { this.seekDrag = true; this.setPlayhead(value, true); canvas.setPointerCapture(e.pointerId); e.preventDefault(); return; }
      const tolerance = boundaryTolerance, distanceStart = Math.abs(value - this.start), distanceEnd = Math.abs(value - this.end), mode = Math.min(distanceStart, distanceEnd) <= tolerance ? (distanceStart < distanceEnd ? 'start' : 'end') : value > this.start && value < this.end ? 'move' : 'new';
      this.drag = { mode, at: value, start: this.start, end: this.end }; canvas.setPointerCapture(e.pointerId); e.preventDefault();
    });
    canvas.addEventListener('pointermove', e => {
      if (this.panDrag) { this.offset = Math.max(0, Math.min(this.source.duration - this.visibleDuration, this.panDrag.offset - (e.clientX - this.panDrag.x) / canvas.clientWidth * this.visibleDuration)); this.updateScroll(); this.draw(); return; }
      if (this.seekDrag) { this.setPlayhead(this.timeAt(canvas, e), true); return; }
      if (!this.drag || this.locked) return;
      const value = this.timeAt(canvas, e), min = 1 / this.source.sampleRate, d = this.drag;
      if (d.mode === 'start') this.start = Math.min(value, this.end - min); else if (d.mode === 'end') this.end = Math.max(value, this.start + min); else if (d.mode === 'move') { const delta = Math.max(-d.start, Math.min(this.source.duration - d.end, value - d.at)); this.start = d.start + delta; this.end = d.end + delta; } else { this.start = Math.min(d.at, Math.min(value, this.source.duration - min)); this.end = Math.min(this.source.duration, Math.max(d.at + min, value)); }
      document.querySelector('#selection-error').hidden = true; this.changed();
    });
    const finish = () => { this.drag = null; this.panDrag = null; this.seekDrag = false; }; canvas.addEventListener('pointerup', finish); canvas.addEventListener('pointercancel', finish); canvas.addEventListener('lostpointercapture', finish);
  }
  bindNavigation(canvas) {
    canvas.addEventListener('wheel', e => { if (!this.source) return; e.preventDefault(); if (e.ctrlKey) this.setZoom(this.zoom * Math.exp(-e.deltaY * .0025), this.timeAt(canvas, e)); else { const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY; this.panBy(delta / 500 * this.visibleDuration * (e.shiftKey ? 2 : 1)); } }, { passive: false });
    canvas.addEventListener('dblclick', e => { if (e.button === 0) this.fitAll(); });
  }
  onKeyDown(e) {
    if (!this.source || document.querySelector('#navigation-dialog').open || e.altKey || e.ctrlKey || e.metaKey || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    if (e.key.toLowerCase() === 'f') { e.preventDefault(); e.shiftKey ? this.fitSelection() : this.fitAll(); }
    else if (e.code === 'Space' && e.target.tagName !== 'BUTTON') { e.preventDefault(); this.lastMode === 'preview' && this.previewTransport ? this.previewTransport.toggle() : this.toggleSource().catch(error => setStatus(error.message, true)); }
  }
  drawSelection(ctx, width, height) { const a = (this.start - this.offset) / this.visibleDuration * width, b = (this.end - this.offset) / this.visibleDuration * width; ctx.fillStyle = '#aa462624'; ctx.fillRect(a, 0, b - a, height); ctx.strokeStyle = '#aa4626'; ctx.lineWidth = 2; for (const x of [a, b]) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke(); ctx.fillStyle = '#aa4626'; ctx.fillRect(x - 4, 0, 8, 14); } }
  drawPlayhead(ctx, width, height) { const x = (this.playhead - this.offset) / this.visibleDuration * width; if (x < -2 || x > width + 2) return; ctx.strokeStyle = '#172dc4'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke(); ctx.fillStyle = '#172dc4'; ctx.beginPath(); ctx.moveTo(x - 6, height); ctx.lineTo(x + 6, height); ctx.lineTo(x, height - 10); ctx.closePath(); ctx.fill(); }
  draw() {
    if (!this.source) return;
    const c = this.canvas, w = c.clientWidth, h = this.source.channels.length === 2 ? 170 : 130, dpr = devicePixelRatio || 1; c.width = Math.round(w * dpr); c.height = h * dpr; c.style.height = `${h}px`;
    const ctx = c.getContext('2d'); ctx.scale(dpr, dpr); ctx.fillStyle = '#ebeede'; ctx.fillRect(0, 0, w, h); const lane = (h - 24) / this.peaks.length;
    this.peaks.forEach(({ min, max }, ch) => { const mid = 24 + lane * (ch + .5); ctx.strokeStyle = '#28584c'; ctx.lineWidth = 1; ctx.beginPath(); for (let x = 0; x < w; x++) { const a = Math.floor((this.offset + x / w * this.visibleDuration) / this.source.duration * min.length), b = Math.min(min.length, Math.max(a + 1, Math.ceil((this.offset + (x + 1) / w * this.visibleDuration) / this.source.duration * min.length))); let lo = 0, hi = 0; for (let i = a; i < b; i++) { lo = Math.min(lo, min[i]); hi = Math.max(hi, max[i]); } ctx.moveTo(x + .5, mid - hi * lane * .43); ctx.lineTo(x + .5, mid - lo * lane * .43); } ctx.stroke(); ctx.fillStyle = '#28584c'; ctx.font = '12px Consolas'; ctx.fillText(this.peaks.length === 1 ? t('wave.mono') : ch ? 'R' : 'L', 8, mid - lane * .3); });
    ctx.fillStyle = '#63665b'; ctx.font = '12px Consolas'; for (let i = 0; i < 6; i++) ctx.fillText(`${(this.offset + i / 6 * this.visibleDuration).toFixed(2)} s`, 5 + i / 6 * w, 16); this.drawSelection(ctx, w, h); this.drawPlayhead(ctx, w, h); this.drawSpectrogram?.();
  }

  setPlayhead(value, seek = false, follow = false) {
    if (!this.source) return; this.playhead = Math.max(this.start, Math.min(this.end, value));
    if (seek) { if (this.node) this.startSourceAt(this.playhead); else if (this.previewTransport?.isPlaying() || this.playbackMode === 'preview') this.previewTransport?.seek(this.playhead); }
    if (follow && this.zoom > 1) { const relative = (this.playhead - this.offset) / this.visibleDuration; if (relative > .72 || relative < .05) { this.offset = Math.max(0, Math.min(this.source.duration - this.visibleDuration, this.playhead - this.visibleDuration * .28)); this.updateScroll(); } }
    this.draw();
  }
  async toggleSource() {
    if (this.node) { this.stopSource(); return; }
    if (!document.querySelector('#selection-error').hidden) throw new Error(t('error.selectionPlay'));
    this.previewTransport?.stop(); this.lastMode = 'source'; this.playbackMode = 'source'; this.context ||= new AudioContext(); await this.context.resume();
    if (!this.playbackBuffer) { this.playbackBuffer = this.context.createBuffer(this.source.channels.length, this.source.channels[0].length, this.source.sampleRate); this.source.channels.forEach((channel, index) => this.playbackBuffer.copyToChannel(channel, index)); }
    this.startSourceAt(this.playhead >= this.start && this.playhead < this.end ? this.playhead : this.start);
  }
  startSourceAt(position) {
    if (!this.context || !this.playbackBuffer) return;
    if (this.node) { this.node.onended = null; this.node.stop(); this.node.disconnect(); }
    const node = this.node = this.context.createBufferSource(); node.buffer = this.playbackBuffer; node.connect(this.context.destination); node.loop = document.querySelector('#result-loop').checked; node.loopStart = this.start; node.loopEnd = this.end;
    node.onended = () => { if (this.node === node) { this.node = null; cancelAnimationFrame(this.playheadFrame); this.playhead = this.end; this.updateSourceLabel(); this.draw(); } };
    this.sourceOrigin = position; this.sourceStartedAt = this.context.currentTime; node.start(0, position); if (!node.loop) node.stop(this.context.currentTime + this.end - position); this.updateSourceLabel(); this.animateSourcePlayhead();
  }
  animateSourcePlayhead() { cancelAnimationFrame(this.playheadFrame); const tick = () => { if (!this.node) return; const duration = this.end - this.start, elapsed = this.context.currentTime - this.sourceStartedAt; let value = this.sourceOrigin + elapsed; if (this.node.loop) value = this.start + ((value - this.start) % duration + duration) % duration; this.setPlayhead(Math.min(this.end, value), false, true); this.playheadFrame = requestAnimationFrame(tick); }; this.playheadFrame = requestAnimationFrame(tick); }
  updateSourceLabel() { const button = document.querySelector('#source-play'); if (button) button.textContent = this.node ? t('wave.sourcePause') : t('wave.sourcePlay'); }
  stopSource(reset = false) { if (this.node) { this.node.onended = null; this.node.stop(); this.node.disconnect(); this.node = null; } cancelAnimationFrame(this.playheadFrame); if (reset && this.source) this.playhead = this.start; this.updateSourceLabel(); this.draw(); }
  stop() { this.stopSource(true); this.previewTransport?.stop(true); this.playbackMode = null; }
}
