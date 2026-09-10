import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Edit2, Eye, ShieldCheck, Loader2, CheckCircle2, XCircle, Truck, Upload, Paperclip, Trash2, FileText } from 'lucide-react';
import api from '@/lib/api';
import { Table, Pagination } from '@/components/UI/Table';
import Modal from '@/components/UI/Modal';
import CopyLinkButton from '@/components/UI/CopyLinkButton';
import CreditCheckModal from '@/components/UI/CreditCheckModal';
import DeletePasswordModal from '@/components/UI/DeletePasswordModal';
import DetailModal from '@/components/UI/DetailModal';
import { useAuth } from '@/contexts/AuthContext';
// A FILA DE EXPEDICAO. Mora na mesma tela do cadastro de
// transportadoras porque e a mesma pessoa que abre as duas — mas e
// outro trabalho, e por isso e outra aba, e nao mais uma coluna.
import Expedicao from './Expedicao';
// A FILA DE ETAPAS DA LOGISTICA: coleta, transito e entrega (status
// 24-28 da regua), com iniciar/finalizar e dupla confirmacao — a MESMA
// tela da producao, lendo a fatia da logistica.
import FilaDeEtapas from '@/components/Fluxo/FilaDeEtapas';
import { PackageCheck } from 'lucide-react';
import toast from 'react-hot-toast';

const states = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

function formatPhone(raw) {
  if (!raw) return '';
  const d = raw.replace(/\D/g, '');
  if (d.length === 11) return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
  return raw;
}

function formatCnpj(v) {
  const d = v.replace(/\D/g, '').slice(0, 14);
  if (d.length <= 2)  return d;
  if (d.length <= 5)  return `${d.slice(0,2)}.${d.slice(2)}`;
  if (d.length <= 8)  return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8)}`;
  return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12)}`;
}

function maskCpf(v) {
  return String(v || '').replace(/\D/g, '').slice(0, 11)
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}
function validCpf(v) {
  const c = String(v || '').replace(/\D/g, '');
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  let s = 0;
  for (let i = 0; i < 9; i++) s += +c[i] * (10 - i);
  let d = (s * 10) % 11; if (d === 10) d = 0;
  if (d !== +c[9]) return false;
  s = 0;
  for (let i = 0; i < 10; i++) s += +c[i] * (11 - i);
  d = (s * 10) % 11; if (d === 10) d = 0;
  return d === +c[10];
}

const DOC_LABELS = { contrato: 'Contrato Comercial assinado', tabela: 'Tabela de Preços vigente' };

function formatSize(bytes) {
  if (!bytes) return '';
  const kb = bytes / 1024;
  return kb < 1024 ? `${kb.toFixed(0)} KB` : `${(kb / 1024).toFixed(1)} MB`;
}

const DAYS = [
  { key: 'seg', label: 'Seg' },
  { key: 'ter', label: 'Ter' },
  { key: 'qua', label: 'Qua' },
  { key: 'qui', label: 'Qui' },
  { key: 'sex', label: 'Sex' },
  { key: 'sab', label: 'Sáb' },
  { key: 'dom', label: 'Dom' },
];

const emptySlot = () => ({ days: [], time: '08:00' });

const emptyForm = {
  name: '', trade_name: '', cnpj: '', ie: '', email: '',
  phone: '', whatsapp: '', contact_name: '',
  pickup_schedule: [], is_active: true, is_pickup: false,
  address: { street: '', number: '', complement: '', neighborhood: '', city: '', state: '', zip: '' },
};

