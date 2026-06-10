import { useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { Loader2, Instagram, Paperclip, Trash2, Download, Upload } from 'lucide-react';

const states = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
const SETORES = ['GRAVAÇÃO','MARKETING','LOGÍSTICA','DESIGNER','VENDAS','FINANCEIRO','ALMOXARIFADO','QUALIDADE'];
const ESCALAS = ['Segunda a Sexta','Segunda a Sábado','6x1','5x2','12x36','Plantão'];

const emptyAddress  = { street:'', number:'', complement:'', neighborhood:'', city:'', state:'', zip:'' };
const emptyAdmission = { salary:'', father_name:'', mother_name:'', pis:'', sector:'', scale:'', monthly_hours:'', start_date:'', notes:'' };

function fileIcon(type) {
  if (type?.includes('pdf'))    return '📄';
  if (type?.includes('image'))  return '🖼️';
  if (type?.includes('word') || type?.includes('document')) return '📝';
  if (type?.includes('sheet') || type?.includes('excel'))   return '📊';
  return '📎';
}

function formatSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function AttachmentsPanel({ customerId }) {
  const qc = useQueryClient();
  const fileRef = useRef();
  const [uploading, setUploading] = useState(false);

  const { data: attachments = [], isLoading } = useQuery({
    queryKey: ['attachments', customerId],
    queryFn: () => api.get(`/customers/${customerId}/attachments`),
    enabled: !!customerId,
  });

  function invalidate() {
    qc.invalidateQueries(['attachments', customerId]);
    qc.invalidateQueries(['employees']); // mantém a lista sincronizada
  }

  async function handleFileChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      await api.post(`/customers/${customerId}/attachments`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success('Arquivo anexado!');
      invalidate();
    } catch (err) { toast.error(err.error || 'Erro ao enviar arquivo'); }
    finally { setUploading(false); e.target.value = ''; }
  }

  async function handleDelete(id) {
    if (!window.confirm('Remover este anexo?')) return;
    try {
      await api.delete(`/customers/${customerId}/attachments/${id}`);
      toast.success('Removido');
      invalidate();
    } catch { toast.error('Erro ao remover'); }
  }

  return (
    <div className="border border-indigo-200 rounded-lg bg-indigo-50/20 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-indigo-800 flex items-center gap-1.5">
          <Paperclip size={15} /> Documentos ({attachments.length})
        </p>
        <div>
          <input ref={fileRef} type="file" className="hidden" onChange={handleFileChange}
            accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp,.txt" />
          <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
            className="flex items-center gap-1.5 text-xs font-medium bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700 disabled:opacity-50">
            {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
            {uploading ? 'Enviando...' : 'Adicionar'}
          </button>
        </div>
      </div>

      {isLoading && <p className="text-xs text-gray-400">Carregando...</p>}
      {!isLoading && attachments.length === 0 && (
        <p className="text-xs text-gray-400 text-center py-3">
          Nenhum documento. Adicione contratos, CTPS, exames...
        </p>
      )}

      <div className="space-y-2">
        {attachments.map(att => (
          <div key={att.id} className="flex items-center gap-3 bg-white border border-gray-200 rounded-lg px-3 py-2">
            <span className="text-xl flex-shrink-0">{fileIcon(att.type)}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800 truncate">{att.name}</p>
              <p className="text-xs text-gray-400">{formatSize(att.size)}</p>
            </div>
            <div className="flex gap-1">
              <a href={att.url} target="_blank" rel="noreferrer"
                className="btn-ghost p-1.5 text-indigo-500 hover:text-indigo-700" title="Abrir">
                <Download size={14} />
              </a>
              <button type="button" onClick={() => handleDelete(att.id)}
                className="btn-ghost p-1.5 text-gray-400 hover:text-red-500" title="Remover">
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function EmployeeForm({ employee, onSaved, onCancel }) {
  const [form, setForm] = useState({
    name: '', cpf_cnpj: '', email: '', phone: '', instagram: '',
    address: { ...emptyAddress },
    admission_data: { ...emptyAdmission },
    is_active: true,
  });
  const [loading, setLoading]     = useState(false);
  const [cepLoading, setCepLoading] = useState(false);
  const [duplicate, setDuplicate]  = useState(null);

  useEffect(() => {
    if (employee) {
      setForm({
        name:           employee.name || '',
        cpf_cnpj:       employee.cpf_cnpj || '',
        email:          employee.email || '',
        phone:          employee.phone || '',
        instagram:      employee.instagram || '',
        address:        employee.address || { ...emptyAddress },
        admission_data: employee.admission_data || { ...emptyAdmission },
        is_active:      employee.is_active !== false,
      });
    }
  }, [employee]);

  function set(f, v)    { setForm(p => ({ ...p, [f]: v })); }
  function setAddr(f,v) { setForm(p => ({ ...p, address: { ...p.address, [f]: v } })); }
  function setAdm(f,v)  { setForm(p => ({ ...p, admission_data: { ...p.admission_data, [f]: v } })); }

  async function handleCepBlur(e) {
    const cep = e.target.value.replace(/\D/g, '');
    if (cep.length !== 8) return;
    setCepLoading(true);
    try {
      const res  = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const data = await res.json();
      if (data.erro) { toast.error('CEP não encontrado'); return; }
      setForm(p => ({
        ...p,
        address: { ...p.address, street: data.logradouro||'', neighborhood: data.bairro||'', city: data.localidade||'', state: data.uf||'', zip: e.target.value },
      }));
    } catch { toast.error('Erro ao buscar CEP'); }
    finally   { setCepLoading(false); }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name)                   { toast.error('Nome é obrigatório'); return; }
    if (!form.admission_data.sector)  { toast.error('Informe o setor'); return; }

    setLoading(true);
    try {
      const payload = { ...form, type: 'CO' };
      if (employee?.id) {
        await api.put(`/customers/${employee.id}`, payload);
        toast.success('Colaborador atualizado!');
      } else {
        await api.post('/customers', payload);
        toast.success('Colaborador cadastrado!');
      }
      onSaved();
    } catch (err) {
      if (err.duplicate) {
        setDuplicate({ id: err.existing_id, name: err.existing_name, display_id: err.existing_display_id });
      } else {
        toast.error(err.error || 'Erro ao salvar');
      }
    } finally { setLoading(false); }
  }

  /* CPF duplicado */
  if (duplicate) {
    return (
      <div className="space-y-5 text-center py-4">
        <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto">
          <span className="text-3xl">⚠️</span>
        </div>
        <div>
          <p className="text-base font-semibold text-gray-900">CPF já cadastrado</p>
          <p className="text-sm text-gray-500 mt-1">Já existe um cadastro com esse CPF:</p>
          <p className="text-sm font-bold text-primary-700 mt-2">#{duplicate.display_id} — {duplicate.name}</p>
        </div>
        <div className="flex gap-3 justify-center pt-2">
          <button type="button" onClick={() => setDuplicate(null)} className="btn-secondary">
            Voltar ao formulário
          </button>
          <a href={`/customers/${duplicate.id}`} className="btn-primary" onClick={() => onCancel?.()}>
            Ver cadastro existente
          </a>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">

      {/* ── Dados pessoais ── */}
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="label">Nome Completo *</label>
          <input className="input" value={form.name} onChange={e => set('name', e.target.value)} autoFocus />
        </div>
        <div>
          <label className="label">CPF</label>
          <input className="input" value={form.cpf_cnpj} onChange={e => set('cpf_cnpj', e.target.value)} placeholder="000.000.000-00" />
        </div>
        <div>
          <label className="label">Telefone / WhatsApp</label>
          <input className="input" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="(44) 99999-9999" />
        </div>
        <div>
          <label className="label">E-mail</label>
          <input type="email" className="input" value={form.email} onChange={e => set('email', e.target.value)} />
        </div>
        <div>
          <label className="label">Instagram</label>
          <div className="relative">
            <Instagram size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-pink-400" />
            <input className="input pl-8" value={form.instagram} onChange={e => set('instagram', e.target.value)} placeholder="@perfil" />
          </div>
        </div>
      </div>

      {/* ── Endereço ── */}
      <details className="border border-gray-200 rounded-lg">
        <summary className="px-4 py-3 cursor-pointer text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-lg select-none">
          Endereço
        </summary>
        <div className="px-4 pb-4 grid grid-cols-3 gap-3 mt-3">
          <div>
            <label className="label">CEP</label>
            <div className="relative">
              <input className="input pr-8" value={form.address.zip}
                onChange={e => setAddr('zip', e.target.value)}
                onBlur={handleCepBlur} placeholder="00000-000" />
              {cepLoading && <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-gray-400" />}
            </div>
          </div>
          <div className="col-span-2">
            <label className="label">Rua / Logradouro</label>
            <input className="input" value={form.address.street} onChange={e => setAddr('street', e.target.value)} />
          </div>
          <div>
            <label className="label">Número</label>
            <input className="input" value={form.address.number} onChange={e => setAddr('number', e.target.value)} />
          </div>
          <div>
            <label className="label">Complemento</label>
            <input className="input" value={form.address.complement} onChange={e => setAddr('complement', e.target.value)} />
          </div>
          <div>
            <label className="label">Bairro</label>
            <input className="input" value={form.address.neighborhood} onChange={e => setAddr('neighborhood', e.target.value)} />
          </div>
          <div>
            <label className="label">Cidade</label>
            <input className="input" value={form.address.city} onChange={e => setAddr('city', e.target.value)} />
          </div>
          <div>
            <label className="label">Estado</label>
            <select className="input" value={form.address.state} onChange={e => setAddr('state', e.target.value)}>
              <option value="">UF</option>
              {states.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
      </details>

      {/* ── Ficha de Admissão ── */}
      <div className="border border-indigo-200 rounded-lg bg-indigo-50/20 p-4 space-y-4">
        <p className="text-sm font-semibold text-indigo-800">📋 Ficha de Admissão</p>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Data de Admissão</label>
            <input type="date" className="input" value={form.admission_data.start_date}
              onChange={e => setAdm('start_date', e.target.value)} />
          </div>
          <div>
            <label className="label">Salário (R$)</label>
            <input type="number" step="0.01" min="0" className="input"
              value={form.admission_data.salary} onChange={e => setAdm('salary', e.target.value)} />
          </div>
          <div>
            <label className="label">Setor *</label>
            <select className="input" value={form.admission_data.sector}
              onChange={e => setAdm('sector', e.target.value)}>
              <option value="">Selecione...</option>
              {SETORES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Escala de trabalho</label>
            <select className="input" value={form.admission_data.scale}
              onChange={e => setAdm('scale', e.target.value)}>
              <option value="">Selecione...</option>
              {ESCALAS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Horas mensais</label>
            <input type="number" min="0" className="input" placeholder="Ex: 220"
              value={form.admission_data.monthly_hours} onChange={e => setAdm('monthly_hours', e.target.value)} />
          </div>
          <div>
            <label className="label">PIS</label>
            <input className="input" placeholder="000.00000.00-0"
              value={form.admission_data.pis} onChange={e => setAdm('pis', e.target.value)} />
          </div>
          <div>
            <label className="label">Nome do Pai</label>
            <input className="input" value={form.admission_data.father_name}
              onChange={e => setAdm('father_name', e.target.value)} />
          </div>
          <div>
            <label className="label">Nome da Mãe</label>
            <input className="input" value={form.admission_data.mother_name}
              onChange={e => setAdm('mother_name', e.target.value)} />
          </div>
          <div className="col-span-2">
            <label className="label">Observações</label>
            <textarea rows={2} className="input resize-none"
              value={form.admission_data.notes} onChange={e => setAdm('notes', e.target.value)} />
          </div>
        </div>

        {/* Documentos — só quando editando */}
        {employee?.id ? (
          <AttachmentsPanel customerId={employee.id} />
        ) : (
          <p className="text-xs text-indigo-600 bg-indigo-100 rounded-lg px-3 py-2">
            💡 Salve o colaborador primeiro para adicionar documentos (CTPS, contratos, exames...)
          </p>
        )}
      </div>

      {/* Status */}
      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={form.is_active} onChange={e => set('is_active', e.target.checked)} className="rounded" />
        <span className="text-sm text-gray-700">Colaborador ativo</span>
      </label>

      <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-100">
        {onCancel && <button type="button" onClick={onCancel} className="btn-secondary">Cancelar</button>}
        <button type="submit" disabled={loading} className="btn-primary">
          {loading ? <><Loader2 size={15} className="animate-spin" /> Salvando...</> : 'Salvar'}
        </button>
      </div>
    </form>
  );
}
