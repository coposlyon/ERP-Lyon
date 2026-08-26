import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Plus, Search, Eye, ArrowRightCircle, FileText, Mail, MessageCircle, Image } from 'lucide-react';
import api from '@/lib/api';
import { generateQuotePng, parseQuoteNotes, downloadPng } from '@/lib/quotePng';
import { Table, Pagination } from '@/components/UI/Table';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import toast from 'react-hot-toast';

const STATUS = {
  open:      { label: 'Aberto',     cls: 'badge-blue' },
  sent:      { label: 'Enviado',    cls: 'badge-yellow' },
  approved:  { label: 'Aprovado',   cls: 'badge-green' },
  rejected:  { label: 'Recusado',   cls: 'badge-red' },
  expired:   { label: 'Expirado',   cls: 'badge-gray' },
  converted: { label: 'Convertido', cls: 'badge-purple' },
};

function fmt(v) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
}

/**
 * @param embutido  true quando esta lista é uma ABA de outra tela
 *   (Pagamentos da Loja). Aí o título da página não vem junto: a tela
 *   que hospeda já disse onde a pessoa está, e dois títulos empilhados
 *   é o que faz uma aba parecer uma página que abriu por engano.
 */
export default function Quotes({ embutido = false }) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['quotes', page, status],
    queryFn: () => api.get(`/quotes?page=${page}&limit=20${status ? `&status=${status}` : ''}`),
  });

  async function handleConvert(id) {
    if (!confirm('Converter este orçamento em pedido de venda?')) return;
    try {
      const res = await api.post(`/quotes/${id}/convert`);
      toast.success(`Venda #${res.sale?.number} criada com sucesso!`);
      qc.invalidateQueries(['quotes']);
    } catch (err) { toast.error(err.error || 'Erro ao converter'); }
  }

  async function handleStatus(id, newStatus) {
    try {
      await api.patch(`/quotes/${id}/status`, { status: newStatus });
      toast.success('Status atualizado!');
      qc.invalidateQueries(['quotes']);
    } catch (err) { toast.error(err.error || 'Erro'); }
  }

  // Regenera a foto PNG padronizada do orçamento a partir do histórico
  async function handlePng(id) {
    const t = toast.loading('Gerando a foto do orçamento...');
    try {
      const q = await api.get(`/quotes/${id}`);
      const extras = parseQuoteNotes(q.notes);
      const dataUrl = generateQuotePng({
        number: q.number,
        createdAt: q.created_at,
        customerName: q.CLIENTES?.name || '',
        items: (q.ORCAMENTO_ITENS || []).map(i => ({
          name: i.product_name || i.PRODUTOS?.name || 'Produto',
          quantity: i.quantity,
          unit_price: i.unit_price,
        })),
        discount: q.discount,
        freight: extras.freight,
        carrierName: extras.carrierName,
        quoteNumber: extras.quoteNumber,
        quoteDate: extras.quoteDate,
        quoteValidityDays: extras.quoteValidityDays,
        deliveryDays: extras.deliveryDays || q.delivery_days,
        productionTime: extras.productionTime,
        pixPrice: extras.pixPrice,
        validityDays: extras.validityDays || 3,
      });
      downloadPng(dataUrl, `orcamento-${String(q.number).padStart(4, '0')}.png`);
      toast.success('Foto do orçamento baixada!', { id: t });
    } catch (err) { toast.error(err.error || 'Erro ao gerar a foto', { id: t }); }
  }

  async function handleSend(id, channel) {
    const t = toast.loading(`Enviando por ${channel === 'whatsapp' ? 'WhatsApp' : 'e-mail'}...`);
    try {
      await api.post(`/quotes/${id}/send`, { channel });
      toast.success('Orçamento enviado!', { id: t });
      qc.invalidateQueries(['quotes']);
    } catch (err) { toast.error(err.error || 'Erro ao enviar', { id: t }); }
  }

  const columns = [
    { key: 'number', label: '#', width: 60,
      render: v => <span className="font-mono font-bold">#{String(v).padStart(4,'0')}</span> },
    { key: 'created_at', label: 'Data', width: 100,
      render: v => { try { return format(parseISO(v), 'dd/MM/yyyy', { locale: ptBR }); } catch { return v; } } },
    { key: 'CLIENTES', label: 'Cliente', render: v => v?.name || <span className="text-gray-400">Sem cliente</span> },
    { key: 'total', label: 'Total', width: 120, render: v => <span className="font-semibold">{fmt(v)}</span> },
    { key: 'valid_until', label: 'Válido até', width: 100,
      render: v => v ? format(parseISO(v), 'dd/MM/yyyy', { locale: ptBR }) : '—' },
    { key: 'status', label: 'Status', width: 110,
      render: v => { const s = STATUS[v] || { label: v, cls: 'badge-gray' }; return <span className={`badge ${s.cls}`}>{s.label}</span>; } },
    { key: 'id', label: '', width: 160,
      render: (id, row) => (
        <div className="flex items-center gap-1">
          <Link to={`/quotes/${id}`} className="btn-ghost p-1.5 tooltip" title="Ver">
            <Eye size={14} />
          </Link>
          <button onClick={() => handlePng(id)} className="btn-ghost p-1.5 text-purple-600" title="Baixar foto (PNG) do orçamento">
            <Image size={14} />
          </button>
          <button onClick={() => handleSend(id, 'whatsapp')} className="btn-ghost p-1.5 text-green-600" title="Enviar por WhatsApp">
            <MessageCircle size={14} />
          </button>
          <button onClick={() => handleSend(id, 'email')} className="btn-ghost p-1.5 text-indigo-600" title="Enviar por e-mail">
            <Mail size={14} />
          </button>
          {row.status === 'open' && (
            <button onClick={() => handleStatus(id, 'sent')} className="btn-ghost p-1.5 text-blue-600" title="Marcar como Enviado">
              <FileText size={14} />
            </button>
          )}
          {row.status !== 'converted' && (
            <button onClick={() => handleConvert(id)} className="btn-ghost p-1.5 text-green-600" title="Transferir para Pedido de Venda">
              <ArrowRightCircle size={14} />
            </button>
          )}
        </div>
      )
    },
  ];

  const summary = (data?.data || []).reduce((a, q) => {
    a.total += q.total || 0;
    if (q.status === 'open') a.abertos++;
    if (q.status === 'approved') a.aprovados++;
    return a;
  }, { total: 0, abertos: 0, aprovados: 0 });

  return (
    <div className="space-y-4">
      <div className="page-header">
        <div>
          {!embutido && <h1 className="page-title">Orçamentos</h1>}
          <p className="text-sm text-gray-500 mt-1">{data?.total || 0} orçamentos</p>
        </div>
        <Link to="/quotes/new" className="btn-primary">
          <Plus size={16} /> Novo Orçamento
        </Link>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'Total em Aberto', value: summary.abertos, suffix: ' orçamentos', color: 'blue' },
          { label: 'Aprovados', value: summary.aprovados, suffix: ' para converter', color: 'green' },
          { label: 'Valor Total', value: fmt(summary.total), suffix: '', color: 'purple' },
        ].map(k => (
          <div key={k.label} className="card p-4">
            <p className="text-xs text-gray-500">{k.label}</p>
            <p className={`text-xl font-bold mt-1 text-${k.color}-600`}>{k.value}{k.suffix}</p>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-header flex gap-3 flex-wrap">
          <select className="input max-w-[160px]" value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}>
            <option value="">Todos os status</option>
            {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
        <Table columns={columns} data={data?.data} loading={isLoading} emptyMessage="Nenhum orçamento encontrado" />
        <Pagination page={page} total={data?.total || 0} limit={20} onPageChange={setPage} />
      </div>
    </div>
  );
}
