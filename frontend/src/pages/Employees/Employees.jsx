import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Edit2, Briefcase, MessageCircle, UserCheck, UserX } from 'lucide-react';
import api from '@/lib/api';
import { Table, Pagination } from '@/components/UI/Table';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const SETOR_COLORS = {
  GRAVAÇÃO:     'bg-orange-100 text-orange-700',
  MARKETING:    'bg-pink-100 text-pink-700',
  LOGÍSTICA:    'bg-blue-100 text-blue-700',
  DESIGNER:     'bg-purple-100 text-purple-700',
  VENDAS:       'bg-green-100 text-green-700',
  FINANCEIRO:   'bg-yellow-100 text-yellow-700',
  ALMOXARIFADO: 'bg-gray-100 text-gray-700',
  QUALIDADE:    'bg-teal-100 text-teal-700',
};

function whatsappLink(phone, name) {
  if (!phone) return null;
  const num  = phone.replace(/\D/g, '');
  const full = num.startsWith('55') ? num : `55${num}`;
  return `https://wa.me/${full}?text=${encodeURIComponent(`Olá ${name}!`)}`;
}

function fmtDate(d) {
  if (!d) return '—';
  try { return format(parseISO(d), 'dd/MM/yyyy', { locale: ptBR }); } catch { return d; }
}

export default function Employees() {
  const [page, setPage]             = useState(1);
  const [search, setSearch]         = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [statusFilter, setStatusFilter] = useState(''); // '' | 'active' | 'inactive'
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ['employees', page, search, statusFilter],
    queryFn: () => {
      let url = `/customers?type=CO&page=${page}&limit=20`;
      if (search) url += `&search=${encodeURIComponent(search)}`;
      if (statusFilter === 'active')   url += `&is_active=true`;
      if (statusFilter === 'inactive') url += `&is_active=false`;
      return api.get(url);
    },
  });

  function handleSearch(e) { e.preventDefault(); setSearch(searchInput); setPage(1); }
  function clearSearch()   { setSearch(''); setSearchInput(''); setPage(1); }

  // O cadastro do colaborador é uma TELA, não um modal: são cinco
  // etapas, documentos e permissões — nada disso cabe numa janelinha.
  function openNew()     { navigate('/employees/novo'); }
  function openEdit(emp) { navigate(`/employees/${emp.id}`); }

  const total     = data?.total || 0;
  const ativos    = data?.data?.filter(e => e.is_active).length ?? 0;

  const columns = [
    {
      key: 'display_id', label: '#', width: 55,
      render: v => <span className="text-xs font-mono text-gray-400 font-semibold">{v || '—'}</span>,
    },
    {
      key: 'name', label: 'Colaborador',
      render: (v, row) => (
        <div>
          {/* A linha inteira abre o cadastro (ver o onRowClick da Table
              la embaixo). O sublinhado no hover existe porque o nome e
              onde a pessoa mira: sem ele, a unica pista de que da para
              clicar era o cursor mudar. */}
          <p className="font-medium text-gray-900 text-sm group-hover:underline">{v}</p>
          {row.cpf_cnpj && <p className="text-xs text-gray-400">{row.cpf_cnpj}</p>}
        </div>
      ),
    },
    {
      key: 'admission_data', label: 'Setor', width: 140,
      render: v => {
        const s = v?.sector;
        if (!s) return <span className="text-gray-300 text-xs">—</span>;
        return <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${SETOR_COLORS[s] || 'bg-gray-100 text-gray-600'}`}>{s}</span>;
      },
    },
    {
      key: 'admission_data', label: 'Escala', width: 150,
      render: v => <span className="text-sm text-gray-600">{v?.scale || '—'}</span>,
    },
    {
      key: 'admission_data', label: 'Admissão', width: 110,
      render: v => <span className="text-sm text-gray-600">{fmtDate(v?.start_date)}</span>,
    },
    {
      key: 'phone', label: 'Telefone', width: 150,
      render: (v, row) => {
        if (!v) return <span className="text-gray-300 text-xs">—</span>;
        const link = whatsappLink(v, row.name);
        return link
          ? <a href={link} target="_blank" rel="noreferrer"
              onClick={e => e.stopPropagation()}
              className="flex items-center gap-1 text-green-600 hover:text-green-700 text-sm font-medium">
              <MessageCircle size={13}/> {v}
            </a>
          : v;
      },
    },
    {
      key: 'is_active', label: 'Status', width: 80,
      render: v => (
        <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${v ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
          {v ? <UserCheck size={11}/> : <UserX size={11}/>}
          {v ? 'Ativo' : 'Inativo'}
        </span>
      ),
    },
    {
      key: 'id', label: '', width: 50,
      render: (_, row) => (
        <button onClick={e => { e.stopPropagation(); openEdit(row); }}
          className="btn-ghost p-1.5" title="Abrir cadastro">
          <Edit2 size={14}/>
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="page-header">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-indigo-100 rounded-lg flex items-center justify-center">
            <Briefcase size={18} className="text-indigo-600"/>
          </div>
          <div>
            <h1 className="page-title">Colaboradores</h1>
            <p className="text-sm text-gray-500 mt-0.5">{total} cadastrado{total !== 1 ? 's' : ''} · {ativos} ativo{ativos !== 1 ? 's' : ''}</p>
          </div>
        </div>
        <button onClick={openNew} className="btn-primary">
          <Plus size={16}/> Novo Colaborador
        </button>
      </div>

      {/* Tabela */}
      <div className="card">
        <div className="card-header flex flex-wrap items-center gap-3">

          {/* Filtro status */}
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            {[
              { v: '',         l: 'Todos'    },
              { v: 'active',   l: '✅ Ativos'  },
              { v: 'inactive', l: '⛔ Inativos' },
            ].map(f => (
              <button key={f.v} onClick={() => { setStatusFilter(f.v); setPage(1); }}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  statusFilter === f.v
                    ? 'bg-white shadow text-indigo-700'
                    : 'text-gray-500 hover:text-gray-800'
                }`}>
                {f.l}
              </button>
            ))}
          </div>

          {/* Busca */}
          <form onSubmit={handleSearch} className="flex gap-2 flex-1 max-w-sm ml-auto">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
              <input
                type="text"
                placeholder="Nome, CPF ou #ID..."
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                className="input pl-9 text-sm"
              />
            </div>
            <button type="submit" className="btn-secondary text-sm">Buscar</button>
            {search && (
              <button type="button" onClick={clearSearch} className="text-xs text-gray-400 hover:text-gray-600">
                Limpar
              </button>
            )}
          </form>
        </div>

        {/* CLICAR NA LINHA ABRE O COLABORADOR.
            A Table ja sabia fazer isto (onRowClick) e esta tela nao
            usava: o unico caminho ate o cadastro era o lapis de 14px na
            ponta direita. Pior, a linha ja vinha com cursor-pointer,
            entao ela parecia clicavel e nao era.
            O WhatsApp e o lapis param a propagacao para nao abrirem
            duas coisas de uma vez. */}
        <Table columns={columns} data={data?.data} loading={isLoading}
          onRowClick={openEdit} rowClassName={() => 'group'} />
        <Pagination page={page} total={total} limit={20} onPageChange={setPage}/>
      </div>

    </div>
  );
}
