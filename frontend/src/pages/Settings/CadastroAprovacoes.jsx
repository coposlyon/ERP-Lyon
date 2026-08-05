import { useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import {
  ShieldCheck, Loader2, CheckCircle2, XCircle, Paperclip, FileText,
  User, Building2, Truck, ArrowRight, Clock, AlertTriangle,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import api from '@/lib/api';
import Modal from '@/components/UI/Modal';
import toast from 'react-hot-toast';

// Pedidos de alteração vindos dos links públicos de cadastro. Nada é gravado
// no cadastro até um administrador aprovar aqui — quem manda o pedido não vê
// nem recebe nenhum dado do cadastro existente.

const ENTIDADES = {
  cliente:        { label: 'Cliente',        icon: User,      badge: 'badge-gray',   link: id => `/customers/${id}` },
  fornecedor:     { label: 'Fornecedor',     icon: Building2, badge: 'badge-blue',   link: () => '/suppliers' },
  transportadora: { label: 'Transportadora', icon: Truck,     badge: 'badge-purple', link: () => '/logistics' },
};

const STATUS_BADGE = { pendente: 'badge-yellow', aprovada: 'badge-green', rejeitada: 'badge-red' };
const STATUS_LABEL = { pendente: 'Pendente', aprovada: 'Aprovada', rejeitada: 'Rejeitada' };

const FILTROS = [
  { value: 'pendente', label: 'Pendentes' },
  { value: 'aprovada', label: 'Aprovadas' },
  { value: 'rejeitada', label: 'Rejeitadas' },
  { value: 'todas', label: 'Todas' },
];

function dt(iso) {
  try { return format(parseISO(iso), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }); } catch { return iso || '—'; }
}
const maskDoc = d => {
  const s = String(d || '');
  return s.length === 11 ? s.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
    : s.length === 14 ? s.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5') : s;
};
const kb = n => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.round((n || 0) / 1024)} KB`);

// Uma linha do diff: valor atual → valor proposto
function LinhaMudanca({ c }) {
  return (
    <div className="grid grid-cols-[130px_1fr_18px_1fr] gap-2 items-start py-1.5 border-b border-gray-50 last:border-0 text-sm">
      <span className="text-gray-400 text-xs pt-0.5">{c.label}</span>
      <span className="text-gray-500 line-through break-words">{c.from || <i className="text-gray-300 not-italic">vazio</i>}</span>
      <ArrowRight size={14} className="text-gray-300 mt-1" />
      <span className="font-medium text-gray-900 break-words">{c.to || <i className="text-gray-300 font-normal not-italic">vazio</i>}</span>
    </div>
  );
}

export default function CadastroAprovacoes() {
  const qc = useQueryClient();
  const [status, setStatus] = useState('pendente');
  const [aberta, setAberta] = useState(null);   // solicitação no modal
  const [acao, setAcao] = useState(null);       // 'approve' | 'reject'
  const [nota, setNota] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['cadastro-requests', status],
    queryFn: () => api.get(`/cadastro-requests?status=${status}`),
    refetchInterval: 60000,
    refetchIntervalInBackground: false,
  });

  const mut = useMutation({
    mutationFn: ({ id, tipo, note }) => api.post(`/cadastro-requests/${id}/${tipo}`, { note }),
    onSuccess: (_r, v) => {
      toast.success(v.tipo === 'approve' ? 'Alteração aprovada e gravada no cadastro!' : 'Pedido rejeitado.');
      setAberta(null); setAcao(null); setNota('');
      qc.invalidateQueries(['cadastro-requests']);
      qc.invalidateQueries(['cadastro-requests-count']);
      qc.invalidateQueries(['customers']);
      qc.invalidateQueries(['suppliers']);
      qc.invalidateQueries(['carriers']);
    },
    onError: e => toast.error(e.error || 'Não foi possível concluir'),
  });

  const lista = data?.data || [];
  const pendentes = lista.filter(s => s.status === 'pendente').length;

  function confirmar() {
    if (acao === 'reject' && !nota.trim()) return toast.error('Escreva o motivo da rejeição.');
    mut.mutate({ id: aberta.id, tipo: acao, note: nota.trim() });
  }

  return (
    <div className="space-y-4">
      <div className="page-header">
        <div>
          <h1 className="page-title flex items-center gap-2"><ShieldCheck size={22} className="text-primary-600" /> Aprovações de Cadastro</h1>
          <p className="text-sm text-gray-500 mt-1">
            Pedidos de alteração feitos pelos links públicos de cadastro. Nada muda no sistema até você aprovar.
          </p>
        </div>
      </div>

      <div className="card">
        <div className="card-header flex flex-wrap items-center gap-3">
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            {FILTROS.map(f => (
              <button key={f.value} onClick={() => setStatus(f.value)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  status === f.value ? 'bg-white shadow text-primary-700' : 'text-gray-500 hover:text-gray-800'}`}>
                {f.label}
                {f.value === 'pendente' && status === 'pendente' && pendentes > 0 && (
                  <span className="ml-1.5 text-xs bg-amber-100 text-amber-700 rounded-full px-1.5">{pendentes}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {data?.missing && (
          <div className="flex items-start gap-3 m-4 p-3 rounded-xl bg-amber-50 border border-amber-100 text-sm text-amber-800">
            <AlertTriangle size={18} className="shrink-0 mt-0.5" />
            <span>A tabela de solicitações ainda não existe no banco. Rode a migração <b>062_cadastro_solicitacoes.sql</b> no Supabase (SQL Editor).</span>
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-gray-400">
            <Loader2 size={20} className="animate-spin mr-2" /> Carregando...
          </div>
        ) : lista.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <CheckCircle2 size={34} className="mb-2 text-green-300" />
            <p className="text-sm">Nenhum pedido {status === 'todas' ? '' : STATUS_LABEL[status]?.toLowerCase()} por aqui.</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {lista.map(s => {
              const ent = ENTIDADES[s.entity] || ENTIDADES.cliente;
              const Icon = ent.icon;
              const nMud = (s.changes || []).length;
              const nDoc = (s.attachments || []).length;
              return (
                <li key={s.id} onClick={() => { setAberta(s); setAcao(null); setNota(''); }}
                  className="flex items-start gap-3 p-4 hover:bg-gray-50 cursor-pointer transition-colors">
                  <span className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
                    <Icon size={16} className="text-gray-500" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 text-sm break-words">
                      {s.entity_name || '(sem nome)'}
                      <span className={`badge ${ent.badge} ml-2 align-middle`}>{ent.label}</span>
                      <span className={`badge ${STATUS_BADGE[s.status]} ml-1 align-middle`}>{STATUS_LABEL[s.status]}</span>
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {maskDoc(s.doc_digits)} · pedido por <b className="text-gray-500 font-medium">{s.requested_by?.name || '—'}</b>
                      {s.requested_by?.cargo ? ` (${s.requested_by.cargo})` : ''} · {dt(s.created_at)}
                    </p>
                    <p className="text-xs text-gray-500 mt-1 flex flex-wrap gap-x-3 gap-y-1">
                      <span>{nMud} {nMud === 1 ? 'campo alterado' : 'campos alterados'}</span>
                      {nDoc > 0 && <span className="inline-flex items-center gap-1 text-violet-600"><Paperclip size={11} /> {nDoc} documento{nDoc > 1 ? 's' : ''}</span>}
                      {s.note && <span className="italic text-gray-400 truncate max-w-xs">“{s.note}”</span>}
                    </p>
                  </div>
                  {s.status === 'pendente' && <Clock size={15} className="text-amber-400 shrink-0 mt-1" />}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Detalhe do pedido */}
      <Modal isOpen={!!aberta} onClose={() => { setAberta(null); setAcao(null); }} size="lg"
        title={aberta ? `${ENTIDADES[aberta.entity]?.label || 'Cadastro'} — pedido de alteração` : ''}>
        {aberta && (
          <div className="space-y-4">
            <div className="bg-gray-50 rounded-xl p-4 text-sm space-y-1">
              <p className="font-semibold text-gray-800 break-words">{aberta.entity_name || '(sem nome)'}</p>
              <p className="text-gray-500">{maskDoc(aberta.doc_digits)}</p>
              <p className="text-gray-500">
                Pedido por <b className="text-gray-700">{aberta.requested_by?.name || '—'}</b>
                {aberta.requested_by?.cargo ? ` — ${aberta.requested_by.cargo}` : ''}
                {aberta.requested_by?.cpf ? ` · CPF ${maskDoc(aberta.requested_by.cpf)}` : ''}
              </p>
              <p className="text-gray-400 text-xs">{dt(aberta.created_at)}</p>
              {aberta.note && <p className="text-gray-600 italic pt-1">“{aberta.note}”</p>}
            </div>

            <div>
              <p className="text-sm font-semibold text-gray-700 mb-1">O que muda</p>
              {(aberta.changes || []).length === 0 ? (
                <p className="text-sm text-gray-400 py-2">Nenhum dado alterado — o pedido é só para anexar documento.</p>
              ) : (
                <div className="border border-gray-200 rounded-xl px-4 py-2">
                  {aberta.changes.map((c, i) => <LinhaMudanca key={i} c={c} />)}
                </div>
              )}
            </div>

            {(aberta.attachments || []).length > 0 && (
              <div>
                <p className="text-sm font-semibold text-gray-700 mb-1 flex items-center gap-1.5">
                  <Paperclip size={14} /> Documentos anexados
                </p>
                <ul className="space-y-1.5">
                  {aberta.attachments.map(a => (
                    <li key={a.id} className="flex items-center gap-2 border border-gray-200 rounded-xl px-3 py-2">
                      <FileText size={15} className="text-gray-400 shrink-0" />
                      <a href={a.url} target="_blank" rel="noreferrer"
                        className="text-sm text-primary-600 hover:underline truncate flex-1">{a.name}</a>
                      <span className="text-xs text-gray-400 shrink-0">{a.kind} · {kb(a.size)}</span>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-gray-400 mt-1">Ao rejeitar, os arquivos são apagados.</p>
              </div>
            )}

            {aberta.status !== 'pendente' ? (
              <div className={`rounded-xl p-3 text-sm ${aberta.status === 'aprovada' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
                {STATUS_LABEL[aberta.status]} por <b>{aberta.reviewed_by_name || '—'}</b> em {dt(aberta.reviewed_at)}
                {aberta.review_note && <p className="italic mt-1">“{aberta.review_note}”</p>}
              </div>
            ) : acao ? (
              <div className="border-t border-gray-100 pt-4 space-y-3">
                <label className="label">
                  {acao === 'approve' ? 'Observação (opcional)' : 'Motivo da rejeição *'}
                </label>
                <textarea className="input" rows={2} value={nota} autoFocus
                  onChange={e => setNota(e.target.value)}
                  placeholder={acao === 'approve' ? 'Ex.: conferido por telefone com o cliente' : 'Ex.: não conseguimos confirmar quem pediu'} />
                <div className="flex gap-2 justify-end">
                  <button onClick={() => { setAcao(null); setNota(''); }} className="btn-secondary">Voltar</button>
                  <button onClick={confirmar} disabled={mut.isPending}
                    className={`text-white font-medium px-4 py-2 rounded-xl flex items-center gap-2 disabled:opacity-50 ${
                      acao === 'approve' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}`}>
                    {mut.isPending ? <Loader2 size={15} className="animate-spin" /> : acao === 'approve' ? <CheckCircle2 size={15} /> : <XCircle size={15} />}
                    {acao === 'approve' ? 'Confirmar aprovação' : 'Confirmar rejeição'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2 justify-end border-t border-gray-100 pt-4">
                <button onClick={() => setAcao('reject')}
                  className="border border-red-200 text-red-600 hover:bg-red-50 font-medium px-4 py-2 rounded-xl flex items-center gap-2">
                  <XCircle size={15} /> Rejeitar
                </button>
                <button onClick={() => setAcao('approve')}
                  className="bg-green-600 hover:bg-green-700 text-white font-medium px-4 py-2 rounded-xl flex items-center gap-2">
                  <CheckCircle2 size={15} /> Aprovar e gravar
                </button>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
