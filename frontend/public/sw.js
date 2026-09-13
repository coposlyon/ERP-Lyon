// Service worker mínimo: network-first com fallback offline.
// Sempre tenta a rede primeiro (evita servir bundle desatualizado);
// só usa o cache quando está sem conexão.
// v2: não intercepta mais imagens externas (Supabase) nem /api — o navegador
// cuida delas direto. Interceptar tudo fazia fotos quebradas ficarem "presas"
// até um Ctrl+Shift+R, porque respostas de erro também iam para o cache.
// v3: um JS que sumiu depois do deploy voltava como index.html com status
// 200, e o cache guardava esse HTML no lugar do JS. A página ficava branca.
// Subir a versão apaga esses caches envenenados.
const CACHE = 'lyon-erp-v3';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Imagens do Storage e qualquer recurso de outro domínio: direto no navegador.
  if (url.origin !== self.location.origin) return;
  // API nunca passa pelo cache do service worker.
  if (url.pathname.startsWith('/api/')) return;

  event.respondWith(
    fetch(request)
      .then(response => {
        // só cacheia resposta boa — erro cacheado vira página/asset quebrado.
        // HTML só é resposta boa para navegação: pedido de script ou CSS que
        // volta HTML é o fallback do SPA, não o arquivo.
        const html = (response.headers.get('content-type') || '').includes('text/html');
        if (response.ok && (request.mode === 'navigate' || !html)) {
          const copy = response.clone();
          caches.open(CACHE).then(c => c.put(request, copy)).catch(() => {});
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        // offline navegando para uma rota do SPA → devolve o shell
        if (request.mode === 'navigate') {
          const shell = await caches.match('/index.html');
          if (shell) return shell;
        }
        return Response.error();
      })
  );
});
