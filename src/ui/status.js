export function setStatus(message, error = false) {
  const status = document.querySelector('#status');
  status.textContent = message;
  status.classList.toggle('error', error);
}
