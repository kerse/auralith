import { setStatus, setStatusKey } from './status.js';
import { t, translateError } from './i18n.js';
import { analyseFrame, joinChunks, MAX_RECORDING_BYTES } from '../audio/capture.js';

const MAX_SAMPLES = Math.floor(MAX_RECORDING_BYTES / Float32Array.BYTES_PER_ELEMENT);

export class MicrophoneRecorder {
  constructor({ onRecorded, onCaptureState }) {
    this.onRecorded = onRecorded;
    this.onCaptureState = onCaptureState;
    this.sequence = 0;
    this.canvas = document.querySelector('#recorder-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.timeData = new Float32Array(2048);
    this.frequencyData = new Uint8Array(1024);
    this.history = [];
    this.resizeObserver = new ResizeObserver(() => this.draw());
    this.resizeObserver.observe(this.canvas);
    document.querySelector('#record-audio').addEventListener('click', () => this.start());
    document.querySelector('#record-stop').addEventListener('click', () => this.stop(true));
    document.querySelector('#record-cancel').addEventListener('click', () => this.cancel());
    document.addEventListener('languagechange', () => this.refreshLanguage());
    this.refreshLanguage();
  }

  refreshLanguage() {
    document.querySelector('#record-audio').textContent = t('record.start');
    document.querySelector('#record-stop').textContent = t('record.stop');
    document.querySelector('#record-cancel').textContent = t('record.cancel');
    document.querySelector('#recorder-title').textContent = t('record.title');
    document.querySelector('#recorder-level-label').textContent = t('record.level');
    this.canvas.setAttribute('aria-label', t('record.visualizationAria'));
    if (!this.recording) this.updateReadout({ rmsDb: -96, peakDb: -96, speaking: false, clipping: false });
  }

  async start() {
    if (this.recording) return;
    const button = document.querySelector('#record-audio'), file = document.querySelector('#audio-file'), error = document.querySelector('#load-error');
    button.disabled = true; file.disabled = true; error.hidden = true; this.history.length = 0;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error(t('error.microphoneUnsupported'));
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      this.context = new AudioContext(); await this.context.resume();
      this.source = this.context.createMediaStreamSource(this.stream);
      this.analyser = this.context.createAnalyser(); this.analyser.fftSize = 2048; this.analyser.smoothingTimeConstant = .72;
      this.processor = this.context.createScriptProcessor(4096, 1, 1);
      this.silence = this.context.createGain(); this.silence.gain.value = 0;
      this.chunks = []; this.sampleCount = 0; this.startedAt = performance.now(); this.lastClipAt = -Infinity; this.lastState = null; this.reachedLimit = false;
      this.processor.onaudioprocess = event => {
        if (!this.recording) return;
        const chunk = new Float32Array(event.inputBuffer.getChannelData(0));
        if (this.sampleCount + chunk.length > MAX_SAMPLES) { this.reachedLimit = true; void this.stop(true); return; }
        this.chunks.push(chunk); this.sampleCount += chunk.length;
      };
      this.source.connect(this.analyser); this.source.connect(this.processor); this.processor.connect(this.silence); this.silence.connect(this.context.destination);
      this.recording = true; this.onCaptureState(true);
      document.querySelector('#recorder-panel').hidden = false;
      document.querySelector('#record-stop').disabled = false; document.querySelector('#record-cancel').disabled = false;
      setStatusKey('status.recording'); this.animate(); document.querySelector('#record-stop').focus();
    } catch (exception) {
      await this.release();
      const message = this.friendlyError(exception);
      error.textContent = message; error.hidden = false; setStatus(message, true);
      button.disabled = false; file.disabled = false;
    }
  }

  friendlyError(error) {
    if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') return t('error.microphonePermission');
    if (error?.name === 'NotFoundError' || error?.name === 'DevicesNotFoundError') return t('error.microphoneMissing');
    if (error?.name === 'NotReadableError' || error?.name === 'TrackStartError') return t('error.microphoneBusy');
    return translateError(error?.message || t('error.microphone'));
  }

