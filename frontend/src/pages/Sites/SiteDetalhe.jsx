// ============================================================
// SITES → um site.
//
// Duas abas e nada mais: VER e EDITAR.
//
//   Ver    — o site rodando, no tamanho de computador, tablet ou
//            celular. Dá para clicar dentro e navegar, porque conferir
//            um site parado na home não confere quase nada.
//   Editar — o editor DE VERDADE daquele site, aberto aqui dentro, com
//            a prévia ao lado. Salvou, a prévia recarrega: a distância
//            entre mudar e ver o resultado virou zero.
//
// POR QUE NÃO SE ESCREVEU UM EDITOR NOVO. A loja já tinha o dela em
// Configurações → Site e o catálogo o dele no Administrativo. Um
// terceiro editor seria uma segunda verdade para discordar da primeira
// no mês que vem. Aqui os editores existentes são REUSADOS — mesma
// tela, mesmo salvamento, agora com prévia do lado.
// ============================================================
import { lazy, Suspense, useEffect, useState } from 'react';
import { useParams, Link, Navigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, ExternalLink, Link2, Check, RefreshCw, Eye, PenLine, Save, Loader2,
  Monitor, Tablet, Smartphone, Lock, Info, ArrowUpRight, RotateCcw,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import {
  CADASTRO_PADRAO, CAMPOS_CADASTRO, TIPOS_CADASTRO, TIPO_POR_SITE, DONE_PADRAO,
} from '@/pages/Public/cadastroTextos';
import { acharSite, CORES, urlDoSite, copiarTexto } from './registro';
import { PreviewAparelho, APARELHOS } from './Preview';

// Os dois editores pesados entram sob demanda: quem abriu só para VER
// como o site está não baixa o editor da loja nem o do catálogo.
const SiteEditor    = lazy(() => import('@/pages/Settings/SiteEditor'));
const CatalogoAdmin = lazy(() => import('@/pages/Settings/CatalogoAdmin'));

/** Espera dos editores sob demanda. */
function Abrindo() {
  return (
    <div className="flex items-center justify-center h-40">
      <Loader2 size={22} className="animate-spin text-primary-600" />
    </div>
  );
}

const ICONE_APARELHO = { desktop: Monitor, tablet: Tablet, mobile: Smartphone };

// ── O rascunho da configuração da empresa ───────────────────
// PUT /settings troca o objeto `settings` inteiro pelo que for enviado.
// Por isso o rascunho parte do que veio do banco e devolve tudo de
// volta: mexer só no ramo do site apagaria e-mail, frete e PIX.
function useConfigEmpresa() {
  const qc = useQueryClient();
  const [form, setForm] = useState(null);
  const [sujo, setSujo] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get('/settings'),
  });

  useEffect(() => {
    if (!data) return;
    setForm({
      name: data.name || '', app_name: data.app_name || '', cnpj: data.cnpj || '',
      phone: data.phone || '', email: data.email || '', logo_url: data.logo_url || '',
      address: data.address || {}, settings: data.settings || {},
    });
    setSujo(false);
  }, [data]);

  const salvar = useMutation({
    mutationFn: () => api.put('/settings', form),
    onSuccess: () => { toast.success('Salvo — a prévia já está atualizada'); qc.invalidateQueries(['settings']); setSujo(false); },
    onError: e => toast.error(e.error || 'Erro ao salvar'),
  });

  const campo = (k, v) => { setForm(p => ({ ...p, [k]: v })); setSujo(true); };
  const opcao = (k, v) => { setForm(p => ({ ...p, settings: { ...p.settings, [k]: v } })); setSujo(true); };
  // Um texto de um tipo de cadastro: settings.cadastro_textos[tipo][k].
  const doCadastro = (tipo, k, v) => {
    setForm(p => ({
      ...p,
      settings: {
        ...p.settings,
        cadastro_textos: {
          ...(p.settings?.cadastro_textos || {}),
          [tipo]: { ...(p.settings?.cadastro_textos?.[tipo] || {}), [k]: v },
        },
      },
    }));
    setSujo(true);
  };

  const doSite = (k, v) => {
    setForm(p => ({ ...p, settings: { ...p.settings, site: { ...(p.settings?.site || {}), [k]: v } } }));
    setSujo(true);
  };

  return { form, isLoading, isError, refetch, salvar, campo, opcao, doSite, doCadastro, sujo };
}

