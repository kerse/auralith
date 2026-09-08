import { parameters } from '../audio/parameters.js';
export class ProcessingControls {
  constructor(onChange = () => {}) {
    this.onChange = onChange; this.ratio = 10; this.pitch = 0; this.reverse = false;
    document.querySelector('#processing-controls').innerHTML = `<fieldset id="process-fields" class="control-fields" disabled><div class="parameter-grid"><label>Длительность результата, с<input id="target-duration" type="number" min="0" max="3600" step="any" value="10"></label><label>Растяжение, ×<input id="stretch" type="number" min="1" step="any" value="10"></label><label>Pitch, semitones<input id="pitch-shift" type="number" min="-24" max="24" step=".01" value="0"></label><label id="reverse-label" class="toggle"><input id="reverse-source" type="checkbox"> Reverse источника</label></div></fieldset><p id="parameter-error" class="error" role="alert" hidden></p><p id="parameter-note" class="hint">Загрузите звук. Pitch не зависит от длительности.</p>`;
    this.fields = document.querySelector('#process-fields');
    this.durationInput = document.querySelector('#target-duration'); this.ratioInput = document.querySelector('#stretch'); this.pitchInput = document.querySelector('#pitch-shift');
    for (const input of [this.durationInput, this.ratioInput, this.pitchInput]) input.setAttribute('aria-describedby', 'parameter-error parameter-note');
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
      this.showError('Выделение длиннее 1 часа. Сократите его до 3600 секунд или меньше на графике либо в полях начала и конца.');
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
    } catch (error) { this.showError(error.message); this.onChange(); }
  }
  showError(message) { const el = document.querySelector('#parameter-error'); el.textContent = message; el.hidden = !message; this.invalid = Boolean(message); }
  notify() {
    document.querySelector('#parameter-note').textContent = `${this.duration >= 600 ? 'Длинный результат: экспорт может занять несколько минут. ' : ''}${this.reverse ? 'Reverse включён: источник разворачивается перед растяжением. ' : ''}Лимит — 1 час. Pitch независим от времени.`;
    this.onChange();
  }
  getParameters() {
    if (!this.selection || this.invalid || !document.querySelector('#selection-error').hidden) throw new Error('Исправьте параметры и время выделения.');
    // Validate every visible value too, including another field left temporarily invalid.
    const pitch = Number(this.pitchInput.value), duration = Number(this.durationInput.value), ratio = Number(this.ratioInput.value);
    const p = parameters(this.selection, duration, pitch, this.reverse);
    if (!this.pitchInput.value || !this.durationInput.value || !this.ratioInput.value || !Number.isFinite(ratio) || Math.abs(p.stretch - ratio) > 1e-7 * Math.max(1, ratio)) throw new Error('Длительность и stretch должны быть согласованы.');
    return p;
  }
}