function CarrierForm({ carrier, onSaved, onCancel }) {
  const [form, setForm] = useState({
    ...emptyForm,
    ...(carrier || {}),
    pickup_schedule:  carrier?.pickup_schedule  || [],
    address: { ...emptyForm.address, ...(carrier?.address || {}) },
    is_active: carrier?.is_active !== false,
    is_pickup: !!carrier?.is_pickup,
  });
  const [loading,      setLoading]      = useState(false);
  const [cnpjLoading,  setCnpjLoading]  = useState(false);
  const [cnpjStatus,   setCnpjStatus]   = useState(null);
  const [addressOpen,  setAddressOpen]  = useState(true);

  // Documentos obrigatórios + quem está anexando
  const existingDocs = carrier?.documents?.attachments || [];
  const resp0 = carrier?.documents?.responsible || {};
  const [newFiles, setNewFiles] = useState({ contrato: null, tabela: null });
  const [resp, setResp] = useState({
    name:  resp0.name  || '',
    cpf:   resp0.cpf ? maskCpf(resp0.cpf) : '',
    cargo: resp0.cargo || '',
  });
  const hasKind = k => !!newFiles[k] || existingDocs.some(d => d.kind === k);

  const up = s => (typeof s === 'string' ? s.toUpperCase() : s);
  function set(k, v)    { setForm(p => ({ ...p, [k]: (k === 'email' ? v : up(v)) })); }
  function setAddr(k,v) { setForm(p => ({ ...p, address: { ...p.address, [k]: up(v) } })); }

  // Horários de coleta
  function addSlot()        { setForm(p => ({ ...p, pickup_schedule: [...p.pickup_schedule, emptySlot()] })); }
  function removeSlot(i)    { setForm(p => ({ ...p, pickup_schedule: p.pickup_schedule.filter((_, idx) => idx !== i) })); }
  function updateSlot(i, k, v) {
    setForm(p => {
      const s = [...p.pickup_schedule];
      s[i] = { ...s[i], [k]: v };
      return { ...p, pickup_schedule: s };
    });
  }
  function toggleSlotDay(i, day) {
    setForm(p => {
      const s = [...p.pickup_schedule];
      const days = s[i].days.includes(day) ? s[i].days.filter(d => d !== day) : [...s[i].days, day];
      s[i] = { ...s[i], days };
      return { ...p, pickup_schedule: s };
    });
  }

  // Busca via backend (proxy server-side — sem CORS, tenta 4 APIs)
  async function lookupCnpj(digits) {
    if (digits.length !== 14 || cnpjLoading) return;
    setCnpjLoading(true);
    setCnpjStatus(null);

    try {
      const res = await fetch(`/api/cnpj/${digits}`);
      if (!res.ok) throw new Error('not found');
      const d = await res.json();

      const zip = d.zip ? d.zip.replace(/^(\d{5})(\d{3})$/, '$1-$2') : '';
      setForm(p => ({
        ...p,
        name:       up(d.name)       || p.name,
        trade_name: up(d.trade_name) || p.trade_name,
        ie:         up(d.ie)         || p.ie,
        email:      d.email      || p.email,
        phone:      formatPhone(d.phone || ''),
        address: {
          ...p.address,
          street:       up(d.street)       || '',
          number:       up(d.number)       || '',
          complement:   up(d.complement)   || '',
          neighborhood: up(d.neighborhood) || '',
          city:         up(d.city)         || '',
          state:        up(d.state)        || '',
          zip,
        },
      }));
      if (d.street || d.city) setAddressOpen(true);
      setCnpjStatus('ok');
      toast.success('✅ Dados do CNPJ preenchidos automaticamente!');
    } catch {
      setCnpjStatus('error');
      toast.error('CNPJ não encontrado');
    } finally {
      setCnpjLoading(false);
    }
  }

  function handleCnpjChange(e) {
    const formatted = formatCnpj(e.target.value);
    set('cnpj', formatted);
    // Dispara automaticamente ao completar os 14 dígitos
    const digits = formatted.replace(/\D/g, '');
    if (digits.length === 14) lookupCnpj(digits);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const a = form.address || {};
    // Todos os campos são obrigatórios (menos Complemento e o e-mail continua minúsculo)
    if (!form.cnpj?.trim())            { toast.error('Informe o CNPJ'); return; }
    if (!form.ie?.trim())             { toast.error('Informe a Inscrição Estadual (ou ISENTO)'); return; }
    if (!form.name?.trim())            { toast.error('Razão Social é obrigatória'); return; }
    if (!form.trade_name?.trim())      { toast.error('Informe o Nome Fantasia'); return; }
    if (!form.contact_name?.trim())    { toast.error('Informe o Responsável / Contato'); return; }
    if (!form.email?.trim())           { toast.error('Informe o E-mail'); return; }
    if (!form.phone?.trim())           { toast.error('Informe o Telefone'); return; }
    if (!form.whatsapp?.trim())        { toast.error('Informe o WhatsApp'); return; }
    if (!a.zip?.trim())                { setAddressOpen(true); toast.error('Informe o CEP'); return; }
    if (!a.street?.trim())             { setAddressOpen(true); toast.error('Informe a Rua / Logradouro'); return; }
    if (!String(a.number || '').trim()){ setAddressOpen(true); toast.error('Informe o Número'); return; }
    if (!a.neighborhood?.trim())       { setAddressOpen(true); toast.error('Informe o Bairro'); return; }
    if (!a.city?.trim())               { setAddressOpen(true); toast.error('Informe a Cidade'); return; }
    if (!a.state?.trim())              { setAddressOpen(true); toast.error('Informe o Estado (UF)'); return; }

    // Identificação de quem está anexando
    if (!resp.name.trim() || !resp.cargo.trim()) { toast.error('Informe o nome completo e o cargo de quem está anexando os documentos'); return; }
    if (!validCpf(resp.cpf))                      { toast.error('CPF inválido. Confira os números digitados.'); return; }
    // Documentos obrigatórios
    if (!hasKind('contrato') || !hasKind('tabela')) {
      toast.error('Anexe o Contrato Comercial assinado e a Tabela de Preços vigente para finalizar o cadastro.');
      return;
    }

    setLoading(true);
    try {
      let carrierId = carrier?.id;
      if (carrierId) {
        await api.put(`/logistics/${carrierId}`, form);
      } else {
        const created = await api.post('/logistics', form);
        carrierId = created?.id;
      }
      // Sobe os documentos recém-selecionados, registrando quem anexou
      for (const kind of ['contrato', 'tabela']) {
        const file = newFiles[kind];
        if (!file) continue;
        const fd = new FormData();
        fd.append('file', file);
        fd.append('kind', kind);
        fd.append('uploader_name', resp.name.trim());
        fd.append('uploader_cpf', resp.cpf);
        fd.append('uploader_cargo', resp.cargo.trim());
        await api.post(`/logistics/${carrierId}/attachments`, fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      }
      toast.success(carrier?.id ? 'Transportadora atualizada!' : 'Transportadora cadastrada!');
      onSaved();
    } catch (err) {
      toast.error(err?.response?.data?.error || err?.error || 'Erro ao salvar');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">

      {/* CNPJ + IE */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="label">CNPJ *</label>
          <div className="relative">
            <input
              className="input pr-10"
              value={form.cnpj}
              onChange={handleCnpjChange}
              onBlur={e => lookupCnpj(e.target.value.replace(/\D/g, ''))}
              placeholder="00.000.000/0000-00"
              maxLength={18}
              disabled={cnpjLoading}
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              {cnpjLoading && <Loader2 size={16} className="animate-spin text-gray-400" />}
              {!cnpjLoading && cnpjStatus === 'ok'    && <CheckCircle2 size={16} className="text-green-500" />}
              {!cnpjLoading && cnpjStatus === 'error' && <XCircle      size={16} className="text-red-400" />}
            </div>
          </div>
          {cnpjLoading && (
            <p className="text-xs text-primary-600 mt-1 flex items-center gap-1">
              <Loader2 size={11} className="animate-spin" /> Consultando...
            </p>
          )}
          {!cnpjLoading && cnpjStatus === 'ok' && (
            <p className="text-xs text-green-600 mt-1">✅ Dados preenchidos automaticamente</p>
          )}
          {!cnpjLoading && cnpjStatus === 'error' && (
            <p className="text-xs text-red-500 mt-1">CNPJ não encontrado — preencha manualmente</p>
          )}
        </div>

        <div>
          <label className="label">Inscrição Estadual (IE) *</label>
          <input
            className="input"
            value={form.ie}
            onChange={e => set('ie', e.target.value)}
            placeholder="Auto-preenchido pelo CNPJ ou ISENTO"
          />
        </div>
      </div>

      {/* Razão Social + Nome Fantasia */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <label className="label">Razão Social *</label>
          <input className="input" value={form.name}
            onChange={e => set('name', e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <label className="label">Nome Fantasia *</label>
          <input className="input" value={form.trade_name}
            onChange={e => set('trade_name', e.target.value)}
            placeholder="Nome comercial" />
        </div>

        <div>
          <label className="label">Responsável / Contato *</label>
          <input className="input" value={form.contact_name}
            onChange={e => set('contact_name', e.target.value)} />
        </div>
        <div>
          <label className="label">E-mail *</label>
          <input type="email" className="input" value={form.email}
            onChange={e => set('email', e.target.value)} />
        </div>
        <div>
          <label className="label">Telefone *</label>
          <input className="input" value={form.phone}
            onChange={e => set('phone', e.target.value)}
            placeholder="(44) 3333-3333" />
        </div>
        <div>
          <label className="label">WhatsApp *</label>
          <input className="input" value={form.whatsapp}
            onChange={e => set('whatsapp', e.target.value)}
            placeholder="(44) 99999-9999" />
        </div>
      </div>

      {/* Endereço */}
      <div className="border border-gray-200 rounded-lg">
        <button
          type="button"
          onClick={() => setAddressOpen(v => !v)}
          className="w-full px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-lg text-left flex items-center justify-between"
        >
          <span>
            Endereço
            {form.address.city && (
              <span className="text-gray-400 font-normal"> — {form.address.city}/{form.address.state}</span>
            )}
          </span>
          <span className="text-gray-400 text-xs">{addressOpen ? '▲' : '▼'}</span>
        </button>
        {addressOpen && <div className="px-4 pb-4 grid grid-cols-1 sm:grid-cols-3 gap-3 border-t border-gray-100 pt-3">
          <div>
            <label className="label">CEP *</label>
            <input className="input" value={form.address.zip}
              onChange={e => setAddr('zip', e.target.value)} placeholder="00000-000" />
          </div>
          <div className="col-span-2">
            <label className="label">Rua / Logradouro *</label>
            <input className="input" value={form.address.street}
              onChange={e => setAddr('street', e.target.value)} />
          </div>
          <div>
            <label className="label">Número *</label>
            <input className="input" value={form.address.number}
              onChange={e => setAddr('number', e.target.value)} />
          </div>
          <div>
            <label className="label">Complemento</label>
            <input className="input" value={form.address.complement}
              onChange={e => setAddr('complement', e.target.value)} />
          </div>
          <div>
            <label className="label">Bairro *</label>
            <input className="input" value={form.address.neighborhood}
              onChange={e => setAddr('neighborhood', e.target.value)} />
          </div>
          <div>
            <label className="label">Cidade *</label>
            <input className="input" value={form.address.city}
              onChange={e => setAddr('city', e.target.value)} />
          </div>
          <div>
            <label className="label">Estado *</label>
            <select className="input" value={form.address.state}
              onChange={e => setAddr('state', e.target.value)}>
              <option value="">UF</option>
              {states.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>}
      </div>

      {/* Horários de Coleta */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="label mb-0">Horários de Coleta</label>
          {form.pickup_schedule.length === 0 && (
            <button type="button" onClick={addSlot}
              className="text-xs text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1">
              <Plus size={13} /> Adicionar horário
            </button>
          )}
        </div>

        {form.pickup_schedule.length === 0 && (
          <p className="text-xs text-gray-400 py-3 text-center border border-dashed border-gray-200 rounded-lg">
            Nenhum horário cadastrado — clique em "Adicionar horário"
          </p>
        )}

        <div className="space-y-3">
          {form.pickup_schedule.map((slot, i) => (
            <div key={i} className="border border-gray-200 rounded-xl p-3 bg-gray-50 space-y-2">
              {/* Dias da semana */}
              <div className="flex flex-wrap gap-1.5">
                {DAYS.map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => toggleSlotDay(i, key)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
                      slot.days.includes(key)
                        ? 'bg-primary-600 text-white'
                        : 'bg-white text-gray-500 border border-gray-300 hover:border-primary-400'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Hora da coleta + botão remover */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 shrink-0">Horário:</span>
                <input
                  type="time"
                  value={slot.time}
                  onChange={e => updateSlot(i, 'time', e.target.value)}
                  className="input py-1 text-sm w-28"
                />
                <button
                  type="button"
                  onClick={() => removeSlot(i)}
                  className="ml-auto text-red-400 hover:text-red-600 p-1 rounded hover:bg-red-50 transition-colors"
                  title="Remover"
                >
                  <XCircle size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Status */}
      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={form.is_active}
          onChange={e => set('is_active', e.target.checked)} className="rounded" />
        <span className="text-sm text-gray-700">Transportadora ativa</span>
      </label>

      {/* O QUE ESTA CAIXA DECIDE, ALEM DO ROTULO.
          Pedido com uma transportadora marcada assim nasce como
          retirada e NAO passa pela fase "Em Transito" — nao ha coleta
          nem viagem quando o cliente vem buscar. Antes isso era uma
          opcao falsa dentro do seletor do pedido; agora e o cadastro
          que responde. */}
      <label className="flex items-start gap-2 cursor-pointer">
        <input type="checkbox" checked={form.is_pickup}
          onChange={e => set('is_pickup', e.target.checked)} className="rounded mt-0.5" />
        <span className="text-sm text-gray-700">
          O cliente retira no local
          <span className="block text-xs text-gray-400">
            Marque na linha que representa o seu próprio balcão. O pedido pula a etapa de trânsito.
          </span>
        </span>
      </label>

      {/* Documentos obrigatórios + responsável */}
      <div className="border border-indigo-200 rounded-lg bg-indigo-50/30 p-4 space-y-3">
        <p className="text-sm font-semibold text-indigo-800 flex items-center gap-1.5">
          <Paperclip size={15} /> Documentos obrigatórios
        </p>

        {['contrato', 'tabela'].map(kind => {
          const existing = existingDocs.find(d => d.kind === kind);
          const picked   = newFiles[kind];
          return (
            <div key={kind} className="bg-white border border-gray-200 rounded-lg px-3 py-2">
              <div className="flex items-center gap-2">
                <FileText size={16} className="text-indigo-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800">{DOC_LABELS[kind]} *</p>
                  {picked ? (
                    <p className="text-xs text-green-600 truncate">{picked.name} · {formatSize(picked.size)}</p>
                  ) : existing ? (
                    <a href={existing.url} target="_blank" rel="noreferrer"
                      className="text-xs text-indigo-500 hover:underline truncate block">
                      {existing.name} (enviado)
                    </a>
                  ) : (
                    <p className="text-xs text-gray-400">Nenhum arquivo</p>
                  )}
                </div>
                <label className="btn-secondary text-xs cursor-pointer flex items-center gap-1.5 shrink-0">
                  <Upload size={13} /> {existing || picked ? 'Trocar' : 'Anexar'}
                  <input type="file" className="hidden"
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
                    onChange={e => { const f = e.target.files[0]; if (f) setNewFiles(p => ({ ...p, [kind]: f })); e.target.value = ''; }} />
                </label>
              </div>
            </div>
          );
        })}

        <div className="pt-1">
          <label className="label">Quem está anexando *</label>
          <input className="input" value={resp.name} placeholder="Nome completo"
            onChange={e => setResp(p => ({ ...p, name: e.target.value }))} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label">CPF *</label>
            <input className="input" value={resp.cpf} placeholder="000.000.000-00" maxLength={14}
              onChange={e => setResp(p => ({ ...p, cpf: maskCpf(e.target.value) }))} />
          </div>
          <div>
            <label className="label">Cargo *</label>
            <input className="input" value={resp.cargo} placeholder="Ex: Comercial"
              onChange={e => setResp(p => ({ ...p, cargo: e.target.value }))} />
          </div>
        </div>
        <p className="text-xs text-gray-400">
          O cadastro só é concluído com os dois documentos anexados e a identificação preenchida.
        </p>
      </div>

      <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
        <button type="button" onClick={onCancel} className="btn-secondary">Cancelar</button>
        <button type="submit" disabled={loading} className="btn-primary">
          {loading ? <><Loader2 size={15} className="animate-spin" /> Salvando...</> : 'Salvar'}
        </button>
      </div>
    </form>
  );
}

export default function Logistics() {
  // Qual das duas telas esta aberta. A fila vem primeiro: e o trabalho do dia.
  const [aba, setAba] = useState('fila');
  const [page, setPage]               = useState(1);
  const [search, setSearch]           = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [modalOpen, setModalOpen]     = useState(false);
  const [editing, setEditing]         = useState(null);
  const [detail, setDetail]           = useState(null);   // ficha (olhinho)
  const [scoreTarget, setScoreTarget] = useState(null);   // consulta de crédito
  const [delTarget, setDelTarget]     = useState(null);   // exclusão definitiva
  const [selectedId, setSelectedId]   = useState(null);   // linha marcada ao clicar
  const qc = useQueryClient();
  const { isAdmin } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ['carriers', page, search],
    queryFn: () => api.get(`/logistics?page=${page}&limit=20${search ? `&search=${encodeURIComponent(search)}` : ''}`),
  });

  function openNew()   { setEditing(null); setModalOpen(true); }
  function openEdit(c) { setDetail(null); setEditing(c); setModalOpen(true); }
  function close()     { setModalOpen(false); setEditing(null); }
  function onSaved()   { close(); qc.invalidateQueries({ queryKey: ['carriers'] }); }

  const columns = [
    {
      key: 'name', label: 'Transportadora',
      render: (v, row) => (
        <div>
          <p className="font-medium text-gray-900 text-sm">{v}</p>
          {row.trade_name && <p className="text-xs text-gray-400">{row.trade_name}</p>}
        </div>
      ),
    },
    { key: 'cnpj', label: 'CNPJ', width: 170 },
    { key: 'contact_name', label: 'Contato' },
    { key: 'phone', label: 'Telefone', width: 145 },
    {
      key: 'pickup_schedule', label: 'Horários', width: 160,
      render: v => {
        if (!v || v.length === 0) return <span className="text-gray-400 text-xs">—</span>;
        const DAY_LABELS = { seg:'Seg',ter:'Ter',qua:'Qua',qui:'Qui',sex:'Sex',sab:'Sáb',dom:'Dom' };
        return (
          <div className="space-y-0.5">
            {v.slice(0, 2).map((slot, i) => (
              <p key={i} className="text-xs text-gray-600 leading-tight">
                <span className="font-medium">{slot.days.map(d => DAY_LABELS[d] || d).join(', ')}</span>
                {slot.time && <span className="text-gray-400"> {slot.time}</span>}
              </p>
            ))}
            {v.length > 2 && <p className="text-xs text-gray-400">+{v.length - 2} mais</p>}
          </div>
        );
      },
    },
    {
      key: 'address', label: 'Cidade/UF', width: 130,
      render: v => v?.city ? `${v.city}/${v.state}` : '—',
    },
    {
      key: 'is_active', label: 'Status', width: 80,
      render: v => (
        <span className={`badge ${v ? 'badge-green' : 'badge-gray'}`}>
          {v ? 'Ativa' : 'Inativa'}
        </span>
      ),
    },
    {
      key: 'id', label: '', width: 110,
      render: (_, row) => (
        <div className="flex gap-1" onClick={e => e.stopPropagation()}>
          <button onClick={() => setScoreTarget(row)} className="btn-ghost p-1.5 text-indigo-500 hover:text-indigo-700" title="Consultar score / crédito">
            <ShieldCheck size={14} />
          </button>
          <button onClick={() => setDetail(row)} className="btn-ghost p-1.5" title="Ver detalhes">
            <Eye size={14} />
          </button>
          <button onClick={() => openEdit(row)} className="btn-ghost p-1.5" title="Editar">
            <Edit2 size={14} />
          </button>
          {isAdmin && (
            <button onClick={() => setDelTarget(row)} className="btn-ghost p-1.5 text-red-400 hover:text-red-600" title="Excluir transportadora">
              <Trash2 size={14} />
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="page-header flex-wrap gap-3" hidden={aba === 'fila'}>
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Truck size={24} className="text-primary-600" />
            Logística
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {aba === 'fila' ? 'Coleta · Trânsito · Entrega — as etapas do que sai da porta'
              : aba === 'expedicao' ? 'Pedidos prontos, avisos ao cliente, coleta e documentos'
              : `${data?.total || 0} transportadoras cadastradas`}
          </p>
        </div>
        {aba === 'transportadoras' && (
          <div className="flex items-center gap-2 flex-wrap">
            <CopyLinkButton path="/cadastro-transportadora" />
            <button onClick={openNew} className="btn-primary">
              <Plus size={16} /> Nova Transportadora
            </button>
          </div>
        )}
      </div>

      {/* DUAS COISAS DIFERENTES NA MESMA TELA, E ISSO E DE PROPOSITO.
          Quem cuida da saida dos pedidos e quem cadastra transportadora
          e a mesma pessoa — mas o trabalho de hoje e a fila, e por isso
          ela abre primeiro. */}
      <div className="flex gap-6 border-b border-gray-200">
        {[['fila', 'Etapas'], ['expedicao', 'Expedição'], ['transportadoras', 'Transportadoras']].map(([k, l]) => (
          <button key={k} onClick={() => setAba(k)}
            className={`pb-2 text-sm font-medium border-b-2 transition-colors ${
              aba === k ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-900'}`}>
            {l}
          </button>
        ))}
      </div>

      {/* A FILA E O TRABALHO DO DIA: o pedido chega da embalagem, a
          logistica registra a coleta (ou a retirada no balcao), o
          transito e a entrega — com senha nas duas portas, como na
          fabrica. A Expedicao (aba seguinte) e o papelorio em volta:
          nota, declaracao, etiqueta, aviso ao cliente. */}
      {aba === 'fila' && (
        <FilaDeEtapas
          modulo="logistica"
          api="/logistica"
          titulo="Logística"
          subtitulo="Coleta / retirada · Em trânsito · Entrega"
          Icone={PackageCheck}
          cor="green"
        />
      )}
      {aba === 'expedicao' && <Expedicao />}

      <div className="card" hidden={aba !== 'transportadoras'}>
        <div className="card-header">
          <form
            onSubmit={e => { e.preventDefault(); setSearch(searchInput); setPage(1); }}
            className="flex gap-3 max-w-md"
          >
            <div className="relative flex-1">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input type="text" placeholder="Nome, CNPJ..." value={searchInput}
                onChange={e => setSearchInput(e.target.value)} className="input pl-9" />
            </div>
            <button type="submit" className="btn-secondary">Buscar</button>
          </form>
        </div>

        <Table columns={columns} data={data?.data} loading={isLoading}
          onRowClick={row => setSelectedId(prev => prev === row.id ? null : row.id)}
          rowClassName={row => row.id === selectedId
            ? '!bg-primary-50 shadow-[inset_3px_0_0_0_theme(colors.primary.600)]'
            : ''} />
        <Pagination page={page} total={data?.total || 0} limit={20} onPageChange={setPage} />
      </div>

      <Modal
        isOpen={modalOpen}
        onClose={close}
        title={editing ? 'Editar Transportadora' : 'Nova Transportadora'}
        size="md"
      >
        <CarrierForm carrier={editing} onSaved={onSaved} onCancel={close} />
      </Modal>

      <DetailModal
        target={detail}
        onClose={() => setDetail(null)}
        onEdit={openEdit}
        title="Ficha da transportadora"
        fields={detail ? [
          { label: 'Razão Social',  value: detail.name, wide: true },
          { label: 'Nome Fantasia', value: detail.trade_name, wide: true },
          { label: 'CNPJ',          value: detail.cnpj },
          { label: 'Inscrição Estadual', value: detail.ie },
          { label: 'Status',        value: detail.is_active ? 'Ativa' : 'Inativa' },
          { label: 'Tipo',          value: detail.is_pickup ? 'Retirada no local' : 'Entrega' },
          { label: 'Contato',       value: detail.contact_name },
          { label: 'Telefone',      value: detail.phone },
          { label: 'WhatsApp',      value: detail.whatsapp },
          { label: 'E-mail',        value: detail.email, wide: true },
          { label: 'Endereço',      value: [detail.address?.street, detail.address?.number, detail.address?.complement].filter(Boolean).join(', '), wide: true },
          { label: 'Bairro',        value: detail.address?.neighborhood },
          { label: 'Cidade/UF',     value: detail.address?.city ? `${detail.address.city}/${detail.address.state || ''}` : null },
          { label: 'CEP',           value: detail.address?.zip },
          { label: 'Horários de coleta', wide: true,
            value: detail.pickup_schedule?.length
              ? detail.pickup_schedule.map(s => `${(s.days || []).join(', ')}${s.time ? ` ${s.time}` : ''}`).join(' · ')
              : null },
        ] : []}
      />

      <CreditCheckModal
        target={scoreTarget}
        onClose={() => setScoreTarget(null)}
        path="/logistics"
        docKey="cnpj"
        docLabel="sem CNPJ"
      />

      <DeletePasswordModal
        target={delTarget}
        onClose={() => setDelTarget(null)}
        onDeleted={() => qc.invalidateQueries({ queryKey: ['carriers'] })}
        path="/logistics"
        title="Excluir transportadora"
        noun="Transportadora"
      />
    </div>
  );
}