/** A barra fixa de salvar — a mesma em todos os editores desta tela. */
function BarraSalvar({ cfg, isAdmin, aoSalvar }) {
  if (!isAdmin) return null;
  return (
    <div className="flex items-center justify-end gap-3 sticky bottom-0 bg-white/85 backdrop-blur py-2 -mx-6 px-6 border-t border-gray-100">
      {cfg.sujo && <span className="text-xs text-amber-600">Alterações não salvas</span>}
      <button onClick={() => cfg.salvar.mutate(undefined, { onSuccess: aoSalvar })}
        disabled={cfg.salvar.isPending} className="btn-primary">
        {cfg.salvar.isPending ? <><Loader2 size={15} className="animate-spin" /> Salvando...</> : <><Save size={15} /> Salvar</>}
      </button>
    </div>
  );
}

function AvisoAdmin({ isAdmin }) {
  if (isAdmin) return null;
  return (
    <p className="text-sm text-amber-700 bg-amber-50 rounded-lg px-4 py-2">
      Apenas administradores podem editar os sites. Você pode ver como está, mas não salvar.
    </p>
  );
}

// ── Editor da loja: o de Configurações → Site, aqui dentro ──
function EditorLoja({ cfg, isAdmin, aoSalvar }) {
  return (
    <div className="space-y-4">
      <AvisoAdmin isAdmin={isAdmin} />
      <Suspense fallback={<Abrindo />}>
        <SiteEditor site={cfg.form?.settings?.site} setSite={cfg.doSite} isAdmin={isAdmin} />
      </Suspense>
      <BarraSalvar cfg={cfg} isAdmin={isAdmin} aoSalvar={aoSalvar} />
    </div>
  );
}

// ── Editor dos autocadastros ────────────────────────
// TRÊS LINKS, TRÊS VOZES, UMA JORNADA. Cliente, fornecedor e
// transportadora percorrem as mesmas quatro telas — abertura, vídeo,
// formulário, conclusão — dizendo coisas diferentes. Por isso o editor
// tem uma aba por tipo e uma aba de Conclusão, que é comum aos três: a
// saída é a mesma porta.
//
// O CAMPO JÁ VEM PREENCHIDO COM O QUE O SITE DIZ HOJE. Campo em branco
// com o texto de fábrica em cinza atrás parecia campo vazio: quem abria
// não sabia se o site estava sem título ou se aquilo era sugestão. Aqui
// se edita o que existe, não se adivinha o que existe.
//
// Apagar tudo continua sendo seguro: a tela pública ignora texto em
// branco e volta ao de fábrica, então ninguém publica um título vazio
// sem querer. E "voltar ao original" traz a frase de fábrica de volta
// para dentro do campo.

