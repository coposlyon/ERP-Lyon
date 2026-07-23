import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Save, Loader2, Plus, Edit2 } from 'lucide-react';
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
              <p className="text-xs text-gray-400 mt-2">A <b>baixa automática</b> desse PIX é feita pela conciliação Open Finance (Pluggy) — configurada à parte.</p>
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

            {/* Tabela regional — funciona já */}
            <div>
              <h3 className="font-medium text-gray-900">Frete e prazo automáticos (por estado)</h3>
              <p className="text-sm text-gray-500 mt-1">
                Define o <b>valor do frete</b> e os <b>dias de entrega</b> por estado (UF). O sistema calcula
                automaticamente no PDV usando o estado do cliente e o peso (nº de copos × peso unitário).
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <label className="label">CEP de origem</label>
                <input className="input" value={form.settings?.frete?.origin_cep || ''} onChange={e => setFrete('origin_cep', e.target.value)} placeholder="00000-000" disabled={!isAdmin} />
              </div>
              <div>
                <label className="label">Peso por copo (g)</label>
                <input type="number" className="input" value={form.settings?.frete?.weight_per_unit_g ?? ''} onChange={e => setFrete('weight_per_unit_g', e.target.value)} placeholder="200" disabled={!isAdmin} />
              </div>
              <div>
                <label className="label">Frete grátis acima de (R$)</label>
                <input type="number" className="input" value={form.settings?.frete?.free_above ?? ''} onChange={e => setFrete('free_above', e.target.value)} placeholder="0 = desligado" disabled={!isAdmin} />
              </div>
              <div>
                <label className="label">Acréscimo no frete (%)</label>
                <input type="number" step="0.1" className="input" value={form.settings?.frete?.freight_markup ?? ''} onChange={e => setFrete('freight_markup', e.target.value)} placeholder="14" disabled={!isAdmin} />
                <p className="text-xs text-gray-400 mt-1">% somado ao frete (caixa + peso). Vazio = 14%. Ex.: R$50 → R$57.</p>
              </div>
              <div>
                <label className="label">Prazo padrão (dias)</label>
                <input type="number" className="input" value={form.settings?.frete?.default_days ?? ''} onChange={e => setFrete('default_days', e.target.value)} placeholder="ex.: 7" disabled={!isAdmin} />
              </div>
              <div>
                <label className="label">Frete padrão (R$)</label>
                <input type="number" step="0.01" className="input" value={form.settings?.frete?.default_price ?? ''} onChange={e => setFrete('default_price', e.target.value)} placeholder="ex.: 30" disabled={!isAdmin} />
                <p className="text-[11px] text-gray-400 mt-1">Usado quando o estado não tem regra própria (e sem cotação por API). Vazio = "A combinar".</p>
              </div>
              <div>
                <label className="label">Frete padrão + por kg (R$)</label>
                <input type="number" step="0.01" className="input" value={form.settings?.frete?.default_per_kg ?? ''} onChange={e => setFrete('default_per_kg', e.target.value)} placeholder="0" disabled={!isAdmin} />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-semibold text-gray-700">Tabela por estado</h4>
                {isAdmin && (
                  <button type="button" onClick={() => setFreteTable([...(form.settings?.frete?.table || []), { uf: '', price: '', per_kg: '', days: '' }])}
                    className="btn-secondary btn-sm"><Plus size={13} /> Adicionar UF</button>
                )}
              </div>
              <div className="space-y-2">
                <div className="grid grid-cols-12 gap-2 text-xs text-gray-400 px-1">
                  <span className="col-span-2">UF</span><span className="col-span-3">Frete base (R$)</span>
                  <span className="col-span-3">+ por kg (R$)</span><span className="col-span-3">Prazo (dias)</span>
                </div>
                {(form.settings?.frete?.table || []).map((row, i) => {
                  const upd = (k, v) => { const t = [...form.settings.frete.table]; t[i] = { ...t[i], [k]: v }; setFreteTable(t); };
                  return (
                    <div key={i} className="grid grid-cols-12 gap-2 items-center">
                      <select className="input col-span-2" value={row.uf || ''} onChange={e => upd('uf', e.target.value)} disabled={!isAdmin}>
                        <option value="">UF</option>{states.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                      <input type="number" className="input col-span-3" value={row.price ?? ''} onChange={e => upd('price', e.target.value)} placeholder="0,00" disabled={!isAdmin} />
                      <input type="number" className="input col-span-3" value={row.per_kg ?? ''} onChange={e => upd('per_kg', e.target.value)} placeholder="0,00" disabled={!isAdmin} />
                      <input type="number" className="input col-span-3" value={row.days ?? ''} onChange={e => upd('days', e.target.value)} placeholder="dias" disabled={!isAdmin} />
                      {isAdmin && <button type="button" onClick={() => setFreteTable(form.settings.frete.table.filter((_, j) => j !== i))} className="col-span-1 text-red-400 hover:text-red-600 text-lg leading-none">×</button>}
                    </div>
                  );
                })}
                {(form.settings?.frete?.table || []).length === 0 && <p className="text-xs text-gray-400">Nenhum estado configurado — usa o prazo/frete padrão acima.</p>}
              </div>
            </div>

            {/* J&T API — precisa de conta/credenciais */}
            <div className="border-t border-gray-100 pt-5">
              <label className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-colors ${form.settings?.frete?.enabled ? 'border-primary-300 bg-primary-50' : 'border-gray-200'}`}>
                <input type="checkbox" className="mt-1 rounded" checked={!!form.settings?.frete?.enabled} onChange={e => setFrete('enabled', e.target.checked)} disabled={!isAdmin} />
                <span>
                  <span className="block text-sm font-semibold text-gray-800">Integração J&T Express (envios, etiqueta e rastreio pela API)</span>
                  <span className="block text-xs text-gray-500 mt-0.5">Preencha com a <b>conta de cliente da API J&T</b> (apiAccount, customerCode, senha e privateKey). Com isso o sistema gera o envio direto da venda, imprime a etiqueta e rastreia. Se os campos ficarem vazios, o servidor usa as credenciais das variáveis de ambiente (JT_*).</span>
                </span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                <div>
                  <label className="label">apiAccount</label>
                  <input className="input font-mono" value={form.settings?.frete?.jt_api_account || ''} onChange={e => setFrete('jt_api_account', e.target.value)} disabled={!isAdmin} />
                </div>
                <div>
                  <label className="label">customerCode</label>
                  <input className="input font-mono" value={form.settings?.frete?.jt_customer_code || ''} onChange={e => setFrete('jt_customer_code', e.target.value)} disabled={!isAdmin} />
                </div>
                <div>
                  <label className="label">Senha (API)</label>
                  <input type="password" className="input font-mono" value={form.settings?.frete?.jt_password || ''} onChange={e => setFrete('jt_password', e.target.value)} placeholder="senha do cliente J&T" disabled={!isAdmin} />
                </div>
                <div>
                  <label className="label">privateKey</label>
                  <input className="input font-mono" value={form.settings?.frete?.jt_private_key || ''} onChange={e => setFrete('jt_private_key', e.target.value)} placeholder="cole a chave privada da J&T" disabled={!isAdmin} />
                </div>
                <div className="sm:col-span-2">
                  <label className="label">URL base da API</label>
                  <input className="input font-mono" value={form.settings?.frete?.jt_base_url || ''} onChange={e => setFrete('jt_base_url', e.target.value)} placeholder="https://openapi.jtjms-br.com" disabled={!isAdmin} />
                  <p className="text-xs text-gray-400 mt-1">Homologação: <code>https://demoopenapi.jtjms-br.com</code> · Produção: <code>https://openapi.jtjms-br.com</code></p>
                </div>
              </div>
            </div>

            {/* BrasPress API — cotação (loja) + rastreio por NF */}
            <div className="border-t border-gray-100 pt-5">
              <label className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-colors ${form.settings?.frete?.bp_enabled ? 'border-primary-300 bg-primary-50' : 'border-gray-200'}`}>
                <input type="checkbox" className="mt-1 rounded" checked={!!form.settings?.frete?.bp_enabled} onChange={e => setFrete('bp_enabled', e.target.checked)} disabled={!isAdmin} />
                <span>
                  <span className="block text-sm font-semibold text-gray-800">Integração BrasPress (cotação na loja + rastreio por Nota Fiscal)</span>
                  <span className="block text-xs text-gray-500 mt-0.5">Com as credenciais da <b>API BrasPress</b> (usuário, senha e CNPJ), a loja passa a mostrar o frete da BrasPress no carrinho e você rastreia a encomenda pela NF na venda (aba Transportadores). Se os campos ficarem vazios, o servidor usa as variáveis de ambiente (BRASPRESS_*).</span>
                </span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                <div>
                  <label className="label">Usuário (API)</label>
                  <input className="input font-mono" value={form.settings?.frete?.bp_user || ''} onChange={e => setFrete('bp_user', e.target.value)} placeholder="00000000000000_PRD" disabled={!isAdmin} />
                </div>
                <div>
                  <label className="label">Senha (API)</label>
                  <input type="password" className="input font-mono" value={form.settings?.frete?.bp_password || ''} onChange={e => setFrete('bp_password', e.target.value)} placeholder="senha da API BrasPress" disabled={!isAdmin} />
                </div>
                <div>
                  <label className="label">CNPJ do contrato (remetente / pagador do frete)</label>
                  <input className="input font-mono" value={form.settings?.frete?.bp_cnpj || ''} onChange={e => setFrete('bp_cnpj', e.target.value)} placeholder="somente números" disabled={!isAdmin} />
                </div>
                <div>
                  <label className="label">CNPJ destinatário padrão (cotação sem CNPJ)</label>
                  <input className="input font-mono" value={form.settings?.frete?.bp_cnpj_dest || ''} onChange={e => setFrete('bp_cnpj_dest', e.target.value)} placeholder="opcional — usa o do contrato se vazio" disabled={!isAdmin} />
                  <p className="text-xs text-gray-400 mt-1">A BrasPress exige CNPJ do destinatário na cotação. Na loja, quando o cliente é consumidor, usa-se este CNPJ (a cotação depende de CEP/peso/volume, não do destinatário).</p>
                </div>
                <div>
                  <label className="label">Modal</label>
                  <select className="input" value={form.settings?.frete?.bp_modal || 'R'} onChange={e => setFrete('bp_modal', e.target.value)} disabled={!isAdmin}>
                    <option value="R">Rodoviário</option>
                    <option value="A">Aéreo</option>
                  </select>
                </div>
                <div>
                  <label className="label">Tipo de frete</label>
                  <select className="input" value={String(form.settings?.frete?.bp_tipo_frete || 1)} onChange={e => setFrete('bp_tipo_frete', e.target.value)} disabled={!isAdmin}>
                    <option value="1">CIF (pago pelo remetente)</option>
                    <option value="2">FOB (pago pelo destinatário)</option>
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="label">URL base da API</label>
                  <input className="input font-mono" value={form.settings?.frete?.bp_base_url || ''} onChange={e => setFrete('bp_base_url', e.target.value)} placeholder="https://api.braspress.com" disabled={!isAdmin} />
                </div>
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
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-5">
              <p className="text-sm font-medium text-blue-900">Configuração de NF-e</p>
              <p className="text-sm text-blue-700 mt-1">
                Para emitir NF-e, você precisa configurar o certificado digital A1 (.pfx) e o ambiente (homologação ou produção).
                Essas configurações ficam armazenadas com segurança no servidor.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Ambiente</label>
                <select className="input" disabled={!isAdmin}>
                  <option value="1">Produção</option>
                  <option value="2">Homologação (Testes)</option>
                </select>
              </div>
              <div>
                <label className="label">Série NF-e</label>
                <input type="number" className="input" placeholder="1" disabled={!isAdmin} />
              </div>
              <div>
                <label className="label">Último número NF-e</label>
                <input type="number" className="input" placeholder="0" disabled={!isAdmin} />
              </div>
              <div>
                <label className="label">Regime Tributário</label>
                <select className="input" disabled={!isAdmin}>
                  <option value="1">Simples Nacional</option>
                  <option value="2">Simples Nacional — Excesso</option>
                  <option value="3">Regime Normal</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="label">Certificado Digital A1 (.pfx)</label>
                <input type="file" accept=".pfx,.p12" className="input" disabled={!isAdmin} />
              </div>
              <div>
                <label className="label">Senha do Certificado</label>
                <input type="password" className="input" disabled={!isAdmin} />
              </div>
            </div>
            {isAdmin && (
              <div className="flex justify-end mt-4">
                <button className="btn-primary"><Save size={15} /> Salvar Configurações Fiscais</button>
              </div>
            )}
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
