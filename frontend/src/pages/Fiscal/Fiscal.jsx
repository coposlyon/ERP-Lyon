import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Receipt, FileText, Settings2, RefreshCw, XCircle, Plus,
  AlertCircle, CheckCircle2, Loader2, FlaskConical, Rocket,
  Download, ShoppingCart, Eye, ThumbsUp, HelpCircle, Ban, Search,
} from 'lucide-react';
import api from '@/lib/api';
import Modal from '@/components/UI/Modal';
import toast from 'react-hot-toast';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useAuth } from '@/contexts/AuthContext';

const fmt = v => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
const fmtDate = d => { try { return format(parseISO(d), 'dd/MM/yy HH:mm', { locale: ptBR }); } catch { return d || '—'; } };

const STATUS = {
  processando_autorizacao: { l: 'Processando',  cls: 'bg-blue-100   text-blue-700'  },
  autorizado:              { l: 'Autorizada',   cls: 'bg-green-100  text-green-700' },
  cancelado:               { l: 'Cancelada',    cls: 'bg-gray-100   text-gray-500'  },
  erro_autorizacao:        { l: 'Erro',         cls: 'bg-red-100    text-red-700'   },
  denegado:                { l: 'Denegada',     cls: 'bg-red-100    text-red-700'   },
};

