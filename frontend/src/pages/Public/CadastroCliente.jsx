import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Loader2, User, Instagram, ExternalLink, Play } from 'lucide-react';
import storeApi from '@/store/storeApi';
import { setStoreCustomer } from '@/store/StoreAuthContext';
import '@/store/store.css';
import toast from 'react-hot-toast';
import CadastroDone from './CadastroDone';
import SolicitarAlteracao from './SolicitarAlteracao';
import AberturaCadastro from './AberturaCadastro';
import { textosCadastro } from './cadastroTextos';

const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
const INPUT = 'w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:border-violet-400 focus:ring-2 focus:ring-violet-100 outline-none text-sm transition';

const maskCPF = v => v.replace(/\D/g,'').slice(0,11).replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d{1,2})$/,'$1-$2');
const maskCNPJ = v => v.replace(/\D/g,'').slice(0,14).replace(/(\d{2})(\d)/,'$1.$2').replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d)/,'$1/$2').replace(/(\d{4})(\d{1,2})$/,'$1-$2');
const maskPhone = v => { const d=v.replace(/\D/g,'').slice(0,11); return d.length<=10 ? d.replace(/(\d{2})(\d)/,'($1) $2').replace(/(\d{4})(\d{1,4})$/,'$1-$2') : d.replace(/(\d{2})(\d)/,'($1) $2').replace(/(\d{5})(\d{1,4})$/,'$1-$2'); };
const maskCEP = v => v.replace(/\D/g,'').slice(0,8).replace(/(\d{5})(\d)/,'$1-$2');
const maskDate = v => v.replace(/\D/g,'').slice(0,8).replace(/(\d{2})(\d)/,'$1/$2').replace(/(\d{2})(\d)/,'$1/$2');

// NOME DE PESSOA NÃO TEM NÚMERO.
//
// O campo é o mesmo para os dois tipos de cadastro, e por isso a regra
// não pode ser do campo: RAZÃO SOCIAL tem número com frequência ("3M do
// Brasil", "Copos 24h Ltda") e travar dígito ali quebraria cadastro
// legítimo. Só a Pessoa Física perde os números.
//
// Fica na digitação, não na validação: o cliente não recebe um "erro"
// depois de preencher, o dígito simplesmente não entra. Ponto, hífen e
// apóstrofo continuam passando — existe "D'Ávila" e existe "Jr.".
const soNomeDeGente = v => v.replace(/[0-9]/g, '');
const igHandle = v => String(v||'').trim().replace(/^https?:\/\/(www\.)?instagram\.com\//i,'').replace(/[/?].*$/,'').replace(/^@/,'');
// Valida o @perfil: 1–30 caracteres, só letras/números/ponto/_, sem ponto no início/fim nem ".."
function validIG(v) {
  const h = igHandle(v);
  if (!h) return true; // campo opcional
  if (h.length > 30) return false;
  if (!/^[a-zA-Z0-9._]+$/.test(h)) return false;
  if (/^\./.test(h) || /\.$/.test(h) || /\.\./.test(h)) return false;
  return true;
}

// Data digitada (DD/MM/AAAA) → ISO (AAAA-MM-DD). Valida data real, ano 1900..hoje.
function brToISO(s) {
  const m = String(s||'').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const [, d, mo, y] = m;
  const dt = new Date(`${y}-${mo}-${d}T00:00:00`);
  if (isNaN(dt) || dt.getFullYear() !== +y || dt.getMonth()+1 !== +mo || dt.getDate() !== +d) return null;
  if (+y < 1900 || dt > new Date()) return null;
  return `${y}-${mo}-${d}`;
}
const isoToBR = iso => { const m = String(iso||'').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : ''; };

function validCPF(v) {
  const c = String(v||'').replace(/\D/g,'');
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  let s = 0; for (let i = 0; i < 9; i++) s += +c[i] * (10 - i);
  let d = (s * 10) % 11; if (d === 10) d = 0; if (d !== +c[9]) return false;
  s = 0; for (let i = 0; i < 10; i++) s += +c[i] * (11 - i);
  d = (s * 10) % 11; if (d === 10) d = 0; return d === +c[10];
}
function validCNPJ(v) {
  const c = String(v||'').replace(/\D/g,'');
  if (c.length !== 14 || /^(\d)\1{13}$/.test(c)) return false;
  const calc = (len) => { let pos = len - 7, sum = 0; for (let i = len; i >= 1; i--) { sum += +c[len - i] * pos--; if (pos < 2) pos = 9; } const r = sum % 11; return r < 2 ? 0 : 11 - r; };
  return calc(12) === +c[12] && calc(13) === +c[13];
}

function Field({ label, children }) {
  return (<div><label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>{children}</div>);
}

// Estrelinhas brancas girando no fundo preto da abertura
function Starfield() {
  const stars = useMemo(() => Array.from({ length: 90 }, () => ({
    top: Math.random() * 100, left: Math.random() * 100,
    size: Math.random() * 2 + 1, delay: Math.random() * 4, dur: Math.random() * 2.5 + 1.8,
  })), []);
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <div className="absolute inset-[-25%] st-spin-slower">
        {stars.map((s, i) => (
          <span key={i} className="absolute rounded-full bg-white" style={{
            top: `${s.top}%`, left: `${s.left}%`, width: s.size, height: s.size,
            boxShadow: '0 0 4px rgba(255,255,255,.85)',
            animation: `st-twinkle ${s.dur}s ease-in-out ${s.delay}s infinite`,
          }} />
        ))}
      </div>
    </div>
  );
}

