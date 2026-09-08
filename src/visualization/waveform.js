import { setStatus } from '../ui/status.js';
import { t, translateError } from '../ui/i18n.js';
export class Waveform {
  constructor(onSelection = () => {}) {
    this.onSelection = onSelection;
    this.zoom = 1; this.offset = 0;
    document.querySelector('#visualizations').innerHTML = `<div id="wave-panel" hidden><div class="view-toolbar"><span id="wave-form-label"></span><label><span id="zoom-label"></span> <input id="zoom" type="range" min="1" max="32" step="1" value="1"></label><label class="scroll-label"><span id="scroll-label"></span> <input id="scroll" type="range" min="0" max="1" step=".001" value="0" disabled></label></div><canvas id="waveform" height="200"></canvas><div id="spectrogram-slot"></div><p id="wave-hint" class="hint"></p></div>`;
    this.canvas = document.querySelector('#waveform');
    document.querySelector('#selection-controls').innerHTML = `<div id="selection-panel" hidden><div class="selection-row">${['start', 'end'].map((bound, i) => `<fieldset><legend>${i ? '<span data-bound="end"></span>' : '<span data-bound="start"></span>'}</legend>${[['min', 59], ['sec', 59], ['ms', 999]].map(([unit, max]) => `<label><input id="${bound}-${unit}" type="number" min="0" max="${unit === 'min' ? 9999 : max}" step="1" value="0"> <span data-unit="${unit}"></span></label>`).join('')}</fieldset>`).join('')}<button id="source-play" type="button"></button><span id="selection-length" class="muted"></span></div><p id="selection-error" class="error" role="alert" hidden></p></div>`;
    for (const bound of ['start', 'end']) for (const unit of ['min', 'sec', 'ms']) {
      const input = document.querySelector(`#${bound}-${unit}`);
      input.setAttribute('aria-describedby', 'selection-error');
      if (unit === 'ms') { input.step = '.001'; input.max = '999.999'; }
      input.addEventListener('change', () => this.readFields());
    }
    document.querySelector('#source-play').onclick = () => this.play().catch(e => setStatus(e.message, true));
    this.refreshLanguage = () => { document.querySelector('#wave-form-label').textContent = t('wave.form'); document.querySelector('#zoom-label').textContent = t('wave.zoom'); document.querySelector('#scroll-label').textContent = t('wave.scroll'); document.querySelector('#wave-hint').textContent = t('wave.hint'); document.querySelector('#waveform').setAttribute('aria-label', t('wave.aria')); document.querySelector('[data-bound="start"]').textContent = t('wave.start'); document.querySelector('[data-bound="end"]').textContent = t('wave.end'); for (const unit of ['min', 'sec', 'ms']) document.querySelector(`[data-unit="${unit}"]`).textContent = t(`wave.${unit}`); document.querySelector('#source-play').textContent = this.node ? t('wave.sourceStop') : t('wave.sourcePlay'); if (this.source) this.updateFields(); this.draw(); };
    document.addEventListener('languagechange', this.refreshLanguage);
    document.querySelector('#zoom').oninput = e => { this.zoom = +e.target.value; this.offset = Math.min(this.offset, this.source.duration - this.visibleDuration); this.updateScroll(); this.draw(); };
    document.querySelector('#scroll').oninput = e => { this.offset = +e.target.value; this.draw(); };
    this.bindPointer(this.canvas);
    this.resize = new ResizeObserver(() => this.draw()); this.resize.observe(this.canvas);
    this.refreshLanguage();
  }
  get visibleDuration() { return this.source ? this.source.duration / this.zoom : 0; }
  async load(source) {
    this.stop(); this.worker?.terminate();
    const peaks = await new Promise((resolve, reject) => {
      const worker = this.worker = new Worker(new URL('./analysis-worker.js', import.meta.url), { type: 'module' });
      worker.onmessage = ({ data }) => { worker.terminate(); resolve(data.peaks); };
      worker.onerror = () => { worker.terminate(); reject(new Error(t('error.waveform'))); };
      worker.postMessage({ channels: source.channels });
    });
    this.source = source; this.playbackBuffer = null; this.peaks = peaks; this.start = 0; this.end = source.duration; this.zoom = 1; this.offset = 0;
    document.querySelector('#wave-panel').hidden = false; document.querySelector('#selection-panel').hidden = false;
    document.querySelector('#zoom').value = 1; document.querySelector('#selection-error').hidden = true; this.updateScroll(); this.changed();
  }
  updateScroll() { const scroll = document.querySelector('#scroll'); scroll.max = Math.max(0, this.source.duration - this.visibleDuration); scroll.step = Math.max(.000001, this.source.duration / 100000); scroll.value = this.offset; scroll.disabled = this.zoom === 1; }
  changed() { this.stop(); this.updateFields(); this.draw(); this.onSelection({ start: this.start, end: this.end }); }
  updateFields() {
    for (const bound of ['start', 'end']) {
      const micros = Math.round(this[bound] * 1000000);
      document.querySelector(`#${bound}-min`).value = Math.floor(micros / 60000000);
      document.querySelector(`#${bound}-sec`).value = Math.floor(micros / 1000000) % 60;
      document.querySelector(`#${bound}-ms`).value = (micros % 1000000) / 1000;
    }
    const duration = this.end - this.start;
    const samples = Math.max(1, Math.round(duration * this.source.sampleRate));
    document.querySelector('#selection-length').textContent = duration < .001 ? t(samples === 1 ? 'wave.fragmentMsOne' : 'wave.fragmentMs', { value: (duration * 1000).toFixed(3), samples }) : t('wave.fragment', { value: duration.toFixed(3) });
  }
  readFields() {
    const error = document.querySelector('#selection-error');
    const read = bound => ['min', 'sec', 'ms'].reduce((sum, unit, i) => { const input = document.querySelector(`#${bound}-${unit}`); if (!input.checkValidity() || input.value === '' || !Number.isFinite(+input.value) || (unit !== 'ms' && !Number.isInteger(+input.value))) return NaN; return sum + +input.value * [60, 1, .001][i]; }, 0);
    const rawStart = read('start'), rawEnd = read('end');
    const start = Math.round(rawStart * this.source.sampleRate) / this.source.sampleRate;
    // Rounded displayed file-end remains a valid representation of the last sample.
    const end = Math.round(rawEnd * this.source.sampleRate) / this.source.sampleRate;
    if (!Number.isFinite(start + end) || rawStart < 0 || rawEnd > this.source.duration + .0000005 || end > this.source.duration || Math.round((end - start) * this.source.sampleRate) < 1) { error.textContent = t('error.selection'); error.hidden = false; return; }
    error.hidden = true; this.start = start; this.end = end; this.changed();
  }
  bindPointer(canvas) {
    const time = e => Math.max(0, Math.min(this.source.duration, this.offset + (e.clientX - canvas.getBoundingClientRect().left) / canvas.getBoundingClientRect().width * this.visibleDuration));
    canvas.addEventListener('pointerdown', e => {
      if (!this.source || this.locked || e.button !== 0) return;
      const t = time(e), tolerance = this.visibleDuration * 12 / canvas.clientWidth;
      const distanceStart = Math.abs(t - this.start), distanceEnd = Math.abs(t - this.end);
      const mode = Math.min(distanceStart, distanceEnd) <= tolerance ? (distanceStart < distanceEnd ? 'start' : 'end') : t > this.start && t < this.end ? 'move' : 'new';
      this.drag = { mode, at: t, start: this.start, end: this.end }; canvas.setPointerCapture(e.pointerId); e.preventDefault();
    });
    canvas.addEventListener('pointermove', e => {
      if (!this.drag || this.locked) return;
      const t = time(e), min = 1 / this.source.sampleRate, d = this.drag;
      if (d.mode === 'start') this.start = Math.min(t, this.end - min);
      else if (d.mode === 'end') this.end = Math.max(t, this.start + min);
      else if (d.mode === 'move') { const delta = Math.max(-d.start, Math.min(this.source.duration - d.end, t - d.at)); this.start = d.start + delta; this.end = d.end + delta; }
      else { this.start = Math.min(d.at, Math.min(t, this.source.duration - min)); this.end = Math.min(this.source.duration, Math.max(d.at + min, t)); }
      document.querySelector('#selection-error').hidden = true; this.changed();
    });
    const finish = () => { this.drag = null; }; canvas.addEventListener('pointerup', finish); canvas.addEventListener('pointercancel', finish); canvas.addEventListener('lostpointercapture', finish);
  }
  drawSelection(ctx, width, height) {
    const a = (this.start - this.offset) / this.visibleDuration * width, b = (this.end - this.offset) / this.visibleDuration * width;
    ctx.fillStyle = '#aa462624'; ctx.fillRect(a, 0, b - a, height);
    ctx.strokeStyle = '#aa4626'; ctx.lineWidth = 2;
    for (const x of [a, b]) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke(); ctx.fillStyle = '#aa4626'; ctx.fillRect(x - 4, 0, 8, 14); }
  }
  draw() {
    if (!this.source) return;
    const c = this.canvas, w = c.clientWidth, h = this.source.channels.length === 2 ? 170 : 130, dpr = devicePixelRatio || 1;
    c.width = Math.round(w * dpr); c.height = h * dpr; c.style.height = `${h}px`;
    const ctx = c.getContext('2d'); ctx.scale(dpr, dpr); ctx.fillStyle = '#ebeede'; ctx.fillRect(0, 0, w, h);
    const lane = (h - 24) / this.peaks.length;
    this.peaks.forEach(({ min, max }, ch) => {
      const mid = 24 + lane * (ch + .5); ctx.strokeStyle = '#28584c'; ctx.lineWidth = 1; ctx.beginPath();
      for (let x = 0; x < w; x++) {
        const a = Math.floor((this.offset + x / w * this.visibleDuration) / this.source.duration * min.length), b = Math.min(min.length, Math.max(a + 1, Math.ceil((this.offset + (x + 1) / w * this.visibleDuration) / this.source.duration * min.length)));
        let lo = 0, hi = 0; for (let i = a; i < b; i++) { lo = Math.min(lo, min[i]); hi = Math.max(hi, max[i]); }
        ctx.moveTo(x + .5, mid - hi * lane * .43); ctx.lineTo(x + .5, mid - lo * lane * .43);
      }
      ctx.stroke(); ctx.fillStyle = '#28584c'; ctx.font = '12px Consolas'; ctx.fillText(this.peaks.length === 1 ? t('wave.mono') : ch ? 'R' : 'L', 8, mid - lane * .3);
    });
    ctx.fillStyle = '#63665b'; ctx.font = '12px Consolas';
    for (let i = 0; i < 6; i++) ctx.fillText(`${(this.offset + i / 6 * this.visibleDuration).toFixed(2)} s`, 5 + i / 6 * w, 16);
    this.drawSelection(ctx, w, h); this.drawSpectrogram?.();
  }
  async play() {
    if (this.node) { this.stop(); return; }
    if (!document.querySelector('#selection-error').hidden) throw new Error(t('error.selectionPlay'));
    this.context ||= new AudioContext(); await this.context.resume();
    if (!this.playbackBuffer) {
      this.playbackBuffer = this.context.createBuffer(this.source.channels.length, this.source.channels[0].length, this.source.sampleRate);
      this.source.channels.forEach((channel, index) => this.playbackBuffer.copyToChannel(channel, index));
    }
    const node = this.node = this.context.createBufferSource(); node.buffer = this.playbackBuffer; node.connect(this.context.destination);
    node.onended = () => { if (this.node === node) this.stop(); };
    node.start(0, this.start, this.end - this.start); document.querySelector('#source-play').textContent = t('wave.sourceStop');
  }
  stop() { if (this.node) { this.node.onended = null; this.node.stop(); this.node.disconnect(); this.node = null; } const b = document.querySelector('#source-play'); if (b) b.textContent = t('wave.sourcePlay'); }
}