// ══ Aba: Notas emitidas ═══════════════════════════════════
function TabNotas() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [emitModal, setEmitModal] = useState(false);
  const [cancelNota, setCancelNota] = useState(null);
  const [justificativa, setJustificativa] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['invoices', page],
    queryFn: () => api.get(`/fiscal/invoices?page=${page}&limit=20`),
  });

  const { data: pendingSales = [] } = useQuery({
    queryKey: ['fiscal-pending-sales'],
    queryFn: () => api.get('/fiscal/sales-pending'),
    enabled: emitModal,
  });

  const emitMut = useMutation({
    mutationFn: saleId => api.post(`/fiscal/emit/${saleId}`),
    onSuccess: () => {
      toast.success('NF-e enviada para autorização!');
      setEmitModal(false);
      qc.invalidateQueries(['invoices']);
    },
    onError: e => toast.error(e.error || 'Erro ao emitir NF-e', { duration: 6000 }),
  });

  const refreshMut = useMutation({
    mutationFn: id => api.post(`/fiscal/invoices/${id}/refresh`),
    onSuccess: nota => {
      qc.invalidateQueries(['invoices']);
      const st = STATUS[nota.status]?.l || nota.status;
      toast.success(`Status: ${st}${nota.motivo ? ` — ${nota.motivo}` : ''}`, { duration: 5000 });
    },
    onError: e => toast.error(e.error || 'Erro ao consultar'),
  });

  const cancelMut = useMutation({
    mutationFn: ({ id, justificativa }) => api.post(`/fiscal/invoices/${id}/cancel`, { justificativa }),
    onSuccess: () => {
      toast.success('NF-e cancelada');
      setCancelNota(null);
      setJustificativa('');
      qc.invalidateQueries(['invoices']);
    },
    onError: e => toast.error(e.error || 'Erro ao cancelar', { duration: 6000 }),
  });

  const rows = data?.data || [];
  const total = data?.total || 0;
  const pages = Math.max(1, Math.ceil(total / 20));

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => setEmitModal(true)} className="btn-primary btn-sm">
          <Plus size={14}/> Emitir NF-e
        </button>
      </div>

      {/* O QUE ENTROU, EM DINHEIRO. A lista dizia quantas notas
          existiam e nao quanto elas somavam — e a pergunta que se faz a
          um modulo fiscal e a segunda. So nota AUTORIZADA conta:
          cancelada, rejeitada ou em processamento nao e faturamento. */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="card p-4">
          <p className="text-xs text-gray-500">Faturado (notas autorizadas)</p>
          <p className="text-xl font-bold text-green-700 mt-1">{fmt(data?.resumo?.faturado)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-gray-500">Notas autorizadas</p>
          <p className="text-xl font-bold text-gray-900 mt-1">{data?.resumo?.autorizadas ?? 0}</p>
        </div>
        <div className={`card p-4 ${data?.resumo?.pendentes > 0 ? 'border-amber-300 bg-amber-50' : ''}`}>
          <p className="text-xs text-gray-500">Em processamento / rejeitadas</p>
          <p className={`text-xl font-bold mt-1 ${data?.resumo?.pendentes > 0 ? 'text-amber-700' : 'text-gray-900'}`}>
            {data?.resumo?.pendentes ?? 0}
          </p>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase w-32">Data</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase w-24">Número</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Destinatário</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase w-28">Total</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase w-28">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase w-20">Amb.</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase w-44">Ações</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={7} className="py-10 text-center text-gray-400 text-sm">Carregando...</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={7} className="py-10 text-center text-gray-400 text-sm">Nenhuma NF-e emitida ainda</td></tr>
              ) : rows.map(n => {
                const st = STATUS[n.status] || { l: n.status, cls: 'bg-gray-100 text-gray-600' };
                return (
                  <tr key={n.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                    <td className="px-4 py-2.5 text-xs text-gray-500 font-mono">{fmtDate(n.created_at)}</td>
                    <td className="px-4 py-2.5 text-sm font-medium">{n.numero ? `${n.numero}/${n.serie || 1}` : '—'}</td>
                    <td className="px-4 py-2.5">
                      <p className="text-sm font-medium text-gray-800">{n.destinatario || n.VENDAS?.CLIENTES?.name || '—'}</p>
                      <p className="text-xs text-gray-400">Venda #{n.VENDAS?.number ?? '—'}{n.motivo && n.status !== 'autorizado' ? ` · ${String(n.motivo).slice(0, 60)}` : ''}</p>
                    </td>
                    <td className="px-4 py-2.5 text-right font-semibold text-sm">{fmt(n.total)}</td>
                    <td className="px-4 py-2.5"><span className={`badge text-xs ${st.cls}`}>{st.l}</span></td>
                    <td className="px-4 py-2.5">
                      {n.ambiente === 'producao'
                        ? <span title="Produção"><Rocket size={14} className="text-green-600"/></span>
                        : <span title="Homologação (teste)"><FlaskConical size={14} className="text-amber-500"/></span>}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => refreshMut.mutate(n.id)} title="Atualizar status"
                          className="p-1.5 text-gray-400 hover:text-blue-600 transition-colors">
                          <RefreshCw size={14} className={refreshMut.isPending ? 'animate-spin' : ''}/>
                        </button>
                        {n.danfe_url && (
                          <a href={n.danfe_url} target="_blank" rel="noreferrer" title="DANFE (PDF)"
                            className="p-1.5 text-gray-400 hover:text-indigo-600 transition-colors">
                            <FileText size={14}/>
                          </a>
                        )}
                        {n.xml_url && (
                          <a href={n.xml_url} target="_blank" rel="noreferrer" title="XML"
                            className="p-1.5 text-gray-400 hover:text-teal-600 transition-colors text-xs font-mono font-bold">
                            XML
                          </a>
                        )}
                        {n.status === 'autorizado' && (
                          <button onClick={() => setCancelNota(n)} title="Cancelar NF-e"
                            className="p-1.5 text-gray-400 hover:text-red-600 transition-colors">
                            <XCircle size={14}/>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <span className="text-xs text-gray-400">Página {page} de {pages}</span>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage(p => p-1)} className="btn-secondary btn-sm disabled:opacity-40">Anterior</button>
              <button disabled={page >= pages} onClick={() => setPage(p => p+1)} className="btn-secondary btn-sm disabled:opacity-40">Próxima</button>
            </div>
          </div>
        )}
      </div>

      {/* Modal: escolher venda para emitir */}
      <Modal isOpen={emitModal} onClose={() => setEmitModal(false)} title="Emitir NF-e — escolha a venda" size="lg">
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {pendingSales.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">
              Nenhuma venda confirmada sem nota. Faça uma venda no PDV primeiro.
            </p>
          ) : pendingSales.map(s => (
            <button key={s.id} disabled={emitMut.isPending}
              onClick={() => emitMut.mutate(s.id)}
              className="w-full flex items-center justify-between px-4 py-3 border border-gray-200 rounded-xl hover:border-indigo-300 hover:bg-indigo-50/40 transition-colors text-left disabled:opacity-50">
              <div>
                <p className="font-semibold text-sm text-gray-800">Venda #{s.number}</p>
                <p className="text-xs text-gray-400">
                  {s.CLIENTES?.name || '⚠️ Sem cliente (NF-e exige CPF/CNPJ)'}
                  {s.CLIENTES && !s.CLIENTES.cpf_cnpj ? ' · ⚠️ cliente sem CPF/CNPJ' : ''}
                  {' · '}{fmtDate(s.created_at)}
                </p>
              </div>
              <span className="font-bold text-indigo-700">{fmt(s.total)}</span>
            </button>
          ))}
        </div>
        {emitMut.isPending && (
          <p className="text-sm text-indigo-600 flex items-center gap-2 mt-3">
            <Loader2 size={14} className="animate-spin"/> Enviando para a SEFAZ...
          </p>
        )}
      </Modal>

      {/* Modal: cancelamento */}
      <Modal isOpen={!!cancelNota} onClose={() => setCancelNota(null)}
        title={`Cancelar NF-e ${cancelNota?.numero || ''}`} size="md">
        <div className="space-y-4">
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
            O cancelamento é registrado na SEFAZ e não pode ser desfeito.
          </div>
          <div>
            <label className="label">Justificativa (mínimo 15 caracteres) *</label>
            <textarea className="input resize-none" rows={3} value={justificativa}
              onChange={e => setJustificativa(e.target.value)}
              placeholder="Ex.: Erro na quantidade de itens informada na nota" />
            <p className="text-xs text-gray-400 mt-1">{justificativa.trim().length}/15 caracteres mínimos</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setCancelNota(null)} className="btn-secondary flex-1">Voltar</button>
            <button
              onClick={() => cancelMut.mutate({ id: cancelNota.id, justificativa })}
              disabled={justificativa.trim().length < 15 || cancelMut.isPending}
              className="flex-1 py-2 rounded-xl bg-red-600 text-white font-medium hover:bg-red-700 disabled:opacity-40 transition-colors">
              {cancelMut.isPending ? 'Cancelando...' : 'Cancelar NF-e'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ══ Aba: Configuração ═════════════════════════════════════
const CFG_FIELDS = [
  { section: 'Emitente', fields: [
    ['cnpj', 'CNPJ *', 'text', '00.000.000/0001-00'],
    ['razao_social', 'Razão Social *'],
    ['nome_fantasia', 'Nome Fantasia'],
    ['inscricao_estadual', 'Inscrição Estadual'],
    ['regime_tributario', 'Regime Tributário', 'select', [['simples','Simples Nacional'],['normal','Regime Normal']]],
    ['telefone', 'Telefone'],
  ]},
  { section: 'Endereço do Emitente', fields: [
    ['logradouro', 'Logradouro *'],
    ['numero', 'Número *'],
    ['complemento', 'Complemento'],
    ['bairro', 'Bairro *'],
    ['municipio', 'Município *'],
    ['uf', 'UF *', 'text', 'PR'],
    ['cep', 'CEP *'],
    ['codigo_municipio', 'Código IBGE do Município *', 'text', 'Ex: 4115200 (Maringá)'],
  ]},
  { section: 'Padrões Fiscais', fields: [
    ['natureza_operacao', 'Natureza da Operação'],
    ['ncm_padrao', 'NCM Padrão', 'text', '39241000 = copos plásticos'],
    ['cfop_interno', 'CFOP Dentro do Estado'],
    ['cfop_interestadual', 'CFOP Fora do Estado'],
    ['csosn_padrao', 'CSOSN (Simples)'],
    ['pis_cst', 'CST PIS'],
    ['cofins_cst', 'CST COFINS'],
  ]},
];

function TabConfig() {
  const qc = useQueryClient();
  const { data: cfg } = useQuery({ queryKey: ['fiscal-config'], queryFn: () => api.get('/fiscal/config') });
  const [form, setForm] = useState({});

  useEffect(() => { if (cfg) setForm(cfg); }, [cfg]);

  const saveMut = useMutation({
    mutationFn: d => api.put('/fiscal/config', d),
    onSuccess: () => { toast.success('Configuração fiscal salva!'); qc.invalidateQueries(['fiscal-config']); },
    onError: e => toast.error(e.error || 'Erro ao salvar'),
  });

  function set(k, v) { setForm(p => ({ ...p, [k]: v })); }

  const prod = form.ambiente === 'producao';

  return (
    <form onSubmit={e => { e.preventDefault(); saveMut.mutate(form); }} className="space-y-5">

      {/* Ambiente */}
      <div className={`card p-4 border-2 ${prod ? 'border-green-300 bg-green-50/40' : 'border-amber-300 bg-amber-50/40'}`}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            {prod ? <Rocket size={20} className="text-green-600"/> : <FlaskConical size={20} className="text-amber-500"/>}
            <div>
              <p className="font-semibold text-gray-800">{prod ? 'PRODUÇÃO — notas com valor fiscal real' : 'HOMOLOGAÇÃO — ambiente de testes (sem valor fiscal)'}</p>
              <p className="text-xs text-gray-500">Use homologação até validar tudo. Produção exige plano Focus NFe contratado + certificado A1 cadastrado no painel deles.</p>
            </div>
          </div>
          <div className="flex gap-1 bg-white rounded-lg p-1 border border-gray-200">
            {[['homologacao','Homologação'],['producao','Produção']].map(([v, l]) => (
              <button key={v} type="button" onClick={() => set('ambiente', v)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  (form.ambiente || 'homologacao') === v ? 'bg-violet-600 text-white' : 'text-gray-500'
                }`}>{l}</button>
            ))}
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4 mt-4">
          <div>
            <label className="label">Token Focus NFe — Homologação</label>
            <input className="input font-mono text-sm" value={form.focus_token_homologacao || ''}
              onChange={e => set('focus_token_homologacao', e.target.value)}
              placeholder="Token do painel Focus NFe" />
          </div>
          <div>
            <label className="label">Token Focus NFe — Produção</label>
            <input className="input font-mono text-sm" value={form.focus_token_producao || ''}
              onChange={e => set('focus_token_producao', e.target.value)}
              placeholder="Preencher quando contratar o plano" />
          </div>
        </div>
      </div>

      {CFG_FIELDS.map(({ section, fields }) => (
        <div key={section} className="card p-4">
          <p className="text-sm font-semibold text-gray-700 mb-3">{section}</p>
          <div className="grid sm:grid-cols-3 gap-3">
            {fields.map(([key, label, type, extra]) => (
              <div key={key}>
                <label className="label text-xs">{label}</label>
                {type === 'select' ? (
                  <select className="input text-sm" value={form[key] || ''} onChange={e => set(key, e.target.value)}>
                    {extra.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                ) : (
                  <input className="input text-sm" value={form[key] || ''}
                    onChange={e => set(key, e.target.value)} placeholder={typeof extra === 'string' ? extra : ''} />
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      <button type="submit" disabled={saveMut.isPending} className="btn-primary">
        {saveMut.isPending ? 'Salvando...' : 'Salvar Configuração Fiscal'}
      </button>
    </form>
  );
}

// ══ Página ════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════
// COMPRAS — TODA NF-e EMITIDA CONTRA O CNPJ DA EMPRESA.
//
// Nao e uma lista de notas que alguem digitou: e o que a SEFAZ tem. Toda
// nota emitida contra o CNPJ passa por la, e a Distribuicao de DF-e
// devolve o conjunto inteiro. Se o fornecedor emitiu, aparece aqui —
// mesmo que ele nunca mande o XML, mesmo que ninguem digite nada.
//
// A MANIFESTACAO NAO E ENFEITE. A SEFAZ da 10 dias para a empresa dar
// ciencia de cada nota emitida contra ela, e o "desconhecimento" e o
// unico jeito formal de recusar nota que nao e sua — que e como se
// defende de nota fria emitida no seu CNPJ. Por isso a tela abre
// cobrando o que esta pendente.
// ═══════════════════════════════════════════════════════════

const MANIFESTOS = [
  { tipo: 'ciencia',        rotulo: 'Dar ciencia',    Icone: Eye,        cls: 'text-blue-600',    dica: 'Sei que a nota existe, ainda sem confirmar a operacao. E o minimo que a SEFAZ cobra, em 10 dias.' },
  { tipo: 'confirmacao',    rotulo: 'Confirmar',      Icone: ThumbsUp,   cls: 'text-green-600',   dica: 'A compra e nossa e a mercadoria chegou.' },
  { tipo: 'desconhecimento',rotulo: 'Desconhecer',    Icone: HelpCircle, cls: 'text-amber-600',   dica: 'Nao reconheco esta nota. E o que se usa contra nota fria emitida no nosso CNPJ.' },
  { tipo: 'nao_realizada',  rotulo: 'Nao realizada',  Icone: Ban,        cls: 'text-red-600',     dica: 'A nota e nossa, mas a operacao nao aconteceu (devolucao, recusa na entrega). Exige justificativa.' },
];

const ROTULO_MANIFESTO = {
  ciencia: 'Ciencia', confirmacao: 'Confirmada',
  desconhecimento: 'Desconhecida', nao_realizada: 'Nao realizada',
};

const CLS_MANIFESTO = {
  ciencia: 'bg-blue-50 text-blue-700', confirmacao: 'bg-green-50 text-green-700',
  desconhecimento: 'bg-amber-50 text-amber-700', nao_realizada: 'bg-red-50 text-red-700',
};

function TabCompras() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [pendentes, setPendentes] = useState(false);
  const [busca, setBusca] = useState('');
  const [buscaAtiva, setBuscaAtiva] = useState('');
  const [manifestando, setManifestando] = useState(null);   // { nota, tipo }
  const [justificativa, setJustificativa] = useState('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['nfe-recebidas', page, pendentes, buscaAtiva],
    queryFn: () => api.get(`/fiscal/recebidas?page=${page}&limit=30${pendentes ? '&pendentes=1' : ''}${buscaAtiva ? `&search=${encodeURIComponent(buscaAtiva)}` : ''}`),
    retry: false,
  });

  const sync = useMutation({
    mutationFn: () => api.post('/fiscal/recebidas/sync'),
    onSuccess: r => {
      toast.success(r.importadas
        ? `${r.importadas} nota(s) nova(s) da SEFAZ`
        : 'Nenhuma nota nova — ja estava tudo aqui.');
      qc.invalidateQueries({ queryKey: ['nfe-recebidas'] });
    },
    onError: e => toast.error(e.error || 'Nao foi possivel consultar a SEFAZ'),
  });

  const manifestar = useMutation({
    mutationFn: ({ chave, tipo, justificativa }) =>
      api.post(`/fiscal/recebidas/${chave}/manifestar`, { tipo, justificativa }),
    onSuccess: () => {
      toast.success('Manifestacao registrada na SEFAZ');
      setManifestando(null); setJustificativa('');
      qc.invalidateQueries({ queryKey: ['nfe-recebidas'] });
    },
    onError: e => toast.error(e.error || 'Erro ao manifestar'),
  });

  // O XML vem pela API PORQUE A ROTA PEDE TOKEN. Abrir a URL numa aba
  // nova mandaria o navegador buscar sem o Authorization, e o download
  // voltaria 401. Entao busca-se aqui e entrega-se como arquivo.
  async function baixarXml(nota) {
    try {
      const xml = await api.get(`/fiscal/recebidas/${nota.chave}/xml`);
      const url = URL.createObjectURL(new Blob([xml], { type: 'application/xml' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `nfe-${nota.chave}.xml`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) { toast.error(e.error || 'Nao foi possivel baixar o XML'); }
  }

  if (error) {
    return (
      <div className="card p-4 bg-amber-50 border-amber-200 flex items-start gap-3">
        <AlertCircle size={18} className="text-amber-600 mt-0.5 flex-shrink-0" />
        <div className="text-sm">
          <p className="font-medium text-amber-900">Compras nao habilitadas</p>
          <p className="text-amber-700">{error.error || 'Erro ao carregar.'}</p>
        </div>
      </div>
    );
  }

  const notas = data?.data || [];
  const resumo = data?.resumo || {};

  return (
    <div className="space-y-4">
      {data?.aviso && (
        <div className="card p-4 bg-amber-50 border-amber-200 flex items-start gap-3">
          <AlertCircle size={18} className="text-amber-600 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-amber-800">{data.aviso}</p>
        </div>
      )}

      {/* O RESUMO E DO FILTRO INTEIRO, nao da pagina: "quanto a Lyon
          comprou" nao e a soma das trinta linhas visiveis. */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="card p-4">
          <p className="text-xs text-gray-500">Total comprado</p>
          <p className="text-xl font-bold text-gray-900 mt-1">{fmt(resumo.valor_total)}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">notas canceladas fora da conta</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-gray-500">Notas no CNPJ</p>
          <p className="text-xl font-bold text-gray-900 mt-1">{data?.total ?? 0}</p>
        </div>
        <div className={`card p-4 ${resumo.pendentes_manifestacao > 0 ? 'border-amber-300 bg-amber-50' : ''}`}>
          <p className="text-xs text-gray-500">Pendentes de manifestacao</p>
          <p className={`text-xl font-bold mt-1 ${resumo.pendentes_manifestacao > 0 ? 'text-amber-700' : 'text-gray-900'}`}>
            {resumo.pendentes_manifestacao ?? 0}
          </p>
          <p className="text-[11px] text-gray-400 mt-0.5">a SEFAZ da 10 dias para a ciencia</p>
        </div>
      </div>

      <div className="card">
        <div className="card-header flex flex-wrap items-center gap-2">
          <form onSubmit={e => { e.preventDefault(); setBuscaAtiva(busca); setPage(1); }}
            className="relative flex-1 min-w-[200px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input className="input pl-9" value={busca} onChange={e => setBusca(e.target.value)}
              placeholder="Fornecedor, CNPJ ou chave da nota..." />
          </form>
          <button type="button" onClick={() => { setPendentes(p => !p); setPage(1); }}
            className={pendentes ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'}>
            Pendentes de manifestacao
          </button>
          <button type="button" className="btn-secondary btn-sm"
            onClick={() => sync.mutate()} disabled={sync.isPending}>
            {sync.isPending
              ? <><Loader2 size={14} className="animate-spin" /> Consultando SEFAZ...</>
              : <><RefreshCw size={14} /> Buscar na SEFAZ</>}
          </button>
        </div>

        {data?.sync_at && (
          <p className="px-4 pt-2 text-[11px] text-gray-400">
            Ultima consulta a SEFAZ: {fmtDate(data.sync_at)}
          </p>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr className="text-left text-[11px] uppercase text-gray-500">
                <th className="px-4 py-2.5">Emissao</th>
                <th className="px-3 py-2.5">Fornecedor</th>
                <th className="px-3 py-2.5 text-right">Valor</th>
                <th className="px-3 py-2.5">Situacao</th>
                <th className="px-3 py-2.5">Manifestacao</th>
                <th className="px-3 py-2.5 text-center">Acoes</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={6} className="text-center py-12 text-gray-400">
                  <Loader2 size={18} className="animate-spin inline" />
                </td></tr>
              ) : notas.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-12 text-sm text-gray-400">
                  <ShoppingCart size={28} className="mx-auto mb-2 opacity-30" />
                  Nenhuma nota ainda. Clique em <b>Buscar na SEFAZ</b> para trazer as compras do CNPJ.
                </td></tr>
              ) : notas.map(n => (
                <tr key={n.id} className="border-t border-gray-100">
                  <td className="px-4 py-2.5 whitespace-nowrap text-gray-600">{fmtDate(n.data_emissao)}</td>
                  <td className="px-3 py-2.5">
                    <span className="block text-gray-900">{n.nome_emitente || '\u2014'}</span>
                    <span className="block text-[11px] text-gray-400 font-mono">{n.documento_emitente || ''}</span>
                  </td>
                  <td className="px-3 py-2.5 text-right font-semibold whitespace-nowrap">{fmt(n.valor_total)}</td>
                  <td className="px-3 py-2.5">
                    <span className={`badge ${n.situacao === 'cancelada' ? 'badge-red' : 'badge-green'}`}>
                      {n.situacao || '\u2014'}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    {n.manifestacao ? (
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${CLS_MANIFESTO[n.manifestacao] || 'bg-gray-100 text-gray-600'}`}>
                        {ROTULO_MANIFESTO[n.manifestacao] || n.manifestacao}
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700">
                        pendente
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center justify-center gap-1">
                      {MANIFESTOS.map(m => (
                        <button key={m.tipo} type="button" title={`${m.rotulo} \u2014 ${m.dica}`}
                          className={`btn-ghost p-1.5 ${m.cls} disabled:opacity-25`}
                          disabled={n.manifestacao === m.tipo}
                          onClick={() => { setManifestando({ nota: n, tipo: m.tipo }); setJustificativa(''); }}>
                          <m.Icone size={14} />
                        </button>
                      ))}
                      <button type="button" title="Baixar o XML da nota"
                        className="btn-ghost p-1.5 text-gray-500"
                        onClick={() => baixarXml(n)}>
                        <Download size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {data?.total > 30 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 text-sm">
            <span className="text-gray-500">
              {(page - 1) * 30 + 1} a {(page - 1) * 30 + notas.length} de {data.total}
            </span>
            <div className="flex gap-2">
              <button className="btn-secondary btn-sm" disabled={page === 1}
                onClick={() => setPage(p => p - 1)}>Anterior</button>
              <button className="btn-secondary btn-sm" disabled={page * 30 >= data.total}
                onClick={() => setPage(p => p + 1)}>Proxima</button>
            </div>
          </div>
        )}
      </div>

      {/* A confirmacao da manifestacao. Ela vai para a SEFAZ e nao volta
          atras — por isso pergunta antes, e por isso mostra o que cada
          tipo significa em vez de so o nome dele. */}
      {manifestando && (
        <Modal isOpen onClose={() => setManifestando(null)} title="Manifestar nota" size="md">
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              <b>{MANIFESTOS.find(m => m.tipo === manifestando.tipo)?.rotulo}</b> a nota de{' '}
              <b>{manifestando.nota.nome_emitente || 'fornecedor'}</b>, no valor de{' '}
              <b>{fmt(manifestando.nota.valor_total)}</b>.
            </p>
            <p className="text-[12.5px] text-gray-500 rounded-lg bg-gray-50 p-3">
              {MANIFESTOS.find(m => m.tipo === manifestando.tipo)?.dica}
            </p>
            {manifestando.tipo === 'nao_realizada' && (
              <div>
                <label className="label">Justificativa (15 a 255 caracteres) *</label>
                <textarea className="input" rows={3} value={justificativa}
                  onChange={e => setJustificativa(e.target.value)}
                  placeholder="Ex.: mercadoria recusada na entrega por avaria na embalagem" />
                <p className="text-[11px] text-gray-400 mt-1">{justificativa.length} caracteres</p>
              </div>
            )}
            <p className="text-[12px] text-amber-700 bg-amber-50 rounded-lg p-2.5">
              A manifestacao e enviada a SEFAZ e fica registrada no CNPJ da empresa.
            </p>
            <div className="flex justify-end gap-2 pt-1">
              <button className="btn-secondary" onClick={() => setManifestando(null)}>Cancelar</button>
              <button className="btn-primary" disabled={manifestar.isPending}
                onClick={() => manifestar.mutate({
                  chave: manifestando.nota.chave,
                  tipo: manifestando.tipo,
                  justificativa: justificativa.trim() || null,
                })}>
                {manifestar.isPending ? <Loader2 size={14} className="animate-spin" /> : null} Enviar a SEFAZ
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default function Fiscal() {
  const { isAdmin } = useAuth();
  const [tab, setTab] = useState('notas');

  const { data: cfg } = useQuery({ queryKey: ['fiscal-config'], queryFn: () => api.get('/fiscal/config') });
  const configured = !!(cfg?.cnpj && (cfg?.focus_token_homologacao || cfg?.focus_token_producao));

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-violet-100 rounded-lg flex items-center justify-center">
            <Receipt size={18} className="text-violet-600"/>
          </div>
          <div>
            <h1 className="page-title">Fiscal / NF-e</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Emissão e compras do CNPJ, integradas via Focus NFe / SEFAZ
            </p>
          </div>
        </div>
      </div>

      {!configured ? (
        <div className="card p-4 bg-amber-50 border-amber-200 flex items-start gap-3">
          <AlertCircle size={18} className="text-amber-600 mt-0.5 flex-shrink-0" />
          <div className="text-sm">
            <p className="font-medium text-amber-900">Configuração necessária</p>
            <p className="text-amber-700">
              Preencha os dados do emitente e o token Focus NFe na aba <strong>Configuração</strong>.
              Crie uma conta gratuita em <strong>focusnfe.com.br</strong> para obter o token de homologação (testes).
            </p>
          </div>
        </div>
      ) : (
        <div className="card p-3 bg-green-50 border-green-200 flex items-center gap-2 text-sm text-green-700">
          <CheckCircle2 size={15}/> Emissor configurado — {cfg.razao_social || cfg.cnpj} · ambiente: <strong>{cfg.ambiente === 'producao' ? 'Produção' : 'Homologação'}</strong>
        </div>
      )}

      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {/* AS DUAS PONTAS DO CNPJ, uma ao lado da outra. Emitidas e o
            que entrou de dinheiro; Compras e tudo o que foi comprado no
            CNPJ, direto da SEFAZ. Antes so a primeira existia. */}
        <button onClick={() => setTab('notas')}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === 'notas' ? 'bg-white shadow text-violet-700' : 'text-gray-500'}`}>
          Notas Emitidas
        </button>
        <button onClick={() => setTab('compras')}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${tab === 'compras' ? 'bg-white shadow text-violet-700' : 'text-gray-500'}`}>
          <ShoppingCart size={13} /> Compras (SEFAZ)
        </button>
        {isAdmin && (
          <button onClick={() => setTab('config')}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${tab === 'config' ? 'bg-white shadow text-violet-700' : 'text-gray-500'}`}>
            <Settings2 size={13}/> Configuração
          </button>
        )}
      </div>

      {tab === 'notas' ? <TabNotas /> : tab === 'compras' ? <TabCompras /> : <TabConfig />}
    </div>
  );
}
