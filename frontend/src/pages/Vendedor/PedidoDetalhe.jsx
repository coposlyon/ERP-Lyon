// ============================================================
// Detalhe do pedido — versão do vendedor.
//
// A Tela 2 completa ainda vai ser especificada. Isto é o que sustenta o
// botão "Visualizar detalhes" enquanto isso: cliente, itens com a
// personalização, valores e a etapa atual.
//
// O que NÃO aparece: custo, margem, rateio e taxa administrativa. Não é
// só a tela que esconde — a rota /area-vendedor/pedidos/:id nem consulta
// esses campos.
// ============================================================
import { useQuery } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Package, User, Truck, FileText, Send, CheckCircle2,
  AlertTriangle, Siren, Calendar,
} from 'lucide-react';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { useVend, fmtBRL, fmtUn, fmtDate } from './ui';

const CORES = {
  cinza: '#94a3b8', amarelo: '#facc15', laranja: '#fb923c', azul: '#60a5fa',
  roxo: '#c084fc', rosa: '#f472b6', ciano: '#22d3ee', verde: '#4ade80', vermelho: '#f87171',
};
const SINAL = { normal: CheckCircle2, atencao: AlertTriangle, critico: Siren };
const SINAL_COR = { normal: '#22c55e', atencao: '#facc15', critico: '#ef4444' };

