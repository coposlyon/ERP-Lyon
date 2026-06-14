import { useState, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Eye, FileUp, Loader2, CheckCircle2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import { Table, Pagination } from '@/components/UI/Table';
import Modal from '@/components/UI/Modal';
import toast from 'react-hot-toast';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

function fmt(v) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
}

export default function Purchases() {
  const [page, setPage] = useState(1);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fileRef = useRef(null);
  const [xml, setXml] = useState('');
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['purchases', page],
    queryFn: () => api.get(`/purchases?page=${page}&limit=20`),
  });

  async function onFile(e) {
    const file = e.target.files?.[0]; if (!file) return; e.target.value = '';
    const text = await file.text();
    setXml(text); setLoading(true); setPreview(null);
    try {
      const res = await api.post('/purchases/import-nfe/preview', { xml: text });
      setPreview(res);
    } catch (err) { toast.error(err.error || 'XML inválido'); }
    finally { setLoading(false); }
  }

  async function confirmImport() {
    setImporting(true);
    try {
      const res = await api.post('/purchases/import-nfe', { xml });
      toast.success(`Compra importada! ${res.created_products} produto(s) novo(s).`);
      setPreview(null); setXml('');
      qc.invalidateQueries(['purchases']);
    } catch (err) { toast.error(err.error || 'Erro ao importar'); }
    finally { setImporting(false); }
  }

  const columns = [
    { key: 'number', label: '#', width: 70, render: v => <span className="font-mono font-semibold">#{String(v).padStart(4, '0')}</span> },
    { key: 'created_at', label: 'Data', width: 110, render: v => { try { return format(parseISO(v), 'dd/MM/yyyy', { locale: ptBR }); } catch { return v; } } },
    { key: 'suppliers', label: 'Fornecedor', render: v => v?.name || '—' },
    { key: 'status', label: 'Status', width: 120, render: v => {
      const cls = { received: 'badge-green', pending: 'badge-yellow', cancelled: 'badge-red', partial: 'badge-blue' };
      const lbl = { received: 'Recebido', pending: 'Pendente', cancelled: 'Cancelado', partial: 'Parcial' };
      return <span className={`badge ${cls[v] || 'badge-gray'}`}>{lbl[v] || v}</span>;
    } },
    { key: 'total', label: 'Total', width: 130, render: v => <span className="font-semibold">{fmt(v)}</span> },
    { key: 'id', label: '', width: 50, render: (_, row) => (
      <button onClick={() => navigate(`/purchases/${row.id}`)} className="btn-ghost p-1.5"><Eye size={14} /></button>
    ) },
  ];

  return (
    <div className="space-y-4">
      <div className="page-header">
        <div>
          <h1 className="page-title">Compras</h1>
          <p className="text-sm text-gray-500 mt-1">{data?.total || 0} pedidos de compra</p>
        </div>
        <div className="flex gap-2">
          <input ref={fileRef} type="file" accept=".xml,text/xml" className="hidden" onChange={onFile} />
          <button onClick={() => fileRef.current?.click()} className="btn-secondary"><FileUp size={16} /> Importar NF-e (XML)</button>
          <button onClick={() => navigate('/purchases/new')} className="btn-primary"><Plus size={16} /> Nova Compra</button>
        </div>
      </div>
      <div className="card">
        <Table columns={columns} data={data?.data} loading={isLoading} />
        <Pagination page={page} total={data?.total || 0} limit={20} onPageChange={setPage} />
      </div>

      <Modal isOpen={loading || !!preview} onClose={() => { if (!importing) { setPreview(null); setXml(''); } }} title="Importar NF-e de entrada" size="lg">
        {loading ? (
          <div className="py-10 text-center text-gray-400"><Loader2 className="animate-spin mx-auto mb-2" /> Lendo o XML...</div>
        ) : preview && (
          <div className="space-y-4">
            <div className="bg-gray-50 rounded-xl p-3 text-sm">
              <p><strong>Fornecedor:</strong> {preview.supplier?.name} {preview.supplier?.cnpj ? `(${preview.supplier.cnpj})` : ''}
                {preview.supplier?.matched_id ? <span className="text-green-600 ml-1">· já cadastrado</span> : <span className="text-amber-600 ml-1">· será criado</span>}</p>
              <p className="mt-1"><strong>NF-e:</strong> {preview.number || '—'} · {preview.items.length} itens · Total {fmt(preview.total)}</p>
              <p className="text-xs text-gray-500 mt-1">
                {preview.summary.new_products} produto(s) novo(s) serão criados, o restante será casado por código/EAN.
              </p>
            </div>
            <div className="max-h-64 overflow-y-auto border border-gray-100 rounded-xl">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                  <tr><th className="text-left px-3 py-2">Produto</th><th className="text-right px-3 py-2">Qtd</th><th className="text-right px-3 py-2">Custo</th><th className="px-3 py-2"></th></tr>
                </thead>
                <tbody>
                  {preview.items.map((it, i) => (
                    <tr key={i} className="border-t border-gray-50">
                      <td className="px-3 py-2"><span className="font-medium">{it.name}</span> <span className="text-xs text-gray-400">{it.code}</span></td>
                      <td className="px-3 py-2 text-right">{it.quantity} {it.unit}</td>
                      <td className="px-3 py-2 text-right">{fmt(it.unit_price)}</td>
                      <td className="px-3 py-2 text-right">
                        {it.matched_product_id
                          ? <span className="text-green-600 flex items-center gap-1 justify-end text-xs"><CheckCircle2 size={12}/> casado</span>
                          : <span className="text-amber-600 text-xs">novo</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setPreview(null); setXml(''); }} className="btn-secondary flex-1">Cancelar</button>
              <button onClick={confirmImport} disabled={importing} className="btn-primary flex-1">
                {importing ? 'Importando...' : 'Confirmar importação'}
              </button>
            </div>
            <p className="text-xs text-gray-400">A entrada de estoque e o custo médio são atualizados automaticamente.</p>
          </div>
        )}
      </Modal>
    </div>
  );
}