  animate() {
    cancelAnimationFrame(this.frame);
    const tick = () => {
      if (!this.recording) return;
      this.analyser.getFloatTimeDomainData(this.timeData); this.analyser.getByteFrequencyData(this.frequencyData);
      const metrics = analyseFrame(this.timeData);
      if (metrics.clipping) this.lastClipAt = performance.now();
      metrics.clipping = performance.now() - this.lastClipAt < 900;
      this.history.push(metrics.rms); if (this.history.length > 360) this.history.shift();
      this.updateReadout(metrics); this.draw(metrics);
      this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }

  updateReadout(metrics) {
    const elapsed = this.recording ? (performance.now() - this.startedAt) / 1000 : 0;
    const minutes = Math.floor(elapsed / 60), seconds = Math.floor(elapsed % 60), tenths = Math.floor(elapsed * 10) % 10;
    document.querySelector('#record-time').textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${tenths}`;
    document.querySelector('#record-db').textContent = `${metrics.rmsDb.toFixed(1)} dBFS`;
    const state = document.querySelector('#record-state'), nextState = metrics.clipping ? 'clipping' : metrics.speaking ? 'voice' : 'silence';
    if (nextState !== this.lastState) { state.textContent = t(`record.${nextState}`); state.dataset.state = nextState; this.lastState = nextState; }
    const meter = document.querySelector('#record-level'); meter.value = Math.max(0, Math.min(1, (metrics.peakDb + 60) / 60));
  }

  draw(metrics = { peak: 0 }) {
    if (document.querySelector('#recorder-panel').hidden) return;
    const canvas = this.canvas, width = canvas.clientWidth, height = 190, ratio = devicePixelRatio || 1;
    if (canvas.width !== Math.round(width * ratio) || canvas.height !== height * ratio) { canvas.width = Math.round(width * ratio); canvas.height = height * ratio; canvas.style.height = `${height}px`; }
    const context = this.ctx; context.setTransform(ratio, 0, 0, ratio, 0, 0); context.clearRect(0, 0, width, height);
    context.fillStyle = '#ebeede'; context.fillRect(0, 0, width, height);
    context.strokeStyle = '#292e2b12'; context.lineWidth = 1;
    for (let y = 19.5; y < height; y += 19) { context.beginPath(); context.moveTo(0, y); context.lineTo(width, y); context.stroke(); }
    for (let x = 39.5; x < width; x += 40) { context.beginPath(); context.moveTo(x, 0); context.lineTo(x, height); context.stroke(); }
    const middle = height / 2, bins = Math.min(96, this.frequencyData.length);
    context.beginPath(); context.moveTo(0, middle);
    for (let i = 0; i < bins; i++) { const x = i / (bins - 1) * width, magnitude = this.frequencyData[i] / 255; context.lineTo(x, middle - magnitude * 72); }
    for (let i = bins - 1; i >= 0; i--) { const x = i / (bins - 1) * width, magnitude = this.frequencyData[i] / 255; context.lineTo(x, middle + magnitude * 72); }
    context.closePath(); const aura = context.createLinearGradient(0, 0, width, 0); aura.addColorStop(0, '#28584c18'); aura.addColorStop(.45, '#28584c72'); aura.addColorStop(1, '#b9914438'); context.fillStyle = aura; context.fill();
    context.strokeStyle = '#172dc4'; context.lineWidth = 1.5; context.beginPath();
    for (let x = 0; x < width; x++) { const index = Math.min(this.timeData.length - 1, Math.floor(x / width * this.timeData.length)), y = middle + this.timeData[index] * 76; x ? context.lineTo(x, y) : context.moveTo(x, y); }
    context.stroke();
    context.strokeStyle = '#aa462688'; context.setLineDash([5, 5]);
    for (const y of [18, height - 18]) { context.beginPath(); context.moveTo(0, y); context.lineTo(width, y); context.stroke(); }
    context.setLineDash([]);
    const historyWidth = Math.min(width, this.history.length * 2), origin = width - historyWidth;
    context.strokeStyle = '#28584c'; context.lineWidth = 2; context.beginPath();
    this.history.slice(-Math.floor(width / 2)).forEach((value, index) => { const x = origin + index * 2, y = height - 8 - Math.min(1, value * 9) * 24; index ? context.lineTo(x, y) : context.moveTo(x, y); }); context.stroke();
    if (metrics.clipping) { context.strokeStyle = '#aa4626'; context.lineWidth = 3; context.strokeRect(1.5, 1.5, width - 3, height - 3); }
  }

  async stop(keep) {
    if (!this.recording) return;
    this.recording = false; cancelAnimationFrame(this.frame);
    const chunks = this.chunks, length = this.sampleCount, sampleRate = this.context.sampleRate;
    await this.release();
    document.querySelector('#record-stop').disabled = true; document.querySelector('#record-cancel').disabled = true;
    if (!keep || !length) {
      this.finishCapture();
      if (!length && keep) this.showError(t('error.recordingEmpty'));
      else setStatusKey('status.recordingCancelled');
      return;
    }
    try {
      const channel = joinChunks(chunks, length), duration = length / sampleRate;
      const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }).replace(':', '-');
      const recorded = { name: `${t('record.name')} ${timestamp}.wav`, channels: [channel], sampleRate, duration };
      await this.onRecorded(recorded); this.sequence += 1;
      document.querySelector('#source-empty').hidden = true; setStatusKey(this.reachedLimit ? 'status.recordingLimitSaved' : 'status.recorded');
    } catch (error) { this.showError(this.friendlyError(error)); }
    finally { this.finishCapture(); }
  }

  cancel() { return this.stop(false); }
  async fail(message) { if (!this.recording) return; this.recording = false; cancelAnimationFrame(this.frame); await this.release(); this.showError(message); this.finishCapture(); }
  showError(message) { const error = document.querySelector('#load-error'); error.textContent = message; error.hidden = false; setStatus(message, true); }
  finishCapture() {
    document.querySelector('#recorder-panel').hidden = true;
    document.querySelector('#record-audio').disabled = false; document.querySelector('#audio-file').disabled = false;
    this.onCaptureState(false); this.updateReadout({ rmsDb: -96, peakDb: -96, speaking: false, clipping: false });
    document.querySelector('#record-audio').focus();
  }
  async release() {
    if (this.processor) this.processor.onaudioprocess = null;
    for (const node of [this.source, this.analyser, this.processor, this.silence]) { try { node?.disconnect(); } catch {} }
    this.stream?.getTracks().forEach(track => track.stop());
    if (this.context && this.context.state !== 'closed') await this.context.close();
    this.stream = this.context = this.source = this.analyser = this.processor = this.silence = null;
  }
}
