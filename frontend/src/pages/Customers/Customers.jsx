import { useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { Plus, Search, Edit2, Eye, Star, MessageCircle, Megaphone, Trash2, Loader2, Instagram, Contact, ShieldCheck, AlertTriangle, CheckCircle2, Ban, RefreshCw } from 'lucide-react';
import api from '@/lib/api';
import { Table, Pagination } from '@/components/UI/Table';
import Modal from '@/components/UI/Modal';
import CustomerForm from './CustomerForm';
import MarketingModal from './MarketingModal';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { id4 } from '@/lib/ids';
import CopyLinkButton from '@/components/UI/CopyLinkButton';
import toast from 'react-hot-toast';

const TYPE_LABELS = { PF: 'PF', PJ: 'PJ', CO: 'Colab.' };
const TYPE_BADGE  = { PF: 'badge-gray', PJ: 'badge-blue', CO: 'badge-purple' };

function StarDisplay({ value }) {
  if (!value) return <span className="text-gray-300 text-xs">—</span>;
  return (
    <div className="flex gap-0.5">
      {[1,2,3,4,5].map(n => (
        <Star key={n} size={12} className={n <= value ? 'text-yellow-400 fill-yellow-400' : 'text-gray-200'} />
      ))}
    </div>
  );
}

function whatsappLink(phone, name) {
  if (!phone) return null;
  const num = phone.replace(/\D/g, '');
  const full = num.startsWith('55') ? num : `55${num}`;
  return `https://wa.me/${full}?text=${encodeURIComponent(`Olá ${name}, tudo bem?`)}`;
}

const FILTERS = [
  { value: 'cliente', label: 'Clientes' },
];

const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

export default function Customers() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [typeFilter, setTypeFilter] = useState('cliente');
  const [ratingFilter, setRatingFilter] = useState(null);
  const [stateFilter, setStateFilter] = useState('');
  const [marketingOpen, setMarketingOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [delTarget, setDelTarget] = useState(null);
  const [delPassword, setDelPassword] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [exportingContacts, setExportingContacts] = useState(false);
  const [scoreCustomer, setScoreCustomer] = useState(null); // cliente do modal de score
  const [selectedId, setSelectedId] = useState(null); // linha marcada ao clicar no cliente

  const scoreMut = useMutation({
    mutationFn: (cid) => api.post(`/customers/${cid}/credit-check`),
    onError: e => toast.error(e.error || 'Não foi possível consultar'),
  });

  const recomputeMut = useMutation({
    mutationFn: () => api.post('/customers/recompute-ratings'),
    onSuccess: (r) => { toast.success(`Estrelas recalculadas (${r.customers || 0} clientes)`); qc.invalidateQueries(['customers']); },
    onError: e => toast.error(e.error || 'Erro ao recalcular'),
  });
  function consultarScore(row) {
    setScoreCustomer(row);
    scoreMut.reset();
    scoreMut.mutate(row.id);
  }

  async function exportContacts() {
    setExportingContacts(true);
    try {
      const vcf = await api.get('/customers/export-contacts', { responseType: 'text' });
      const blob = new Blob([vcf], { type: 'text/vcard;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `clientes-lyon-${new Date().toISOString().slice(0, 10)}.vcf`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      toast.success('Contatos exportados! Importe em contacts.google.com → Importar.');
    } catch (e) {
      toast.error(e.error || 'Erro ao exportar contatos');
    } finally { setExportingContacts(false); }
  }

  async function handleDelete() {
    if (!delTarget || !delPassword) return;
    setDeleting(true);
    try {
      await api.post(`/customers/${delTarget.id}/delete`, { password: delPassword });
      toast.success('Cliente excluído');
      setDelTarget(null); setDelPassword('');
      qc.invalidateQueries(['customers']);
    } catch (e) { toast.error(e.error || 'Erro ao excluir'); }
    finally { setDeleting(false); }
  }

  const { data, isLoading } = useQuery({
    queryKey: ['customers', page, search, typeFilter, ratingFilter, stateFilter],
    queryFn: () => {
      let url = `/customers?page=${page}&limit=100`;
      if (search)       url += `&search=${encodeURIComponent(search)}`;
      if (typeFilter)   url += `&type=${typeFilter}`;
      if (ratingFilter) url += `&rating=${ratingFilter}`;
      if (stateFilter)  url += `&state=${stateFilter}`;
      return api.get(url);
    },
    // Atualiza sozinho: novos cadastros (ex.: cliente que se cadastra na loja)
    // aparecem sem precisar dar F5. Só enquanto a aba está visível.
    refetchInterval: 20000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });

  function handleSearch(e) {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  }

  function applyFilter(val) {
    setTypeFilter(val);
    setPage(1);
  }

  function applyRating(val) {
    setRatingFilter(prev => prev === val ? null : val);
    setPage(1);
  }

  function openNew() { setEditing(null); setModalOpen(true); }
  function openEdit(c) { setEditing(c); setModalOpen(true); }
  function closeModal() { setModalOpen(false); setEditing(null); }
  function onSaved() { closeModal(); qc.invalidateQueries(['customers']); }

  const columns = [
    { key: 'display_id', label: 'Código', width: 70,
      render: v => <span className="text-xs font-mono text-gray-500 font-semibold">{id4(v)}</span>
    },
    { key: 'type', label: 'Tipo', width: 65,
      render: v => <span className={`badge ${TYPE_BADGE[v] || 'badge-gray'}`}>{TYPE_LABELS[v] || v}</span>
    },
    { key: 'name', label: 'Nome',
      render: (v, row) => {
        const primeiroNome = String(v || '').trim().split(/\s+/)[0] || v;
        return (
          <div>
            <p title={v} className="font-medium text-gray-900 text-sm flex items-center gap-1.5 whitespace-nowrap">
              {row.blocked && (
                <span title={row.block_reason || 'Cliente bloqueado / com problemas'} className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-red-100 text-red-600 shrink-0">
                  <Ban size={11} />
                </span>
              )}
              {row.notes && String(row.notes).trim() && (
                <span title={row.notes} className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-amber-100 text-amber-600 shrink-0">
                  <AlertTriangle size={11} />
                </span>
              )}
              {primeiroNome}
            </p>
            {row.nome_fantasia && <p className="text-xs text-gray-400 whitespace-nowrap">{row.nome_fantasia}</p>}
          </div>
        );
      }
    },
    { key: 'credit_limit', label: 'Limite de Crédito', width: 140,
      render: v => v > 0
        ? <span className="text-sm text-gray-700">R$ {Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}</span>
        : <span className="text-gray-300 text-xs">—</span>
    },
    { key: 'cpf_cnpj', label: 'CPF/CNPJ', width: 130,
      render: v => <span className="text-xs font-mono whitespace-nowrap">{v || '—'}</span>
    },
    { key: 'phone', label: 'Telefone', width: 130,
      render: (v, row) => {
        if (!v) return '—';
        // Exibe sem pontuação para não quebrar o layout
        const digits = v.replace(/\D/g, '');
        const compact = digits.length >= 10
          ? digits.replace(/^(\d{2})(\d{4,5})(\d{4})$/, '$1 $2-$3')
          : digits;
        const link = whatsappLink(v, row.name);
        return link ? (
          <a href={link} target="_blank" rel="noreferrer"
            className="flex items-center gap-1 text-green-600 hover:text-green-700 text-sm font-medium whitespace-nowrap">
            <MessageCircle size={13} /> {compact}
          </a>
        ) : <span className="whitespace-nowrap">{compact}</span>;
      }
    },
    { key: 'instagram', label: 'Instagram', width: 130,
      render: (v) => {
        const handle = String(v || '').trim()
          .replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/[/?].*$/, '').replace(/^@/, '');
        if (!handle) return <span className="text-gray-300">—</span>;
        return (
          <a href={`https://instagram.com/${handle}`} target="_blank" rel="noreferrer"
            onClick={e => e.stopPropagation()}
            className="inline-flex items-center gap-1 text-pink-600 hover:text-pink-700 text-sm font-medium whitespace-nowrap"
            title="Abrir Instagram do cliente">
            <Instagram size={13} /> @{handle}
          </a>
        );
      }
    },
    { key: 'rating', label: '⭐', width: 100,
      render: (v, row) => (
        <div>
          <StarDisplay value={v} />
          {row.total_12m > 0 && (
            <p className="text-[10px] text-gray-400 mt-0.5 whitespace-nowrap" title="Total comprado nos últimos 12 meses">
              R$ {Number(row.total_12m).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}/12m
            </p>
          )}
        </div>
      )
    },
    { key: 'is_active', label: 'Status', width: 70,
      render: v => <span className={`badge ${v ? 'badge-green' : 'badge-gray'}`}>{v ? 'Ativo' : 'Inativo'}</span>
    },
    { key: 'id', label: '', width: 110,
      render: (_, row) => (
        <div className="flex gap-1">
          <button onClick={() => consultarScore(row)} className="btn-ghost p-1.5 text-indigo-500 hover:text-indigo-700" title="Consultar score / crédito">
            <ShieldCheck size={14} />
          </button>
          <button onClick={() => navigate(`/customers/${row.id}`)} className="btn-ghost p-1.5" title="Ver detalhes">
            <Eye size={14} />
          </button>
          <button onClick={() => openEdit(row)} className="btn-ghost p-1.5" title="Editar">
            <Edit2 size={14} />
          </button>
          {isAdmin && (
            <button onClick={() => { setDelTarget(row); setDelPassword(''); }} className="btn-ghost p-1.5 text-red-400 hover:text-red-600" title="Excluir cliente">
              <Trash2 size={14} />
            </button>
          )}
        </div>
      )
    },
  ];

  return (
    <div className="space-y-4">
      <div className="page-header">
        <div>
          <h1 className="page-title">Clientes</h1>
          <p className="text-sm text-gray-500 mt-1">{data?.total || 0} cadastrados</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => recomputeMut.mutate()} disabled={recomputeMut.isPending} className="btn-secondary disabled:opacity-50"
            title="Recalcula as estrelas dos clientes pelo total comprado nos últimos 12 meses (≥1mil=3★, ≥2mil=4★, ≥5mil=5★)">
            {recomputeMut.isPending ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />} Recalcular estrelas
          </button>
          <button onClick={exportContacts} disabled={exportingContacts} className="btn-secondary disabled:opacity-50"
            title="Baixa um arquivo .vcf com nome + código + telefone para importar no Google Contatos / celular">
            {exportingContacts ? <Loader2 size={16} className="animate-spin" /> : <Contact size={16} />} Exportar contatos
          </button>
          <CopyLinkButton path="/cadastro" />
          <button onClick={openNew} className="btn-primary"><Plus size={16} /> Novo</button>
        </div>
      </div>

      <div className="card">
        {/* Filtros */}
        <div className="card-header flex flex-wrap items-center gap-3">
          {/* Tipo */}
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            {FILTERS.map(f => (
              <button
                key={f.value}
                onClick={() => applyFilter(f.value)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  typeFilter === f.value
                    ? 'bg-white shadow text-primary-700'
                    : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Filtro por estrelas */}
          <div className="flex items-center gap-0.5 border border-gray-200 rounded-lg px-2 py-1.5">
            <span className="text-xs text-gray-400 mr-1.5 select-none">Avaliação:</span>
            {[1,2,3,4,5].map(n => (
              <button
                key={n}
                type="button"
                onClick={() => applyRating(n)}
                title={`${n} estrela${n > 1 ? 's' : ''}`}
                className="focus:outline-none transition-transform hover:scale-110"
              >
                <Star
                  size={17}
                  className={n === ratingFilter ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300 hover:text-yellow-300'}
                />
              </button>
            ))}
            {ratingFilter && (
              <button
                type="button"
                onClick={() => applyRating(null)}
                className="ml-1.5 text-gray-400 hover:text-gray-600 text-xs leading-none"
                title="Limpar filtro"
              >✕</button>
            )}
          </div>

          {/* Filtro por estado (UF) */}
          <select value={stateFilter} onChange={e => { setStateFilter(e.target.value); setPage(1); }}
            className="border border-gray-200 rounded-lg px-2 py-2 text-sm text-gray-600" title="Filtrar por estado">
            <option value="">Todos os estados</option>
            {UFS.map(uf => <option key={uf} value={uf}>{uf}</option>)}
          </select>

          {/* Botão Marketing */}
          <button
            onClick={() => setMarketingOpen(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100 text-sm font-medium transition-colors"
          >
            <Megaphone size={15} /> Marketing
          </button>

          <form onSubmit={handleSearch} className="flex gap-2 flex-1 max-w-sm ml-auto">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Nome, CPF, telefone ou #ID..."
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                className="input pl-9 text-sm"
              />
            </div>
            <button type="submit" className="btn-secondary text-sm">Buscar</button>
            {search && (
              <button type="button" onClick={() => { setSearch(''); setSearchInput(''); setPage(1); }}
                className="text-xs text-gray-400 hover:text-gray-600">
                Limpar
              </button>
            )}
          </form>
        </div>

        <Table columns={columns} data={data?.data} loading={isLoading}
          onRowClick={row => setSelectedId(prev => prev === row.id ? null : row.id)}
          rowClassName={row => row.id === selectedId
            ? '!bg-primary-50 shadow-[inset_3px_0_0_0_theme(colors.primary.600)]'
            : ''} />
        <Pagination page={page} total={data?.total || 0} limit={100} onPageChange={setPage} />
      </div>

      <MarketingModal isOpen={marketingOpen} onClose={() => setMarketingOpen(false)} />

      <Modal isOpen={modalOpen} onClose={closeModal}
        title={editing ? (editing.type === 'CO' ? 'Editar Colaborador' : 'Editar Cliente') : 'Novo Cadastro'}
        size="lg">
        <CustomerForm customer={editing} onSaved={onSaved} onCancel={closeModal} />
      </Modal>

      {/* Excluir cliente — admin + senha */}
      <Modal isOpen={!!delTarget} onClose={() => setDelTarget(null)} title="Excluir cliente" size="sm">
        <div className="space-y-4">
          <div className="flex items-start gap-3 bg-red-50 border border-red-100 rounded-xl p-3">
            <Trash2 size={18} className="text-red-500 mt-0.5 shrink-0" />
            <p className="text-sm text-gray-700">
              Você vai <b>excluir permanentemente</b> o cliente <b>{delTarget?.name}</b>. Esta ação não pode ser desfeita.
            </p>
          </div>
          <div>
            <label className="label">Confirme com sua senha de login</label>
            <input type="password" className="input" autoFocus value={delPassword}
              onChange={e => setDelPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleDelete()} placeholder="Sua senha" />
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setDelTarget(null)} className="btn-secondary">Cancelar</button>
            <button onClick={handleDelete} disabled={deleting || !delPassword}
              className="bg-red-600 hover:bg-red-700 text-white font-medium px-4 py-2 rounded-xl flex items-center gap-2 disabled:opacity-50">
              {deleting ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />} Excluir
            </button>
          </div>
        </div>
      </Modal>

      {/* Consulta de score/crédito a partir da lista */}
      <Modal isOpen={!!scoreCustomer} onClose={() => setScoreCustomer(null)} title="Consulta de crédito" size="sm">
        <div className="space-y-3">
          <p className="text-sm"><b>{scoreCustomer?.name}</b> <span className="text-gray-400">· {scoreCustomer?.cpf_cnpj || 'sem CPF'}</span></p>
          {scoreMut.isPending ? (
            <div className="flex items-center justify-center gap-2 py-6 text-gray-500"><Loader2 size={18} className="animate-spin" /> Consultando...</div>
          ) : scoreMut.isError ? (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{scoreMut.error?.error || 'Não foi possível consultar.'}</p>
          ) : scoreMut.data ? (
            <div className="border border-gray-200 rounded-xl p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-400">Score</p>
                  <p className="text-2xl font-bold">{scoreMut.data.score ?? '—'}
                    {scoreMut.data.score_faixa && <span className="text-sm text-gray-500 ml-2">{scoreMut.data.score_faixa}</span>}</p>
                </div>
                {scoreMut.data.negativado == null ? null : scoreMut.data.negativado ? (
                  <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-red-700 bg-red-50 rounded-lg px-3 py-1.5"><AlertTriangle size={15} /> Negativado</span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-green-700 bg-green-50 rounded-lg px-3 py-1.5"><CheckCircle2 size={15} /> Sem restrições</span>
                )}
              </div>
            </div>
          ) : null}
          <div className="flex justify-between items-center pt-2 border-t border-gray-100">
            <button onClick={() => navigate(`/customers/${scoreCustomer?.id}`)} className="text-xs text-primary-600 hover:underline">Ver ficha completa</button>
            <button onClick={() => scoreMut.mutate(scoreCustomer.id)} disabled={scoreMut.isPending} className="btn-secondary text-sm"><ShieldCheck size={14} /> Consultar de novo</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
