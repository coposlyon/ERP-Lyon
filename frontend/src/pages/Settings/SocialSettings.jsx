import { useState, useEffect } from 'react';
import { Instagram, Facebook, Eye, ChevronDown, ExternalLink } from 'lucide-react';
import { RawEmbed, FacebookPage } from '@/store/SocialEmbeds';

// Configuração das redes sociais da loja (Facebook Page Plugin + widget de
// Instagram), com tutorial passo a passo e pré-visualização ao vivo antes de salvar.
export default function SocialSettings({ site, setSite, isAdmin }) {
  const fbUrl = site?.facebook_page_url || '';
  const igHtml = site?.instagram_embed || '';
  const [openTut, setOpenTut] = useState(null); // 'fb' | 'ig' | null

  // pré-visualização com debounce — não recarrega o iframe/script a cada tecla
  const [pv, setPv] = useState({ fb: fbUrl, ig: igHtml });
  useEffect(() => {
    const t = setTimeout(() => setPv({ fb: fbUrl, ig: igHtml }), 600);
    return () => clearTimeout(t);
  }, [fbUrl, igHtml]);

  const hasPreview = !!(pv.fb || pv.ig);

  return (
    <div className="border-t border-gray-100 pt-5">
      <h3 className="font-medium text-gray-900">Redes sociais na loja</h3>
      <p className="text-sm text-gray-500 mt-1">
        Mostra o Facebook e o Instagram da empresa na página inicial da loja. <b>Não precisa de token</b> —
        deixe em branco para não exibir. Preencha e veja a prévia ao lado antes de salvar.
      </p>

      <div className="grid lg:grid-cols-2 gap-6 mt-4">
        {/* ── Coluna de campos + tutoriais ── */}
        <div className="space-y-5">

          {/* FACEBOOK */}
          <div className="rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center"><Facebook size={16} /></span>
              <span className="font-semibold text-gray-800 text-sm">Facebook — Página</span>
            </div>
            <input className="input" value={fbUrl} disabled={!isAdmin}
              onChange={e => setSite('facebook_page_url', e.target.value)}
              placeholder="https://www.facebook.com/suapagina" />

            <button type="button" onClick={() => setOpenTut(o => o === 'fb' ? null : 'fb')}
              className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary-600 hover:text-primary-700">
              <ChevronDown size={14} className={`transition-transform ${openTut === 'fb' ? 'rotate-180' : ''}`} />
              Como pegar o endereço da Página
            </button>
            {openTut === 'fb' && (
              <ol className="mt-2 space-y-1.5 text-xs text-gray-600 list-decimal pl-5">
                <li>Abra a <b>Página</b> da empresa no Facebook (a <i>fanpage</i>, não o seu perfil pessoal).</li>
                <li>Copie o endereço que aparece na barra do navegador — algo como <code className="bg-gray-100 px-1 rounded">https://www.facebook.com/lyoncopos</code>.</li>
                <li>Cole no campo acima. A loja passa a mostrar as últimas publicações da Página (atualiza sozinho, sem token).</li>
                <li className="text-gray-400">A Página precisa ser <b>pública</b>. Perfis pessoais não funcionam no plugin.</li>
              </ol>
            )}
          </div>

          {/* INSTAGRAM */}
          <div className="rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-7 h-7 rounded-lg bg-pink-50 text-pink-600 flex items-center justify-center"><Instagram size={16} /></span>
              <span className="font-semibold text-gray-800 text-sm">Instagram — código do widget</span>
            </div>
            <textarea className="input min-h-[96px] resize-y font-mono text-xs" value={igHtml} disabled={!isAdmin}
              onChange={e => setSite('instagram_embed', e.target.value)}
              placeholder={'<script src="https://snapwidget.com/..."></script>\nou\n<iframe src="https://snapwidget.com/embed/..."></iframe>'} />

            <button type="button" onClick={() => setOpenTut(o => o === 'ig' ? null : 'ig')}
              className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary-600 hover:text-primary-700">
              <ChevronDown size={14} className={`transition-transform ${openTut === 'ig' ? 'rotate-180' : ''}`} />
              Como gerar o código (grátis, passo a passo)
            </button>
            {openTut === 'ig' && (
              <div className="mt-2 text-xs text-gray-600 space-y-2">
                <ol className="space-y-1.5 list-decimal pl-5">
                  <li>Acesse <a href="https://snapwidget.com" target="_blank" rel="noopener noreferrer" className="text-primary-600 underline inline-flex items-center gap-0.5">snapwidget.com <ExternalLink size={11} /></a> e clique em <b>“Get Started”</b> (é grátis).</li>
                  <li>Crie uma conta grátis (ou entre com o Google).</li>
                  <li>Clique em <b>“Create a Widget”</b> → escolha a origem <b>Instagram</b> e conecte/entre com o Instagram da empresa.</li>
                  <li>Em <b>Layout</b>, escolha <b>“Grid”</b> (grade). Ajuste colunas, nº de fotos e espaçamento como preferir.</li>
                  <li>Deixe marcado <b>“Responsive”</b> (para caber em qualquer tela).</li>
                  <li>Clique em <b>“Get Widget”</b> e <b>copie todo o código</b> que aparecer (começa com <code className="bg-gray-100 px-1 rounded">&lt;script</code> ou <code className="bg-gray-100 px-1 rounded">&lt;iframe</code>).</li>
                  <li>Cole no campo acima e confira na <b>pré-visualização</b>. Depois clique em <b>Salvar</b>.</li>
                </ol>
                <p className="text-gray-400">
                  Dica: o plano grátis do SnapWidget tem uma marca d’água pequena e atualiza a cada ~30 min.
                  Serve também <a href="https://lightwidget.com" target="_blank" rel="noopener noreferrer" className="text-primary-600 underline">lightwidget.com</a> — o processo é parecido.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ── Coluna da pré-visualização ── */}
        <div>
          <div className="flex items-center gap-1.5 text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
            <Eye size={14} /> Pré-visualização
          </div>
          <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-4 min-h-[220px]">
            {!hasPreview ? (
              <div className="h-full min-h-[190px] flex flex-col items-center justify-center text-center text-sm text-gray-400 gap-1">
                <Eye size={22} className="text-gray-300" />
                Preencha o Facebook ou o Instagram ao lado<br />para ver aqui como vai aparecer no site.
              </div>
            ) : (
              <div className="space-y-6">
                {pv.ig && (
                  <div>
                    <p className="text-[11px] font-bold text-pink-600 uppercase tracking-wide mb-2 flex items-center gap-1"><Instagram size={12} /> Instagram</p>
                    <RawEmbed html={pv.ig} />
                  </div>
                )}
                {pv.fb && (
                  <div>
                    <p className="text-[11px] font-bold text-blue-600 uppercase tracking-wide mb-2 flex items-center gap-1"><Facebook size={12} /> Facebook</p>
                    {/^https?:\/\/(www\.|m\.|web\.)?facebook\.com\//i.test(pv.fb.trim())
                      ? <FacebookPage url={pv.fb} height={480} />
                      : <p className="text-xs text-amber-600">O endereço não parece uma Página do Facebook. Use algo como <code className="bg-amber-50 px-1 rounded">https://www.facebook.com/suapagina</code>.</p>}
                  </div>
                )}
              </div>
            )}
          </div>
          <p className="text-[11px] text-gray-400 mt-2">A prévia é a mesma coisa que aparece no site. Ela atualiza sozinha alguns segundos depois de você digitar.</p>
        </div>
      </div>
    </div>
  );
}
