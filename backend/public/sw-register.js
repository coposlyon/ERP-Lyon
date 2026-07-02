// Registro do service worker em arquivo externo — a CSP bloqueia scripts inline.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