/** Um campo do editor — texto, texto longo ou chave liga/desliga. */
function CampoTexto({ campo, tipo, cfg, isAdmin }) {
  const salvos = cfg.form?.settings?.cadastro_textos?.[tipo] || {};
  const padrao = (CADASTRO_PADRAO[tipo] || {})[campo.k];
  const valor = salvos[campo.k];

  if (campo.tipo === 'liga') {
    const ligado = valor === undefined ? padrao !== false : valor !== false;
    return (
      <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${ligado ? 'border-primary-300 bg-primary-50' : 'border-gray-200 hover:border-gray-300'}`}>
        <input type="checkbox" className="mt-0.5 rounded" checked={ligado} disabled={!isAdmin}
          onChange={e => cfg.doCadastro(tipo, campo.k, e.target.checked)} />
        <span>
          <span className="block text-sm font-semibold text-gray-800">{campo.label}</span>
          {campo.dica && <span className="block text-xs text-gray-500 mt-0.5">{campo.dica}</span>}
        </span>
      </label>
    );
  }

  // O que o site mostra HOJE: o texto salvo, ou o de fábrica quando
  // ninguém mexeu. É isso que aparece dentro do campo, escrito.
  const efetivo = valor === undefined ? (padrao ?? '') : valor;
  const diferenteDoOriginal = efetivo !== (padrao ?? '');

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <label className="label mb-0">{campo.label}</label>
        {diferenteDoOriginal && isAdmin && (
          <button type="button" onClick={() => cfg.doCadastro(tipo, campo.k, padrao ?? '')}
            className="text-[11px] text-gray-400 hover:text-primary-600 flex items-center gap-1">
            <RotateCcw size={11} /> voltar ao original
          </button>
        )}
      </div>
      {campo.linhas > 1 ? (
        <textarea className="input mt-1" rows={campo.linhas} value={efetivo} placeholder={padrao}
          onChange={e => cfg.doCadastro(tipo, campo.k, e.target.value)} disabled={!isAdmin} />
      ) : (
        <input className="input mt-1" value={efetivo} placeholder={padrao}
          onChange={e => cfg.doCadastro(tipo, campo.k, e.target.value)} disabled={!isAdmin} />
      )}
      {campo.dica && <p className="text-xs text-gray-400 mt-1">{campo.dica}</p>}
    </div>
  );
}

function EditorCadastro({ cfg, isAdmin, aoSalvar, tipoInicial = 'cliente', siteAtual }) {
  const [aba, setAba] = useState(tipoInicial);
  const s = cfg.form?.settings || {};
  const tipo = aba === 'fim' ? null : aba;
  const oTipo = TIPOS_CADASTRO.find(t => t.key === tipo);
  const siteDoTipo = Object.keys(TIPO_POR_SITE).find(k => TIPO_POR_SITE[k] === tipo);

  return (
    <div className="space-y-5">
      <AvisoAdmin isAdmin={isAdmin} />

      <div className="flex flex-wrap gap-2">
        {[...TIPOS_CADASTRO.map(t => [t.key, t.label]), ['fim', 'Conclusão']].map(([k, label]) => (
          <button key={k} type="button" onClick={() => setAba(k)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all ${aba === k ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* A prévia ao lado é a DESTE site. Editar outro tipo aqui é
          legítimo, mas quem edita precisa saber que não está vendo o
          resultado ao lado. */}
      {oTipo && siteAtual && TIPO_POR_SITE[siteAtual] !== tipo && (
        <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 flex flex-wrap items-center gap-1.5">
          <Info size={13} className="shrink-0" />
          Você está editando o cadastro de {oTipo.label.toLowerCase()} — a prévia ao lado continua mostrando este site.
          <Link to={`/sites/${siteDoTipo}`} className="text-primary-600 hover:underline inline-flex items-center gap-0.5">
            abrir o dele <ArrowUpRight size={11} />
          </Link>
        </p>
      )}

      {tipo && CAMPOS_CADASTRO.map(grupo => {
        const campos = grupo.campos.filter(c => !c.so || c.so === tipo);
        if (!campos.length) return null;
        return (
          <div key={grupo.grupo} className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-gray-800">{grupo.grupo}</h3>
              {grupo.ajuda && <p className="text-xs text-gray-500 mt-0.5">{grupo.ajuda}</p>}
            </div>
            {campos.map(c => <CampoTexto key={c.k} campo={c} tipo={tipo} cfg={cfg} isAdmin={isAdmin} />)}
          </div>
        );
      })}

      {aba === 'fim' && (
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-800">Depois que a pessoa termina</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Vale para os <b>três</b> cadastros — a saída é a mesma porta.
            </p>
          </div>

          <label className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-colors ${s.cadastro_maintenance ? 'border-primary-300 bg-primary-50' : 'border-gray-200 hover:border-gray-300'}`}>
            <input type="checkbox" className="mt-1 rounded" checked={!!s.cadastro_maintenance}
              onChange={e => cfg.opcao('cadastro_maintenance', e.target.checked)} disabled={!isAdmin} />
            <span>
              <span className="block text-sm font-semibold text-gray-800">Modo manutenção do site</span>
              <span className="block text-xs text-gray-500 mt-0.5">
                Ligado, o site mostra só um card pedindo para voltar ao WhatsApp depois do cadastro —
                não entra na loja nem abre outras telas.
              </span>
            </span>
          </label>

          <div>
            <label className="label">Título do card final</label>
            <input className="input" value={s.cadastro_done_titulo ?? DONE_PADRAO.titulo} placeholder={DONE_PADRAO.titulo}
              onChange={e => cfg.opcao('cadastro_done_titulo', e.target.value)} disabled={!isAdmin} />
          </div>

          <div>
            <label className="label">Mensagem exibida no card</label>
            <input className="input" value={s.cadastro_message ?? DONE_PADRAO.mensagem} placeholder={DONE_PADRAO.mensagem}
              onChange={e => cfg.opcao('cadastro_message', e.target.value)} disabled={!isAdmin} />
          </div>

          <div>
            <label className="label">WhatsApp do botão “Voltar ao WhatsApp”</label>
            <input className="input" value={s.cadastro_whatsapp ?? (cfg.form?.phone || '')}
              onChange={e => cfg.opcao('cadastro_whatsapp', e.target.value)}
              placeholder="(44) 99999-9999" disabled={!isAdmin} />
            <p className="text-xs text-gray-400 mt-1">
              Em branco, usa o telefone da empresa — que é o número já preenchido aqui.
            </p>
          </div>
        </div>
      )}

      <BarraSalvar cfg={cfg} isAdmin={isAdmin} aoSalvar={aoSalvar} />
    </div>
  );
}

