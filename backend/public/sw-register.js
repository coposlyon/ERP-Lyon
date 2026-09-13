// Registro do service worker em arquivo externo — a CSP bloqueia scripts inline.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

// Tela branca depois de deploy: o JS principal é de uma versão que não
// existe mais e nem chega a rodar — então o ErrorBoundary do React também
// não roda. Se o #root continua vazio uns segundos depois do load, limpa o
// cache e o service worker e recarrega. Uma vez só por minuto, para não
// entrar em loop se o problema for outro.
(function () {
  var CHAVE = 'lyon-tela-branca';
  function recuperar() {
    var ultima = 0;
    try { ultima = Number(sessionStorage.getItem(CHAVE) || 0); } catch (e) {}
    if (Date.now() - ultima < 60000) return;
    try { sessionStorage.setItem(CHAVE, String(Date.now())); } catch (e) {}
    var tarefas = [];
    if (window.caches) {
      tarefas.push(caches.keys().then(function (ks) {
        return Promise.all(ks.map(function (k) { return caches.delete(k); }));
      }));
    }
    if ('serviceWorker' in navigator) {
      tarefas.push(navigator.serviceWorker.getRegistrations().then(function (rs) {
        return Promise.all(rs.map(function (r) { return r.unregister(); }));
      }));
    }
    Promise.all(tarefas).catch(function () {}).then(function () { location.reload(); });
  }
  // Chunk de uma tela que falhou ao carregar (o Vite avisa por este evento).
  window.addEventListener('vite:preloadError', function (ev) {
    if (ev && ev.preventDefault) ev.preventDefault();
    recuperar();
  });
  window.addEventListener('load', function () {
    setTimeout(function () {
      var root = document.getElementById('root');
      if (root && !root.hasChildNodes()) recuperar();
    }, 6000);
  });
})();
