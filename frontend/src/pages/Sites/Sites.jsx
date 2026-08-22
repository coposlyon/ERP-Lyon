// ============================================================
// SITES — o painel de todos os endereços que a Lyon publica.
//
// A PERGUNTA QUE ESTA TELA RESPONDE. "Como está o site agora?" Antes, a
// resposta era abrir outra aba e torcer para lembrar o endereço certo;
// para editar, procurar em qual canto das Configurações aquele site foi
// parar. Aqui os sites estão todos na mesma página, cada um com a cara
// que o cliente vê neste instante e um botão que leva ao editor dele.
//
// A PRÉVIA É O SITE, NÃO UMA FOTO. Cada cartão roda o endereço de
// verdade dentro de um quadro. Não existe prévia desatualizada.
// ============================================================
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Globe, ExternalLink, Link2, Check, RefreshCw, PenLine, Lock } from 'lucide-react';
import toast from 'react-hot-toast';
import { SITES, CORES, urlDoSite, copiarTexto } from './sites';
import { MiniPreview } from './Preview';

function CartaoSite({ site, versao }) {
  const [copiado, setCopiado] = useState(false);
  const cor = CORES[site.cor] || CORES.slate;
  const url = urlDoSite(site);

  async function copiar() {
    if (await copiarTexto(url)) {
      setCopiado(true);
      toast.success('Link copiado');
      setTimeout(() => setCopiado(false), 2000);
    } else toast.error('Não consegui copiar — selecione o endereço e copie à mão');
  }

  return (
    <div className="card overflow-hidden flex flex-col">
      <Link to={`/sites/${site.key}`} className="block p-3 pb-0" title="Ver e editar">
        <MiniPreview caminho={site.caminho} versao={versao} />
      </Link>

      <div className="card-body flex-1 flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${cor.chip}`}>
            <site.icone size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-gray-900 truncate">{site.nome}</h3>
              {site.publico
                ? <span className="badge badge-green shrink-0">Público</span>
                : <span className="badge badge-gray shrink-0 flex items-center gap-1"><Lock size={10} /> Interno</span>}
            </div>
            <p className="text-xs text-gray-500 mt-0.5">{site.resumo}</p>
          </div>
        </div>

        <button type="button" onClick={copiar}
          className="flex items-center gap-2 text-xs text-gray-500 hover:text-primary-600 transition-colors text-left"
          title="Copiar o endereço">
          {copiado ? <Check size={13} className="text-green-500 shrink-0" /> : <Link2 size={13} className="shrink-0" />}
          <span className="truncate">{url}</span>
        </button>

        <div className="flex gap-2 mt-auto pt-1">
          <Link to={`/sites/${site.key}`} className="btn-primary btn-sm flex-1 justify-center">
            <PenLine size={14} /> Ver e editar
          </Link>
          <a href={site.caminho} target="_blank" rel="noreferrer" className="btn-secondary btn-sm" title="Abrir em outra aba">
            <ExternalLink size={14} />
          </a>
        </div>
      </div>
    </div>
  );
}

export default function Sites() {
  // Trocar a versão remonta os iframes — é o "atualizar" das prévias.
  const [versao, setVersao] = useState(0);
  const publicos = SITES.filter(s => s.publico);
  const internos = SITES.filter(s => !s.publico);

  return (
    <div className="space-y-5">
      <div className="page-header flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-violet-100 rounded-lg flex items-center justify-center">
            <Globe size={18} className="text-violet-600" />
          </div>
          <div>
            <h1 className="page-title">Sites</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Todos os endereços que a Lyon publica — veja como estão e edite quando quiser
            </p>
          </div>
        </div>
        <button onClick={() => setVersao(v => v + 1)} className="btn-secondary btn-sm">
          <RefreshCw size={14} /> Atualizar prévias
        </button>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-gray-700 mb-2">Sites públicos <span className="font-normal text-gray-400">— o cliente abre sem login</span></h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {publicos.map(s => <CartaoSite key={s.key} site={s} versao={versao} />)}
        </div>
      </div>

      {internos.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-700 mb-2">Telas internas <span className="font-normal text-gray-400">— endereço próprio, mas exige login</span></h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {internos.map(s => <CartaoSite key={s.key} site={s} versao={versao} />)}
          </div>
        </div>
      )}
    </div>
  );
}