export default function PedidoDetalhe() {
  const v = useVend();
  const { id } = useParams();
  const navigate = useNavigate();

  const { data: p, isLoading, error } = useQuery({
    queryKey: ['pedido-vendedor', id],
    queryFn: () => api.get(`/area-vendedor/pedidos/${id}`),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ ...v.card, padding: '2rem' }} className="text-center">
        <p style={{ color: v.textPrimary }}>{error.error || 'Não foi possível abrir este pedido'}</p>
        <button onClick={() => navigate('/vendedor/pedidos')} className="btn-secondary mt-4 mx-auto">
          <ArrowLeft size={14} /> Voltar
        </button>
      </div>
    );
  }

  const Sinal = SINAL[p.atencao?.level] || CheckCircle2;
  const itens = p.VENDA_ITENS || [];
  const unidades = itens.reduce((s, i) => s + (Number(i.quantity) || 0), 0);

  const emBreve = qual => toast(`${qual} será uma tela própria, ainda em definição.`, { icon: '🚧' });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <button onClick={() => navigate('/vendedor/pedidos')} className="btn-secondary btn-sm mt-1">
            <ArrowLeft size={14} />
          </button>
          <div>
            <h1 className="text-2xl font-bold" style={{ color: v.textPrimary }}>{p.codigo}</h1>
            <p className="text-sm mt-0.5 flex items-center gap-2 flex-wrap" style={{ color: v.textSubtle }}>
              {p.origin && <span>Origem: {p.origin}</span>}
              <span>·</span>
              <span>{p.source === 'manual' ? 'lançado pelo vendedor' : 'lançado pelo cliente'}</span>
              <span>·</span>
              <span>{new Date(p.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span>
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => emBreve('A geração do comprovante')} className="btn-secondary btn-sm">
            <FileText size={14} /> Gerar comprovante
          </button>
          <button onClick={() => emBreve('O envio ao cliente')} className="btn btn-sm"
            style={{ background: '#16a34a', color: 'white' }}>
            <Send size={14} /> Enviar ao cliente
          </button>
        </div>
      </div>

      {/* Etapa e prazo */}
      <div style={{ ...v.card, padding: '1.15rem' }} className="flex flex-wrap items-center gap-4">
        <Sinal size={26} style={{ color: SINAL_COR[p.atencao?.level] || '#22c55e' }} className="shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold" style={{ color: CORES[p.status_cor] || v.textPrimary }}>
            {p.status_label}
          </p>
          <p className="text-[12px]" style={{ color: v.textMuted }}>
            {p.atencao?.reason || 'Sem pendências neste pedido'}
            {p.atencao?.areaLabel && ` · responsável: ${p.atencao.areaLabel}`}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[10px] uppercase tracking-wider" style={{ color: v.textSubtle }}>Saída prevista</p>
          <p className="font-semibold flex items-center gap-1.5" style={{ color: v.textPrimary }}>
            <Calendar size={13} /> {p.atencao?.due_date ? fmtDate(p.atencao.due_date) : 'não cadastrada'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Itens */}
        <div style={v.card} className="lg:col-span-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider px-4 py-3 flex items-center gap-1.5"
            style={{ color: v.textSubtle, borderBottom: `1px solid ${v.divider}` }}>
            <Package size={13} /> Itens do pedido — {fmtUn(unidades)} unidades
          </p>
          {itens.length === 0 ? (
            <p className="text-sm py-8 text-center" style={{ color: v.empty }}>Sem itens</p>
          ) : itens.map(i => (
            <div key={i.id} className="px-4 py-3" style={{ borderBottom: `1px solid ${v.divider}` }}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium" style={{ color: v.textPrimary }}>
                    {i.PRODUTOS?.name || i.product_name || 'Produto'}
                  </p>
                  {i.customization && (
                    <p className="text-[11px] mt-0.5" style={{ color: v.textSubtle }}>
                      {Object.entries(i.customization)
                        .filter(([, val]) => val)
                        .map(([k, val]) => `${k}: ${val}`).join(' · ')}
                    </p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold" style={{ color: v.textPrimary }}>{fmtBRL(i.total)}</p>
                  <p className="text-[11px]" style={{ color: v.textMuted }}>
                    {fmtUn(i.quantity)} × {fmtBRL(i.unit_price)}
                  </p>
                </div>
              </div>
            </div>
          ))}

          <div className="px-4 py-3 space-y-1 text-sm">
            <Linha v={v} rotulo="Produtos" valor={fmtBRL(p.subtotal)} />
            {Number(p.discount) > 0 && <Linha v={v} rotulo="Desconto" valor={`− ${fmtBRL(p.discount)}`} />}
            <Linha v={v} rotulo="Frete" valor={fmtBRL(p.freight)} />
            <div className="flex items-center justify-between pt-2" style={{ borderTop: `1px solid ${v.divider}` }}>
              <span className="font-semibold" style={{ color: v.textPrimary }}>Total</span>
              <span className="text-lg font-bold" style={{ color: '#22d3ee' }}>{fmtBRL(p.total)}</span>
            </div>
          </div>
        </div>

        {/* Cliente e entrega */}
        <div className="space-y-4">
          <div style={{ ...v.card, padding: '1.15rem' }}>
            <p className="text-[11px] font-semibold uppercase tracking-wider flex items-center gap-1.5 mb-2"
              style={{ color: v.textSubtle }}>
              <User size={13} /> Cliente
            </p>
            <p className="font-semibold" style={{ color: v.textPrimary }}>{p.CLIENTES?.name || 'Consumidor final'}</p>
            {p.codigo_cliente && (
              <p className="text-[11px] font-mono mt-0.5" style={{ color: v.textMuted }}>
                Código {p.codigo_cliente}
              </p>
            )}
            {(p.CLIENTES?.mobile || p.CLIENTES?.phone) && (
              <p className="text-sm mt-1" style={{ color: v.textMuted }}>
                {p.CLIENTES.mobile || p.CLIENTES.phone}
              </p>
            )}
            {p.CLIENTES?.address?.city && (
              <p className="text-sm" style={{ color: v.textMuted }}>
                {p.CLIENTES.address.city} / {p.CLIENTES.address.state || '—'}
              </p>
            )}
          </div>

          <div style={{ ...v.card, padding: '1.15rem' }}>
            <p className="text-[11px] font-semibold uppercase tracking-wider flex items-center gap-1.5 mb-2"
              style={{ color: v.textSubtle }}>
              <Truck size={13} /> Entrega
            </p>
            <div className="space-y-1 text-sm">
              <Linha v={v} rotulo="Saída prevista" valor={p.ship_date ? fmtDate(p.ship_date) : '—'} />
              <Linha v={v} rotulo="Entrega"        valor={p.delivery_date ? fmtDate(p.delivery_date) : '—'} />
              <Linha v={v} rotulo="Limite"         valor={p.max_delivery_date ? fmtDate(p.max_delivery_date) : '—'} />
            </div>
            {p.notes && <p className="text-[12px] mt-2" style={{ color: v.textMuted }}>{p.notes}</p>}
          </div>

          <p className="text-[11px] px-1" style={{ color: v.textSubtle }}>
            Alterar produto, quantidade, preço ou frete depende de autorização administrativa —
            toda mudança fica registrada com usuário, data, motivo e valor anterior.
          </p>
        </div>
      </div>
    </div>
  );
}

function Linha({ v, rotulo, valor }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span style={{ color: v.textMuted }}>{rotulo}</span>
      <span style={{ color: v.textPrimary }}>{valor}</span>
    </div>
  );
}
