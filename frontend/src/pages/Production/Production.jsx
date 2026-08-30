import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Factory, Play, Check, Search, RefreshCw, Loader2, Save, Image as ImageIcon, AlertTriangle, Clock, Plus, Camera, Trash2 } from 'lucide-react';
import api from '@/lib/api';
import { id4 } from '@/lib/ids';
import Modal from '@/components/UI/Modal';
import SerigrafiaPanel from './SerigrafiaPanel';
import toast from 'react-hot-toast';

const fmtMoney = v => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
const fmtDT = s => s ? new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
const STEP_LABEL = { revelacao: 'Revelação', producao: 'Produção', pintura: 'Pintura', metalizacao: 'Metalização', embalagem: 'Embalagem', perda: 'Perda', status: 'Status' };
const ACT_LABEL = { start: 'iniciou', finish: 'finalizou', registro: 'registrou' };

const STAGES = {
  aguardando_arte:     { label: 'Aguardando Arte',     cls: 'bg-gray-100 text-gray-600' },
  aguardando_producao: { label: 'Aguardando Produção', cls: 'bg-blue-100 text-blue-700' },
  revelacao:           { label: 'Em processo de gravação', cls: 'bg-yellow-100 text-yellow-700' },
  pintura:             { label: 'Em Pintura',          cls: 'bg-pink-100 text-pink-700' },
  metalizacao:         { label: 'Em Metalização',      cls: 'bg-slate-200 text-slate-700' },
  producao:            { label: 'Em Produção',         cls: 'bg-orange-100 text-orange-700' },
  embalagem:           { label: 'Em Embalagem',        cls: 'bg-violet-100 text-violet-700' },
  finalizado:          { label: 'Finalizado',          cls: 'bg-green-100 text-green-700' },
};
// Fluxo: Revelação → Pintura → Metalização → Produção → Embalagem
// A Metalização é OPCIONAL (só pedidos com borda metalizada): a Produção
// aceita vir tanto da Pintura quanto da Metalização.
const STEPS = [
  { stage: 'revelacao',   label: 'Revelação' },
  { stage: 'pintura',     label: 'Pintura' },
  { stage: 'metalizacao', label: 'Metalização' },
  { stage: 'producao',    label: 'Produção' },
  { stage: 'embalagem',   label: 'Embalagem' },
];
const fmtDate = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR') : '—';

/**
 * A FÁBRICA SÓ MEXE NO QUE É DELA.
 *
 * Duas condições antes de qualquer etapa, e as duas vêm do servidor
 * (`interagivel`), não de um palpite da tela:
 *
 *   ENVIADO       alguém do comercial disse "pode começar". Antes, o
 *                 pedido caía na fila só por mudar de status — inclusive
 *                 o que ainda estava sendo acertado com o cliente.
 *   PERSONALIZADO copo liso não tem arte, vegetal nem tela. Não há o que
 *                 revelar, e um botão "Iniciar Revelação" nele é um
 *                 convite a registrar trabalho que não existe.
 *
 * O pedido liso continua aparecendo na lista — some da tela seria a
 * produção descobrir por telefone que ele existe. Aparece marcado, e
 * sem botão.
 */
function canDo(s, stage, action) {
  if (!s) return false;
  if (!s.interagivel) return false;
  if (action === 'finish') return s.stage === stage;
  if (stage === 'revelacao') return ['aguardando_arte', 'aguardando_producao'].includes(s.stage);
  if (stage === 'pintura')     return s.stage === 'revelacao';
  if (stage === 'metalizacao') return s.stage === 'pintura';
  // Metalização é opcional: a Produção libera vindo da Pintura ou dela
  if (stage === 'producao')    return ['pintura', 'metalizacao'].includes(s.stage);
  if (stage === 'embalagem')   return s.stage === 'producao';
  return false;
}