// ── Editor do acompanhamento ────────────────────────────────
// A página é feita dos pedidos do cliente; o que dá para mexer é a
// identidade que aparece nela.
function EditorEmpresa({ cfg, isAdmin, aoSalvar }) {
  const f = cfg.form || {};
  return (
    <div className="space-y-5">
      <AvisoAdmin isAdmin={isAdmin} />
      <p className="text-sm text-gray-500">
        O conteúdo desta página vem dos <b>pedidos</b> — não há texto para escrever. O que se edita
        aqui é a identidade da empresa que o cliente vê no topo (a mesma de Configurações → Empresa).
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <label className="label">Nome da empresa</label>
          <input className="input" value={f.name || ''} onChange={e => cfg.campo('name', e.target.value)} disabled={!isAdmin} />
        </div>
        <div className="sm:col-span-2">
          <label className="label">Logo (URL)</label>
          <input className="input" value={f.logo_url || ''} onChange={e => cfg.campo('logo_url', e.target.value)} placeholder="https://..." disabled={!isAdmin} />
        </div>
        <div>
          <label className="label">Telefone</label>
          <input className="input" value={f.phone || ''} onChange={e => cfg.campo('phone', e.target.value)} disabled={!isAdmin} />
        </div>
        <div>
          <label className="label">E-mail</label>
          <input className="input" value={f.email || ''} onChange={e => cfg.campo('email', e.target.value)} disabled={!isAdmin} />
        </div>
      </div>
      <BarraSalvar cfg={cfg} isAdmin={isAdmin} aoSalvar={aoSalvar} />
    </div>
  );
}

