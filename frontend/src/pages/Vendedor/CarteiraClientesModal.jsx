// ============================================================
// TELA 3 — Carteira de Clientes / Top compradores
//
// Abre pelo olhinho da Carteira. A lista nasce dos pedidos DO VENDEDOR,
// então ele nunca enxerga cliente de outra carteira; o território, quando
// cadastrado, aperta mais um pouco.
//
// Daqui saem três caminhos: falar no WhatsApp (um a um), abrir o fluxo
// de orçamento daquele cliente (a flecha azul — que leva à conferência,
// nunca envia sozinha) ou marcar vários e criar oferta (Tela 4).
// ============================================================
import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Users, X, Search, ArrowUpDown, Calendar, MessageCircle, ArrowRight, Send, Info,
} from 'lucide-react';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { useVend, fmtUn, fmtDate } from './ui';

const TOPS = [10, 20, 30, 50];

function waLink(phone, name) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return null;
  const full = (digits.startsWith('55') ? '' : '55') + digits;
  return `https://wa.me/${full}?text=${encodeURIComponent(`Olá ${name || ''}, tudo bem?`)}`;
}

// Ordenações da tabela. Cada uma devolve o comparador da coluna.
const ORDENACOES = {
  name:         (a, b) => (a.name || '').localeCompare(b.name || ''),
  city:         (a, b) => `${a.uf || ''}${a.city || ''}`.localeCompare(`${b.uf || ''}${b.city || ''}`),
  last_date:    (a, b) => String(b.last_date || '').localeCompare(String(a.last_date || '')),
  last_units:   (a, b) => (b.last_units || 0) - (a.last_units || 0),
  last_product: (a, b) => (a.last_product || '').localeCompare(b.last_product || ''),
  units:        (a, b) => (b.units || 0) - (a.units || 0),
};

