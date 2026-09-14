import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Save, Loader2, Plus, Edit2, Receipt } from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import toast from 'react-hot-toast';
import Modal from '@/components/UI/Modal';
import SiteEditor from './SiteEditor';

const states = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

// Sugestão inicial de condições de pagamento (% negativo = desconto, positivo = juros)
// Valores aproximados das tabelas Lyon (PIX −8% e parcelas "sem juros" com acréscimo embutido).
const PAY_SUGGESTION = [
  { label: 'PIX',          percent: -8 },
  { label: 'Dinheiro',     percent: -8 },
  { label: '1x (à vista)', percent: 0 },
  { label: '3x sem juros', percent: 7.7 },
  { label: '6x sem juros', percent: 10.9 },
  { label: '9x sem juros', percent: 16.6 },
  { label: '12x sem juros', percent: 20.2 },
];

export default function Settings() {
  const { user, tenant } = useAuth();
  const [tab, setTab] = useState('company');
  const qc = useQueryClient();
  const isAdmin = user?.role === 'admin';

  const { data: settings, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get('/settings'),
  });

  const { data: users } = useQuery({
    queryKey: ['settings-users'],
    queryFn: () => api.get('/settings/users'),
    enabled: tab === 'users',
  });

  // ── Serigrafia ──────────────────────────────────────────────
  const [seri, setSeri] = useState(null);
  const { data: seriData } = useQuery({
    queryKey: ['seri-config-settings'],
    queryFn: () => api.get('/production/serigrafia/config'),
    enabled: tab === 'serigrafia',
  });
  useEffect(() => { if (seriData) setSeri(seriData); }, [seriData]);
  const { data: seriProducts } = useQuery({
    queryKey: ['seri-products'],
    queryFn: () => api.get('/products?limit=2000&is_active=true'),
    enabled: tab === 'serigrafia',
  });
  const setSe = (k, v) => setSeri(s => ({ ...s, [k]: v }));
  const saveSeri = useMutation({
    mutationFn: () => api.put('/production/serigrafia/config', seri),
    onSuccess: () => { toast.success('Configuração de serigrafia salva!'); qc.invalidateQueries(['seri-config']); },
    onError: e => toast.error(e.error || 'Erro ao salvar'),
  });

  const [form, setForm] = useState({
    name: '', app_name: '', cnpj: '', phone: '', email: '',
    logo_url: '',
    address: { street: '', number: '', city: '', state: '', zip: '' },
    settings: {},
  });

  const [userModal, setUserModal] = useState(false);
  const [newUser, setNewUser] = useState({ name: '', email: '', password: '', role: 'operator' });
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (settings) {
      setForm({
        name: settings.name || '',
        app_name: settings.app_name || '',
        cnpj: settings.cnpj || '',
        phone: settings.phone || '',
        email: settings.email || '',
        logo_url: settings.logo_url || '',
        address: settings.address || {},
        settings: settings.settings || {},
      });
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: (data) => api.put('/settings', data),
    onSuccess: () => { toast.success('Configurações salvas!'); qc.invalidateQueries(['settings']); },
    onError: (err) => toast.error(err.error || 'Erro ao salvar'),
  });

  async function createUser(e) {
    e.preventDefault();
    setCreating(true);
    try {
      await api.post('/settings/users', newUser);
      toast.success('Usuário criado!');
      setUserModal(false);
      setNewUser({ name: '', email: '', password: '', role: 'operator' });
      qc.invalidateQueries(['settings-users']);
    } catch (err) { toast.error(err.error || 'Erro ao criar usuário'); }
    finally { setCreating(false); }
  }

  function set(k, v) { setForm(p => ({ ...p, [k]: v })); }
  function setAddr(k, v) { setForm(p => ({ ...p, address: { ...p.address, [k]: v } })); }
  function setSetting(k, v) { setForm(p => ({ ...p, settings: { ...p.settings, [k]: v } })); }
  function setCredito(k, v) { setForm(p => ({ ...p, settings: { ...p.settings, credito: { ...(p.settings?.credito || {}), [k]: v } } })); }
  function setEmailCfg(k, v) { setForm(p => ({ ...p, settings: { ...p.settings, email: { ...(p.settings?.email || {}), [k]: v } } })); }
  function setSite(k, v) { setForm(p => ({ ...p, settings: { ...p.settings, site: { ...(p.settings?.site || {}), [k]: v } } })); }
  function setFrete(k, v) { setForm(p => ({ ...p, settings: { ...p.settings, frete: { ...(p.settings?.frete || {}), [k]: v } } })); }
  function setPix(k, v) { setForm(p => ({ ...p, settings: { ...p.settings, pix: { ...(p.settings?.pix || {}), [k]: v } } })); }
  function setPaymentTerms(rows) { setForm(p => ({ ...p, settings: { ...p.settings, payment_terms: rows } })); }
  function setFreteTable(rows) { setForm(p => ({ ...p, settings: { ...p.settings, frete: { ...(p.settings?.frete || {}), table: rows } } })); }
  function gmailPreset() { setForm(p => ({ ...p, settings: { ...p.settings, email: { ...(p.settings?.email || {}), smtp_host: 'smtp.gmail.com', smtp_port: 465, smtp_secure: true } } })); }

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="page-header">
        <h1 className="page-title">Configurações</h1>
      </div>

      <div className="card">
        <div className="card-header flex gap-6">
          {[['company','Empresa'],['site','Site'],['cadastro','Cadastro (site)'],['email','E-mail'],['pagamento','Pagamento'],['frete','Transportadora'],['serigrafia','Serigrafia'],['credito','Crédito'],['users','Usuários'],['fiscal','Fiscal / NF-e']].map(([k,l]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`pb-2 text-sm font-medium border-b-2 transition-colors ${tab === k ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-900'}`}>
              {l}
            </button>
          ))}
        </div>

        {tab === 'company' && (
          <div className="card-body space-y-5">
            {!isAdmin && <p className="text-sm text-amber-700 bg-amber-50 rounded-lg px-4 py-2">Apenas admins podem editar as configurações da empresa.</p>}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="label">Nome da Empresa *</label>
                <input className="input" value={form.name} onChange={e => set('name', e.target.value)} disabled={!isAdmin} />
              </div>
              <div>
                <label className="label">Nome do Sistema (App)</label>
                <input className="input" value={form.app_name} onChange={e => set('app_name', e.target.value)}
                  placeholder="Dator ERP" disabled={!isAdmin} />
                <p className="text-xs text-gray-400 mt-1">Aparece no topo do menu lateral</p>
              </div>
              <div>
                <label className="label">CNPJ</label>
                <input className="input" value={form.cnpj} onChange={e => set('cnpj', e.target.value)}
                  placeholder="00.000.000/0000-00" disabled={!isAdmin} />
              </div>
              <div>
                <label className="label">Telefone</label>
                <input className="input" value={form.phone} onChange={e => set('phone', e.target.value)} disabled={!isAdmin} />
              </div>
              <div>
                <label className="label">E-mail</label>
                <input type="email" className="input" value={form.email} onChange={e => set('email', e.target.value)} disabled={!isAdmin} />
              </div>
              <div className="col-span-2">
                <label className="label">URL do Logotipo</label>
                <input className="input" value={form.logo_url} onChange={e => set('logo_url', e.target.value)}
                  placeholder="https://..." disabled={!isAdmin} />
              </div>
            </div>

            <div>
              <h3 className="font-medium text-gray-900 mb-3">Endereço</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="label">CEP</label>
                  <input className="input" value={form.address?.zip || ''} onChange={e => setAddr('zip', e.target.value)} disabled={!isAdmin} />
                </div>
                <div className="col-span-2">
                  <label className="label">Rua</label>
                  <input className="input" value={form.address?.street || ''} onChange={e => setAddr('street', e.target.value)} disabled={!isAdmin} />
                </div>
                <div>
                  <label className="label">Número</label>
                  <input className="input" value={form.address?.number || ''} onChange={e => setAddr('number', e.target.value)} disabled={!isAdmin} />
                </div>
                <div>
                  <label className="label">Cidade</label>
                  <input className="input" value={form.address?.city || ''} onChange={e => setAddr('city', e.target.value)} disabled={!isAdmin} />
                </div>
                <div>
                  <label className="label">Estado</label>
                  <select className="input" value={form.address?.state || ''} onChange={e => setAddr('state', e.target.value)} disabled={!isAdmin}>
                    <option value="">UF</option>
                    {states.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {isAdmin && (
              <div className="flex justify-end">
                <button onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending} className="btn-primary">
                  {saveMutation.isPending ? <><Loader2 size={15} className="animate-spin" /> Salvando...</> : <><Save size={15} /> Salvar Configurações</>}
                </button>
              </div>
            )}
          </div>
        )}

        {tab === 'cadastro' && (
          <div className="card-body space-y-5">
            {!isAdmin && <p className="text-sm text-amber-700 bg-amber-50 rounded-lg px-4 py-2">Apenas admins podem alterar estas configurações.</p>}

            <div>
              <h3 className="font-medium text-gray-900">Alterar caminho do cadastro</h3>
              <p className="text-sm text-gray-500 mt-1">
                Controla o que acontece <b>depois</b> que o cliente, fornecedor ou transportadora
                conclui um cadastro pelo site (links públicos).
              </p>
            </div>

            {/* Modo manutenção */}
            <label className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-colors ${form.settings?.cadastro_maintenance ? 'border-primary-300 bg-primary-50' : 'border-gray-200 hover:border-gray-300'}`}>
              <input type="checkbox" className="mt-1 rounded"
                checked={!!form.settings?.cadastro_maintenance}
                onChange={e => setSetting('cadastro_maintenance', e.target.checked)}
                disabled={!isAdmin} />
              <span>
                <span className="block text-sm font-semibold text-gray-800">Modo manutenção do site</span>
                <span className="block text-xs text-gray-500 mt-0.5">
                  Quando ligado, após concluir <b>qualquer</b> cadastro o site mostra apenas um card
                  pedindo para voltar ao WhatsApp (não entra na loja nem mostra outras telas).
                  Use enquanto o site estiver em manutenção.
                </span>
              </span>
            </label>

            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="label">Mensagem exibida no card</label>
                <input className="input" value={form.settings?.cadastro_message || ''}
                  onChange={e => setSetting('cadastro_message', e.target.value)}
                  placeholder="Você concluiu o cadastro! Volte para o WhatsApp." disabled={!isAdmin} />
                <p className="text-xs text-gray-400 mt-1">O título do card é sempre “VOCÊ CONCLUIU O CADASTRO”.</p>
              </div>
              <div>
                <label className="label">WhatsApp do botão “Voltar ao WhatsApp”</label>
                <input className="input" value={form.settings?.cadastro_whatsapp || ''}
                  onChange={e => setSetting('cadastro_whatsapp', e.target.value)}
                  placeholder="(44) 99999-9999" disabled={!isAdmin} />
                <p className="text-xs text-gray-400 mt-1">Se ficar em branco, usa o telefone da empresa. Se não houver número, o card não mostra o botão.</p>
              </div>
            </div>

            {isAdmin && (
              <div className="flex justify-end">
                <button onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending} className="btn-primary">
                  {saveMutation.isPending ? <><Loader2 size={15} className="animate-spin" /> Salvando...</> : <><Save size={15} /> Salvar</>}
                </button>
              </div>
            )}
          </div>
        )}

        {tab === 'site' && (
          <div className="card-body space-y-5">
            <div>
              <h3 className="font-medium text-gray-900">Editar site (loja)</h3>
              <p className="text-sm text-gray-500 mt-1">Personalize a página inicial da loja: topo e fotos dos copos, ordem e visibilidade das seções, blocos, textos e redes sociais. As mudanças aparecem no site após <b>Salvar</b>.</p>
            </div>

            <SiteEditor site={form.settings?.site} setSite={setSite} isAdmin={isAdmin} />

            {isAdmin && (
              <div className="flex justify-end sticky bottom-0 bg-white/80 backdrop-blur py-2 -mx-6 px-6 border-t border-gray-100">
                <button onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending} className="btn-primary">
                  {saveMutation.isPending ? <><Loader2 size={15} className="animate-spin" /> Salvando...</> : <><Save size={15} /> Salvar</>}
                </button>
              </div>
            )}
          </div>
        )}

        {tab === 'email' && (
          <div className="card-body space-y-5">
            {!isAdmin && <p className="text-sm text-amber-700 bg-amber-50 rounded-lg px-4 py-2">Apenas admins podem alterar estas configurações.</p>}
            <div>
              <h3 className="font-medium text-gray-900">Envio de e-mail (SMTP)</h3>
              <p className="text-sm text-gray-500 mt-1">
                Vincule um e-mail para o sistema <b>enviar e-mails em massa</b> (Marketing). Serve para o seu
                <b> Gmail</b> (com “senha de app”) ou para serviços como <b>Brevo, SendGrid, Mailgun</b> (use o SMTP deles).
              </p>
              <button type="button" onClick={gmailPreset} disabled={!isAdmin} className="mt-2 text-xs text-primary-600 hover:underline">Preencher dados do Gmail</button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Servidor SMTP</label>
                <input className="input" value={form.settings?.email?.smtp_host || ''} onChange={e => setEmailCfg('smtp_host', e.target.value)} placeholder="smtp.gmail.com" disabled={!isAdmin} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="label">Porta</label>
                  <input type="number" className="input" value={form.settings?.email?.smtp_port ?? ''} onChange={e => setEmailCfg('smtp_port', e.target.value)} placeholder="465" disabled={!isAdmin} />
                </div>
                <div className="flex items-end pb-2">
                  <label className="flex items-center gap-2 text-sm text-gray-600">
                    <input type="checkbox" className="rounded" checked={!!form.settings?.email?.smtp_secure} onChange={e => setEmailCfg('smtp_secure', e.target.checked)} disabled={!isAdmin} />
                    SSL (465)
                  </label>
                </div>
              </div>
              <div>
                <label className="label">Usuário (e-mail de login)</label>
                <input className="input" value={form.settings?.email?.smtp_user || ''} onChange={e => setEmailCfg('smtp_user', e.target.value)} placeholder="seuemail@gmail.com" disabled={!isAdmin} />
              </div>
              <div>
                <label className="label">Senha (ou “senha de app”)</label>
                <input type="password" className="input" value={form.settings?.email?.smtp_pass || ''} onChange={e => setEmailCfg('smtp_pass', e.target.value)} placeholder="••••••••" disabled={!isAdmin} />
              </div>
              <div>
                <label className="label">Nome do remetente</label>
                <input className="input" value={form.settings?.email?.from_name || ''} onChange={e => setEmailCfg('from_name', e.target.value)} placeholder="Lyon Copos" disabled={!isAdmin} />
              </div>
              <div>
                <label className="label">E-mail do remetente (opcional)</label>
                <input className="input" value={form.settings?.email?.from_email || ''} onChange={e => setEmailCfg('from_email', e.target.value)} placeholder="vazio = usa o usuário acima" disabled={!isAdmin} />
              </div>
            </div>
            <p className="text-xs text-gray-400">
              <b>Gmail:</b> ative a verificação em 2 etapas e gere uma <b>“senha de app”</b> em myaccount.google.com → Segurança → Senhas de app, e use ela aqui (não a senha normal).
            </p>
            {isAdmin && (
              <div className="flex justify-end">
                <button onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending} className="btn-primary">
                  {saveMutation.isPending ? <><Loader2 size={15} className="animate-spin" /> Salvando...</> : <><Save size={15} /> Salvar</>}
                </button>
              </div>
            )}
          </div>
        )}

        {tab === 'pagamento' && (
          <div className="card-body space-y-5">
            {!isAdmin && <p className="text-sm text-amber-700 bg-amber-50 rounded-lg px-4 py-2">Apenas admins podem alterar estas configurações.</p>}
            <div>
              <h3 className="font-medium text-gray-900">Condições de pagamento (desconto / juros)</h3>
              <p className="text-sm text-gray-500 mt-1">
                Defina o ajuste de preço por forma de pagamento. <b>%</b> negativo = <b>desconto</b> (ex.: PIX −8),
                positivo = <b>acréscimo/juros</b> (ex.: 12x +10). No PDV, ao escolher a condição, o total é ajustado automaticamente.
              </p>
            </div>

            {(!form.settings?.payment_terms || form.settings.payment_terms.length === 0) && (
              <button type="button" onClick={() => setPaymentTerms(PAY_SUGGESTION)} disabled={!isAdmin}
                className="btn-secondary text-sm"><Plus size={14} /> Preencher com a sugestão (PIX −8%, 2x +2%, …)</button>
            )}

            <div className="space-y-2 max-w-lg">
              {(form.settings?.payment_terms || []).length > 0 && (
                <div className="grid grid-cols-12 gap-2 text-xs text-gray-400 px-1">
                  <span className="col-span-7">Forma de pagamento</span>
                  <span className="col-span-4">% (− desconto / + juros)</span>
                </div>
              )}
              {(form.settings?.payment_terms || []).map((row, i) => {
                const upd = (k, v) => { const t = [...form.settings.payment_terms]; t[i] = { ...t[i], [k]: v }; setPaymentTerms(t); };
                return (
                  <div key={i} className="grid grid-cols-12 gap-2 items-center">
                    <input className="input col-span-7" value={row.label || ''} onChange={e => upd('label', e.target.value)} placeholder="Ex.: PIX, 2x, 12x..." disabled={!isAdmin} />
                    <input type="number" step="0.1" className="input col-span-4" value={row.percent ?? ''} onChange={e => upd('percent', e.target.value === '' ? '' : Number(e.target.value))} placeholder="0" disabled={!isAdmin} />
                    {isAdmin && <button type="button" onClick={() => setPaymentTerms(form.settings.payment_terms.filter((_, j) => j !== i))} className="col-span-1 text-red-400 hover:text-red-600 text-lg leading-none">×</button>}
                  </div>
                );
              })}
              {isAdmin && (
                <button type="button" onClick={() => setPaymentTerms([...(form.settings?.payment_terms || []), { label: '', percent: 0 }])}
                  className="btn-secondary btn-sm mt-1"><Plus size={13} /> Adicionar condição</button>
              )}
            </div>

            {/* Recebimento por PIX — chave própria (Nubank etc.), sem gateway */}
            <div className="border-t border-gray-100 pt-5 max-w-lg">
              <h3 className="font-medium text-gray-900">Recebimento por PIX (chave própria)</h3>
              <p className="text-sm text-gray-500 mt-1">
                Informe a <b>chave PIX</b> da sua conta (ex.: <b>Nubank</b>) para o sistema gerar o
                copia-e-cola/QR <b>direto na sua conta</b> — sem gateway, sem retenção. Em branco, usa o Mercado Pago.
              </p>
              <div className="grid sm:grid-cols-2 gap-4 mt-3">
                <div className="sm:col-span-2">
                  <label className="label">Chave PIX (CNPJ, e-mail, telefone ou aleatória)</label>
                  <input className="input font-mono" value={form.settings?.pix?.key || ''} onChange={e => setPix('key', e.target.value)} placeholder="ex.: 40899894000118" disabled={!isAdmin} />
                </div>
                <div>
                  <label className="label">Nome do recebedor</label>
                  <input className="input" value={form.settings?.pix?.name || ''} onChange={e => setPix('name', e.target.value)} placeholder="LYON COPOS" disabled={!isAdmin} />
                </div>
                <div>
                  <label className="label">Cidade</label>
                  <input className="input" value={form.settings?.pix?.city || ''} onChange={e => setPix('city', e.target.value)} placeholder="ANDIRA" disabled={!isAdmin} />
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                Com a chave preenchida, o pedido do site passa a exigir pagamento: ele fica em
                <b> Comercial → Pagamentos da Loja</b> e só vira Pedido de Venda quando alguém confirmar
                que o PIX caiu na conta. Em branco, o pedido entra direto, sem cobrança.
              </p>
            </div>

            {isAdmin && (
              <div className="flex justify-end">
                <button onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending} className="btn-primary">
                  {saveMutation.isPending ? <><Loader2 size={15} className="animate-spin" /> Salvando...</> : <><Save size={15} /> Salvar</>}
                </button>
              </div>
            )}
          </div>
        )}

        {tab === 'frete' && (
          <div className="card-body space-y-6">
            {!isAdmin && <p className="text-sm text-amber-700 bg-amber-50 rounded-lg px-4 py-2">Apenas admins podem alterar estas configurações.</p>}

            {/* O PREÇO DO FRETE É ESTA TABELA. Não existe mais cotação por
                API decidindo o valor: o que estiver escrito aqui é o que o
                cliente paga, hoje e amanhã. */}
            <div>
              <h3 className="font-medium text-gray-900">Frete por estado</h3>
              <p className="text-sm text-gray-500 mt-1">
                Escreva o valor do frete de cada estado. O site e o PDV pegam o valor
                <b> automaticamente pelo estado do cliente</b> — sem cotação externa, sem cálculo por
                peso e sem acréscimo por cima. Estado em branco usa o valor padrão abaixo.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <label className="label">Frete grátis acima de (R$)</label>
                <input type="number" className="input" value={form.settings?.frete?.free_above ?? ''} onChange={e => setFrete('free_above', e.target.value)} placeholder="0 = desligado" disabled={!isAdmin} />
              </div>
              <div>
                <label className="label">Valor padrão (R$)</label>
                <input type="number" step="0.01" className="input" value={form.settings?.frete?.default_price ?? ''} onChange={e => setFrete('default_price', e.target.value)} placeholder="ex.: 30" disabled={!isAdmin} />
                <p className="text-[11px] text-gray-400 mt-1">Para estado sem valor. Vazio = “a combinar”.</p>
              </div>
              <div>
                <label className="label">Prazo padrão (dias)</label>
                <input type="number" className="input" value={form.settings?.frete?.default_days ?? ''} onChange={e => setFrete('default_days', e.target.value)} placeholder="ex.: 7" disabled={!isAdmin} />
              </div>
              <div>
                <label className="label">CEP de origem</label>
                <input className="input" value={form.settings?.frete?.origin_cep || ''} onChange={e => setFrete('origin_cep', e.target.value)} placeholder="00000-000" disabled={!isAdmin} />
                <p className="text-[11px] text-gray-400 mt-1">De onde a carga sai (usado no rastreio BrasPress).</p>
              </div>
            </div>

            <TabelaFretePorEstado
              linhas={form.settings?.frete?.table || []}
              aoMudar={setFreteTable}
              isAdmin={isAdmin}
            />

            {/* BrasPress — rastreio pela nota. NÃO decide preço. */}
            <div className="border-t border-gray-100 pt-5">
              <label className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-colors ${form.settings?.frete?.bp_enabled ? 'border-primary-300 bg-primary-50' : 'border-gray-200'}`}>
                <input type="checkbox" className="mt-1 rounded" checked={!!form.settings?.frete?.bp_enabled} onChange={e => setFrete('bp_enabled', e.target.checked)} disabled={!isAdmin} />
                <span>
                  <span className="block text-sm font-semibold text-gray-800">BrasPress — rastreio da carga pela nota fiscal</span>
                  <span className="block text-xs text-gray-500 mt-0.5">
                    Serve para <b>acompanhar a entrega</b> dentro do ERP. Não interfere no valor do frete:
                    quem define o preço é a tabela por estado acima.
                  </span>
                </span>
              </label>

              {form.settings?.frete?.bp_enabled && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                  <div>
                    <label className="label">Usuário</label>
                    <input className="input font-mono" value={form.settings?.frete?.bp_user || ''} onChange={e => setFrete('bp_user', e.target.value)} disabled={!isAdmin} />
                  </div>
                  <div>
                    <label className="label">Senha</label>
                    <input type="password" className="input font-mono" value={form.settings?.frete?.bp_password || ''} onChange={e => setFrete('bp_password', e.target.value)} disabled={!isAdmin} />
                  </div>
                  <div>
                    <label className="label">CNPJ pagador do frete</label>
                    <input className="input font-mono" value={form.settings?.frete?.bp_cnpj || ''} onChange={e => setFrete('bp_cnpj', e.target.value)} placeholder="somente números" disabled={!isAdmin} />
                  </div>
                  <div>
                    <label className="label">URL base da API</label>
                    <input className="input font-mono" value={form.settings?.frete?.bp_base_url || ''} onChange={e => setFrete('bp_base_url', e.target.value)} placeholder="https://api.braspress.com" disabled={!isAdmin} />
                  </div>
                </div>
              )}
            </div>

            <TotalExpressWebservice frete={form.settings?.frete || {}} setFrete={setFrete} isAdmin={isAdmin} />

            {isAdmin && (
              <div className="flex justify-end">
                <button onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending} className="btn-primary">
                  {saveMutation.isPending ? <><Loader2 size={15} className="animate-spin" /> Salvando...</> : <><Save size={15} /> Salvar</>}
                </button>
              </div>
            )}
          </div>
        )}

        {tab === 'serigrafia' && (
          <div className="card-body space-y-5">
            {!isAdmin && <p className="text-sm text-amber-700 bg-amber-50 rounded-lg px-4 py-2">Apenas admins podem alterar estas configurações.</p>}
            {!seri ? <p className="text-sm text-gray-400">Carregando...</p> : (
              <>
                <div>
                  <h3 className="font-medium text-gray-900">Gravação de matriz (telas)</h3>
                  <p className="text-sm text-gray-500 mt-1">Usado para calcular a <b>perda</b> quando uma matriz dá erro (emulsão · sensibilizante · removedor) e a durabilidade das telas.</p>
                </div>

                <div>
                  <h4 className="text-sm font-semibold text-gray-700 mb-2">Tamanho padrão da tela</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-md">
                    <div><label className="label">Largura (cm)</label><input type="number" className="input" value={seri.screen_w ?? ''} onChange={e => setSe('screen_w', e.target.value)} disabled={!isAdmin} /></div>
                    <div><label className="label">Comprimento (cm)</label><input type="number" className="input" value={seri.screen_h ?? ''} onChange={e => setSe('screen_h', e.target.value)} disabled={!isAdmin} /></div>
                    <div><label className="label">Área (cm²)</label><input className="input bg-gray-50" disabled value={(Number(seri.screen_w) || 0) * (Number(seri.screen_h) || 0)} /></div>
                  </div>
                </div>

                {/* Consumo + custo + produto de estoque por insumo */}
                {[
                  ['Emulsão', 'emulsao_g_m2', 'g/m²', 'emulsao_cost_kg', 'R$/kg', 'emulsao_product_id'],
                  ['Sensibilizante', 'sensib_g_m2', 'g/m²', 'sensib_cost_kg', 'R$/kg', 'sensib_product_id'],
                  ['Removedor', 'removedor_ml_m2', 'ml/m²', 'removedor_cost_l', 'R$/L', 'removedor_product_id'],
                ].map(([label, ck, cu, costk, costu, pk]) => (
                  <div key={ck} className="border border-gray-100 rounded-xl p-3">
                    <h4 className="text-sm font-semibold text-gray-700 mb-2">{label}</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div><label className="label">Consumo ({cu})</label><input type="number" className="input" value={seri[ck] ?? ''} onChange={e => setSe(ck, e.target.value)} disabled={!isAdmin} /></div>
                      <div><label className="label">Custo ({costu})</label><input type="number" className="input" value={seri[costk] ?? ''} onChange={e => setSe(costk, e.target.value)} disabled={!isAdmin} /></div>
                      <div>
                        <label className="label">Produto no estoque (baixa)</label>
                        <select className="input" value={seri[pk] || ''} onChange={e => setSe(pk, e.target.value || null)} disabled={!isAdmin}>
                          <option value="">— não dar baixa —</option>
                          {(seriProducts?.data || []).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                      </div>
                    </div>
                  </div>
                ))}

                <div className="max-w-xs">
                  <label className="label">Trocar a tela após (recuperações)</label>
                  <input type="number" className="input" value={seri.troca_limite ?? ''} onChange={e => setSe('troca_limite', e.target.value)} disabled={!isAdmin} />
                  <p className="text-xs text-gray-400 mt-1">Acima desse número de recuperações, o sistema avisa que a tela pode precisar de troca.</p>
                </div>

                {isAdmin && (
                  <div className="flex justify-end">
                    <button onClick={() => saveSeri.mutate()} disabled={saveSeri.isPending} className="btn-primary">
                      {saveSeri.isPending ? <><Loader2 size={15} className="animate-spin" /> Salvando...</> : <><Save size={15} /> Salvar</>}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {tab === 'credito' && (
          <div className="card-body space-y-5">
            {!isAdmin && <p className="text-sm text-amber-700 bg-amber-50 rounded-lg px-4 py-2">Apenas admins podem alterar estas configurações.</p>}
            <div>
              <h3 className="font-medium text-gray-900">Consulta de crédito (Serasa / SPC)</h3>
              <p className="text-sm text-gray-500 mt-1">
                Conecte uma <b>API agregadora</b> (BigDataCorp, Assertiva, idwall…) para consultar o CPF do cliente
                direto na ficha. Crie a conta no provedor, pegue a <b>chave (API key)</b> e cole aqui.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Provedor (nome)</label>
                <input className="input" value={form.settings?.credito?.provider || ''} onChange={e => setCredito('provider', e.target.value)} placeholder="Ex.: BigDataCorp" disabled={!isAdmin} />
              </div>
              <div>
                <label className="label">URL da API (endpoint da consulta)</label>
                <input className="input" value={form.settings?.credito?.api_url || ''} onChange={e => setCredito('api_url', e.target.value)} placeholder="https://api.provedor.com/consulta-cpf" disabled={!isAdmin} />
              </div>
              <div className="sm:col-span-2">
                <label className="label">Chave da API (API key / token)</label>
                <input className="input font-mono" value={form.settings?.credito?.api_key || ''} onChange={e => setCredito('api_key', e.target.value)} placeholder="cole aqui" disabled={!isAdmin} />
              </div>
              <div>
                <label className="label">Nome do cabeçalho de auth (opcional)</label>
                <input className="input" value={form.settings?.credito?.auth_header || ''} onChange={e => setCredito('auth_header', e.target.value)} placeholder="vazio = Authorization: Bearer" disabled={!isAdmin} />
              </div>
              <div>
                <label className="label">Campo do CPF no corpo (opcional)</label>
                <input className="input" value={form.settings?.credito?.cpf_field || ''} onChange={e => setCredito('cpf_field', e.target.value)} placeholder="cpf" disabled={!isAdmin} />
              </div>
            </div>
            <p className="text-xs text-gray-400">
              Se algum campo do retorno (score, negativado, restrições) não aparecer certo, me mande um exemplo da resposta do provedor que eu ajusto a leitura.
            </p>
            {isAdmin && (
              <div className="flex justify-end">
                <button onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending} className="btn-primary">
                  {saveMutation.isPending ? <><Loader2 size={15} className="animate-spin" /> Salvando...</> : <><Save size={15} /> Salvar</>}
                </button>
              </div>
            )}
          </div>
        )}

        {tab === 'users' && (
          <div className="card-body">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-gray-500">{users?.length || 0} usuários cadastrados</p>
              {isAdmin && (
                <button onClick={() => setUserModal(true)} className="btn-primary btn-sm">
                  <Plus size={14} /> Novo Usuário
                </button>
              )}
            </div>
            <div className="space-y-2">
              {(users || []).map(u => (
                <div key={u.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-primary-100 rounded-full flex items-center justify-center text-sm font-bold text-primary-700">
                      {u.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-medium text-sm">{u.name}</p>
                      <p className="text-xs text-gray-500">{u.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`badge ${u.role === 'admin' ? 'badge-purple' : u.role === 'manager' ? 'badge-blue' : 'badge-gray'}`}>
                      {u.role === 'admin' ? 'Admin' : u.role === 'manager' ? 'Gerente' : 'Operador'}
                    </span>
                    <span className={`badge ${u.is_active ? 'badge-green' : 'badge-red'}`}>
                      {u.is_active ? 'Ativo' : 'Inativo'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'fiscal' && (
          <div className="card-body">
            {/* ═══ ESTA ABA ERA UMA MAQUETE ═══════════════════════
                Ambiente, série, último número, regime, certificado e
                senha: seis campos sem `value`, sem `onChange`, e um
                botão "Salvar" sem `onClick`. Nada era lido, nada era
                gravado — clicar em salvar não fazia absolutamente nada,
                e a tela ainda dizia que as configurações ficavam
                "armazenadas com segurança no servidor".

                O pior não era o botão morto: era pedir o CERTIFICADO A1
                e a SENHA num formulário que descartava os dois. Quem
                preenchesse estaria entregando a chave privada da
                empresa a um campo que não leva a lugar nenhum — e sairia
                da tela achando que tinha configurado a emissão.

                A configuração fiscal DE VERDADE mora em
                Financeiro → Fiscal / NF-e → Configuração, e é outra
                coisa: o ERP não guarda certificado nem assina XML (ver
                backend/src/routes/fiscal.js). Em vez de duplicar aquela
                tela aqui — duas telas para o mesmo dado é o caminho
                garantido para as duas discordarem —, esta aponta para
                lá. */}
            <div className="max-w-xl">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm font-medium text-blue-900">A configuração da NF-e mudou de lugar</p>
                <p className="text-sm text-blue-700 mt-1 leading-relaxed">
                  Ela agora fica em <b>Financeiro → Fiscal / NF-e</b>, na aba <b>Configuração</b> —
                  junto das notas emitidas e das notas recebidas da SEFAZ, que é onde ela é usada.
                </p>
              </div>

              <div className="mt-4">
                <Link to="/fiscal" className="btn-primary">
                  <Receipt size={15} /> Abrir Fiscal / NF-e
                </Link>
              </div>

              <p className="text-xs text-gray-500 mt-4 leading-relaxed">
                O certificado digital <b>não</b> é enviado ao ERP. Quem assina o XML e conversa com a
                SEFAZ é o gateway fiscal contratado — o certificado é cadastrado no painel dele, e o
                ERP guarda apenas o token de acesso.
              </p>
            </div>
          </div>
        )}
      </div>

      <Modal isOpen={userModal} onClose={() => setUserModal(false)} title="Novo Usuário" size="sm">
        <form onSubmit={createUser} className="space-y-4">
          <div>
            <label className="label">Nome *</label>
            <input className="input" value={newUser.name} onChange={e => setNewUser(p => ({...p, name: e.target.value}))} required />
          </div>
          <div>
            <label className="label">E-mail *</label>
            <input type="email" className="input" value={newUser.email} onChange={e => setNewUser(p => ({...p, email: e.target.value}))} required />
          </div>
          <div>
            <label className="label">Senha *</label>
            <input type="password" className="input" value={newUser.password} onChange={e => setNewUser(p => ({...p, password: e.target.value}))} required minLength={6} />
          </div>
          <div>
            <label className="label">Perfil</label>
            <select className="input" value={newUser.role} onChange={e => setNewUser(p => ({...p, role: e.target.value}))}>
              <option value="operator">Operador</option>
              <option value="manager">Gerente</option>
              <option value="admin">Administrador</option>
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-2 border-t">
            <button type="button" onClick={() => setUserModal(false)} className="btn-secondary">Cancelar</button>
            <button type="submit" disabled={creating} className="btn-primary">
              {creating ? <><Loader2 size={15} className="animate-spin" /> Criando...</> : 'Criar Usuário'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}


// ============================================================
// A TABELA DE FRETE POR ESTADO.
//
// Os 27 estados aparecem sempre, na mesma ordem. Antes era uma lista
// vazia com "Adicionar UF": quem abria não sabia quais estados já
// tinham valor e quais faltavam, e descobrir isso significava contar
// linha por linha. Com os 27 na tela, o buraco salta aos olhos — e
// preencher é digitar, não cadastrar.
//
// Estado em branco não é frete zero: é estado sem regra, que cai no
// valor padrão (ou em "a combinar", se não houver padrão).
// ============================================================
const UF_NOMES = {
  AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia', CE: 'Ceará',
  DF: 'Distrito Federal', ES: 'Espírito Santo', GO: 'Goiás', MA: 'Maranhão',
  MT: 'Mato Grosso', MS: 'Mato Grosso do Sul', MG: 'Minas Gerais', PA: 'Pará',
  PB: 'Paraíba', PR: 'Paraná', PE: 'Pernambuco', PI: 'Piauí', RJ: 'Rio de Janeiro',
  RN: 'Rio Grande do Norte', RS: 'Rio Grande do Sul', RO: 'Rondônia', RR: 'Roraima',
  SC: 'Santa Catarina', SP: 'São Paulo', SE: 'Sergipe', TO: 'Tocantins',
};

function TabelaFretePorEstado({ linhas, aoMudar, isAdmin }) {
  const porUf = Object.fromEntries((linhas || []).map(r => [String(r.uf || '').toUpperCase(), r]));
  const preenchidos = states.filter(uf => {
    const v = porUf[uf]?.price;
    return v !== undefined && v !== null && v !== '';
  }).length;

  // Grava mantendo a tabela como lista (formato que o servidor lê), sem
  // criar linha para estado que o usuário não tocou.
  function set(uf, campo, valor) {
    const atual = porUf[uf];
    let novas;
    if (atual) {
      novas = linhas.map(r => (String(r.uf || '').toUpperCase() === uf ? { ...r, [campo]: valor } : r));
    } else {
      novas = [...(linhas || []), { uf, price: '', days: '', [campo]: valor }];
    }
    // Estado esvaziado por completo sai da lista: some do banco em vez de
    // ficar lá como linha em branco.
    novas = novas.filter(r => (r.price !== '' && r.price != null) || (r.days !== '' && r.days != null));
    aoMudar(novas);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-semibold text-gray-700">Valor por estado</h4>
        <span className={`text-xs ${preenchidos === states.length ? 'text-green-600' : 'text-amber-600'}`}>
          {preenchidos} de {states.length} estados com valor
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-x-4 gap-y-2">
        {states.map(uf => {
          const row = porUf[uf] || {};
          const vazio = row.price === undefined || row.price === null || row.price === '';
          return (
            <div key={uf} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 ${vazio ? '' : 'bg-gray-50'}`}>
              <span className="w-9 shrink-0 text-xs font-bold text-gray-700" title={UF_NOMES[uf]}>{uf}</span>
              <span className="hidden xl:block flex-1 min-w-0 truncate text-[11px] text-gray-400">{UF_NOMES[uf]}</span>
              <div className="flex items-center gap-1">
                <span className="text-[11px] text-gray-400">R$</span>
                <input type="number" step="0.01" className="input py-1 w-24 text-sm" value={row.price ?? ''}
                  onChange={e => set(uf, 'price', e.target.value)} placeholder="—" disabled={!isAdmin} />
              </div>
              <div className="flex items-center gap-1">
                <input type="number" className="input py-1 w-14 text-sm" value={row.days ?? ''}
                  onChange={e => set(uf, 'days', e.target.value)} placeholder="dias" disabled={!isAdmin} />
                <span className="text-[11px] text-gray-400">d</span>
              </div>
            </div>
          );
        })}
      </div>

      {preenchidos === 0 && (
        <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mt-3">
          Nenhum estado tem valor: o site vai dizer ao cliente que o frete será combinado depois.
        </p>
      )}
    </div>
  );
}

// ── Total Express: o webservice de coleta e rastreio ─────────
//
// O preço continua saindo da tabela negociada. Aqui mora só o acesso ao
// webservice (EDI ICS V24), que transmite as coletas da Expedição e traz
// o rastreio de volta. A conta da Total Express também libera por IP: o
// teste mostra o IP do servidor, que é o número a mandar para eles.
const SERVICOS_TOTAL_EXPRESS = [
  [1, 'Expresso'], [2, 'Especial'], [3, 'Standard com transferência rodoviária'],
  [4, 'Entrega Fácil'], [5, 'Premium'], [6, 'Standard'], [7, 'Super Expresso'],
];

function TotalExpressWebservice({ frete, setFrete, isAdmin }) {
  const [teste, setTeste] = useState(null);
  const [testando, setTestando] = useState(false);

  async function testar() {
    setTestando(true);
    try { setTeste(await api.get('/shipping/total-express/diagnostico')); }
    catch (e) { setTeste({ erro: e.error || 'Não foi possível testar agora.' }); }
    finally { setTestando(false); }
  }

  const liberado = !!teste?.acesso?.ok;
  return (
    <div className="border-t border-gray-100 pt-5">
      <h3 className="font-medium text-gray-900">Total Express — coleta e rastreio (webservice)</h3>
      <p className="text-sm text-gray-500 mt-1">
        Com o acesso preenchido, a <b>Expedição</b> transmite as coletas em lote para a Total Express,
        e o rastreio volta sozinho de hora em hora, atualizando a etapa do pedido.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
        <div>
          <label className="label">Usuário</label>
          <input className="input font-mono" autoComplete="off" value={frete.tex_ws_user || ''}
            onChange={e => setFrete('tex_ws_user', e.target.value)} disabled={!isAdmin} />
        </div>
        <div>
          <label className="label">Senha</label>
          <input type="password" className="input font-mono" autoComplete="new-password" value={frete.tex_ws_password || ''}
            onChange={e => setFrete('tex_ws_password', e.target.value)} disabled={!isAdmin} />
        </div>
        <div>
          <label className="label">REID (código da empresa na Total Express)</label>
          <input className="input font-mono" value={frete.tex_reid || ''}
            onChange={e => setFrete('tex_reid', e.target.value)} disabled={!isAdmin} />
        </div>
        <div>
          <label className="label">Serviço contratado</label>
          <select className="input" value={frete.tex_servico || 1}
            onChange={e => setFrete('tex_servico', Number(e.target.value))} disabled={!isAdmin}>
            {SERVICOS_TOTAL_EXPRESS.map(([v, n]) => <option key={v} value={v}>{v} — {n}</option>)}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="label">Natureza da mercadoria (vai no CT-e)</label>
          <input className="input" maxLength={25} value={frete.tex_natureza || ''} placeholder="COPOS PERSONALIZADOS"
            onChange={e => setFrete('tex_natureza', e.target.value)} disabled={!isAdmin} />
        </div>
      </div>

      {isAdmin && (
        <div className="mt-3 flex items-center gap-2">
          <button type="button" className="btn-secondary" onClick={testar} disabled={testando}>
            {testando ? 'Testando…' : 'Testar conexão'}
          </button>
          <span className="text-xs text-gray-400">Salve antes de testar.</span>
        </div>
      )}

      {teste && (
        <div className={`mt-3 text-sm rounded-lg px-3 py-2 border ${
          liberado ? 'bg-green-50 border-green-200 text-green-800' : 'bg-amber-50 border-amber-200 text-amber-900'}`}>
          {teste.erro ? teste.erro : (
            <>
              <p><b>{liberado ? 'Acesso liberado.' : (teste.acesso?.mensagem || 'Usuário e senha ainda não configurados.')}</b></p>
              {teste.ip_do_servidor && (
                <p className="mt-1">
                  IP de saída deste servidor: <b className="font-mono">{teste.ip_do_servidor}</b>
                  {!liberado && ' — envie este IP à Total Express (edi@totalexpress.com.br) para liberarem o acesso.'}
                </p>
              )}
              {!teste.transportadora_cadastrada && (
                <p className="mt-1">Cadastre a transportadora "Total Express" em Logística para os pedidos poderem usá-la.</p>
              )}
              {!teste.migracao_aplicada && <p className="mt-1">A migração 120 ainda não foi aplicada no banco.</p>}
            </>
          )}
        </div>
      )}
    </div>
  );
}
