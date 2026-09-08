import { selectAudio } from '../audio/engine.js';
import { wavHeader } from '../audio/wav.js';
import { setStatus, setStatusKey } from './status.js';
import { t, translateError } from './i18n.js';
export const BLOB_LIMIT = 128 * 1024 * 1024;
export const exportName = name => `${name.replace(/\.[^.]+$/, '').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').slice(0, 120) || 'sound'}_auralith.wav`;

export class ExportControls {
  constructor(results) {
    this.results = results;
    document.querySelector('#export-slot').innerHTML = '<button id="export-wav" class="secondary" disabled></button>';
    results.exportButton = document.querySelector('#export-wav'); results.exportButton.onclick = () => this.run(); results.refresh();
    const refreshLanguage = () => { results.exportButton.textContent = t('result.export'); };
    document.addEventListener('languagechange', refreshLanguage); refreshLanguage();
  }
  async run() {
    const r = this.results; if (r.busy || r.loading) return;
    let writer, worker, rejectJob, cancelled = false, completed = false, downloadUrl;
    const abortError = () => new DOMException('Экспорт отменён', 'AbortError');
    try {
      const options = r.getParameters(), source = r.getSource();
      if (!source) throw new Error(t('error.noSource'));
      const frames = Math.max(1, Math.round(options.duration * source.sampleRate));
      const header = wavHeader(frames, source.channels.length, source.sampleRate), size = 44 + frames * source.channels.length * 2;
      const name = exportName(source.name);
      if (!window.showSaveFilePicker && size > BLOB_LIMIT) throw new Error(t('error.exportLimit'));
      r.stop(); r.stopSource(); r.lock(true);
      r.cancelOverride = () => { cancelled = true; worker?.terminate(); rejectJob?.(abortError()); };
      document.querySelector('#progress').value = 0; document.querySelector('#progress-label').textContent = t('export.choose');
      const parts = [];
      if (window.showSaveFilePicker) {
        const handle = await window.showSaveFilePicker({ suggestedName: name, types: [{ description: 'WAV audio', accept: { 'audio/wav': ['.wav'] } }] });
        if (cancelled) throw abortError();
        writer = await handle.createWritable();
      } else writer = { write: async bytes => { parts.push(bytes); }, close: async () => {}, abort: async () => { parts.length = 0; } };
      if (cancelled) throw abortError();
      await writer.write(header); setStatusKey('export.processing');
      const channels = selectAudio(source.channels, source.sampleRate, options.start, options.end, options.reverse);
      let bytesWritten = 44;
      await new Promise((resolve, reject) => {
        rejectJob = reject;
        worker = new Worker(new URL('../audio/export-worker.js', import.meta.url), { type: 'module' });
        worker.onerror = () => reject(new Error(t('error.workerExport')));
        worker.onmessage = async ({ data }) => {
          if (cancelled) return;
          try {
            if (data.type === 'error') reject(new Error(data.message));
            else if (data.type === 'done') resolve();
            else if (data.type === 'chunk') {
              await writer.write(data.bytes); bytesWritten += data.bytes.byteLength;
              if (!cancelled) worker.postMessage({ type: 'ack' });
            } else { document.querySelector('#progress').value = data.progress; document.querySelector('#progress-label').textContent = `${data.phase} · ${Math.round(data.progress * 100)}%`; }
          } catch (error) { reject(error); }
        };
        worker.postMessage({ channels, sampleRate: source.sampleRate, options }, channels.map(c => c.buffer));
      });
      if (cancelled) throw abortError();
      if (bytesWritten !== size) throw new Error(t('error.exportSize'));
      document.querySelector('#progress-label').textContent = t('export.saving'); document.querySelector('#progress').value = 1;
      r.cancelButton.disabled = true;
      await writer.close(); completed = true;
      if (parts.length) {
        downloadUrl = URL.createObjectURL(new Blob(parts, { type: 'audio/wav' }));
        const link = document.createElement('a'); link.href = downloadUrl; link.download = name; document.body.append(link); link.click(); link.remove();
        const url = downloadUrl; setTimeout(() => URL.revokeObjectURL(url), 60000);
        setStatusKey('export.download', { name, size: (size / 1048576).toFixed(1) });
      } else setStatusKey('export.saved', { name, size: (size / 1048576).toFixed(1) });
    } catch (error) {
      error.name === 'AbortError' ? setStatusKey('status.exportCancelled') : setStatus(t('error.export', { message: translateError(error.message) }), true);
    } finally {
      worker?.terminate(); rejectJob = null;
      if (writer && !completed) { try { await writer.abort(); } catch {} }
      r.cancelOverride = null; r.cancelButton.disabled = false; r.lock(false);
    }
  }
}
