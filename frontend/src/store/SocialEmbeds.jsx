import { useRef, useEffect } from 'react';

// Injeta um trecho de HTML de widget (Instagram) e executa os <script> embutidos
// — o innerHTML não roda scripts sozinho, então recriamos as tags. O conteúdo é
// colado por admin em Configurações → Site (não é entrada de usuário final).
export function RawEmbed({ html, className }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.innerHTML = html || '';
    el.querySelectorAll('script').forEach(old => {
      const s = document.createElement('script');
      for (const a of old.attributes) s.setAttribute(a.name, a.value);
      s.text = old.textContent || '';
      old.replaceWith(s);
    });
  }, [html]);
  return <div ref={ref} className={className} />;
}

// Plugin oficial da Página do Facebook (iframe, sem token). Mostra as últimas
// publicações e atualiza sozinho — só precisa da URL da Página.
export function FacebookPage({ url, height = 640 }) {
  if (!url || !/^https?:\/\/(www\.|m\.|web\.)?facebook\.com\//i.test(String(url).trim())) return null;
  const src = 'https://www.facebook.com/plugins/page.php?' + new URLSearchParams({
    href: String(url).trim(), tabs: 'timeline', width: '500', height: String(height),
    small_header: 'false', adapt_container_width: 'true',
    hide_cover: 'false', show_facepile: 'true',
  }).toString();
  return (
    <div className="flex justify-center">
      <iframe title="Facebook" src={src}
        className="w-full max-w-[500px] rounded-2xl border border-gray-100 bg-white"
        style={{ height, border: 'none', overflow: 'hidden' }}
        scrolling="no" frameBorder="0" allowFullScreen
        allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share" />
    </div>
  );
}
