import { t, translateError } from './i18n.js';

let current = null;
const legacyKeys = {
  'Готово к работе': 'status.ready', 'Декодирование аудио…': 'status.decoding', 'Источник загружен': 'status.loaded',
  'Подготовка preview…': 'status.previewPreparing', 'Preview готов': 'status.previewReady', 'Обработка отменена': 'status.cancelled', 'Экспорт отменён': 'status.exportCancelled'
};

function render(message, error) {
  const status = document.querySelector('#status');
  status.textContent = message;
  status.classList.toggle('error', error);
}

export function setStatus(message, error = false) { current = { message, error }; render(message, error); }
export function setStatusKey(key, values = {}, error = false) { current = { key, values, error }; render(t(key, values), error); }

document.addEventListener('languagechange', () => {
  if (!current) return;
  const key = current.key || legacyKeys[current.message];
  render(key ? t(key, current.values) : translateError(current.message), current.error);
});