export default function CadastroCliente() {
  const navigate = useNavigate();
  // De onde a pessoa veio. Quem foi mandado para cá no meio de uma
  // compra (o carrinho do catálogo, por exemplo) volta para lá com o
  // carrinho intacto — despejar todo mundo em /loja faria essa pessoa
  // perder o pedido que estava montando.
  const [buscaUrl] = useSearchParams();
  const voltarPara = destinoSeguro(buscaUrl.get('voltar')) || '/loja';
  // Veio no meio de uma compra? Então o fim do cadastro é VOLTAR, não a
  // tela de "fale com a gente no WhatsApp": a pessoa tem um carrinho
  // montado esperando, e mandá-la para o WhatsApp é perder a venda que
  // ela já tinha decidido fazer.
  const retomandoCompra = !!destinoSeguro(buscaUrl.get('voltar'));
  const [type, setType] = useState('PF');
  const [f, setF] = useState({ name:'', cpf_cnpj:'', ie:'', birth_date:'', email:'', phone:'', mobile:'', instagram:'' });
  const [ieIsento, setIeIsento] = useState(false);
  const [canPublish, setCanPublish] = useState('sim');
  const [addr, setAddr] = useState({ zip:'', street:'', number:'', complement:'', neighborhood:'', city:'', state:'' });
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [doneKind, setDoneKind] = useState('new'); // new | requested | login
  const [welcomeName, setWelcomeName] = useState('');
  const [storeCfg, setStoreCfg] = useState(null);

  // Config do site: modo manutenção E os textos das telas de cadastro.
  // `cfgPronto` existe para a abertura não piscar o texto de fábrica
  // antes do texto configurado — o fundo já é preto, então esperar a
  // resposta não custa nada visualmente.
  const [cfgPronto, setCfgPronto] = useState(false);
  useEffect(() => {
    storeApi.get('/store')
      .then(d => setStoreCfg(d?.cadastro || null))
      .catch(() => {})
      .finally(() => setCfgPronto(true));
  }, []);
  const txt = textosCadastro('cliente', storeCfg);

  // Detecção de cliente já cadastrado (ao preencher o CPF/CNPJ)
  const [existing, setExisting] = useState(null); // { first_name, type, has_birth }
  const [checking, setChecking] = useState(false);
  // Pedido de alteração — cadastro existente nunca é gravado por cima:
  // vira um pedido que a equipe aprova no sistema.
  const [pedido, setPedido] = useState(null); // { prefill } | {} enquanto aberto
  const [verifyDate, setVerifyDate] = useState(''); // data informada p/ comprovar identidade
  const [verifying, setVerifying] = useState(false);
  const [verifyErr, setVerifyErr] = useState('');
  const [review, setReview] = useState(null); // cliente p/ revisar os dados antes de entrar

  const todayISO = new Date().toISOString().slice(0, 10);

  // Cliente que ENTROU (já era cadastrado) vai para a loja logado.
  // Quem acabou de FAZER o cadastro volta para o WhatsApp (ver render
  // abaixo) — exceto quem veio no meio de uma compra, que volta para
  // onde estava comprando.
  useEffect(() => {
    if (!done) return;
    if (doneKind !== 'login' && !(retomandoCompra && doneKind === 'new')) return;
    const t = setTimeout(() => navigate(voltarPara), 2800);
    return () => clearTimeout(t);
  }, [done, doneKind, navigate, voltarPara, retomandoCompra]);

  // Abertura: botão "INICIAR CADASTRO" → toca o vídeo (com som) → preto → card sobe.
  const [phase, setPhase] = useState('start'); // start | video | black2 | form
  const videoRef = useRef(null);

  function startIntro() {
    // Vídeo desligado na configuração: vai direto ao formulário.
    if (!txt.video) return setPhase('form');
    const v = videoRef.current;
    setPhase('video');
    if (!v) return;
    v.muted = false; v.volume = 1; v.currentTime = 0;
    const p = v.play();
    if (p && p.catch) p.catch(() => { v.muted = true; v.play().catch(() => setPhase('black2')); });
  }

  useEffect(() => {
    let t;
    if (phase === 'video') t = setTimeout(() => setPhase('black2'), 20000); // segurança
    else if (phase === 'black2') t = setTimeout(() => setPhase('form'), 700);
    return () => clearTimeout(t);
  }, [phase]);

  const set = (k,v) => setF(p => ({ ...p, [k]: v }));
  const setA = (k,v) => setAddr(p => ({ ...p, [k]: typeof v === 'string' ? v.toUpperCase() : v }));
  const isPJ = type === 'PJ';

  // Verifica se o CPF/CNPJ já tem cadastro (sem expor os dados)
  async function checkExisting(digits) {
    if (existing) return;
    setChecking(true);
    try {
      const res = await storeApi.post('/check-doc', { cpf: digits });
      if (res?.exists) { setExisting(res); setVerifyDate(''); setVerifyErr(''); }
    } catch { /* erro de rede → segue normal */ }
    finally { setChecking(false); }
  }

  // Loga o cliente na loja e mostra a animação de boas-vindas
  function entrarLogado(customer) {
    setStoreCustomer(customer);
    setWelcomeName((customer.name || '').trim().split(/\s+/)[0]);
    setDoneKind('login');
    setDone(true);
  }

  // PF: comprova identidade pela data de nascimento → abre revisão dos dados
  async function confirmarIdentidade() {
    const iso = brToISO(verifyDate);
    if (!iso) { setVerifyErr('Informe uma data válida (DD/MM/AAAA)'); return; }
    setVerifying(true); setVerifyErr('');
    try {
      const digits = f.cpf_cnpj.replace(/\D/g, '');
      const res = await storeApi.post('/verify-birth', { cpf: digits, birth_date: iso });
      if (res?.customer) { setReview(res.customer); setExisting(null); }
    } catch (e) {
      setVerifyErr(e?.response?.data?.error || 'Data de nascimento não confere. Tente novamente.');
    } finally { setVerifying(false); }
  }

  // PJ: confirma e abre revisão dos dados (sem data de nascimento)
  async function entrarPJ() {
    setVerifying(true); setVerifyErr('');
    try {
      const digits = f.cpf_cnpj.replace(/\D/g, '');
      const res = await storeApi.post('/login', { cpf: digits });
      if (res?.customer) { setReview(res.customer); setExisting(null); }
    } catch (e) {
      setVerifyErr(e?.response?.data?.error || 'Não foi possível entrar. Tente novamente.');
    } finally { setVerifying(false); }
  }

  // Revisão: dados conferidos → entra na loja
  function okReview() { if (review) entrarLogado(review); }

  // Revisão: quer corrigir → abre o PEDIDO de alteração já preenchido com o
  // que ele acabou de ver. Nada é gravado sem a aprovação da equipe.
  function editarReview() {
    const c = review;
    const a = c.address || {};
    const up = s => String(s || '').toUpperCase();
    setType(c.type === 'PJ' ? 'PJ' : 'PF');
    set('cpf_cnpj', (c.type === 'PJ' ? maskCNPJ : maskCPF)(c.cpf_cnpj || ''));
    setPedido({
      prefill: {
        name: up(c.name),
        rg_ie: c.rg_ie && c.rg_ie !== 'ISENTO' ? c.rg_ie : '',
        birth_date: isoToBR(c.birth_date),
        email: c.email || '',
        phone: maskPhone(c.phone || ''),
        mobile: maskPhone(c.mobile || ''),
        instagram: c.instagram || '',
        can_publish: c.admission_data?.can_publish === false ? 'nao' : 'sim',
        address: {
          zip: maskCEP(a.zip || ''), street: up(a.street), number: up(a.number),
          complement: up(a.complement), neighborhood: up(a.neighborhood),
          city: up(a.city), state: up(a.state),
        },
      },
    });
    setReview(null); setExisting(null);
  }

  // Abre o pedido em branco — usado por quem não consegue comprovar a
  // identidade: não vê nada do cadastro, só descreve o que quer mudar.
  function abrirPedidoEmBranco() {
    setPedido({ prefill: null });
    setExisting(null); setReview(null); setVerifyDate(''); setVerifyErr('');
  }

  function cancelarExistente() {
    setExisting(null); setReview(null); setVerifyDate(''); setVerifyErr('');
    set('cpf_cnpj', '');
  }

  async function lookupCep(cepRaw) {
    const cep = cepRaw.replace(/\D/g,''); if (cep.length !== 8) return;
    try {
      // usa o proxy interno (/api/cep) — fetch externo é bloqueado pela CSP
      const res = await fetch(`/api/cep/${cep}`);
      if (!res.ok) return;
      const d = await res.json();
      const up = s => (s ? String(s).toUpperCase() : null);
      setAddr(p => ({ ...p, street:up(d.street)||p.street, neighborhood:up(d.neighborhood)||p.neighborhood, city:up(d.city)||p.city, state:d.state||p.state }));
    } catch {}
  }

  // Puxa os dados da empresa pelo CNPJ (rota pública /api/cnpj)
  const [cnpjLoading, setCnpjLoading] = useState(false);
  async function lookupCnpj(cnpjRaw) {
    const digits = cnpjRaw.replace(/\D/g,''); if (digits.length !== 14) return;
    setCnpjLoading(true);
    try {
      const r = await fetch(`/api/cnpj/${digits}`);
      if (!r.ok) { toast.error('CNPJ não encontrado'); return; }
      const d = await r.json();
      setF(p => ({ ...p,
        name: d.name ? d.name.toUpperCase() : p.name,
        ie: d.ie || p.ie,
        email: p.email || d.email || '',
        phone: p.phone || (d.phone ? maskPhone(d.phone) : ''),
      }));
      if (d.ie) setIeIsento(false);
      const up = s => (s ? String(s).toUpperCase() : null);
      setAddr(p => ({ ...p,
        zip: d.zip ? maskCEP(d.zip) : p.zip,
        street: up(d.street) || p.street,
        number: d.number || p.number,
        complement: up(d.complement) || p.complement,
        neighborhood: up(d.neighborhood) || p.neighborhood,
        city: up(d.city) || p.city,
        state: d.state || p.state,
      }));
      toast.success('Dados da empresa preenchidos!');
    } catch { toast.error('Não consegui buscar o CNPJ'); }
    finally { setCnpjLoading(false); }
  }

  async function submit(e) {
    e.preventDefault();
    if (!f.name.trim()) return toast.error(`Informe ${isPJ ? 'a razão social' : 'seu nome'}`);
    if (!f.cpf_cnpj.trim()) return toast.error(`Informe o ${isPJ ? 'CNPJ' : 'CPF'}`);
    if (!(isPJ ? validCNPJ(f.cpf_cnpj) : validCPF(f.cpf_cnpj))) return toast.error(`${isPJ ? 'CNPJ' : 'CPF'} inválido. Confira os números.`);
    if (isPJ && !ieIsento && !f.ie.trim()) return toast.error('Informe a Inscrição Estadual (ou marque Isento)');
    if (!isPJ && !brToISO(f.birth_date)) return toast.error('Informe uma data de nascimento válida (DD/MM/AAAA)');
    if (!f.email.trim()) return toast.error('Informe o e-mail');
    if (!/^\S+@\S+\.\S+$/.test(f.email.trim())) return toast.error('E-mail inválido');
    if (!f.phone.trim()) return toast.error('Informe o telefone / WhatsApp');
    if (f.instagram.trim() && !validIG(f.instagram)) return toast.error('Instagram inválido — confira o @perfil (só letras, números, ponto e _)');
    if (!addr.zip.trim() || !addr.street.trim() || !addr.number.trim() || !addr.neighborhood.trim() || !addr.city.trim() || !addr.state.trim())
      return toast.error('Preencha o endereço completo (CEP, rua, número, bairro, cidade e estado)');
    setSending(true);
    try {
      const res = await storeApi.post('/cadastro', {
        type, name: f.name, cpf_cnpj: f.cpf_cnpj, email: f.email, phone: f.phone, mobile: f.mobile,
        instagram: igHandle(f.instagram),
        rg_ie: isPJ ? (ieIsento ? 'ISENTO' : f.ie) : null,
        ie_isento: isPJ ? ieIsento : false,
        birth_date: isPJ ? null : brToISO(f.birth_date),
        can_publish: canPublish === 'sim',
        address: addr,
      });
      // Em modo manutenção NÃO loga na loja — só mostra o card de conclusão.
      if (!storeCfg?.maintenance && res?.customer) {
        setStoreCustomer(res.customer);
        setWelcomeName((res.customer.name || f.name).trim().split(/\s+/)[0]);
      } else {
        setWelcomeName(f.name.trim().split(/\s+/)[0]);
      }
      setDoneKind('new');
      setDone(true);
    } catch (err) {
      // Documento já cadastrado → não grava por cima, abre o pedido de alteração
      if (err?.response?.data?.needs_request) {
        toast('Esse documento já tem cadastro. Envie um pedido de alteração.', { icon: '🔒' });
        abrirPedidoEmBranco();
        return;
      }
      toast.error(err?.response?.data?.error || 'Não foi possível enviar. Tente novamente.');
    } finally { setSending(false); }
  }

  const Bg = (
    <>
      <video autoPlay muted loop playsInline className="fixed inset-0 w-full h-full object-cover" style={{ zIndex: -2 }}>
        <source src="/cadastro-bg.mp4" type="video/mp4" />
      </video>
      {/* camada para legibilidade do formulário */}
      <div className="fixed inset-0 bg-gradient-to-br from-white/60 via-white/40 to-fuchsia-50/50" style={{ zIndex: -1 }} />
    </>
  );

  // Após FAZER/ATUALIZAR o cadastro → mostra "VOCÊ CONCLUIU O CADASTRO" e
  // volta para o WhatsApp (não entra na loja). Só quem fez login entra na loja.
  if (done && doneKind === 'requested') {
    return <CadastroDone whatsapp={storeCfg?.whatsapp}
      title="PEDIDO ENVIADO PARA APROVAÇÃO"
      message="Recebemos seu pedido de alteração. Nossa equipe confere e aprova — até lá, seu cadastro continua como está." />;
  }

  if (done && doneKind !== 'login' && !(retomandoCompra && doneKind === 'new')) {
    return <CadastroDone message={storeCfg?.message} title={storeCfg?.done_titulo} whatsapp={storeCfg?.whatsapp} />;
  }

  if (done) {
    return (
      <div className="cadastro-publico min-h-screen relative overflow-hidden flex items-center justify-center p-4">
        {Bg}
        <div className="relative z-10 bg-white/90 backdrop-blur rounded-3xl shadow-2xl max-w-md w-full p-8 text-center st-rise">
          <div className="relative mx-auto mb-5 w-20 h-20">
            <span className="absolute inset-0 rounded-full bg-green-100 st-pulse" />
            <CheckCircle2 size={80} className="relative text-green-500 mx-auto" />
          </div>
          <h1 className="text-2xl font-black text-gray-900">
            {doneKind === 'updated' ? 'Dados atualizados! ✅' : doneKind === 'login' ? 'Bem-vindo de volta! 🎉' : 'Cadastro concluído! 🎉'}
          </h1>
          <p className="text-lg font-bold st-gradient-text mt-1">Olá{welcomeName ? `, ${welcomeName}` : ''}!</p>
          <p className="text-gray-500 mt-3">Você já está logado. Estamos te levando de volta…</p>
          <div className="flex items-center justify-center gap-2 mt-5 text-violet-600 font-semibold">
            <Loader2 size={18} className="animate-spin" /> Entrando na loja
          </div>
          <button onClick={() => navigate(voltarPara)} className="mt-5 text-sm text-gray-400 hover:text-violet-600 underline">
            Ir agora
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="cadastro-publico min-h-screen relative overflow-hidden py-8 px-4 bg-black">
      {/* Abertura cinematográfica */}
      {/* A abertura e o cartao neon, igual ao acompanhamento do
          pedido. O video continua depois dele. */}
      {phase === 'start' && cfgPronto && (
        <AberturaCadastro tipo="cliente" textos={txt} onIniciar={startIntro} />
      )}

      {/* O bloco do vídeo fica montado desde a abertura, e não só
          depois dela: startIntro() chama play() no <video>, e se o
          elemento ainda não existe o play não acontece — a tela ficava
          preta por vinte segundos. A abertura vem POR CIMA dele. */}
      {phase !== 'form' && (
        <div className="fixed inset-0 z-50 bg-black">
          <Starfield />
          <video ref={videoRef} playsInline preload="auto"
            onEnded={() => setPhase('black2')} onError={() => setPhase('black2')}
            className={`w-full h-full object-contain transition-opacity duration-700 ${phase === 'video' ? 'opacity-100' : 'opacity-0'}`}>
            <source src="/cadastro-bg.mp4" type="video/mp4" />
          </video>


          {phase !== 'start' && (
            <button type="button" onClick={() => setPhase('form')} className="absolute bottom-5 right-6 text-white/60 text-xs hover:text-white z-10">Pular ›</button>
          )}
        </div>
      )}

      {phase === 'form' && (<>
      {Bg}

      {/* Pedido de alteração de um cadastro existente (aprovação da equipe) */}
      {pedido && (
        <SolicitarAlteracao
          doc={f.cpf_cnpj}
          isPJ={isPJ}
          prefill={pedido.prefill}
          onCancel={() => setPedido(null)}
          onDone={() => { setPedido(null); setDoneKind('requested'); setDone(true); }}
        />
      )}

      {/* Revisão dos dados — após comprovar identidade */}
      {review && (
        <div className="fixed inset-0 z-30 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-sm w-full p-6 st-rise">
            <div className="text-center">
              <CheckCircle2 size={44} className="text-green-500 mx-auto mb-2" />
              <h2 className="text-lg font-black text-gray-900">Confirme se seus dados estão atualizados</h2>
              <p className="text-gray-500 text-sm mt-1">Dê uma olhada antes de continuar:</p>
            </div>
            <div className="mt-4 space-y-1.5 text-sm bg-gray-50 rounded-2xl p-4 max-h-[42vh] overflow-y-auto">
              <ReviewRow label="Nome" value={review.name} />
              <ReviewRow label={review.type === 'PJ' ? 'CNPJ' : 'CPF'} value={review.cpf_cnpj} />
              {review.type !== 'PJ' && review.birth_date && <ReviewRow label="Nascimento" value={isoToBR(review.birth_date)} />}
              {review.type === 'PJ' && review.rg_ie && <ReviewRow label="IE" value={review.rg_ie} />}
              <ReviewRow label="E-mail" value={review.email} />
              <ReviewRow label="Telefone" value={review.phone} />
              {review.mobile && <ReviewRow label="Recado" value={review.mobile} />}
              {review.instagram && <ReviewRow label="Instagram" value={'@' + String(review.instagram).replace(/^@/, '')} />}
              {review.address?.street && (
                <ReviewRow label="Endereço" value={`${review.address.street}, ${review.address.number || 's/n'} — ${review.address.city || ''}/${review.address.state || ''}`} />
              )}
            </div>
            <div className="flex flex-col gap-2 mt-5">
              <button onClick={okReview}
                className="w-full bg-violet-600 hover:bg-violet-700 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-colors">
                <CheckCircle2 size={17} /> Está tudo certo — entrar
              </button>
              <button onClick={editarReview}
                className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-3 rounded-xl transition-colors">
                Atualizar meus dados
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CPF/CNPJ já cadastrado — barra e pede a data de nascimento p/ comprovar */}
      {existing && !review && (
        <div className="fixed inset-0 z-30 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-sm w-full p-7 text-center st-rise">
            <div className="w-14 h-14 rounded-2xl bg-amber-100 flex items-center justify-center mx-auto mb-3">
              <span className="text-2xl">🔒</span>
            </div>
            <h2 className="text-lg font-black text-gray-900">Esse {isPJ ? 'CNPJ' : 'CPF'} já tem cadastro no nosso sistema</h2>

            {isPJ ? (
              <>
                <p className="text-gray-500 mt-2">Você já é nosso cliente! Clique abaixo para entrar.</p>
                {verifyErr && <p className="text-sm text-red-600 font-medium mt-3">{verifyErr}</p>}
                <button onClick={entrarPJ} disabled={verifying}
                  className="w-full mt-5 bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-colors">
                  {verifying ? <Loader2 size={17} className="animate-spin" /> : <><User size={17} /> Entrar na loja</>}
                </button>
              </>
            ) : (
              <>
                <p className="text-gray-500 mt-2">Para comprovar que é você, informe sua <b>data de nascimento</b>:</p>
                <input
                  className={`${INPUT} mt-4 text-center text-lg tracking-wide`} inputMode="numeric" maxLength={10}
                  placeholder="DD/MM/AAAA" value={verifyDate} autoFocus
                  onChange={e => { setVerifyDate(maskDate(e.target.value)); setVerifyErr(''); }}
                  onKeyDown={e => e.key === 'Enter' && confirmarIdentidade()} />
                {verifyErr && <p className="text-sm text-red-600 font-medium mt-2">{verifyErr}</p>}
                <button onClick={confirmarIdentidade} disabled={verifying}
                  className="w-full mt-4 bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-colors">
                  {verifying ? <Loader2 size={17} className="animate-spin" /> : <><CheckCircle2 size={17} /> Confirmar</>}
                </button>
              </>
            )}

            {/* Não consegue comprovar? Pode pedir a alteração assim mesmo —
                sem ver nada do cadastro. A equipe confere e aprova. */}
            <button onClick={abrirPedidoEmBranco}
              className="w-full mt-3 border border-violet-200 text-violet-700 hover:bg-violet-50 font-semibold py-2.5 rounded-xl text-sm transition-colors">
              Corrigir meus dados / enviar documentos
            </button>

            <button onClick={cancelarExistente} className="text-xs text-gray-400 hover:text-gray-600 mt-4">
              Não sou eu / usar outro documento
            </button>
          </div>
        </div>
      )}

      <div className="relative z-10 max-w-xl mx-auto st-rise">
        <div className="text-center mb-6">
          <img src="/lyon-logo.png" alt="Lyon Copos" className="h-28 sm:h-32 mx-auto mb-3 object-contain st-float drop-shadow-xl" onError={e => { e.target.style.display='none'; }} />
          <h1 className="text-2xl sm:text-3xl font-black leading-tight st-gradient-text">{txt.form_titulo}</h1>
          <p className="text-gray-500 mt-2 text-sm">{txt.form_subtitulo}</p>
        </div>

        <form onSubmit={submit} className="bg-white/90 backdrop-blur rounded-3xl shadow-xl p-6 sm:p-8 space-y-4">
          <div className="flex gap-6">
            {['PF','PJ'].map(t => (
              <label key={t} className="flex items-center gap-2 cursor-pointer text-sm">
                {/* Trocar para PF limpa os números que a Razão Social podia
                    ter — senão "COPOS 24H" sobrevive à troca de tipo. */}
                <input type="radio" checked={type===t}
                  onChange={() => { setType(t); if (t === 'PF') set('name', soNomeDeGente(f.name)); }}
                  className="accent-violet-600 w-4 h-4" />
                {t==='PF' ? 'Pessoa Física' : 'Pessoa Jurídica'}
              </label>
            ))}
          </div>

          <Field label={`${isPJ ? 'Razão Social' : 'Nome Completo'} *`}>
            <input className={INPUT} value={f.name}
              onChange={e => {
                const bruto = e.target.value.toUpperCase();
                set('name', isPJ ? bruto : soNomeDeGente(bruto));
              }} />
          </Field>

          {isPJ ? (
            <>
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="CNPJ *">
                  <input className={INPUT} value={f.cpf_cnpj} placeholder="00.000.000/0000-00"
                    onChange={e => { const v = maskCNPJ(e.target.value); set('cpf_cnpj', v); const d = v.replace(/\D/g, ''); if (d.length === 14 && validCNPJ(d)) { checkExisting(d); lookupCnpj(v); } }}
                    onBlur={() => validCNPJ(f.cpf_cnpj) && lookupCnpj(f.cpf_cnpj)} />
                  {cnpjLoading && <p className="text-xs text-violet-500 mt-1 flex items-center gap-1"><Loader2 size={11} className="animate-spin" /> buscando dados...</p>}
                  {f.cpf_cnpj.replace(/\D/g,'').length === 14 && !validCNPJ(f.cpf_cnpj) && (
                    <p className="text-xs text-red-500 mt-1">CNPJ inválido — confira os números digitados</p>
                  )}
                </Field>
                <Field label={`Inscrição Estadual (IE)${ieIsento ? '' : ' *'}`}>
                  <input className={INPUT} value={ieIsento ? 'ISENTO' : f.ie} disabled={ieIsento} onChange={e => set('ie', e.target.value.replace(/\D/g,''))} placeholder="000.000.000.000" />
                  <label className="flex items-center gap-1.5 mt-1.5 text-xs text-gray-500 cursor-pointer">
                    <input type="checkbox" checked={ieIsento} onChange={e => setIeIsento(e.target.checked)} className="accent-violet-600 w-3.5 h-3.5" /> Isento de IE
                  </label>
                </Field>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="E-mail *"><input type="email" className={INPUT} value={f.email} onChange={e => set('email', e.target.value)} /></Field>
                <Field label="Instagram"><InstaInput value={f.instagram} onChange={v => set('instagram', v)} /></Field>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Telefone / WhatsApp *"><input className={INPUT} value={f.phone} placeholder="(44) 99999-9999" onChange={e => set('phone', maskPhone(e.target.value))} /></Field>
                <Field label="Telefone p/ Recado"><input className={INPUT} value={f.mobile} placeholder="(44) 3333-3333" onChange={e => set('mobile', maskPhone(e.target.value))} /></Field>
              </div>
            </>
          ) : (
            <>
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="CPF *">
                  <input className={INPUT} value={f.cpf_cnpj} placeholder="000.000.000-00"
                    onChange={e => { const v = maskCPF(e.target.value); set('cpf_cnpj', v); const d = v.replace(/\D/g,''); if (d.length === 11 && validCPF(d)) checkExisting(d); }} />
                  {f.cpf_cnpj.replace(/\D/g,'').length === 11 && !validCPF(f.cpf_cnpj) && (
                    <p className="text-xs text-red-500 mt-1">CPF inválido — confira os números digitados</p>
                  )}
                </Field>
                <Field label="Data de Nascimento *"><input className={INPUT} inputMode="numeric" maxLength={10} placeholder="DD/MM/AAAA" value={f.birth_date} onChange={e => set('birth_date', maskDate(e.target.value))} /></Field>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="E-mail *"><input type="email" className={INPUT} value={f.email} onChange={e => set('email', e.target.value)} /></Field>
                <Field label="Telefone / WhatsApp *"><input className={INPUT} value={f.phone} placeholder="(44) 99999-9999" onChange={e => set('phone', maskPhone(e.target.value))} /></Field>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Telefone p/ Recado"><input className={INPUT} value={f.mobile} placeholder="(44) 3333-3333" onChange={e => set('mobile', maskPhone(e.target.value))} /></Field>
                <Field label="Instagram"><InstaInput value={f.instagram} onChange={v => set('instagram', v)} /></Field>
              </div>
            </>
          )}

          {/* Consentimento de publicação */}
          <div className="bg-violet-50/70 border border-violet-100 rounded-2xl p-4">
            <p className="text-sm font-medium text-gray-700 mb-2">{txt.pergunta_instagram}</p>
            <div className="flex gap-2">
              {[['sim','Sim 💜'], ['nao','Não, obrigado']].map(([v, l]) => (
                <button type="button" key={v} onClick={() => setCanPublish(v)}
                  className={`flex-1 px-3 py-2 rounded-xl text-sm font-medium border-2 transition-colors ${canPublish===v ? 'border-violet-500 bg-violet-100 text-violet-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>{l}</button>
              ))}
            </div>
          </div>

          {/* Endereço */}
          <div className="border border-gray-200 rounded-2xl p-4 space-y-4">
            <p className="text-sm font-semibold text-gray-700">Endereço</p>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="CEP *"><input className={INPUT} value={addr.zip} placeholder="00000-000"
                onChange={e => { const v = maskCEP(e.target.value); setA('zip', v); if (v.replace(/\D/g, '').length === 8) lookupCep(v); }}
                onBlur={e => lookupCep(e.target.value)} /></Field>
              <Field label="Rua / Logradouro *"><input className={INPUT} value={addr.street} onChange={e => setA('street', e.target.value)} /></Field>
            </div>
            <div className="grid sm:grid-cols-3 gap-4">
              <Field label="Número *"><input className={INPUT} value={addr.number} onChange={e => setA('number', e.target.value)} /></Field>
              <Field label="Complemento"><input className={INPUT} value={addr.complement} onChange={e => setA('complement', e.target.value)} /></Field>
              <Field label="Bairro *"><input className={INPUT} value={addr.neighborhood} onChange={e => setA('neighborhood', e.target.value)} /></Field>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Cidade *"><input className={INPUT} value={addr.city} onChange={e => setA('city', e.target.value)} /></Field>
              <Field label="Estado *">
                <select className={INPUT} value={addr.state} onChange={e => setA('state', e.target.value)}>
                  <option value="">UF</option>{UFS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </Field>
            </div>
          </div>

          <button type="submit" disabled={sending}
            className="w-full bg-violet-600 hover:bg-violet-700 text-white font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-60">
            {sending ? <><Loader2 size={18} className="animate-spin" /> Enviando...</> : <><User size={18} /> {txt.form_botao}</>}
          </button>
          <p className="text-xs text-gray-400 text-center">{txt.form_privacidade}</p>
        </form>
      </div>
      </>)}
    </div>
  );
}

function ReviewRow({ label, value }) {
  if (!value) return null;
  return (
    <div className="flex justify-between gap-3">
      <span className="text-gray-400 shrink-0">{label}</span>
      <span className="font-medium text-gray-800 text-right break-words">{value}</span>
    </div>
  );
}

function InstaInput({ value, onChange }) {
  const handle = igHandle(value);
  const invalid = !!String(value).trim() && !validIG(value);
  return (
    <div>
      <div className="relative">
        <Instagram size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-pink-500" />
        <input className={`${INPUT} pl-9 pr-9 ${invalid ? 'border-red-400 focus:border-red-400 focus:ring-red-100' : ''}`}
          value={value} placeholder="@seu_perfil" onChange={e => onChange(e.target.value)} />
        {handle && !invalid && (
          <a href={`https://instagram.com/${handle}`} target="_blank" rel="noreferrer" title="Abrir perfil para conferir"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-pink-500"><ExternalLink size={15} /></a>
        )}
      </div>
      {invalid
        ? <p className="text-xs text-red-500 mt-1">Instagram inválido — use só letras, números, ponto e _ (ex.: @lyon.copos)</p>
        : handle && <p className="text-xs text-gray-400 mt-1">Toque no ícone → para conferir se abre o perfil certo.</p>}
    </div>
  );
}

/**
 * O destino de volta, conferido.
 *
 * Só caminho interno começando com uma barra. Sem isso, `?voltar=` vira
 * um redirecionador aberto: bastaria mandar `/cadastro?voltar=https://
 * site-falso` para o cliente sair do nosso site achando que continua
 * nele — e ele acabou de digitar CPF e endereço.
 */
function destinoSeguro(valor) {
  const v = String(valor || '');
  if (!v.startsWith('/') || v.startsWith('//')) return null;
  return v;
}
