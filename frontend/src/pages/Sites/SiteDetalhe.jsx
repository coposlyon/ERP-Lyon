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
  Monitor, Tablet, Smartphone, Lock, Info, ArrowUpRight,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import SiteEditor from '@/pages/Settings/SiteEditor';
import { acharSite, CORES, urlDoSite, copiarTexto } from './sites';
import { PreviewAparelho, APARELHOS } from './Preview';

const CatalogoAdmin = lazy(() => import('@/pages/Settings/CatalogoAdmin'));

const ICONE_APARELHO = { desktop: Monitor, tablet: Tablet, mobile: Smartphone };

// ── O rascunho da configuração da empresa ───────────────────
// PUT /settings troca o objeto `settings` inteiro pelo que for enviado.
// Por isso o rascunho parte do que veio do banco e devolve tudo de
// volta: mexer só no ramo do site apagaria e-mail, frete e PIX.
function useConfigEmpresa() {
  const qc = useQueryClient();
  const [form, setForm] = useState(null);
  const [sujo, setSujo] = useState(false);

  const { data, isLoading } = useQuery({
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
  const doSite = (k, v) => {
    setForm(p => ({ ...p, settings: { ...p.settings, site: { ...(p.settings?.site || {}), [k]: v } } }));
    setSujo(true);
  };

  return { form, isLoading, salvar, campo, opcao, doSite, sujo };
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
      <SiteEditor site={cfg.form?.settings?.site} setSite={cfg.doSite} isAdmin={isAdmin} />
      <BarraSalvar cfg={cfg} isAdmin={isAdmin} aoSalvar={aoSalvar} />
    </div>
  );
}

// ── Editor dos autocadastros ────────────────────────────────
// São três endereços (cliente, fornecedor, transportadora) e uma
// configuração só: o que o site faz depois que a pessoa termina.
function EditorCadastro({ cfg, isAdmin, aoSalvar }) {
  const s = cfg.form?.settings || {};
  return (
    <div className="space-y-5">
      <AvisoAdmin isAdmin={isAdmin} />
      <p className="text-sm text-gray-500">
        Vale para os <b>três</b> links de autocadastro (cliente, fornecedor e transportadora).
      </p>

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
        <label className="label">Mensagem exibida no card</label>
        <input className="input" value={s.cadastro_message || ''}
          onChange={e => cfg.opcao('cadastro_message', e.target.value)}
          placeholder="Você concluiu o cadastro! Volte para o WhatsApp." disabled={!isAdmin} />
        <p className="text-xs text-gray-400 mt-1">O título do card é sempre “VOCÊ CONCLUIU O CADASTRO”.</p>
      </div>

      <div>
        <label className="label">WhatsApp do botão “Voltar ao WhatsApp”</label>
        <input className="input" value={s.cadastro_whatsapp || ''}
          onChange={e => cfg.opcao('cadastro_whatsapp', e.target.value)}
          placeholder="(44) 99999-9999" disabled={!isAdmin} />
      </div>

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
      {usaConfig && cfg.isLoading && (
        <div className="flex items-center justify-center h-40">
          <Loader2 size={22} className="animate-spin text-primary-600" />
        </div>
      )}
      {usaConfig && !cfg.isLoading && cfg.form && (
        <>
          {editorLoja     && <EditorLoja     cfg={cfg} isAdmin={isAdmin} aoSalvar={recarregar} />}
          {editorCadastro && <EditorCadastro cfg={cfg} isAdmin={isAdmin} aoSalvar={recarregar} />}
          {editorEmpresa  && <EditorEmpresa  cfg={cfg} isAdmin={isAdmin} aoSalvar={recarregar} />}
        </>
      )}
      {editorCatalogo && (
        <Suspense fallback={<div className="flex items-center justify-center h-40"><Loader2 size={22} className="animate-spin text-primary-600" /></div>}>
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
      {/* Cabeçalho */}
      <div className="page-header">
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
        <p className="text-sm text-gray-500 mt-3">{site.descricao}</p>
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
