import { parameters } from '../audio/parameters.js';
import { t, translateError } from './i18n.js';
export class ProcessingControls {
  constructor(onChange = () => {}) {
    this.onChange = onChange; this.ratio = 10; this.pitch = 0; this.reverse = false;
    document.querySelector('#processing-controls').innerHTML = `<fieldset id="process-fields" class="control-fields" disabled><div class="parameter-grid"><label><span id="duration-label"></span><input id="target-duration" type="number" min="0" max="3600" step="any" value="10"></label><label><span id="stretch-label"></span><input id="stretch" type="number" min="1" step="any" value="10"></label><label><span id="pitch-label"></span><input id="pitch-shift" type="number" min="-24" max="24" step=".01" value="0"></label><label id="reverse-label" class="toggle"><input id="reverse-source" type="checkbox"><span id="reverse-label-text"></span></label></div></fieldset><p id="parameter-error" class="error" role="alert" hidden></p><p id="parameter-note" class="hint"></p>`;
    this.fields = document.querySelector('#process-fields');
    this.durationInput = document.querySelector('#target-duration'); this.ratioInput = document.querySelector('#stretch'); this.pitchInput = document.querySelector('#pitch-shift');
    for (const input of [this.durationInput, this.ratioInput, this.pitchInput]) input.setAttribute('aria-describedby', 'parameter-error parameter-note');
    this.refreshLanguage = () => { document.querySelector('#duration-label').textContent = t('processing.duration'); document.querySelector('#stretch-label').textContent = t('processing.stretch'); document.querySelector('#pitch-label').textContent = t('processing.pitch'); document.querySelector('#reverse-label-text').textContent = t('processing.reverse'); this.updateNote(); if (this.invalid) document.querySelector('#parameter-error').textContent = translateError(this.errorMessage); };
    document.addEventListener('languagechange', this.refreshLanguage);
    this.refreshLanguage();
    this.durationInput.oninput = () => this.edit('duration'); this.ratioInput.oninput = () => this.edit('ratio'); this.pitchInput.oninput = () => this.edit('pitch');
    document.querySelector('#reverse-source').onchange = e => { this.reverse = e.target.checked; document.querySelector('#reverse-label').classList.toggle('active', this.reverse); this.notify(); };
  }
  setSelection(selection) {
    this.selection = selection; this.fields.disabled = Boolean(this.locked);
    const length = selection.end - selection.start;
    if (length > 3600) {
      this.duration = length; this.ratio = 1;
      this.durationInput.value = length; this.ratioInput.value = 1;
      this.fields.disabled = true;
      this.showError(t('processing.error.longSelection'));
      this.onChange(); return;
    }
    this.duration = Math.min(3600, length * this.ratio); this.ratio = this.duration / length;
    this.durationInput.min = length; this.ratioInput.max = 3600 / length;
    this.durationInput.value = this.duration; this.ratioInput.value = this.ratio;
    this.pitchInput.value = this.pitch; this.showError(''); this.notify();
  }
  edit(kind) {
    if (!this.selection) return;
    const length = this.selection.end - this.selection.start;
    const input = kind === 'duration' ? this.durationInput : kind === 'ratio' ? this.ratioInput : this.pitchInput;
    const value = input.value === '' ? NaN : Number(input.value);
    const duration = kind === 'duration' ? value : kind === 'ratio' ? value * length : (this.durationInput.value === '' ? NaN : Number(this.durationInput.value));
    const pitch = this.pitchInput.value === '' ? NaN : Number(this.pitchInput.value);
    try {
      const snapshot = parameters(this.selection, duration, pitch, this.reverse);
      this.duration = snapshot.duration; this.ratio = snapshot.stretch; this.pitch = snapshot.pitch;
      if (kind !== 'duration') this.durationInput.value = this.duration;
      if (kind !== 'ratio') this.ratioInput.value = this.ratio;
      this.showError(''); this.notify();
    } catch (error) { this.showError(translateError(error.message)); this.onChange(); }
  }
  showError(message) { const el = document.querySelector('#parameter-error'); this.errorMessage = message; el.textContent = message; el.hidden = !message; this.invalid = Boolean(message); }
  updateNote() { document.querySelector('#parameter-note').textContent = this.selection ? `${this.duration >= 600 ? t('processing.note.long') : ''}${this.reverse ? t('processing.note.reverse') : ''}${t('processing.note.base')}` : t('processing.note.initial'); }
  notify() {
    this.updateNote();
    this.onChange();
  }
  getParameters() {
    if (!this.selection || this.invalid || !document.querySelector('#selection-error').hidden) throw new Error(t('processing.error.fix'));
    // Validate every visible value too, including another field left temporarily invalid.
    const pitch = Number(this.pitchInput.value), duration = Number(this.durationInput.value), ratio = Number(this.ratioInput.value);
    const p = parameters(this.selection, duration, pitch, this.reverse);
    if (!this.pitchInput.value || !this.durationInput.value || !this.ratioInput.value || !Number.isFinite(ratio) || Math.abs(p.stretch - ratio) > 1e-7 * Math.max(1, ratio)) throw new Error(t('processing.error.agreement'));
    return p;
  }
}
