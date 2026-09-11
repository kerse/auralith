import { MAX_SPEED, MIN_SPEED, curvePreset, sanitizeCurve, shapeCurvePoint } from '../audio/speed-curve.js';

const clone = value => structuredClone(value);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export class SpeedCurveEditor {
  constructor(canvas, onChange = () => {}) {
    this.canvas = canvas; this.onChange = onChange; this.points = curvePreset('linear'); this.selected = 0; this.playhead = 0; this.history = []; this.future = [];
    this.resize = new ResizeObserver(() => this.draw()); this.resize.observe(canvas);
    canvas.addEventListener('pointerdown', event => this.pointerDown(event));
    canvas.addEventListener('pointermove', event => this.pointerMove(event));
    for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(event, () => this.pointerUp());
    canvas.addEventListener('keydown', event => {
      if ((event.key === 'Delete' || event.key === 'Backspace') && this.deleteSelected()) event.preventDefault();
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? this.redo() : this.undo(); }
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
        const point = this.points[this.selected]; if (!point) return; this.save();
        const dx = (event.shiftKey ? .05 : .01) * (event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0), ds = (event.shiftKey ? .2 : .05) * (event.key === 'ArrowDown' ? -1 : event.key === 'ArrowUp' ? 1 : 0);
        const previous = this.points[this.selected - 1], next = this.points[this.selected + 1], oldX = point.x, oldSpeed = point.speed;
        point.x = this.selected === 0 ? 0 : this.selected === this.points.length - 1 ? 1 : clamp(point.x + dx, previous.x + .0001, next.x - .0001); point.speed = clamp(point.speed + ds, MIN_SPEED, MAX_SPEED);
        for (const side of ['left', 'right']) if (point[side]) { point[side].x += point.x - oldX; point[side].speed += point.speed - oldSpeed; }
        this.changed(); event.preventDefault();
      }
    });
    this.draw();
  }

  get value() { return clone(this.points); }
  setPlayhead(fraction) { this.playhead = clamp(fraction, 0, 1); this.draw(); }
  save() { this.history.push(clone(this.points)); if (this.history.length > 100) this.history.shift(); this.future.length = 0; }
  changed() { this.points = sanitizeCurve(this.points); this.draw(); this.onChange(this.value); }
  setPreset(name) { this.save(); this.points = curvePreset(name); this.selected = 0; this.changed(); }
  reset() { this.setPreset('linear'); }
  undo() { if (!this.history.length) return false; this.future.push(clone(this.points)); this.points = this.history.pop(); this.selected = Math.min(this.selected, this.points.length - 1); this.changed(); return true; }
  redo() { if (!this.future.length) return false; this.history.push(clone(this.points)); this.points = this.future.pop(); this.selected = Math.min(this.selected, this.points.length - 1); this.changed(); return true; }
  deleteSelected() {
    if (this.selected <= 0 || this.selected >= this.points.length - 1) return false;
    this.save(); this.points.splice(this.selected, 1); this.selected = Math.min(this.selected, this.points.length - 1); this.changed(); return true;
  }
  shapeSelected(mode) { this.save(); this.points = shapeCurvePoint(this.points, this.selected, mode); this.changed(); }

  geometry() {
    return { left: 54, right: 18, top: 18, bottom: 32, width: Math.max(1, this.canvas.clientWidth - 72), height: 250 };
  }
  toPixel(point) {
    const g = this.geometry();
    const level = Math.log(clamp(point.speed, MIN_SPEED, MAX_SPEED) / MIN_SPEED) / Math.log(MAX_SPEED / MIN_SPEED);
    return { x: g.left + point.x * g.width, y: g.top + (1 - level) * g.height };
  }
  fromPixel(event) {
    const rect = this.canvas.getBoundingClientRect(), g = this.geometry();
    return {
      x: clamp((event.clientX - rect.left - g.left) / g.width, 0, 1),
      speed: clamp(MIN_SPEED * (MAX_SPEED / MIN_SPEED) ** (1 - (event.clientY - rect.top - g.top) / g.height), MIN_SPEED, MAX_SPEED)
    };
  }
  hit(event) {
    const rect = this.canvas.getBoundingClientRect(), x = event.clientX - rect.left, y = event.clientY - rect.top, selected = this.points[this.selected];
    const candidates = [];
    if (selected?.left) candidates.push({ type: 'left', index: this.selected, point: selected.left });
    if (selected?.right) candidates.push({ type: 'right', index: this.selected, point: selected.right });
    this.points.forEach((point, index) => candidates.push({ type: 'point', index, point }));
    return candidates.find(candidate => { const pixel = this.toPixel(candidate.point); return Math.hypot(pixel.x - x, pixel.y - y) <= (candidate.type === 'point' ? 11 : 9); });
  }
  pointerDown(event) {
    if (event.button !== 0) return;
    const hit = this.hit(event), value = this.fromPixel(event); this.save();
    if (hit) { this.selected = hit.index; this.drag = hit; }
    else {
      const point = { x: clamp(value.x, .00001, .99999), speed: value.speed };
      this.points.push(point); this.points.sort((a, b) => a.x - b.x); this.selected = this.points.indexOf(point); this.points = sanitizeCurve(this.points); this.drag = { type: 'point', index: this.selected };
      this.changed();
    }
    this.canvas.setPointerCapture(event.pointerId); this.draw(); event.preventDefault();
  }
  pointerMove(event) {
    if (!this.drag) return;
    const value = this.fromPixel(event), point = this.points[this.drag.index];
    if (this.drag.type === 'point') {
      const previous = this.points[this.drag.index - 1], next = this.points[this.drag.index + 1], oldX = point.x, oldSpeed = point.speed;
      point.x = this.drag.index === 0 ? 0 : this.drag.index === this.points.length - 1 ? 1 : clamp(value.x, previous.x + .0001, next.x - .0001);
      point.speed = value.speed;
      const dx = point.x - oldX, ds = point.speed - oldSpeed;
      if (point.left) { point.left.x += dx; point.left.speed += ds; }
      if (point.right) { point.right.x += dx; point.right.speed += ds; }
    } else {
      const previous = this.points[this.drag.index - 1], next = this.points[this.drag.index + 1];
      point[this.drag.type] = {
        x: this.drag.type === 'left' ? clamp(value.x, previous?.x ?? point.x, point.x) : clamp(value.x, point.x, next?.x ?? point.x),
        speed: value.speed
      };
    }
    this.changed(); event.preventDefault();
  }
  pointerUp() { this.drag = null; }

  draw() {
    const canvas = this.canvas, width = canvas.clientWidth || 800, g = this.geometry(), height = g.top + g.height + g.bottom, dpr = devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr); canvas.style.height = `${height}px`;
    const context = canvas.getContext('2d'); context.scale(dpr, dpr); context.fillStyle = '#ebeede'; context.fillRect(0, 0, width, height);
    context.font = '11px Consolas'; context.textBaseline = 'middle';
    for (const speed of [.1, .5, 1, 2, 3, 4]) {
      const y = this.toPixel({ x: 0, speed }).y; context.strokeStyle = speed === 1 ? '#aa462688' : '#292e2b18'; context.lineWidth = speed === 1 ? 1.5 : 1;
      context.beginPath(); context.moveTo(g.left, y); context.lineTo(g.left + g.width, y); context.stroke(); context.fillStyle = speed === 1 ? '#aa4626' : '#63665b'; context.fillText(`${speed}×`, 8, y);
    }
    for (let index = 0; index <= 4; index++) {
      const x = g.left + index / 4 * g.width; context.strokeStyle = '#292e2b12'; context.beginPath(); context.moveTo(x, g.top); context.lineTo(x, g.top + g.height); context.stroke();
      context.fillStyle = '#63665b'; context.textAlign = index === 0 ? 'left' : index === 4 ? 'right' : 'center'; context.fillText(`${index * 25}%`, x, height - 14);
    }
    context.textAlign = 'left'; context.strokeStyle = '#28584c'; context.lineWidth = 3; context.beginPath();
    const first = this.toPixel(this.points[0]); context.moveTo(first.x, first.y);
    for (let index = 0; index < this.points.length - 1; index++) {
      const a = this.points[index], b = this.points[index + 1], c1 = this.toPixel(a.right), c2 = this.toPixel(b.left), end = this.toPixel(b);
      context.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, end.x, end.y);
    }
    context.stroke();
    const selected = this.points[this.selected];
    if (selected) for (const side of ['left', 'right']) if (selected[side]) {
      const a = this.toPixel(selected), b = this.toPixel(selected[side]); context.strokeStyle = '#63665b'; context.lineWidth = 1; context.beginPath(); context.moveTo(a.x, a.y); context.lineTo(b.x, b.y); context.stroke();
      context.fillStyle = '#fffdf6'; context.strokeStyle = '#aa4626'; context.beginPath(); context.arc(b.x, b.y, 6, 0, Math.PI * 2); context.fill(); context.stroke();
    }
    this.points.forEach((point, index) => { const pixel = this.toPixel(point); context.fillStyle = index === this.selected ? '#aa4626' : '#fffdf6'; context.strokeStyle = '#28584c'; context.lineWidth = 2; context.beginPath(); context.arc(pixel.x, pixel.y, index === this.selected ? 7 : 6, 0, Math.PI * 2); context.fill(); context.stroke(); });
    const playheadX = g.left + this.playhead * g.width; context.strokeStyle = '#172dc4'; context.lineWidth = 2; context.beginPath(); context.moveTo(playheadX, g.top); context.lineTo(playheadX, g.top + g.height); context.stroke();
  }
}