export default function SiteDetalhe() {
  const { key } = useParams();
  const site = acharSite(key);
  const { isAdmin } = useAuth();
  const [aba, setAba] = useState('ver');
  const [aparelho, setAparelho] = useState('desktop');
  const [versao, setVersao] = useState(0);
  const [copiado, setCopiado] = useState(false);
  const cfg = useConfigEmpresa();

  if (!site) return <Navigate to="/sites" replace />;

  const cor = CORES[site.cor] || CORES.slate;
  const url = urlDoSite(site);
  const recarregar = () => setVersao(v => v + 1);

  async function copiar() {
    if (await copiarTexto(url)) {
      setCopiado(true);
      toast.success('Link copiado');
      setTimeout(() => setCopiado(false), 2000);
    } else toast.error('Não consegui copiar — selecione o endereço e copie à mão');
  }

  const editorLoja     = site.editor === 'loja';
  const editorCatalogo = site.editor === 'catalogo';
  const editorCadastro = site.editor === 'cadastro';
  const editorEmpresa  = site.editor === 'empresa';
  const usaConfig      = editorLoja || editorCadastro || editorEmpresa;
  const comLado        = usaConfig;   // o catálogo é largo demais para dividir a tela

  const painelEditor = (
    <>
      {usaConfig && cfg.isLoading && <Abrindo />}
      {/* Sem isto, uma falha ao buscar as configurações deixava o painel
          simplesmente VAZIO — o usuário ficava olhando para o nada sem
          saber se era carregamento, permissão ou defeito. */}
      {usaConfig && !cfg.isLoading && !cfg.form && (
        <div className="flex flex-col items-start gap-3 text-sm text-gray-600 bg-amber-50 rounded-xl p-4">
          <p>Não consegui carregar as configurações do site{cfg.isError ? ' — o servidor não respondeu' : ''}.</p>
          <button onClick={() => cfg.refetch()} className="btn-secondary btn-sm">
            <RefreshCw size={14} /> Tentar de novo
          </button>
        </div>
      )}
      {usaConfig && !cfg.isLoading && cfg.form && (
        <>
          {editorLoja     && <EditorLoja     cfg={cfg} isAdmin={isAdmin} aoSalvar={recarregar} />}
          {editorCadastro && <EditorCadastro cfg={cfg} isAdmin={isAdmin} aoSalvar={recarregar}
            tipoInicial={TIPO_POR_SITE[site.key] || 'cliente'} siteAtual={site.key} />}
          {editorEmpresa  && <EditorEmpresa  cfg={cfg} isAdmin={isAdmin} aoSalvar={recarregar} />}
        </>
      )}
      {editorCatalogo && (
        <Suspense fallback={<Abrindo />}>
          <CatalogoAdmin />
        </Suspense>
      )}
      {!site.editor && (
        <div className="flex items-start gap-3 text-sm text-gray-600 bg-gray-50 rounded-xl p-4">
          <Info size={18} className="text-gray-400 shrink-0 mt-0.5" />
          <p>
            Esta tela não tem conteúdo editável: ela mostra o que o sistema já sabe (as marcações
            de ponto do colaborador). Quem manda no comportamento dela é o cadastro de
            colaboradores e as regras de RH.
          </p>
        </div>
      )}
    </>
  );

  const painelPrevia = (
    <div className="card">
      <div className="card-header flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-1">
          {APARELHOS.map(a => {
            const Icone = ICONE_APARELHO[a.key];
            return (
              <button key={a.key} onClick={() => setAparelho(a.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${aparelho === a.key ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
                <Icone size={14} /> {a.label}
              </button>
            );
          })}
        </div>
        <button onClick={recarregar} className="btn-ghost btn-sm text-gray-500" title="Recarregar a prévia">
          <RefreshCw size={14} /> Recarregar
        </button>
      </div>
      <div className="card-body bg-gray-50">
        <PreviewAparelho caminho={site.caminho} aparelho={aparelho} versao={versao} />
        <p className="text-center text-xs text-gray-400 mt-3">
          O site de verdade, rodando agora — dá para clicar e navegar aqui dentro.
        </p>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Cabeçalho. NÃO usa .page-header no bloco de fora: aquela classe é
          uma LINHA flex, e a descrição viraria irmã do título — foi assim
          que ela foi parar espremida na beirada direita da tela. */}
      <div className="mb-4 sm:mb-6 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-3 min-w-0">
            <Link to="/sites" className="btn-ghost btn-sm text-gray-500 mt-0.5" title="Voltar para Sites">
              <ArrowLeft size={16} />
            </Link>
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${cor.chip}`}>
              <site.icone size={18} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="page-title">{site.nome}</h1>
                {site.publico
                  ? <span className="badge badge-green">Público</span>
                  : <span className="badge badge-gray flex items-center gap-1"><Lock size={10} /> Interno</span>}
              </div>
              <button type="button" onClick={copiar}
                className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-primary-600 transition-colors mt-0.5"
                title="Copiar o endereço">
                {copiado ? <Check size={12} className="text-green-500" /> : <Link2 size={12} />}
                <span className="truncate">{url}</span>
              </button>
            </div>
          </div>
          <a href={site.caminho} target="_blank" rel="noreferrer" className="btn-secondary btn-sm">
            <ExternalLink size={14} /> Abrir o site
          </a>
        </div>
        <p className="text-sm text-gray-500 max-w-3xl">{site.descricao}</p>
      </div>

      {/* Abas */}
      <div className="flex gap-2">
        {[['ver', 'Ver o site', Eye], ['editar', site.editor ? 'Editar' : 'Sobre esta tela', PenLine]].map(([k, label, Icone]) => (
          <button key={k} onClick={() => setAba(k)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold transition-all ${aba === k ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'}`}>
            <Icone size={15} /> {label}
          </button>
        ))}
      </div>

      {aba === 'ver' && painelPrevia}

      {aba === 'editar' && (
        comLado ? (
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
            <div className="xl:col-span-7 card">
              <div className="card-header">
                <h2 className="font-semibold text-gray-900">{site.editorTitulo}</h2>
                <p className="text-xs text-gray-500 mt-0.5">{site.editorResumo}</p>
              </div>
              <div className="card-body">{painelEditor}</div>
            </div>
            <div className="xl:col-span-5 xl:sticky xl:top-4">{painelPrevia}</div>
          </div>
        ) : (
          <div className="space-y-4">
            {editorCatalogo && (
              <div className="flex items-start gap-3 text-sm text-gray-600 bg-blue-50 rounded-xl p-4">
                <Info size={18} className="text-blue-400 shrink-0 mt-0.5" />
                <p>
                  Os cinco cadastros abaixo são o que o cliente encontra no catálogo. Produto, cor e
                  acabamento continuam no cadastro de Produtos — o catálogo só oferece o que estiver
                  ativo lá. Depois de salvar, volte em <b>Ver o site</b> para conferir.
                  {' '}
                  <Link to="/products" className="text-primary-600 hover:underline inline-flex items-center gap-0.5">
                    Ir para Produtos <ArrowUpRight size={12} />
                  </Link>
                </p>
              </div>
            )}
            {site.editor ? painelEditor : <div className="card"><div className="card-body">{painelEditor}</div></div>}
          </div>
        )
      )}
    </div>
  );
}