export default function Production() {
  const qc = useQueryClient();
  const [filters, setFilters] = useState({ start_date: '', end_date: '', search: '' });
  const [query, setQuery] = useState({ start_date: '', end_date: '', search: '' });
  const [selId, setSelId] = useState(null);

  const { data, isFetching, refetch } = useQuery({
    queryKey: ['production', query],
    queryFn: () => api.get(`/production?${new URLSearchParams(Object.fromEntries(Object.entries(query).filter(([, v]) => v)))}`),
  });
  const rows = data?.data || [];
  const selected = rows.find(r => r.id === selId) || null;

  const { data: detail } = useQuery({
    queryKey: ['production-detail', selId],
    queryFn: () => api.get(`/production/${selId}`),
    enabled: !!selId,
  });

  const stageMut = useMutation({
    mutationFn: (payload) => api.post(`/production/${selId}/stage`, payload),
    onSuccess: () => { qc.invalidateQueries(['production']); qc.invalidateQueries(['production-detail', selId]); toast.success('Etapa registrada!'); setRevConfirm(null); },
    onError: e => toast.error(e.error || 'Erro ao registrar etapa'),
  });

  // Confirmação de QUALQUER etapa: usuário + senha (revelação pede nº do quadro + conferido)
  const [revConfirm, setRevConfirm] = useState(null); // { stage, action } | null
  const [revForm, setRevForm] = useState({ user: '', quadro: '', conferido: false, password: '' });
  function confirmRev() {
    const isRev = revConfirm.stage === 'revelacao';
    stageMut.mutate({
      stage: revConfirm.stage, action: revConfirm.action,
      actor_user: revForm.user.trim(), password: revForm.password,
      ...(isRev ? { quadro: revForm.quadro.trim(), conferido: revForm.conferido } : {}),
    });
  }
  const isRevConfirm = revConfirm?.stage === 'revelacao';
  const revReady = revForm.user.trim() && revForm.password && (!isRevConfirm || (revForm.quadro.trim() && revForm.conferido));

  // Toda etapa passa pelo modal de confirmação (senha + histórico).
  function doStage(stage, action) {
    setRevForm({ user: '', quadro: '', conferido: false, password: '' });
    setRevConfirm({ stage, action });
  }

  const [edit, setEdit] = useState({});
  const saveFields = useMutation({
    mutationFn: () => api.patch(`/production/${selId}`, edit),
    onSuccess: () => { qc.invalidateQueries(['production']); qc.invalidateQueries(['production-detail', selId]); toast.success('Salvo!'); },
    onError: e => toast.error(e.error || 'Erro ao salvar'),
  });

  // Perda na produção
  const [perdaOpen, setPerdaOpen] = useState(false);
  const [perda, setPerda] = useState({ product_id: '', quantity: '', deduct_stock: true, notes: '' });
  const perdaMut = useMutation({
    mutationFn: () => {
      const it = (detail?.items || []).find(i => i.product_id === perda.product_id);
      return api.post(`/production/${selId}/perda`, { ...perda, product_name: it?.product_name || null });
    },
    onSuccess: () => {
      qc.invalidateQueries(['production-detail', selId]);
      setPerdaOpen(false); setPerda({ product_id: '', quantity: '', deduct_stock: true, notes: '' });
      toast.success('Perda registrada!');
    },
    onError: e => toast.error(e.error || 'Erro (rodou a migration 020?)'),
  });
  // Foto do produto (visível ao cliente no site)
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const photoMut = useMutation({
    mutationFn: (image) => api.post(`/production/${selId}/photo`, { image }),
    onSuccess: () => { qc.invalidateQueries(['production-detail', selId]); qc.invalidateQueries(['production']); toast.success('Foto anexada — já aparece para o cliente!'); },
    onError: e => toast.error(e.error || 'Erro ao anexar foto (rodou a migration 024?)'),
  });
  const delPhotoMut = useMutation({
    mutationFn: (url) => api.delete(`/production/${selId}/photo?url=${encodeURIComponent(url)}`),
    onSuccess: () => { qc.invalidateQueries(['production-detail', selId]); toast.success('Foto removida'); },
    onError: e => toast.error(e.error || 'Erro ao remover'),
  });
  function onPickPhoto(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('Selecione uma imagem'); return; }
    if (file.size > 8 * 1024 * 1024) { toast.error('Imagem muito grande (máx. 8MB)'); return; }
    setUploadingPhoto(true);
    const reader = new FileReader();
    reader.onload = () => photoMut.mutate(reader.result, { onSettled: () => setUploadingPhoto(false) });
    reader.onerror = () => { setUploadingPhoto(false); toast.error('Não consegui ler a imagem'); };
    reader.readAsDataURL(file);
  }

  // sincroniza campos editáveis quando troca de pedido
  const d = detail || {};
  const ef = (k, fallback = '') => (k in edit ? edit[k] : (d[k] ?? fallback));

  return (
    <div className="space-y-4">
      <div className="page-header flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-orange-100 rounded-lg flex items-center justify-center"><Factory size={18} className="text-orange-600" /></div>
          <div>
            <h1 className="page-title">Produção</h1>
            <p className="text-sm text-gray-500 mt-0.5">Revelação · Produção · Embalagem</p>
          </div>
        </div>
        <button onClick={() => refetch()} className="btn-secondary"><RefreshCw size={15} className={isFetching ? 'animate-spin' : ''} /> Atualizar</button>
      </div>

      {/* Toolbar de etapas.
          NO CELULAR SÓ APARECE O QUE DÁ PARA FAZER. As cinco etapas em
          dez botões ocupavam uma tela inteira do aparelho — e oito
          deles sempre apagados, porque o pedido está numa etapa de cada
          vez. No computador a régua inteira continua à vista (ela conta
          o caminho); no celular fica o passo de agora, que é o que a
          pessoa de pé na bancada precisa alcançar. */}
      <div className="card p-3 flex flex-wrap items-center gap-2">
        {STEPS.map(s => {
          const podeIniciar = canDo(selected, s.stage, 'start');
          const podeFinalizar = canDo(selected, s.stage, 'finish');
          const agora = podeIniciar || podeFinalizar;
          return (
            <div key={s.stage} className={`items-center gap-1 ${agora ? 'flex w-full sm:w-auto' : 'hidden lg:flex'}`}>
              <button disabled={!podeIniciar || stageMut.isPending}
                onClick={() => doStage(s.stage, 'start')}
                className="flex-1 lg:flex-none justify-center text-xs font-medium px-3 py-2.5 lg:py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-30 inline-flex items-center gap-1">
                <Play size={13} /> Iniciar {s.label}
              </button>
              <button disabled={!podeFinalizar || stageMut.isPending}
                onClick={() => doStage(s.stage, 'finish')}
                className="flex-1 lg:flex-none justify-center text-xs font-medium px-3 py-2.5 lg:py-2 rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-30 inline-flex items-center gap-1">
                <Check size={13} /> Finalizar {s.label}
              </button>
            </div>
          );
        })}
        {/* Nada possível e nenhum aviso: o pedido está entre etapas. */}
        {selected?.interagivel && !STEPS.some(s => canDo(selected, s.stage, 'start') || canDo(selected, s.stage, 'finish')) && (
          <span className="text-xs text-gray-400 lg:hidden">
            Nenhuma etapa da produção disponível agora para este pedido.
          </span>
        )}
        {!selected && <span className="text-xs text-gray-400 ml-2">Selecione um pedido na lista.</span>}
        {/* BOTÃO APAGADO SEM EXPLICAÇÃO É BOTÃO QUEBRADO. Quem clica e
            não acontece nada conclui que o sistema travou. */}
        {selected && !selected.interagivel && (
          <span className="text-xs ml-2 flex items-center gap-1.5 text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
            <AlertTriangle size={13} className="shrink-0" />
            {!selected.personalizado
              ? 'Pedido sem personalização — não passa pela serigrafia. Ele segue pela tela do pedido de venda.'
              : 'Pedido ainda não enviado para a produção. O comercial precisa liberar no pedido de venda.'}
          </span>
        )}
      </div>

      {/* Filtros */}
      <div className="card p-3 flex flex-wrap items-end gap-3">
        <div>
          <label className="label">Saída de</label>
          <input type="date" className="input" value={filters.start_date} onChange={e => setFilters(f => ({ ...f, start_date: e.target.value }))} />
        </div>
        <div>
          <label className="label">até</label>
          <input type="date" className="input" value={filters.end_date} onChange={e => setFilters(f => ({ ...f, end_date: e.target.value }))} />
        </div>
        <div className="flex-1 min-w-48">
          <label className="label">Procurar (pedido ou cliente)</label>
          <input className="input" value={filters.search} onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
            onKeyDown={e => e.key === 'Enter' && setQuery(filters)} placeholder="Nº do pedido ou nome..." />
        </div>
        <button onClick={() => setQuery(filters)} className="btn-primary"><Search size={15} /> Filtrar</button>
      </div>

      {/* Board */}
      <div className="card overflow-hidden">
        {/* NO CELULAR A TABELA NÃO ABRE.
            Onze colunas num aparelho de 360 pontos viram arrastar de lado
            para ler cada pedido — e a coluna que decide (o prazo) é
            justamente a do meio, a que nunca está na tela. Abaixo de `lg`
            a mesma lista vira um cartão por pedido. Os dois leem os
            MESMOS `rows`: não existe segunda consulta nem segunda regra. */}
        <div className="hidden lg:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] text-gray-500 uppercase border-b border-gray-100 bg-gray-50 align-bottom">
                <th className="px-3 py-2 leading-tight"><span className="block text-[9px] text-gray-400">Nº</span>PEDIDO</th>
                <th className="px-3 py-2">Cliente</th>
                <th className="px-3 py-2 leading-tight"><span className="block text-[9px] text-gray-400">DATA DO</span>PEDIDO</th>
                <th className="px-3 py-2 leading-tight"><span className="block text-[9px] text-gray-400">DATA DO</span>EVENTO</th>
                <th className="px-3 py-2 leading-tight"><span className="block text-[9px] text-gray-400">DATA DE</span>SAÍDA</th>
                <th className="px-3 py-2 leading-tight"><span className="block text-[9px] text-gray-400">PRAZO MÁX.</span>ENTREGA</th>
                <th className="px-3 py-2 text-center leading-tight"><span className="block text-[9px] text-gray-400">DIAS</span>P/ PRAZO</th>
                <th className="px-3 py-2">Transportadora</th>
                <th className="px-3 py-2">Cidade/UF</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Vendedor</th>
              </tr>
            </thead>
            <tbody>
              {isFetching && rows.length === 0 && <tr><td colSpan={11} className="p-8 text-center text-gray-400"><Loader2 className="animate-spin mx-auto" /></td></tr>}
              {!isFetching && rows.length === 0 && <tr><td colSpan={11} className="p-8 text-center text-gray-400">Nenhum pedido em produção.</td></tr>}
              {rows.map(r => {
                const st = STAGES[r.stage] || STAGES.aguardando_producao;
                const dd = r.diff_deadline ?? r.diff_days;
                const late = dd != null && dd < 0;
                const soon = dd != null && dd >= 0 && dd <= 3;
                return (
                  <tr key={r.id} onClick={() => { setSelId(r.id); setEdit({}); }}
                    className={`border-b border-gray-50 cursor-pointer ${selId === r.id ? 'bg-orange-50' : 'hover:bg-gray-50/60'} ${r.interagivel ? '' : 'opacity-60'}`}>
                    <td className="px-3 py-2 font-mono font-semibold whitespace-nowrap">
                      #{String(r.number || '').padStart(4, '0')}
                      {!r.personalizado && (
                        <span className="block text-[9px] font-sans font-semibold text-amber-600 uppercase tracking-wide">liso</span>
                      )}
                    </td>
                    <td className="px-3 py-2">{r.customer}</td>
                    <td className="px-3 py-2 text-gray-500">{fmtDate(r.order_date)}</td>
                    <td className="px-3 py-2 text-gray-500">{fmtDate(r.event_date)}</td>
                    <td className="px-3 py-2 text-gray-500">{fmtDate(r.ship_date)}</td>
                    <td className="px-3 py-2 text-gray-500">{fmtDate(r.max_delivery_date)}</td>
                    <td className={`px-3 py-2 text-center font-semibold ${late ? 'text-red-600' : soon ? 'text-orange-500' : 'text-gray-600'}`}>
                      {dd == null ? '—' : late ? `${Math.abs(dd)}d atraso` : `${dd}d`}
                    </td>
                    <td className="px-3 py-2 text-gray-500 truncate max-w-[140px]">{r.carrier || '—'}</td>
                    <td className="px-3 py-2 text-gray-500">{r.city ? `${r.city}/${r.uf || ''}` : '—'}</td>
                    <td className="px-3 py-2"><span className={`text-xs font-medium px-2 py-0.5 rounded-full ${st.cls}`}>{st.label}</span></td>
                    <td className="px-3 py-2 text-gray-500">{r.seller || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* ── A MESMA LISTA, EM CARTÕES (celular) ─────────────── */}
        <div className="lg:hidden divide-y divide-gray-200">
          {isFetching && rows.length === 0 && (
            <div className="p-8 text-center text-gray-400"><Loader2 className="animate-spin mx-auto" /></div>
          )}
          {!isFetching && rows.length === 0 && (
            <p className="p-8 text-center text-gray-400 text-sm">Nenhum pedido em produção.</p>
          )}
          {rows.map(r => (
            <CartaoProducao key={r.id} r={r} selecionado={selId === r.id}
              onSelecionar={() => { setSelId(r.id); setEdit({}); }} />
          ))}
        </div>
      </div>

      {/* Serigrafia — perda de matriz + durabilidade das telas */}
      <SerigrafiaPanel
        saleId={selId}
        defaultQuadro={(detail?.history || []).filter(h => h.stage === 'revelacao' && h.quadro).slice(-1)[0]?.quadro || ''}
      />

      {/* Detalhe do pedido selecionado */}
      {selected && (
        <div className="grid lg:grid-cols-2 gap-4">
          {/* Itens + dados */}
          <div className="space-y-4">
            <div className="card p-4">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Pedido #{String(selected.number || '').padStart(4, '0')} — itens</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                    <th className="py-1.5 pr-2">Cód</th><th className="py-1.5 pr-2">Produto</th>
                    <th className="py-1.5 pr-2 text-right">Qtd</th><th className="py-1.5 pr-2">Cor</th><th className="py-1.5">Impressão</th>
                  </tr></thead>
                  <tbody>
                    {(detail?.items || []).map((it, i) => (
                      <tr key={i} className="border-b border-gray-50">
                        <td className="py-1.5 pr-2 font-mono text-xs text-gray-400">{it.product_code ? id4(it.product_code) : '—'}</td>
                        <td className="py-1.5 pr-2 font-medium">{it.product_name}</td>
                        <td className="py-1.5 pr-2 text-right">{it.quantity}</td>
                        <td className="py-1.5 pr-2">{it.color || '—'}</td>
                        <td className="py-1.5 text-gray-500">{it.impressao || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="card p-4 space-y-3">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Logística & datas</p>
              {/* Data do pedido (automática) + diffs calculados */}
              <div className="bg-gray-50 rounded-xl p-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold">Pedido em</p>
                  <p className="text-sm font-semibold text-gray-800">{fmtDate(detail?.order_date)}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold">Dias p/ evento</p>
                  <p className="text-sm font-semibold text-gray-800">{selected?.diff_event == null ? '—' : `${selected.diff_event}d`}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold">Dias p/ saída</p>
                  <p className="text-sm font-semibold text-gray-800">{selected?.diff_ship == null ? '—' : `${selected.diff_ship}d`}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold">Dias p/ prazo</p>
                  <p className={`text-sm font-bold ${selected?.diff_deadline != null && selected.diff_deadline < 0 ? 'text-red-600' : 'text-gray-800'}`}>
                    {selected?.diff_deadline == null ? '—' : selected.diff_deadline < 0 ? `${Math.abs(selected.diff_deadline)}d atraso` : `${selected.diff_deadline}d`}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label className="label">Data do evento</label><input type="date" className="input" value={ef('event_date') || ''} onChange={e => setEdit(s => ({ ...s, event_date: e.target.value }))} /></div>
                <div><label className="label">Prazo máx. entrega</label><input type="date" className="input" value={ef('max_delivery_date') || ''} onChange={e => setEdit(s => ({ ...s, max_delivery_date: e.target.value }))} /></div>
                <div><label className="label">Data de saída</label><input type="date" className="input" value={ef('ship_date') || ''} onChange={e => setEdit(s => ({ ...s, ship_date: e.target.value }))} /></div>
                <div><label className="label">Horário</label><input className="input" value={ef('ship_time') || ''} onChange={e => setEdit(s => ({ ...s, ship_time: e.target.value }))} placeholder="10:00" /></div>
                <div><label className="label">Transportadora</label><input className="input" value={ef('carrier') || ''} onChange={e => setEdit(s => ({ ...s, carrier: e.target.value }))} /></div>
                <div><label className="label">Frete (R$)</label><input type="number" step="0.01" className="input" value={ef('freight') ?? ''} onChange={e => setEdit(s => ({ ...s, freight: e.target.value }))} placeholder="0,00" /></div>
              </div>
              <div><label className="label">Observações de produção</label><textarea rows={2} className="input resize-none" value={ef('production_obs') || ''} onChange={e => setEdit(s => ({ ...s, production_obs: e.target.value }))} /></div>
              <button onClick={() => saveFields.mutate()} disabled={saveFields.isPending || !Object.keys(edit).length} className="btn-primary disabled:opacity-50">
                <Save size={15} /> Salvar dados
              </button>
            </div>
          </div>

          {/* Arte + Perdas + Histórico */}
          <div className="space-y-4">
            <div className="card p-4">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5"><ImageIcon size={13} /> Arte / Layout</p>
              {(detail?.items || []).some(it => it.art) ? (
                <div className="space-y-3">
                  {(detail?.items || []).filter(it => it.art).map((it, i) => (
                    <div key={i}>
                      <img src={it.art} alt="" className="w-full rounded-xl border border-gray-200" />
                      <p className="text-xs text-gray-400 mt-1">{it.product_name} · {it.color || ''}{it.art_file ? ` · ${it.art_file}` : ''}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-gray-400 text-center py-10">Sem arte anexada neste pedido.</div>
              )}
            </div>

            {/* Foto do produto personalizado (vai para o cliente no site) */}
            <div className="card p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide flex items-center gap-1.5"><Camera size={13} /> Foto do produto</p>
                <label className={`btn-secondary text-xs cursor-pointer ${uploadingPhoto ? 'opacity-50 pointer-events-none' : ''}`}>
                  {uploadingPhoto ? <Loader2 size={13} className="animate-spin" /> : <Camera size={13} />} Anexar foto
                  <input type="file" accept="image/*" capture="environment" className="hidden" onChange={onPickPhoto} disabled={uploadingPhoto} />
                </label>
              </div>
              <p className="text-[11px] text-gray-400 mb-2">Aparece no acompanhamento do pedido do cliente no site. 📸</p>
              {(detail?.photos || []).length === 0 ? (
                <p className="text-sm text-gray-400">Nenhuma foto anexada.</p>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {(detail.photos).map((p, i) => (
                    <div key={i} className="relative group">
                      <img src={p.url} alt="" className="w-full h-24 object-cover rounded-lg border border-gray-200" />
                      <button onClick={() => delPhotoMut.mutate(p.url)}
                        className="absolute top-1 right-1 bg-white/90 hover:bg-red-500 hover:text-white text-red-500 rounded-full p-1 shadow opacity-0 group-hover:opacity-100 transition-opacity" title="Remover">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Perdas na produção */}
            <div className="card p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide flex items-center gap-1.5"><AlertTriangle size={13} /> Perdas na produção</p>
                <button onClick={() => setPerdaOpen(true)} className="btn-secondary text-xs"><Plus size={13} /> Registrar perda</button>
              </div>
              {(detail?.perdas || []).length === 0 ? (
                <p className="text-sm text-gray-400">Nenhuma perda registrada.</p>
              ) : (
                <div className="space-y-1.5">
                  {(detail.perdas).map(p => (
                    <div key={p.id} className="flex items-center justify-between text-sm border-b border-gray-50 pb-1.5">
                      <span className="truncate">{p.product_name || 'Produto'}</span>
                      <span className="text-red-600 font-semibold shrink-0 ml-2">-{Number(p.quantity)} un</span>
                      <span className="text-xs text-gray-400 shrink-0 ml-2">{p.user_name} · {fmtDT(p.created_at)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Histórico / timeline */}
            <div className="card p-4">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5"><Clock size={13} /> Histórico</p>
              {(detail?.history || []).length === 0 ? (
                <p className="text-sm text-gray-400">Sem movimentações ainda.</p>
              ) : (
                <ol className="space-y-2">
                  {[...(detail.history)].reverse().map((h, i) => (
                    <li key={i} className="flex gap-2 text-sm">
                      <span className="w-1.5 h-1.5 rounded-full bg-orange-400 mt-1.5 shrink-0" />
                      <div>
                        <span className="font-medium">{STEP_LABEL[h.stage] || h.stage}</span>
                        <span className="text-gray-500"> — {ACT_LABEL[h.action] || h.action}{h.detail ? ` (${h.detail})` : ''}</span>
                        <div className="text-xs text-gray-400">{h.user || '—'} · {fmtDT(h.at)}</div>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal: registrar perda */}
      <Modal isOpen={perdaOpen} onClose={() => setPerdaOpen(false)} title="Registrar perda na produção" size="sm">
        <div className="space-y-3">
          <div>
            <label className="label">Produto</label>
            <select className="input" value={perda.product_id} onChange={e => setPerda(s => ({ ...s, product_id: e.target.value }))}>
              <option value="">Selecione o produto...</option>
              {(detail?.items || []).map((it, i) => <option key={i} value={it.product_id || ''}>{it.product_name}{it.color ? ` — ${it.color}` : ''}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Quantidade perdida</label>
            <input type="number" min="1" className="input" value={perda.quantity} onChange={e => setPerda(s => ({ ...s, quantity: e.target.value }))} placeholder="0" />
          </div>
          <div>
            <label className="label">Observação</label>
            <input className="input" value={perda.notes} onChange={e => setPerda(s => ({ ...s, notes: e.target.value }))} placeholder="Ex.: quebra na revelação" />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input type="checkbox" checked={perda.deduct_stock} onChange={e => setPerda(s => ({ ...s, deduct_stock: e.target.checked }))} className="w-4 h-4 accent-orange-600" />
            Dar baixa no estoque
          </label>
          <div className="flex gap-2 justify-end pt-2">
            <button onClick={() => setPerdaOpen(false)} className="btn-secondary">Cancelar</button>
            <button onClick={() => perdaMut.mutate()} disabled={perdaMut.isPending || !perda.quantity} className="btn-primary disabled:opacity-50">
              {perdaMut.isPending ? 'Salvando...' : 'Registrar'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Confirmação da etapa (senha + histórico). Revelação pede nº do quadro + conferido. */}
      <Modal isOpen={!!revConfirm} onClose={() => !stageMut.isPending && setRevConfirm(null)}
        title={`${revConfirm?.action === 'finish' ? 'Finalizar' : 'Iniciar'} ${STEP_LABEL[revConfirm?.stage] || ''}`} size="sm">
        <div className="space-y-3">
          <div>
            <label className="label">Usuário *</label>
            <input className="input" autoFocus value={revForm.user}
              onChange={e => setRevForm(s => ({ ...s, user: e.target.value.toUpperCase() }))}
              placeholder="Quem está fazendo esta etapa" />
          </div>

          {/* O restante aparece após informar o usuário */}
          {revForm.user.trim() && (
            <div className="space-y-3 border-t border-gray-100 pt-3">
              {isRevConfirm && (
                <>
                  <div>
                    <label className="label">Qual a numeração do quadro? *</label>
                    <input className="input font-mono" value={revForm.quadro}
                      onChange={e => setRevForm(s => ({ ...s, quadro: e.target.value }))}
                      placeholder="Ex.: 04827" />
                  </div>
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                    <b>Obs:</b> favor conferir se a gravação da matriz está conforme a vegetal impressa.
                  </p>
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input type="checkbox" checked={revForm.conferido}
                      onChange={e => setRevForm(s => ({ ...s, conferido: e.target.checked }))}
                      className="w-4 h-4 accent-primary-600" />
                    Conferido
                  </label>
                </>
              )}
              <div>
                <label className="label">Confirme com a sua senha *</label>
                <input type="password" className="input" value={revForm.password}
                  onChange={e => setRevForm(s => ({ ...s, password: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && revReady && !stageMut.isPending && confirmRev()}
                  placeholder="Sua senha" />
                <p className="text-[11px] text-gray-400 mt-1">Só confirma quando todos os campos acima estiverem preenchidos.</p>
              </div>
            </div>
          )}

          <div className="flex gap-2 justify-end pt-2 border-t border-gray-100">
            <button onClick={() => setRevConfirm(null)} disabled={stageMut.isPending} className="btn-secondary">Cancelar</button>
            <button onClick={confirmRev} disabled={!revReady || stageMut.isPending}
              className="btn-primary disabled:opacity-40">
              {stageMut.isPending ? <><Loader2 size={15} className="animate-spin" /> Confirmando...</> : <><Check size={15} /> Confirmar</>}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

/**
 * UM PEDIDO, UM CARTÃO — a fila da produção no celular.
 *
 * A tabela responde "qual está mais apertado?" de relance porque as
 * datas estão alinhadas em coluna. Num aparelho de 360 pontos nada está
 * alinhado: sobra arrastar de lado, e arrastar de lado não responde
 * nada.
 *
 * O cartão inverte a ordem de leitura: primeiro o prazo — que é o que
 * a produção decide por —, depois quem é o pedido, e por último o
 * resto. Cidade, transportadora e vendedor só aparecem quando existem:
 * no computador um campo vazio é uma célula com traço; aqui é uma linha
 * inteira gasta para dizer "nada".
 */
function CartaoProducao({ r, selecionado, onSelecionar }) {
  const st = STAGES[r.stage] || STAGES.aguardando_producao;
  const dd = r.diff_deadline ?? r.diff_days;
  const atrasado = dd != null && dd < 0;
  const perto = dd != null && dd >= 0 && dd <= 3;
  const rodape = [r.city ? `${r.city}/${r.uf || ''}` : null, r.carrier, r.seller].filter(Boolean).join(' · ');

  return (
    <div role="button" tabIndex={0} onClick={onSelecionar}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelecionar(); } }}
      className={`px-4 py-3.5 cursor-pointer ${selecionado ? 'bg-orange-50' : ''} ${r.interagivel ? '' : 'opacity-70'}`}>

      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-mono font-bold text-gray-900">#{String(r.number || '').padStart(4, '0')}</span>
        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${st.cls}`}>{st.label}</span>
        {/* O selo do liso vem antes de qualquer número: ele muda o que
            dá para fazer com o pedido, e isso se lê primeiro. */}
        {!r.personalizado && (
          <span className="text-[11px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
            sem personalização
          </span>
        )}
        <span className={`ml-auto text-[13px] font-bold whitespace-nowrap ${atrasado ? 'text-red-600' : perto ? 'text-orange-500' : 'text-gray-500'}`}>
          {dd == null ? '—' : atrasado ? `${Math.abs(dd)}d atraso` : `${dd}d p/ prazo`}
        </span>
      </div>

      <p className="font-semibold text-gray-800 mt-1 truncate">{r.customer}</p>

      <div className="grid grid-cols-3 gap-2 mt-2">
        <Prazo rotulo="Evento"  valor={fmtDate(r.event_date)} />
        <Prazo rotulo="Saída"   valor={fmtDate(r.ship_date)} />
        <Prazo rotulo="Entrega" valor={fmtDate(r.max_delivery_date)} />
      </div>

      {rodape && <p className="text-[11px] text-gray-400 mt-2 truncate">{rodape}</p>}
    </div>
  );
}

function Prazo({ rotulo, valor }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-wider text-gray-400">{rotulo}</p>
      <p className="text-[12.5px] text-gray-600 truncate">{valor}</p>
    </div>
  );
}