export default function CarteiraClientesModal({ open, onClose, month, sellerId, produtoInicial, onCriarOferta }) {
  const v = useVend();
  const navigate = useNavigate();

  const [busca, setBusca]   = useState('');
  const [uf, setUf]         = useState('');
  const [produto, setProduto] = useState('');
  const [top, setTop]       = useState(10);
  const [ordem, setOrdem]   = useState('units');
  const [sel, setSel]       = useState([]);   // ids marcados

  // Vindo da Tela 2 ("Criar oferta" no produto líder), a lista já abre
  // filtrada por aquela LINHA — categoria e volume, todas as cores.
  useEffect(() => {
    if (open && produtoInicial?.key) setProduto(produtoInicial.key);
  }, [open, produtoInicial]);

  useEffect(() => { if (!open) { setSel([]); setBusca(''); } }, [open]);

  const params = new URLSearchParams({ month, top: String(top) });
  if (sellerId) params.set('user_id', sellerId);
  if (uf) params.set('uf', uf);
  if (produto) params.set('line', produto);

  const { data, isLoading } = useQuery({
    queryKey: ['vendedor-carteira', month, sellerId, top, uf, produto],
    queryFn: () => api.get(`/vendedor/carteira?${params.toString()}`),
    enabled: open,
  });

  // A busca por nome roda no cliente: a lista já cabe na tela e o
  // vendedor vê o resultado enquanto digita, sem ida ao servidor.
  const clientes = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const base = (data?.customers || []).filter(c => !termo || (c.name || '').toLowerCase().includes(termo));
    return [...base].sort(ORDENACOES[ordem] || ORDENACOES.units);
  }, [data, busca, ordem]);

  if (!open) return null;

  const marcados = clientes.filter(c => sel.includes(c.customer_id));
  const todosMarcados = clientes.length > 0 && marcados.length === clientes.length;

  function toggle(id) {
    setSel(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  }
  function toggleTodos() {
    setSel(todosMarcados ? [] : clientes.map(c => c.customer_id));
  }

  function criarOferta() {
    if (!marcados.length) { toast.error('Selecione ao menos um cliente'); return; }
    onCriarOferta?.(marcados, produtoInicial || null);
  }

  const Th = ({ campo, children, className = '' }) => (
    <button onClick={() => setOrdem(campo)}
      className={`flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider hover:opacity-80 ${className}`}
      style={{ color: ordem === campo ? '#60a5fa' : v.textSubtle }}>
      {children} <ArrowUpDown size={11} />
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-0 sm:p-6 overflow-y-auto">
      <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-6xl my-auto flex flex-col" style={{ ...v.card, maxHeight: '94vh' }}>

        {/* Cabeçalho */}
        <div className="flex items-start justify-between gap-3 px-5 py-4 shrink-0"
          style={{ borderBottom: `1px solid ${v.divider}` }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
              style={{ background: 'rgba(59,130,246,0.16)' }}>
              <Users size={20} style={{ color: '#60a5fa' }} />
            </div>
            <div>
              <h2 className="text-xl font-bold" style={{ color: v.textPrimary }}>
                Carteira de Clientes — Top compradores
              </h2>
              <p className="text-sm" style={{ color: v.textSubtle }}>
                Veja os clientes que mais compram com você e crie ofertas personalizadas.
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:opacity-70" style={{ color: v.textMuted }}>
            <X size={20} />
          </button>
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap items-center gap-2 px-5 py-3 shrink-0">
          <div className="relative flex-1 min-w-[180px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: v.textSubtle }} />
            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar cliente..."
              style={{ ...v.control, paddingLeft: '2.25rem', width: '100%' }} />
          </div>
          <label className="flex items-center gap-2 text-sm" style={{ color: v.textMuted }}>
            UF
            <select value={uf} onChange={e => setUf(e.target.value)} style={v.control}>
              <option value="">Todas</option>
              {(data?.ufs || []).map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm" style={{ color: v.textMuted }}>
            Produto
            <select value={produto} onChange={e => setProduto(e.target.value)} style={{ ...v.control, maxWidth: 220 }}>
              <option value="">Todos</option>
              {(data?.products || []).map(p => (
                <option key={p.key} value={p.key}>{p.name}</option>
              ))}
            </select>
          </label>
          <select value={top} onChange={e => setTop(Number(e.target.value))} style={v.control} title="Tamanho da carteira">
            {TOPS.map(t => <option key={t} value={t}>Top {t}</option>)}
          </select>
        </div>

        {/* Tabela */}
        <div className="flex-1 overflow-auto px-5">
          {isLoading ? (
            <div className="flex items-center justify-center h-40">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
            </div>
          ) : clientes.length === 0 ? (
            <p className="text-center py-14 text-sm" style={{ color: v.empty }}>
              Nenhum cliente encontrado com estes filtros.
            </p>
          ) : (
            <div style={{ minWidth: 880 }}>
              {/* Cabeçalho da tabela */}
              <div className="flex items-center gap-3 px-3 py-2 sticky top-0 z-10"
                style={{ background: v.isDark ? 'rgba(17,17,27,0.92)' : '#ffffff', borderBottom: `1px solid ${v.divider}` }}>
                <input type="checkbox" checked={todosMarcados} onChange={toggleTodos}
                  className="w-4 h-4 accent-blue-600 shrink-0" title="Selecionar todos" />
                <span className="flex-1 min-w-0"><Th campo="name">Cliente</Th></span>
                <span className="w-40 shrink-0"><Th campo="city">Cidade / UF</Th></span>
                <span className="w-32 shrink-0"><Th campo="last_date">Última compra</Th></span>
                <span className="w-28 shrink-0"><Th campo="last_units" className="justify-end">Quantidade</Th></span>
                <span className="w-52 shrink-0"><Th campo="last_product">Último produto</Th></span>
                <span className="w-20 text-center text-[10px] font-semibold uppercase tracking-wider shrink-0"
                  style={{ color: v.textSubtle }}>WhatsApp</span>
                <span className="w-24 text-center text-[10px] font-semibold uppercase tracking-wider shrink-0"
                  style={{ color: v.textSubtle }}>Orçamento</span>
              </div>

              {clientes.map(c => {
                const wa = waLink(c.phone, c.name);
                const marcado = sel.includes(c.customer_id);
                return (
                  <div key={c.customer_id}
                    className="flex items-center gap-3 px-3 py-2.5 text-sm"
                    style={{ borderBottom: `1px solid ${v.divider}`,
                             background: marcado ? 'rgba(59,130,246,0.08)' : 'transparent' }}>
                    <input type="checkbox" checked={marcado} onChange={() => toggle(c.customer_id)}
                      className="w-4 h-4 accent-blue-600 shrink-0" />
                    <span className="flex-1 min-w-0 truncate" style={{ color: v.textPrimary }}>
                      {c.name}
                      <span className="ml-2 text-[11px]" style={{ color: v.textSubtle }}>
                        {fmtUn(c.units)} un no período
                      </span>
                    </span>
                    <span className="w-40 shrink-0 truncate" style={{ color: v.textMuted }}>
                      {c.city ? `${c.city} / ${c.uf || '—'}` : (c.uf || '—')}
                    </span>
                    <span className="w-32 shrink-0 flex items-center gap-1.5" style={{ color: v.textMuted }}>
                      <Calendar size={12} className="shrink-0" /> {fmtDate(c.last_date)}
                    </span>
                    <span className="w-28 shrink-0 text-right font-semibold" style={{ color: v.textPrimary }}>
                      {fmtUn(c.last_units)} un
                    </span>
                    <span className="w-52 shrink-0 truncate" style={{ color: v.textMuted }}>
                      {c.last_product || '—'}
                    </span>
                    <span className="w-20 shrink-0 flex justify-center">
                      {wa ? (
                        <a href={wa} target="_blank" rel="noreferrer" title={`Falar com ${c.name}`}
                          className="w-8 h-8 rounded-lg flex items-center justify-center"
                          style={{ background: '#16a34a', color: 'white' }}>
                          <MessageCircle size={15} />
                        </a>
                      ) : (
                        <span className="text-[10px]" style={{ color: v.textSubtle }} title="Cliente sem telefone cadastrado">
                          sem tel.
                        </span>
                      )}
                    </span>
                    <span className="w-24 shrink-0 flex justify-center">
                      <button
                        onClick={() => navigate(`/quotes/new?customer_id=${c.customer_id}`)}
                        title="Abrir orçamento para este cliente (você confere antes de enviar)"
                        className="w-8 h-8 rounded-lg flex items-center justify-center"
                        style={{ background: '#2563eb', color: 'white' }}>
                        <ArrowRight size={15} />
                      </button>
                    </span>
                  </div>
                );
              })}

              <p className="text-[11px] py-3 flex items-center gap-1.5" style={{ color: v.textSubtle }}>
                <Info size={12} className="shrink-0" />
                Ranking por quantidade total comprada nos últimos {data?.period?.months || 12} meses.
                {data?.territory?.length ? ` Território: ${data.territory.join(', ')}.` : ''}
              </p>
            </div>
          )}
        </div>

        {/* Rodapé */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 shrink-0"
          style={{ borderTop: `1px solid ${v.divider}` }}>
          <p className="text-sm flex items-center gap-2" style={{ color: v.textMuted }}>
            <Info size={14} style={{ color: '#60a5fa' }} />
            {marcados.length
              ? `${marcados.length} cliente(s) selecionado(s)`
              : 'Selecione um ou mais clientes para criar oferta'}
          </p>
          <button onClick={criarOferta} disabled={!marcados.length} className="btn-primary">
            <Send size={15} /> Criar oferta
          </button>
        </div>
      </div>
    </div>
  );
}
