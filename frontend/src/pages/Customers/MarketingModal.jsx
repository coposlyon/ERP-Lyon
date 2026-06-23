import { useState, useEffect } from 'react';
import { X, MessageCircle, Mail, Star, CheckSquare, Square, Send, Users, Loader2 } from 'lucide-react';
import api from '@/lib/api';
import toast from 'react-hot-toast';

const TYPE_OPTIONS = [
  { value: '',        label: 'Todos' },
  { value: 'cliente', label: 'Clientes' },
  { value: 'PF',      label: 'PF' },
  { value: 'PJ',      label: 'PJ' },
];

export default function MarketingModal({ isOpen, onClose }) {
  const [tab,          setTab]          = useState('whatsapp'); // 'whatsapp' | 'email'
  const [ratingFilter, setRatingFilter] = useState(null);
  const [typeFilter,   setTypeFilter]   = useState('cliente');
  const [customers,    setCustomers]    = useState([]);
  const [selected,     setSelected]     = useState(new Set());
  const [message,      setMessage]      = useState('');
  const [subject,      setSubject]      = useState('');
  const [emailBody,    setEmailBody]    = useState('');
  const [loading,      setLoading]      = useState(false);
  const [sent,         setSent]         = useState(new Set());

  useEffect(() => {
    if (isOpen) { fetchCustomers(); setSent(new Set()); }
  }, [isOpen, ratingFilter, typeFilter]);

  useEffect(() => {
    setSelected(new Set());
    setSent(new Set());
  }, [tab]);

  async function fetchCustomers() {
    setLoading(true);
    try {
      let url = '/customers?limit=500';
      if (ratingFilter) url += `&rating=${ratingFilter}`;
      if (typeFilter)   url += `&type=${typeFilter}`;
      const res = await api.get(url);
      setCustomers(res.data || []);
    } catch { setCustomers([]); }
    finally  { setLoading(false); }
  }

  // Filtra só quem tem o contato relevante
  const relevant = tab === 'whatsapp'
    ? customers.filter(c => c.phone)
    : customers.filter(c => c.email);

  const allSelected   = relevant.length > 0 && selected.size === relevant.length;
  const selectedList  = relevant.filter(c => selected.has(c.id));

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(relevant.map(c => c.id)));
  }
  function toggle(id) {
    setSelected(p => { const s = new Set(p); s.has(id) ? s.delete(id) : s.add(id); return s; });
  }

  function waLink(customer) {
    const num  = (customer.phone || '').replace(/\D/g, '');
    const full = num.startsWith('55') ? num : `55${num}`;
    return `https://wa.me/${full}?text=${encodeURIComponent(message)}`;
  }

  function markSent(id) {
    setSent(p => { const s = new Set(p); s.add(id); return s; });
  }

  function openEmailClient() {
    const emails = selectedList.map(c => c.email).filter(Boolean);
    if (!emails.length) return;
    const link = `mailto:?bcc=${emails.join(',')}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(emailBody)}`;
    window.location.href = link;
  }

  const [sendingEmail, setSendingEmail] = useState(false);
  async function sendEmailViaSystem() {
    const emails = selectedList.map(c => c.email).filter(Boolean);
    if (!emails.length) { toast.error('Selecione clientes com e-mail'); return; }
    if (!subject.trim() || !emailBody.trim()) { toast.error('Preencha assunto e mensagem'); return; }
    setSendingEmail(true);
    try {
      const r = await api.post('/customers/marketing/email', { subject, message: emailBody, emails });
      toast.success(`Enviado para ${r.sent} de ${r.total} destinatário(s)!`);
    } catch (e) {
      toast.error(e.error || 'Não foi possível enviar');
    } finally { setSendingEmail(false); }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Users size={20} className="text-primary-600" />
            <h2 className="text-lg font-semibold text-gray-900">Marketing</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100 px-6">
          {[
            { id: 'whatsapp', icon: <MessageCircle size={15} />, label: 'WhatsApp em Massa' },
            { id: 'email',    icon: <Mail          size={15} />, label: 'Email em Massa'    },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === t.id
                  ? 'border-primary-600 text-primary-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.icon}{t.label}
            </button>
          ))}
        </div>

        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Filtros */}
          <div className="px-6 py-3 border-b border-gray-100 bg-gray-50 flex flex-wrap gap-3 items-center">
            {/* Tipo */}
            <div className="flex gap-1 bg-white rounded-lg border border-gray-200 p-0.5">
              {TYPE_OPTIONS.map(o => (
                <button key={o.value} onClick={() => { setTypeFilter(o.value); }}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                    typeFilter === o.value ? 'bg-primary-600 text-white' : 'text-gray-500 hover:text-gray-800'
                  }`}>
                  {o.label}
                </button>
              ))}
            </div>

            {/* Estrelas */}
            <div className="flex items-center gap-0.5 bg-white border border-gray-200 rounded-lg px-2 py-1">
              <span className="text-xs text-gray-400 mr-1">Avaliação:</span>
              {[1,2,3,4,5].map(n => (
                <button key={n} type="button" onClick={() => setRatingFilter(p => p === n ? null : n)}
                  className="focus:outline-none hover:scale-110 transition-transform">
                  <Star size={15} className={n === ratingFilter ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300 hover:text-yellow-300'} />
                </button>
              ))}
              {ratingFilter && (
                <button onClick={() => setRatingFilter(null)} className="ml-1 text-xs text-gray-400 hover:text-gray-600">✕</button>
              )}
            </div>

            <span className="text-xs text-gray-400 ml-auto">
              {loading ? 'Carregando...' : `${relevant.length} contato${relevant.length !== 1 ? 's' : ''} com ${tab === 'whatsapp' ? 'telefone' : 'e-mail'}`}
            </span>
          </div>

          <div className="flex flex-1 overflow-hidden">
            {/* Lista de clientes */}
            <div className="w-72 border-r border-gray-100 flex flex-col overflow-hidden shrink-0">
              {/* Selecionar todos */}
              <button onClick={toggleAll}
                className="flex items-center gap-2 px-4 py-2.5 text-xs font-medium text-gray-600 hover:bg-gray-50 border-b border-gray-100">
                {allSelected
                  ? <CheckSquare size={14} className="text-primary-600" />
                  : <Square      size={14} className="text-gray-400"    />}
                Selecionar todos ({relevant.length})
              </button>

              <div className="overflow-y-auto flex-1">
                {loading && (
                  <div className="text-xs text-gray-400 text-center py-8">Carregando clientes...</div>
                )}
                {!loading && relevant.length === 0 && (
                  <div className="text-xs text-gray-400 text-center py-8">Nenhum cliente com {tab === 'whatsapp' ? 'telefone' : 'e-mail'} cadastrado</div>
                )}
                {relevant.map(c => (
                  <label key={c.id}
                    className={`flex items-center gap-2.5 px-4 py-2.5 cursor-pointer hover:bg-gray-50 border-b border-gray-50 ${
                      selected.has(c.id) ? 'bg-primary-50' : ''
                    }`}>
                    <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} className="rounded text-primary-600" />
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-gray-900 truncate">{c.name}</p>
                      <p className="text-xs text-gray-400 truncate">{tab === 'whatsapp' ? c.phone : c.email}</p>
                    </div>
                    {c.rating && (
                      <div className="ml-auto flex shrink-0">
                        {[1,2,3,4,5].slice(0, c.rating).map(n => (
                          <Star key={n} size={10} className="text-yellow-400 fill-yellow-400" />
                        ))}
                      </div>
                    )}
                  </label>
                ))}
              </div>
            </div>

            {/* Área de mensagem */}
            <div className="flex-1 flex flex-col p-5 overflow-y-auto">

              {tab === 'whatsapp' && (
                <>
                  <div className="mb-3">
                    <label className="text-xs font-semibold text-gray-700 block mb-1">
                      Mensagem <span className="text-gray-400 font-normal">({selectedList.length} destinatário{selectedList.length !== 1 ? 's' : ''} selecionado{selectedList.length !== 1 ? 's' : ''})</span>
                    </label>
                    <textarea
                      value={message}
                      onChange={e => setMessage(e.target.value)}
                      placeholder="Olá {nome}, temos uma novidade exclusiva para você..."
                      className="input min-h-[100px] resize-none text-sm"
                    />
                    <p className="text-xs text-gray-400 mt-1">Dica: use <strong>{'{nome}'}</strong> para personalizar com o nome do cliente.</p>
                  </div>

                  {selectedList.length > 0 && message && (
                    <>
                      <div className="flex items-center gap-2 mb-2">
                        <Send size={13} className="text-green-600" />
                        <p className="text-xs font-semibold text-gray-700">Links para envio — clique em cada um para abrir o WhatsApp:</p>
                        <span className="ml-auto text-xs text-gray-400">{sent.size}/{selectedList.length} enviados</span>
                      </div>
                      <div className="space-y-1.5 overflow-y-auto max-h-52">
                        {selectedList.map(c => {
                          const personalizedMsg = message.replace(/\{nome\}/gi, c.name);
                          const link = `https://wa.me/${(c.phone.replace(/\D/g,'').startsWith('55') ? '' : '55') + c.phone.replace(/\D/g,'')}?text=${encodeURIComponent(personalizedMsg)}`;
                          const done = sent.has(c.id);
                          return (
                            <a
                              key={c.id}
                              href={link}
                              target="_blank"
                              rel="noreferrer"
                              onClick={() => markSent(c.id)}
                              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                                done
                                  ? 'bg-green-50 text-green-700 border border-green-200'
                                  : 'bg-green-600 text-white hover:bg-green-700'
                              }`}
                            >
                              <MessageCircle size={14} />
                              {done ? '✓ ' : ''}{c.name}
                              <span className="text-xs opacity-70 ml-auto">{c.phone}</span>
                            </a>
                          );
                        })}
                      </div>
                    </>
                  )}

                  {selectedList.length === 0 && (
                    <p className="text-xs text-gray-400 text-center mt-8">Selecione os clientes na lista ao lado</p>
                  )}
                </>
              )}

              {tab === 'email' && (
                <>
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-semibold text-gray-700 block mb-1">
                        Assunto <span className="text-gray-400 font-normal">({selectedList.length} destinatário{selectedList.length !== 1 ? 's' : ''} selecionado{selectedList.length !== 1 ? 's' : ''})</span>
                      </label>
                      <input value={subject} onChange={e => setSubject(e.target.value)}
                        placeholder="Novidades exclusivas para você!" className="input text-sm" />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-700 block mb-1">Mensagem</label>
                      <textarea
                        value={emailBody}
                        onChange={e => setEmailBody(e.target.value)}
                        placeholder="Olá! Temos uma novidade especial..."
                        className="input min-h-[120px] resize-none text-sm"
                      />
                    </div>

                    {selectedList.length > 0 && (
                      <div>
                        <p className="text-xs text-gray-500 mb-2">E-mails selecionados:</p>
                        <div className="bg-gray-50 rounded-lg p-2 text-xs text-gray-600 max-h-24 overflow-y-auto space-y-0.5">
                          {selectedList.map(c => <p key={c.id}>{c.email}</p>)}
                        </div>
                      </div>
                    )}

                    <button
                      onClick={sendEmailViaSystem}
                      disabled={sendingEmail || selectedList.length === 0 || !subject || !emailBody}
                      className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {sendingEmail ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                      Enviar pelo sistema ({selectedList.length} destinatários)
                    </button>
                    <button
                      onClick={openEmailClient}
                      disabled={selectedList.length === 0 || !subject || !emailBody}
                      className="btn-secondary w-full flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Mail size={15} /> Abrir no meu app de e-mail
                    </button>
                    <p className="text-xs text-gray-400 text-center">
                      “Enviar pelo sistema” usa o SMTP de <b>Configurações → E-mail</b>. A outra opção abre seu app com os destinatários em CCO.
                    </p>
                  </div>

                  {selectedList.length === 0 && (
                    <p className="text-xs text-gray-400 text-center mt-8">Selecione os clientes na lista ao lado</p>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
