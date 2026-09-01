import { useState, useRef, useMemo, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Search, Trash2, Pencil, ShoppingCart, User, Check, Loader2, X, ChevronLeft, ChevronRight, Truck, Star, Plus, MoreHorizontal, MessageCircle, Download } from 'lucide-react';
import api from '@/lib/api';
import Modal from '@/components/UI/Modal';
import SeletorOrigem from '@/components/UI/SeletorOrigem';
import CampoData from '@/components/UI/CampoData';
import { useAuth } from '@/contexts/AuthContext';
import { generateQuotePng, buildQuoteNotes, downloadPng } from '@/lib/quotePng';
import toast from 'react-hot-toast';
import { expandVariants, expandVariantsWithCode } from '@/pages/Products/ProductVariantsModal';

function fmt(v) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
}

// Dinheiro digitado no padrão BR: "40" → 40, "100,5" → 100.5, "1.234,56" → 1234.56
function parseMoney(s) {
  const n = parseFloat(String(s ?? '').replace(/\./g, '').replace(',', '.'));
  return isNaN(n) ? 0 : n;
}
// Formata para exibir no campo: 40 → "40,00" | 100 → "100,00"
function maskMoney(n) {
  return (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const todayISO = () => new Date().toISOString().split('T')[0];

// Link para chamar o cliente no WhatsApp (DDI 55 automático)
function waLink(phone, name) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return null;
  const full = (digits.startsWith('55') ? '' : '55') + digits;
  return `https://wa.me/${full}?text=${encodeURIComponent(`Olá ${name || ''}, tudo bem?`)}`;
}

// Preço oficial pela quantidade: faixa (price_tiers) ou preço de venda.
// O backend recalcula do lado dele — isso aqui é para a UI mostrar certo.
function tierPrice(tiers, salePrice, qty) {
  let price = Number(salePrice) || 0;
  for (const t of tiers || []) {
    const min = Number(t.min_qty) || 0;
    const max = (t.max_qty == null || t.max_qty === '') ? Infinity : Number(t.max_qty);
    if (qty >= min && qty <= max) price = Number(t.price) || price;
  }
  return price;
}

// Tamanho em ML lido do nome ("TWISTER TRADICIONAL - AZUL - 400 ML" → 400).
const volumeML = (name) => {
  const m = String(name || '').match(/(\d{2,4})\s*ML\b/i);
  return m ? parseInt(m[1]) : null;
};

// O que foi escolhido no lançamento vai junto do item da venda/orçamento.
// null quando não há nada a guardar.
function itemCustomization(i) {
  const c = {
    ...(i.variant_code ? { 'Código': i.variant_code } : {}),
    ...(i.variant ? { 'Variação': i.variant } : {}),
    ...(i.print_color ? { 'Cor da personalização': i.print_color } : {}),
    ...(i.borda ? { 'Borda': i.borda } : {}),
    ...(i.ink_type ? { 'Tinta': i.ink_type } : {}),
    ...(i.acabamentos?.length ? { 'Acabamentos': i.acabamentos.join(', ') } : {}),
  };
  return Object.keys(c).length ? c : null;
}

/**
 * Estoque do produto na lista de seleção.
 *
 * Verde quando tem, vermelho piscando quando está negativo. Negativo
 * significa que já foi vendido mais do que existe — é a informação que
 * impede o operador de prometer prazo para o que não está na prateleira,
 * e por isso ela se mexe: numa lista de 24 itens iguais, cor parada
 * passa batido.
 */
function Estoque({ valor }) {
  const n = Number(valor) || 0;
  if (n < 0) {
    return (
      <span className="estoque-negativo font-bold" title="Estoque negativo — vendido mais do que existe">
        Estoque: {n} ⚠
      </span>
    );
  }
  if (n > 0) return <span className="estoque-positivo font-semibold">Estoque: {n}</span>;
  return <span className="text-gray-400">Estoque: 0</span>;
}

// Acabamentos e técnicas marcáveis no lançamento do item. Todos opcionais.
const ACABAMENTOS = ['Cor degradê', 'Cor bicolor', 'Jateado', 'Borda metalizada', 'Pintura', 'Laser', 'Transfer', 'DTF'];

// O produto tem borda? Lê da variação escolhida e, se não disser, das
// variações do produto. É só o palpite inicial: quem decide é o operador.
function palpiteBorda(product, variantName) {
  const v = (product && product.variations) || {};
  const hay = [variantName, product?.name, ...(Array.isArray(v.borders) ? v.borders : []), ...(Array.isArray(v.items) ? v.items : [])]
    .join(' ').toLowerCase();
  return hay.includes('borda') ? 'Com borda' : 'Sem borda';
}

// "Retirar em maos" e uma opcao DO SELETOR DE TRANSPORTADORA.
//
// Ela ja morou aqui, saiu para um campo "Entrega" separado, e voltou:
// dois campos para a mesma pergunta ("quem leva?") faziam o operador
// escolher transportadora e ainda ter que dizer que era entrega. Uma
// pergunta, um campo.
//
// O QUE NAO VOLTA e o bug que a separacao expos: escolher retirada
// gravava so uma observacao em texto e nunca `delivery_mode`, a coluna
// que lib/atencao.js le para pular "Em Transito". Pedido de retirada
// seguia a rota de entrega esperando uma coleta que nao vinha. Agora a
// opcao mora aqui E grava a coluna.
const RETIRADA = '__retirada__';
const RETIRADA_LABEL = 'Retirar em mãos';

// mode: 'sale' (pedido de venda) | 'quote' (orçamento — salva e gera a foto PNG)
// customerId: abre já com este cliente escolhido (a carteira do vendedor
// manda o cliente pela URL ao clicar na flecha de orçamento)
export default function PDV({ onDone, mode = 'sale', customerId = null }) {
  const inModal = typeof onDone === 'function';
  const { user } = useAuth();
  const isQuote = mode === 'quote';
  const [items, setItems] = useState([]);
  const [productSearch, setProductSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState(''); // filtro por tipo (categoria) do produto
  const [volFilter, setVolFilter] = useState('');   // filtro por tamanho (ML), aparece após escolher o tipo
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [discount, setDiscount] = useState('');
  const [couponInput, setCouponInput] = useState('');
  const [coupon, setCoupon] = useState(null); // { coupon_id, code, discount_type, discount_value }
  const [frete, setFrete] = useState(null); // { price, days, weightKg, uf }
  const [carrierId, setCarrierId] = useState(''); // transportadora desta venda
  const [freightInput, setFreightInput] = useState(''); // valor do frete (R$) — editável
  const [quoteNumber, setQuoteNumber] = useState(''); // nº da cotação do frete na transportadora

  // Campos específicos do ORÇAMENTO (mode='quote')
  const [quoteDate, setQuoteDate] = useState(todayISO); // data da cotação do frete
  const [quoteValidityDays, setQuoteValidityDays] = useState('7'); // validade da cotação (dias corridos)
  const [deliveryDays, setDeliveryDays] = useState(''); // prazo de entrega (dias úteis)
  const [productionTime, setProductionTime] = useState('3 a 7 dias úteis'); // prazo de produção
  const [pixPriceInput, setPixPriceInput] = useState(''); // valor com desconto PIX/dinheiro
  const [validityDays, setValidityDays] = useState('3'); // validade do orçamento (dias corridos)
  const [png, setPng] = useState(null); // { dataUrl, number } — foto gerada
  const [payTerm, setPayTerm] = useState(null); // condição de pagamento { label, percent }
  const [paymentMethod, setPaymentMethod] = useState('cash');
  // Contábil: empresa faturadora + conta de destino (migração 043)
  const [billingCompanyId, setBillingCompanyId] = useState('');
  const [receivingAccountId, setReceivingAccountId] = useState('');
  const [receivedAmount, setReceivedAmount] = useState('');
  const [installments, setInstallments] = useState(1);
  const [operationDate, setOperationDate] = useState(todayISO);
  // De onde veio o cliente (Shopee, WhatsApp, Site...). Começa vazio de
  // propósito: um padrão chutado enche o relatório de canal de mentira.
  const [origem, setOrigem] = useState('');
  // As demais datas já nascem com a data da operação — assim o ano (e o dd/mm)
  // vêm preenchidos e o operador só ajusta o dia/mês que precisar.
  // OS TRES PRAZOS NASCEM VAZIOS, e nao com a data de hoje.
  //
  // Preenchido com hoje, o campo nao pergunta nada: ele ja respondeu, e
  // a resposta esta quase sempre errada. Evento, saida e entrega sao
  // datas FUTURAS por natureza, e o pedido que nasce com as tres em hoje
  // e salvo assim toda vez que alguem passa direto.
  //
  // Vazio pergunta. E os tres continuam obrigatorios na hora de salvar,
  // entao ninguem passa sem responder.
  //
  // De quebra, isto conserta a sugestao da transportadora: o calculo do
  // frete oferece "previsao = hoje + prazo" so `if (!deliveryDate)`, e
  // com o campo pre-preenchido essa condicao nunca era verdadeira.
  const [eventDate, setEventDate] = useState('');
  const [shipDate, setShipDate] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');

  // Data retroativa em relação à operação pula para o próximo ano:
  // operação 02/07/2026 + saída 01/07 → 01/07/2027
  function forwardDate(v) {
    if (!v || !operationDate || v >= operationDate) return v;
    const y = parseInt(v.slice(0, 4), 10);
    if (!Number.isFinite(y)) return v;
    const bumped = `${y + 1}${v.slice(4)}`;
    return bumped >= operationDate ? bumped : v;
  }

  // Mudou a data da operação → replica o ano dela nas outras datas
  function changeOperationDate(v) {
    setOperationDate(v);
    const y = String(v || '').slice(0, 4);
    if (/^\d{4}$/.test(y)) {
      const withYear = iso => (iso ? `${y}${iso.slice(4)}` : iso);
      setEventDate(withYear);
      setShipDate(withYear);
      setDeliveryDate(withYear);
    }
  }
  // Mudou a data do EVENTO → leva o ano dela para saída e entrega.
  //
  // Quem digita 01/01/2026 no evento está vendendo para o ano que vem, e
  // as outras duas datas são quase sempre do mesmo ano. Repetir 2026 à
  // mão em cada campo é onde nascia o pedido com saída em 2025 e evento
  // em 2026 — erro que só aparece na produção, atrasada.
  //
  // Só o ANO viaja: o dia e o mês de cada etapa continuam sendo escolha
  // de quem vende.
  function changeEventDate(v) {
    setEventDate(v);
    const y = String(v || '').slice(0, 4);
    if (!/^\d{4}$/.test(y)) return;
    const comAno = iso => (iso && iso.slice(0, 4) !== y ? `${y}${iso.slice(4)}` : iso);
    setShipDate(comAno);
    setDeliveryDate(comAno);
  }

  const [showCustomerInfo, setShowCustomerInfo] = useState(false);
  // Chave aleatória de até 5 dígitos para o pedido
  const [firstDueDate, setFirstDueDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 30);
    return d.toISOString().split('T')[0];
  });
  const searchRef = useRef();

  // Carrega todos os produtos ativos (o backend já devolve em ordem alfabética)
  // para mostrar a lista completa ao abrir, e filtra no cliente conforme digita.
  const { data: allProducts } = useQuery({
    queryKey: ['pdv-all-products'],
    queryFn: () => api.get('/products?limit=2000&is_active=true'),
  });

  const productList = useMemo(() => {
    let arr = [...(allProducts?.data || [])].sort((a, b) =>
      (a.name || '').localeCompare(b.name || '', 'pt-BR'));
    // filtro por tipo (categoria): COM BORDA, DEGRADÊ, TRADICIONAL etc.
    if (typeFilter) arr = arr.filter(p => (p.CATEGORIAS?.name || '').trim().toUpperCase() === typeFilter);
    // tamanho: compara o número lido do NOME (o código tem número parecido)
    if (volFilter) arr = arr.filter(p => volumeML(p.name) === Number(volFilter));
    const term = productSearch.trim().toLowerCase();
    if (!term) return arr;
    return arr.filter(p =>
      (p.name || '').toLowerCase().includes(term) ||
      String(p.code || '').toLowerCase().includes(term)
    );
  }, [allProducts, productSearch, typeFilter, volFilter]);

  // Tamanhos disponíveis dentro do tipo escolhido (vazio = o tipo não usa ML)
  const volumeOptions = useMemo(() => {
    const base = (allProducts?.data || []).filter(p =>
      !typeFilter || (p.CATEGORIAS?.name || '').trim().toUpperCase() === typeFilter);
    const set = new Set();
    for (const p of base) { const v = volumeML(p.name); if (v) set.add(v); }
    return [...set].sort((a, b) => a - b);
  }, [allProducts, typeFilter]);

  const { data: customerResults } = useQuery({
    queryKey: ['pdv-customers', customerSearch],
    queryFn: () => api.get(`/customers?search=${encodeURIComponent(customerSearch.trim())}&limit=8&is_active=true`),
    enabled: customerSearch.trim().length >= 1,
  });

  // Cliente que veio pronto pela URL. Só preenche o campo vazio: se o
  // operador já trocou de cliente na tela, a escolha dele é que vale.
  const { data: preloadCustomer } = useQuery({
    queryKey: ['pdv-customer-preload', customerId],
    queryFn: () => api.get(`/customers/${customerId}`),
    enabled: !!customerId,
  });
  useEffect(() => {
    if (preloadCustomer?.id) setSelectedCustomer(c => c || preloadCustomer);
  }, [preloadCustomer]);

  // O vocabulário de origem vem do servidor — marketplace novo aparece
  // aqui sem mexer nesta tela.
  const { data: origens = [] } = useQuery({
    queryKey: ['origens-venda'],
    queryFn: () => api.get('/sales/origens'),
    staleTime: Infinity,
    enabled: !isQuote,
  });

  // Últimos 50 clientes cadastrados — aparecem ao clicar no campo (sem digitar)
  const [custFocus, setCustFocus] = useState(false);
  const { data: recentCustomers } = useQuery({
    queryKey: ['pdv-customers-recent'],
    queryFn: () => api.get('/customers?limit=50&sort=recent&is_active=true&type=cliente'),
  });

  // Transportadoras cadastradas.
  //
  // A busca era travada até haver cliente escolhido (`enabled: isQuote ||
  // !!selectedCustomer`). A economia era de uma requisição; o preço era
  // um seletor que ABRIA VAZIO, com "— selecione —" e "Retirar em mãos"
  // e mais nada — parecendo que não havia transportadora cadastrada,
  // quando havia duas.
  //
  // A lista não depende do cliente: é a mesma para todos, tem duas
  // linhas e o react-query guarda em cache. Carregar sempre é mais
  // barato que explicar por que o campo está vazio.
  const { data: carriers } = useQuery({
    queryKey: ['carriers'],
    queryFn: () => api.get('/shipping/carriers'),
  });
  const carrierSel = (carriers?.data || []).find(c => c.id === carrierId) || null;
  // "Retirar em mãos" é uma opção fixa da lista, não uma transportadora
  // cadastrada: o pedido fica sem carrier_id e a informação vai na observação.
  const isRetirada = carrierId === RETIRADA;
  const carrierLabel = isRetirada ? RETIRADA_LABEL : (carrierSel ? (carrierSel.trade_name || carrierSel.name) : '');

  // Tipos (categorias) de produto — para o filtro do painel de produtos
  const { data: productTypes = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get('/products/categories/list'),
  });

  // Condições de pagamento (desconto/juros) configuradas em Configurações → Pagamento
  const { data: payTermsData } = useQuery({
    queryKey: ['payment-terms'],
    queryFn: () => api.get('/sales/payment-terms'),
  });
  const payTerms = payTermsData?.data || [];

  // Catálogo de cores/bordas por acabamento (cadastrável no lançamento)
  const { data: acabCatalog = {}, refetch: refetchAcab } = useQuery({
    queryKey: ['acab-catalog'],
    queryFn: () => api.get('/settings/acabamentos'),
  });
  // As tintas cadastradas, com o valor por ML de cada uma.
  const { data: tintas = [], refetch: refetchTintas } = useQuery({
    queryKey: ['tintas'],
    queryFn: () => api.get('/settings/tintas'),
  });
  const [novaTinta, setNovaTinta] = useState(null);   // { nome, valor_ml }

  async function salvarTinta() {
    const nome = String(novaTinta?.nome || '').trim().toUpperCase();
    if (!nome) { toast.error('Informe o nome da tinta'); return; }
    try {
      await api.post('/settings/tintas', { nome, valor_ml: novaTinta.valor_ml });
      await refetchTintas();
      setLaunch(l => (l ? { ...l, color: nome } : l));
      setNovaTinta(null);
      toast.success('Tinta cadastrada');
    } catch (err) { toast.error(err.error || 'Erro ao cadastrar a tinta'); }
  }

  // Cadastra uma cor/borda no catálogo e já seleciona no lançamento.
  async function addAcabValor(chave, onPicked) {
    const raw = window.prompt(`Cadastrar novo(a) para "${chave === '__borda' ? 'Borda' : chave}":`);
    const valor = String(raw || '').trim().toUpperCase();
    if (!valor) return;
    try {
      await api.post('/settings/acabamentos', { acabamento: chave, valor });
      await refetchAcab();
      onPicked?.(valor);
    } catch (err) { toast.error(err.error || 'Erro ao cadastrar'); }
  }

  const saleMutation = useMutation({
    mutationFn: (data) => api.post('/sales', data),
    onSuccess: async (sale) => {
      // Consome o cupom (1 uso) vinculado a esta venda
      if (coupon?.coupon_id) {
        await api.post('/coupons/redeem', {
          coupon_id: coupon.coupon_id, customer_id: selectedCustomer?.id || null,
          sale_id: sale?.id || null, discount: couponDiscount,
        }).catch(() => {});
      }
      toast.success('Venda finalizada com sucesso!');
      setItems([]);
      setSelectedCustomer(null);
      setShowCustomerInfo(false);
      setDiscount('');
      setCoupon(null); setCouponInput('');
      setFrete(null);
      setCarrierId(''); setFreightInput(''); setQuoteNumber('');
      setPayTerm(null);
      setReceivedAmount('');
      setEventDate(''); setShipDate(''); setDeliveryDate('');
      if (inModal) { onDone(); return; } // fecha o card e atualiza a lista
      setTimeout(() => searchRef.current?.focus(), 100);
    },
    onError: (err) => toast.error(err.error || 'Erro ao finalizar venda'),
  });

  // Salva o ORÇAMENTO e gera a foto PNG padronizada
  const quoteMutation = useMutation({
    mutationFn: (data) => api.post('/quotes', data),
    onSuccess: (quote, sent) => {
      const dataUrl = generateQuotePng({
        number: quote.number,
        createdAt: todayISO(),
        customerName: selectedCustomer?.name || '',
        items: items.map(i => ({ name: i.name, quantity: i.quantity, unit_price: i.unit_price })),
        discount: sent.discount,
        freight: parseMoney(freightInput),
        carrierName: carrierLabel,
        quoteNumber: quoteNumber.trim(),
        quoteDate,
        quoteValidityDays: parseInt(quoteValidityDays, 10) || 0,
        deliveryDays: parseInt(deliveryDays, 10) || 0,
        productionTime: productionTime.trim(),
        pixPrice: parseMoney(pixPriceInput),
        validityDays: parseInt(validityDays, 10) || 3,
      });
      setPng({ dataUrl, number: quote.number });
      toast.success(`Orçamento #${String(quote.number).padStart(4, '0')} salvo no histórico!`);
    },
    onError: (err) => toast.error(err.error || 'Erro ao salvar o orçamento'),
  });

  // Contábil: empresas faturadoras + contas bancárias (opcional — some se o módulo não estiver ativo)
  const { data: billingCompanies } = useQuery({
    queryKey: ['contabil-companies'],
    queryFn: () => api.get('/contabil/companies').catch(() => []),
    enabled: !isQuote,
    staleTime: 60000,
  });
  const { data: bankAccounts } = useQuery({
    queryKey: ['contabil-accounts'],
    queryFn: () => api.get('/contabil/accounts').catch(() => []),
    enabled: !isQuote,
    staleTime: 60000,
  });
  const companiesOk = Array.isArray(billingCompanies) ? billingCompanies : [];
  // Empresa padrão pré-selecionada
  useEffect(() => {
    if (!billingCompanyId && companiesOk.length) {
      const def = companiesOk.find(c => c.is_default) || companiesOk[0];
      setBillingCompanyId(def.id);
    }
  }, [companiesOk.length]); // eslint-disable-line react-hooks/exhaustive-deps
  // Contas da empresa selecionada (contas sem vínculo aparecem para todas)
  const companyAccounts = (Array.isArray(bankAccounts) ? bankAccounts : [])
    .filter(a => a.is_active !== false && (!a.company_id || a.company_id === billingCompanyId));

  // Calcular frete + prazo pelo estado/CEP do cliente
  const freteMut = useMutation({
    mutationFn: () => api.post('/shipping/quote', {
      uf: selectedCustomer?.address?.state || null,
      cep: selectedCustomer?.address?.zip || null,
      qty: items.reduce((s, i) => s + i.quantity, 0),
      subtotal,
    }),
    onSuccess: (data) => {
      setFrete(data);
      setFreightInput(data.free || !data.price ? '' : maskMoney(data.price));
      // sugere a previsão de entrega = hoje + prazo
      if (data.days && !deliveryDate) {
        const d = new Date(); d.setDate(d.getDate() + Number(data.days));
        setDeliveryDate(d.toISOString().split('T')[0]);
      }
    },
    onError: (e) => { setFrete(null); toast.error(e.error || 'Não foi possível calcular o frete'); },
  });

  // Aplicar cupom — valida no servidor (data, limite, cliente) e guarda o cupom
  const couponMut = useMutation({
    mutationFn: () => api.post('/coupons/validate', {
      code: couponInput, total: subtotal, customer_id: selectedCustomer?.id || null,
    }),
    onSuccess: (data) => { setCoupon(data); toast.success(`Cupom ${data.code} aplicado!`); },
    onError: (e) => { setCoupon(null); toast.error(e.error || 'Cupom inválido'); },
  });

  // Modelo cujas variações estão sendo exibidas (drill-down). null = lista de modelos.
  const [drill, setDrill] = useState(null);

  // Card grande de produtos (abre pelo botão ADICIONAR PRODUTOS)
  const [productsOpen, setProductsOpen] = useState(false);
  // Horários de coleta da transportadora (abrem pelo ⋯)
  const [showSched, setShowSched] = useState(false);

  // Lançamento do item: escolher o produto abre este card para ajustar
  // quantidade, preço, desconto e cor da personalização antes de entrar no
  // pedido. null = fechado.
  const [launch, setLaunch] = useState(null);
  const qtyRef = useRef(null);

  // ESC fecha primeiro o card de produtos (antes de fechar a tela toda).
  // Com o lançamento aberto, o ESC é dele — não fecha os produtos por baixo.
  useEffect(() => {
    if (!productsOpen) return;
    const onKey = (e) => {
      if (e.key !== 'Escape' || launch) return;
      e.stopPropagation();
      setProductsOpen(false);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [productsOpen, launch]);

  // Atalhos do card de lançamento: F2 confirma, F3 acumula, ESC cancela.
  useEffect(() => {
    if (!launch) return;
    const onKey = (e) => {
      if (e.key === 'F2')      { e.preventDefault(); e.stopPropagation(); commitLaunch(false); }
      else if (e.key === 'F3') { e.preventDefault(); e.stopPropagation(); commitLaunch(true); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setLaunch(null); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  // Variações reais do modelo em drill (com código), filtradas pela busca
  const variantList = useMemo(() => {
    if (!drill) return [];
    const all = expandVariantsWithCode(drill);
    const term = productSearch.trim().toLowerCase();
    if (!term) return all;
    return all.filter(x => x.name.toLowerCase().includes(term) || x.code.toLowerCase().includes(term));
  }, [drill, productSearch]);

  // Clicou num modelo: se tem variações, abre a lista delas; senão adiciona direto.
  function pickProduct(product) {
    if (expandVariants(product).length > 1) {
      setDrill(product);
      setProductSearch('');
      setTimeout(() => searchRef.current?.focus(), 30);
      return;
    }
    addProduct(product);
  }

  function addProduct(product) {
    openLaunch(product, null, null);
  }

  // Escolheu a variação: abre o lançamento dela (o drill continua atrás).
  function addVariant(variant) {
    if (!drill) return;
    openLaunch(drill, variant.name, variant.code);
  }

  // ── Card de lançamento do item ──────────────────────────────────────
  // Abre com o preço sugerido da faixa e deixa ajustar antes de entrar
  // no pedido: quantidade, valor unitário, desconto (% ou R$) e a cor da
  // personalização.
  function openLaunch(product, variantName, variantCode) {
    setLaunch({
      product,
      variantName: variantName || null,
      variantCode: variantCode || null,
      qty: '1',
      priceStr: maskMoney(tierPrice(product.price_tiers, product.sale_price, 1)),
      priceTouched: false,
      discPercent: '0',
      discStr: maskMoney(0),
      color: '',
      borda: palpiteBorda(product, variantName),
      bordaTipo: '',              // qual borda (do catálogo) quando "Com borda"
      ink: product.ink_type || '',
      acab: [],
      acabCor: {},                // { 'Cor degradê': 'AZUL/ROSA', ... }
    });
    setTimeout(() => qtyRef.current?.select(), 40);
  }

  function toggleAcab(a) {
    setLaunch(l => {
      if (!l) return l;
      const on = l.acab.includes(a);
      const acab = on ? l.acab.filter(x => x !== a) : [...l.acab, a];
      const acabCor = { ...l.acabCor };
      if (on) delete acabCor[a];   // desmarcou → limpa a cor escolhida
      return { ...l, acab, acabCor };
    });
  }
  const setAcabCor = (a, cor) => setLaunch(l => l && ({ ...l, acabCor: { ...l.acabCor, [a]: cor } }));

  const lQty   = Math.max(1, parseFloat(String(launch?.qty ?? '1').replace(',', '.')) || 1);
  const lPrice = parseMoney(launch?.priceStr);
  const lGross = lQty * lPrice;
  const lDisc  = Math.min(lGross, parseMoney(launch?.discStr));
  const lNet   = Math.max(0, lGross - lDisc);

  // Cores sugeridas: as do próprio produto (variações). O campo é livre.
  const launchColorOptions = useMemo(() => {
    const v = launch?.product?.variations || {};
    return Array.isArray(v.colors) ? v.colors.filter(Boolean) : [];
  }, [launch]);

  // Mudou a quantidade: reaplica a faixa de preço (se o preço não foi
  // editado na mão) e mantém o percentual de desconto escolhido.
  function launchSetQty(v) {
    setLaunch(l => {
      if (!l) return l;
      const q = Math.max(1, parseFloat(String(v).replace(',', '.')) || 1);
      const next = { ...l, qty: v };
      if (!l.priceTouched) next.priceStr = maskMoney(tierPrice(l.product.price_tiers, l.product.sale_price, q));
      const pct = parseFloat(String(l.discPercent).replace(',', '.')) || 0;
      if (pct > 0) next.discStr = maskMoney(Math.round(q * parseMoney(next.priceStr) * pct) / 100);
      return next;
    });
  }

  // Desconto: os dois campos andam juntos (digitou %, calcula R$ e vice-versa)
  function launchSetPercent(v) {
    setLaunch(l => {
      if (!l) return l;
      const pct = Math.min(100, Math.max(0, parseFloat(String(v).replace(',', '.')) || 0));
      const q = Math.max(1, parseFloat(String(l.qty).replace(',', '.')) || 1);
      const gross = q * parseMoney(l.priceStr);
      return { ...l, discPercent: v, discStr: maskMoney(Math.round(gross * pct) / 100) };
    });
  }
  function launchSetDisc(v) {
    setLaunch(l => {
      if (!l) return l;
      const q = Math.max(1, parseFloat(String(l.qty).replace(',', '.')) || 1);
      const gross = q * parseMoney(l.priceStr);
      const val = Math.min(gross, parseMoney(v));
      const pct = gross > 0 ? Math.round((val / gross) * 10000) / 100 : 0;
      return { ...l, discStr: v, discPercent: String(pct).replace('.', ',') };
    });
  }

  // Joga o item lançado no pedido. Mesma combinação (produto + variação +
  // cor + borda + tinta + acabamentos) cai na mesma linha.
  function pushLaunchItem(l, q, price, disc, color, priceTouched) {
    const product = l.product;
    // acabamento vira "Tipo: COR"; borda vira "Com borda: TIPO"
    const acabList = [...l.acab].map(a => l.acabCor?.[a] ? `${a}: ${l.acabCor[a]}` : a);
    const bordaStr = l.borda === 'Com borda' && l.bordaTipo ? `Com borda: ${l.bordaTipo}` : l.borda;
    const acab = [...acabList].sort().join('|');
    const lineKey = i => [i.product_id, i.variant || '', i.print_color || '', i.borda || '', i.ink_type || '', [...(i.acabamentos || [])].sort().join('|')].join('__');
    const key = [product.id, l.variantName || '', color || '', bordaStr || '', l.ink || '', acab].join('__');
    const novo = {
      product_id: product.id,
      variant: l.variantName || null,
      variant_code: l.variantCode || null,
      name: l.variantName || product.name,
      unit: product.unit,
      sale_price: product.sale_price,
      price_tiers: product.price_tiers || [],
      unit_price: price,
      quantity: q,
      discount: disc,
      print_color: color || null,
      borda: bordaStr || null,
      ink_type: l.ink || null,
      acabamentos: acabList,
      priceTouched,
    };

    setItems(prev => {
      // EDICAO SUBSTITUI, E VEM ANTES DA FUSAO.
      //
      // A fusao existe para lancar duas vezes a mesma combinacao e cair
      // numa linha so. Na edicao ela e veneno: a linha editada casa com
      // ela mesma, e corrigir "100 para 80" somaria 80 nas 100. Por isso
      // a substituicao e a primeira coisa, e sai por aqui.
      if (Number.isInteger(l.editIndex)) {
        return prev.map((x, i) => (i === l.editIndex ? novo : x));
      }

      const existing = prev.find(i => lineKey(i) === key);
      if (existing) {
        return prev.map(i => {
          if (lineKey(i) !== key) return i;
          return { ...i, quantity: i.quantity + q, unit_price: price, discount: (i.discount || 0) + disc, priceTouched };
        });
      }
      return [...prev, novo];
    });
  }

  // Confirmar (F2) fecha o card. Acumular (F3) mantém aberto no mesmo
  // produto, com a quantidade zerada, para lançar outra cor/quantidade.
  function commitLaunch(keepOpen) {
    if (!launch) return;
    const l = launch;
    if (!String(l.color || '').trim()) {
      toast.error('Informe a cor da personalização');
      return;
    }
    if (l.borda === 'Com borda' && !String(l.bordaTipo || '').trim()) {
      toast.error('Selecione a borda');
      return;
    }
    const semCor = (l.acab || []).find(a => !String(l.acabCor?.[a] || '').trim());
    if (semCor) {
      toast.error(`Selecione a cor de: ${semCor}`);
      return;
    }
    const q = Math.max(1, parseFloat(String(l.qty).replace(',', '.')) || 1);
    const price = parseMoney(l.priceStr);
    const gross = q * price;
    const disc = Math.min(gross, parseMoney(l.discStr));
    const color = String(l.color || '').trim();
    pushLaunchItem(l, q, price, disc, color, !!l.priceTouched);
    toast.success(`${l.variantName || l.product.name} ${Number.isInteger(l.editIndex) ? 'atualizado' : 'adicionado'}`, { duration: 1200 });
    if (keepOpen) {
      // mantém borda e tinta (são do copo) e limpa o resto para o próximo lançamento
      setLaunch(cur => cur && { ...cur, qty: '1', discPercent: '0', discStr: maskMoney(0), color: '', acab: [] });
      setTimeout(() => qtyRef.current?.select(), 30);
    } else {
      setLaunch(null);
      setProductSearch('');
      setTimeout(() => searchRef.current?.focus(), 50);
    }
  }

  function backToModels() {
    setDrill(null);
    setProductSearch('');
    setTimeout(() => searchRef.current?.focus(), 30);
  }

  // Enter NÃO adiciona mais nada automaticamente — o operador escolhe clicando no produto
  function handleProductKeyDown(e) {
    if (e.key === 'Enter') e.preventDefault();
  }

  /**
   * O LAPIS REABRE O LANCAMENTO COM O ITEM DENTRO.
   *
   * Reconstroi o rascunho a partir do que foi gravado na linha — e
   * `editIndex` e o que faz o Confirmar SUBSTITUIR em vez de somar mais
   * um. Sem ele, corrigir a quantidade de um item criaria um segundo.
   *
   * O produto do item pode nao estar mais na lista carregada (a busca
   * traz uma pagina por vez), entao o essencial vem do proprio item.
   */
  function editarItem(idx) {
    const it = items[idx];
    if (!it) return;
    const acab = (it.acabamentos || []).map(a => a.nome || a);
    const acabCor = {};
    for (const a of it.acabamentos || []) if (a && a.nome) acabCor[a.nome] = a.cor || '';
    const bordaBruta = String(it.borda || '');

    setLaunch({
      editIndex: idx,
      product: {
        id: it.product_id, name: it.name, unit: it.unit,
        sale_price: it.sale_price, price_tiers: it.price_tiers || [],
        ink_type: it.ink_type || '',
      },
      variantName: it.variant || null,
      variantCode: it.variant_code || null,
      qty: String(it.quantity ?? 1),
      priceStr: maskMoney(it.unit_price),
      // Preco de item ja lancado nao pode ser "recalculado pela faixa"
      // ao reabrir: o que esta na linha e o que foi combinado.
      priceTouched: true,
      discPercent: '0',
      discStr: maskMoney(it.discount || 0),
      color: it.print_color || '',
      borda: /com borda/i.test(bordaBruta) ? 'Com borda' : 'Sem borda',
      bordaTipo: (bordaBruta.split(':')[1] || '').trim(),
      ink: it.ink_type || '',
      acab,
      acabCor,
    });
    setTimeout(() => qtyRef.current?.select(), 40);
  }

  function removeItem(idx) {
    setItems(prev => prev.filter((_, i) => i !== idx));
  }

  // O desconto do item (dado no lançamento) já sai do subtotal — é assim
  // que o backend grava o total da linha (qtd × preço − desconto).
  const itemsDiscount = items.reduce((sum, i) => sum + (i.discount || 0), 0);
  const subtotal = items.reduce((sum, i) => sum + i.quantity * i.unit_price - (i.discount || 0), 0);
  const discountValue = parseMoney(discount);
  const couponDiscount = coupon
    ? (coupon.discount_type === 'percent'
        ? Math.min(subtotal, Math.round(subtotal * Number(coupon.discount_value)) / 100)
        : Math.min(subtotal, Number(coupon.discount_value)))
    : 0;
  const freteValue = parseMoney(freightInput);
  const goodsBase = subtotal - discountValue - couponDiscount;
  const payPercent = payTerm ? (Number(payTerm.percent) || 0) : 0;
  const paymentAdj = payTerm ? Math.round(goodsBase * payPercent) / 100 : 0; // − desconto / + juros
  const total = Math.max(0, goodsBase + paymentAdj + freteValue);
  const received = parseMoney(receivedAmount);
  const change = paymentMethod === 'cash' && received > 0 ? received - total : 0;

  async function finalizeSale() {
    if (items.length === 0) { toast.error('Adicione ao menos um produto'); return; }
    if (!selectedCustomer) { toast.error('Selecione o cliente (obrigatório)'); return; }
    if (!operationDate) { toast.error('Informe a Data da operação'); return; }
    if (!eventDate) { toast.error('Informe a Data do evento'); return; }
    if (!shipDate) { toast.error('Informe a Data da saída'); return; }
    if (!deliveryDate) { toast.error('Informe a Previsão de entrega'); return; }
    if (paymentMethod === 'cash' && received > 0 && received < total) {
      toast.error(`Valor insuficiente! Faltam ${fmt(total - received)}`);
      return;
    }
    // Simulador de faturamento (Contábil): informa o impacto no limite da
    // empresa faturadora ANTES de concluir — a decisão é do usuário.
    if (billingCompanyId) {
      try {
        const sim = await api.get(`/contabil/simulate?company_id=${billingCompanyId}&amount=${total}`);
        if (sim?.exceeds) {
          const ok = confirm(
            `⚠️ ATENÇÃO: esta operação ultrapassará o limite configurado!\n\n` +
            `Empresa selecionada: ${sim.company.razao_social}\n` +
            `Faturamento atual: ${fmt(sim.faturado_atual)}\n` +
            `Após esta venda: ${fmt(sim.apos_venda)}\n` +
            `Limite anual: ${fmt(sim.limite)}\n\n` +
            `Deseja continuar mesmo assim?`,
          );
          if (!ok) return;
        } else if (sim?.warning) {
          toast(`${sim.company.razao_social}: ${String(sim.pct_apos).replace('.', ',')}% do limite anual após esta venda`, { icon: '⚠️' });
        }
      } catch { /* módulo contábil indisponível → não trava a venda */ }
    }
    // garante a regra do ano: data retroativa à operação vira o ano seguinte
    const evD = forwardDate(eventDate), shD = forwardDate(shipDate), dlD = forwardDate(deliveryDate);
    if (evD !== eventDate) setEventDate(evD);
    if (shD !== shipDate) setShipDate(shD);
    if (dlD !== deliveryDate) setDeliveryDate(dlD);
    saleMutation.mutate({
      customer_id: selectedCustomer.id,
      type: 'sale',
      operation_date: operationDate || null,
      origin: origem || null,
      event_date: evD || null,
      ship_date: shD || null,
      delivery_date: dlD || null,
      items: items.map(i => ({
        product_id: i.product_id,
        quantity: i.quantity,
        unit_price: i.unit_price,
        discount: i.discount || 0,
        // guarda a variação escolhida (código + nome) e a cor da personalização
        ...(itemCustomization(i) ? { customization: itemCustomization(i) } : {}),
      })),
      discount: discountValue + couponDiscount,
      coupon_code: coupon?.code || null,
      freight: freteValue,
      carrier_id: isRetirada ? null : (carrierId || null),
      // A COLUNA que o fluxo le para pular "Em Transito" (migracao 090).
      delivery_mode: isRetirada ? 'retirada' : 'entrega',
      payment_adjustment: paymentAdj,
      ...(() => {
        const noteParts = [];
        if (payTerm) noteParts.push(`Pagamento: ${payTerm.label}${payPercent ? ` (${payPercent > 0 ? '+' : ''}${payPercent}%)` : ''}`);
        if (isRetirada) noteParts.push(`Entrega: ${RETIRADA_LABEL}`);
        if (quoteNumber.trim()) noteParts.push(`Cotação do frete: ${quoteNumber.trim()}`);
        return noteParts.length ? { notes: noteParts.join(' · ') } : {};
      })(),
      payment_method: paymentMethod,
      ...(paymentMethod === 'a_prazo' ? { installments, first_due_date: firstDueDate } : {}),
      ...(billingCompanyId ? { billing_company_id: billingCompanyId } : {}),
      ...(receivingAccountId ? { receiving_account_id: receivingAccountId } : {}),
    });
  }

  // Orçamento: salva no histórico e gera a foto PNG
  function finalizeQuote() {
    if (items.length === 0) { toast.error('Adicione ao menos um produto'); return; }
    const vDays = parseInt(validityDays, 10) || 3;
    const until = new Date(); until.setDate(until.getDate() + vDays);
    quoteMutation.mutate({
      customer_id: selectedCustomer?.id || null,
      items: items.map(i => ({
        product_id: i.product_id,
        product_name: i.name,
        quantity: i.quantity,
        unit_price: i.unit_price,
        ...(itemCustomization(i) ? { customization: itemCustomization(i) } : {}),
      })),
      // o orçamento não tem desconto por item: soma no desconto do total
      discount: discountValue + itemsDiscount,
      delivery_days: parseInt(deliveryDays, 10) || 10,
      valid_until: until.toISOString().split('T')[0],
      notes: buildQuoteNotes({
        freight: freteValue,
        carrierName: carrierLabel,
        quoteNumber: quoteNumber.trim(),
        quoteDate,
        quoteValidityDays: parseInt(quoteValidityDays, 10) || 0,
        deliveryDays: parseInt(deliveryDays, 10) || 0,
        productionTime: productionTime.trim(),
        pixPrice: parseMoney(pixPriceInput),
        validityDays: vDays,
      }),
    });
  }

  // ── Painel de busca/lista de produtos (dentro do card ADICIONAR PRODUTOS) ──
  const ProductPanel = (
    <div className="flex flex-col overflow-hidden h-full border border-gray-100 rounded-xl">
      <div className="p-3 border-b border-gray-100">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            ref={searchRef}
            type="text"
            placeholder={drill ? `Buscar variação de ${drill.name}...` : 'Buscar produto por nome ou código...'}
            value={productSearch}
            onChange={e => setProductSearch(e.target.value)}
            onKeyDown={handleProductKeyDown}
            className="input pl-9 text-base"
            autoFocus
          />
        </div>
        {/* Filtro por tipo: COM BORDA / DEGRADÊ / TRADICIONAL etc. */}
        {!drill && (
          <div className="flex gap-2 mt-2">
            <select className="input text-sm flex-1 min-w-0" value={typeFilter}
              onChange={e => { setTypeFilter(e.target.value); setVolFilter(''); }}>
              <option value="">Todos os tipos</option>
              {productTypes.map(t => (
                <option key={t.id} value={String(t.name || '').trim().toUpperCase()}>
                  {t.name}{t.product_count ? ` (${t.product_count})` : ''}
                </option>
              ))}
            </select>
            {/* Tamanho: só aparece depois de escolher o tipo, com os ML que aquele tipo tem */}
            {typeFilter && volumeOptions.length > 0 && (
              <select className="input text-sm w-36 shrink-0" value={volFilter}
                onChange={e => setVolFilter(e.target.value)} title="Filtrar por tamanho">
                <option value="">Todos os ML</option>
                {volumeOptions.map(v => <option key={v} value={v}>{v} ML</option>)}
              </select>
            )}
          </div>
        )}
      </div>

      {/* a lista rola dentro do card */}
      <div className="flex-1 overflow-y-auto min-h-[200px]">
        {drill ? (
          <>
            <button type="button" onClick={backToModels}
              className="w-full flex items-center justify-between px-4 py-2 bg-gray-50 sticky top-0 z-10 text-xs text-gray-600 hover:bg-gray-100 border-b border-gray-100">
              <span className="flex items-center gap-1"><ChevronLeft size={13} /> Voltar — <b className="ml-0.5">{drill.name}</b></span>
              <span>{variantList.length} variações</span>
            </button>
            {variantList.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">Nenhuma variação encontrada.</p>
            ) : variantList.map((v, idx) => (
              <button key={idx} type="button" onClick={() => addVariant(v)}
                className={`w-full flex items-center justify-between gap-2 px-4 py-2.5 hover:bg-primary-50 text-left border-b border-gray-50 last:border-0 ${idx === 0 && productSearch.trim() ? 'bg-blue-50/40' : ''}`}>
                <span className="flex items-center gap-2 min-w-0">
                  <span className="text-[10px] font-mono font-semibold text-indigo-600 bg-indigo-50 rounded px-1.5 py-0.5 shrink-0">{v.code}</span>
                  <span className="produto-nome text-sm font-semibold leading-snug">{v.name}</span>
                </span>
                <span className="font-semibold text-primary-600 shrink-0">{fmt(drill.sale_price)}</span>
              </button>
            ))}
          </>
        ) : productList.length > 0 ? (
          <>
            <p className="text-[11px] text-gray-400 px-4 py-1.5 bg-gray-50 sticky top-0 z-10 flex justify-between">
              <span>{productSearch.trim() ? `${productList.length} encontrado(s)` : 'Todos os produtos (A–Z)'}</span>
              <span>{productList.length}</span>
            </p>
            {productList.map((p, idx) => {
              const nv = expandVariants(p).length;
              return (
                <button key={p.id} type="button" onClick={() => pickProduct(p)}
                  className={`w-full flex items-center justify-between px-4 py-3 hover:bg-primary-50 text-left border-b border-gray-50 last:border-0 ${idx === 0 && productSearch.trim() ? 'bg-blue-50/40' : ''}`}>
                  <div className="min-w-0">
                    <p className="produto-nome font-semibold text-sm leading-snug">{p.name}</p>
                    <p className="text-xs">
                      <Estoque valor={p.current_stock} />
                      {nv > 1 && <span className="ml-2 text-indigo-500 font-medium">{nv} variações</span>}
                    </p>
                  </div>
                  {nv > 1
                    ? <ChevronRight size={16} className="text-gray-300 shrink-0 ml-2" />
                    : <span className="font-semibold text-primary-600 shrink-0 ml-2">{fmt(p.sale_price)}</span>}
                </button>
              );
            })}
          </>
        ) : (
          <p className="text-sm text-gray-400 text-center py-8">Nenhum produto encontrado.</p>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-3">
      {/* Linha compacta — data da operação, cliente, transportadora e frete */}
      <div className="card p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-[170px_minmax(0,1.1fr)_minmax(0,0.8fr)_130px_minmax(0,0.7fr)] gap-3 items-start">
          {/* Data da operação / do orçamento. A Origem da venda ficava
              empilhada aqui embaixo e desceu para a linha dos prazos, ao
              lado das tres datas — e as quatro respostas que se dao de
              uma vez ao abrir o pedido. */}
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">{isQuote ? 'Data do orçamento *' : 'Data da operação *'}</label>
            <input type="date" className="input text-sm w-full" value={operationDate} onChange={e => changeOperationDate(e.target.value)} />
          </div>

          {/* Cliente */}
          <div className="relative min-w-0">
            <label className="text-xs font-medium text-gray-500 mb-1 flex items-center gap-1"><User size={12} /> Cliente *</label>
            {selectedCustomer ? (
              <div className="bg-primary-50 rounded-lg px-2.5 py-1.5 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                  {selectedCustomer.display_id != null && <span className="text-base font-mono font-bold bg-white text-primary-700 rounded-md px-2 py-0.5 shrink-0 border border-primary-200" title="ID do cliente">{selectedCustomer.display_id}</span>}
                  <p className="text-sm font-semibold text-primary-800 truncate">{selectedCustomer.name}</p>
                  <span className="flex items-center gap-0.5" title="Estrelas do cliente — para alterar, edite no cadastro de clientes">
                    {[1, 2, 3, 4, 5].map(n => (
                      <Star key={n} size={13} className={(selectedCustomer.rating || 0) >= n ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300'} />
                    ))}
                  </span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button type="button" onClick={() => setShowCustomerInfo(v => !v)} title="Ver todos os dados do cliente"
                    className="text-primary-500 hover:text-primary-700"><MoreHorizontal size={16} /></button>
                  <button onClick={() => { setSelectedCustomer(null); setShowCustomerInfo(false); }} className="text-primary-400 hover:text-red-500">
                    <X size={15} />
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Nome, ID ou telefone..."
                    value={customerSearch}
                    onChange={e => setCustomerSearch(e.target.value)}
                    onFocus={() => setCustFocus(true)}
                    onBlur={() => setTimeout(() => setCustFocus(false), 150)}
                    className="input text-sm pl-8 w-full"
                  />
                </div>
                {(() => {
                  const searching = customerSearch.trim().length >= 1;
                  const list = searching ? (customerResults?.data || []) : (custFocus ? (recentCustomers?.data || []) : []);
                  if (list.length === 0 && searching) return <p className="text-xs text-gray-400 mt-1">Nenhum cliente encontrado.</p>;
                  if (list.length === 0) return null;
                  return (
                    <div className="absolute left-0 right-0 z-20 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
                      {!searching && <p className="text-[11px] text-gray-400 px-3 py-1.5 bg-gray-50 sticky top-0">Últimos clientes cadastrados</p>}
                      {list.map(c => (
                        <button key={c.id} type="button"
                          onMouseDown={() => { setSelectedCustomer(c); setCustomerSearch(''); setCustFocus(false); }}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b border-gray-50 last:border-0 flex items-center gap-2">
                          {c.display_id != null && <span className="text-sm font-mono font-bold bg-gray-100 text-gray-600 rounded px-1.5 py-0.5 shrink-0" title="ID do cliente">{c.display_id}</span>}
                          <span className="min-w-0">
                            <span className="font-medium block truncate">{c.name}</span>
                            <span className="text-xs text-gray-400">{c.cpf_cnpj || c.phone}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  );
                })()}
              </>
            )}
          </div>

          {/* Transportadora — e aqui que se diz tambem que o cliente
              retira. Frete e cotacao e que somem, porque nao existem
              quando ninguem transporta. */}
          <div className="min-w-0">
            <label className="text-xs font-medium text-gray-500 mb-1 flex items-center gap-1"><Truck size={12} /> Transportadora</label>
            <select className="input text-sm w-full" value={carrierId} onChange={e => { setCarrierId(e.target.value); setShowSched(false); }}>
              <option value="">— selecione —</option>
              <option value={RETIRADA}>{RETIRADA_LABEL}</option>
              {(carriers?.data || []).map(c => <option key={c.id} value={c.id}>{c.trade_name || c.name}</option>)}
            </select>
            {carrierId && !isRetirada && (
              <button type="button" onClick={() => setShowSched(v => !v)} title="Horários de coleta"
                className="mt-1 text-gray-400 hover:text-primary-600 flex items-center gap-1 text-xs">
                <MoreHorizontal size={16} /> {showSched ? 'ocultar horários' : 'horários de coleta'}
              </button>
            )}
          </div>

          {/* Valor do frete */}
          <div className={isRetirada ? 'hidden' : ''}>
            <label className="text-xs font-medium text-gray-500 block mb-1">Valor do frete (R$)</label>
            <input type="text" inputMode="decimal" className="input text-sm w-full" value={freightInput}
              onChange={e => setFreightInput(e.target.value.replace(/[^\d.,]/g, ''))}
              onBlur={() => { if (freightInput.trim() !== '') setFreightInput(maskMoney(parseMoney(freightInput))); }}
              placeholder="0,00" />
          </div>

          {/* Nº da cotação do frete */}
          <div className={isRetirada ? 'hidden' : ''}>
            <label className="text-xs font-medium text-gray-500 block mb-1">Número da Cotação</label>
            <input type="text" className="input text-sm w-full" value={quoteNumber}
              onChange={e => setQuoteNumber(e.target.value)} placeholder="ex.: 12345" />
          </div>
        </div>

        {/* OS TRES PRAZOS MORAM AQUI, e nao num cartao proprio.
            O cartao "Pedido" existia para segurar tres datas e um numero
            gerado sozinho - e separava do resto do cabecalho justamente
            as perguntas que se responde de uma vez: quem compra, por onde
            sai e QUANDO cada coisa acontece. Subindo, some um cartao e o
            comeco do pedido passa a caber numa tela so. */}
        {!isQuote && (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 items-end mt-3 pt-3 border-t border-gray-100">
            {/* ORIGEM ABRE A LINHA DOS PRAZOS, a pedido de quem usa:
                origem, data do evento, data de saida e previsao de
                entrega sao as quatro respostas que se dao de uma vez ao
                abrir o pedido. Ela morava empilhada sob a Data da
                operacao, longe das tres. */}
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Origem da venda</label>
              <SeletorOrigem origens={origens} value={origem} onChange={setOrigem} />
            </div>
            <div>
              {/* CampoData e nao `input type=date`: o campo nativo nao
                  entrega valor nenhum enquanto o ano estiver vazio, entao
                  quem digitava "31/09" e pulava para o proximo campo
                  perdia o que escreveu. Aqui o ano corrente entra sozinho
                  ao sair do campo. */}
              <label className="text-xs font-medium text-gray-500 block mb-1">Data do evento *</label>
              <CampoData className="input w-full text-sm" value={eventDate} onChange={changeEventDate}
                onBlur={() => setEventDate(d => forwardDate(d))} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Data da saída *</label>
              <CampoData className="input w-full text-sm" value={shipDate} onChange={setShipDate}
                onBlur={() => setShipDate(d => forwardDate(d))} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Previsão de entrega *</label>
              <CampoData className="input w-full text-sm" value={deliveryDate} onChange={setDeliveryDate}
                onBlur={() => setDeliveryDate(d => forwardDate(d))} />
            </div>
          </div>
        )}

        {!selectedCustomer && <p className="text-xs text-amber-600 mt-2">O cliente é obrigatório para o pedido.</p>}

        {/* Horários de coleta (abrem pelo ⋯ abaixo da transportadora) */}
        {carrierId && showSched && (() => {
          const c = (carriers?.data || []).find(x => x.id === carrierId);
          const sched = Array.isArray(c?.pickup_schedule) ? c.pickup_schedule : [];
          const DAY_LABELS = { seg: 'Seg', ter: 'Ter', qua: 'Qua', qui: 'Qui', sex: 'Sex', sab: 'Sáb', dom: 'Dom' };
          return (
            <div className="mt-2 text-xs bg-blue-50/60 border border-blue-100 rounded-lg px-3 py-2">
              <p className="font-semibold text-gray-700 mb-1">🕒 Horários de coleta — {c?.trade_name || c?.name || 'transportadora'}</p>
              {sched.length === 0 ? (
                <p className="text-gray-400">Nenhum horário de coleta cadastrado (cadastre em Logística → Transportadoras).</p>
              ) : (
                <ul className="space-y-0.5">
                  {sched.map((slot, i) => (
                    <li key={i} className="text-gray-600">
                      <b>{(slot.days || []).map(d => DAY_LABELS[d] || d).join(', ') || 'Todos os dias'}</b>
                      {slot.time && <span className="text-gray-500"> às {slot.time}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })()}

        {/* Dados completos do cliente (abrem pelo ⋯ ao lado do nome) */}
        {selectedCustomer && showCustomerInfo && (
          <div className="text-xs text-gray-600 grid sm:grid-cols-3 gap-x-6 gap-y-0.5 border-t border-gray-100 pt-2 mt-3">
            {selectedCustomer.email && <p><b>E-mail:</b> {selectedCustomer.email}</p>}
            {selectedCustomer.phone && (
              <p className="flex items-center gap-1.5">
                <b>Telefone:</b> {selectedCustomer.phone}
                <a href={waLink(selectedCustomer.phone, selectedCustomer.name)} target="_blank" rel="noreferrer"
                  title="Chamar no WhatsApp" className="text-green-500 hover:text-green-600">
                  <MessageCircle size={15} />
                </a>
              </p>
            )}
            {selectedCustomer.mobile && (
              <p className="flex items-center gap-1.5">
                <b>Celular:</b> {selectedCustomer.mobile}
                <a href={waLink(selectedCustomer.mobile, selectedCustomer.name)} target="_blank" rel="noreferrer"
                  title="Chamar no WhatsApp" className="text-green-500 hover:text-green-600">
                  <MessageCircle size={15} />
                </a>
              </p>
            )}
            {selectedCustomer.cpf_cnpj && <p><b>CPF/CNPJ:</b> {selectedCustomer.cpf_cnpj}</p>}
            {selectedCustomer.rg_ie && <p><b>RG/IE:</b> {selectedCustomer.rg_ie}</p>}
            {selectedCustomer.instagram && <p><b>Instagram:</b> {selectedCustomer.instagram}</p>}
            {(() => {
              const a = selectedCustomer.address;
              if (!a || (!a.street && !a.city)) return null;
              return <p className="sm:col-span-3"><b>Endereço:</b> {a.street}{a.number ? `, ${a.number}` : ''}{a.neighborhood ? ` - ${a.neighborhood}` : ''}{a.city ? ` - ${a.city}/${a.state || ''}` : ''}{a.zip ? ` (${a.zip})` : ''}</p>;
            })()}
          </div>
        )}
      </div>

        {/* Dados do ORÇAMENTO (prazos e validades que saem na foto) */}
        {isQuote && (
        <div className="card p-4 space-y-3">
          <span className="text-sm font-semibold text-gray-700">📋 Dados do orçamento</span>
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2">
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Data da cotação</label>
              <input type="date" className="input w-full text-sm" value={quoteDate} onChange={e => setQuoteDate(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Validade da cotação (dias)</label>
              <input type="number" min="0" className="input w-full text-sm" value={quoteValidityDays} onChange={e => setQuoteValidityDays(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Prazo de entrega (dias úteis)</label>
              <input type="number" min="0" className="input w-full text-sm" value={deliveryDays} onChange={e => setDeliveryDays(e.target.value)} placeholder="ex.: 4" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Prazo de produção</label>
              <input type="text" className="input w-full text-sm" value={productionTime} onChange={e => setProductionTime(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Valor PIX/dinheiro (R$)</label>
              <input type="text" inputMode="decimal" className="input w-full text-sm" value={pixPriceInput}
                onChange={e => setPixPriceInput(e.target.value.replace(/[^\d.,]/g, ''))}
                onBlur={() => { if (pixPriceInput.trim() !== '') setPixPriceInput(maskMoney(parseMoney(pixPriceInput))); }}
                placeholder="0,00" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Validade do orçamento (dias)</label>
              <input type="number" min="1" className="input w-full text-sm" value={validityDays} onChange={e => setValidityDays(e.target.value)} />
            </div>
          </div>
        </div>
        )}

        {/* Itens do pedido + botão ADICIONAR PRODUTOS */}
        <div className="card">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100">
            <p className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
              <ShoppingCart size={15} /> Itens do pedido{items.length > 0 ? ` (${items.length})` : ''}
            </p>
            <button type="button" onClick={() => setProductsOpen(true)} className="btn-primary text-sm">
              <Plus size={15} /> ADICIONAR PRODUTOS
            </button>
          </div>
          <div className="max-h-[42vh] overflow-y-auto">
          {items.length === 0 ? (
            <button type="button" onClick={() => setProductsOpen(true)}
              className="w-full flex flex-col items-center justify-center h-36 text-gray-400 hover:text-primary-600 transition-colors">
              <ShoppingCart size={30} className="mb-2 opacity-30" />
              <p className="text-sm">Nenhum item — clique em ADICIONAR PRODUTOS</p>
            </button>
          ) : (
            // A TABELA GANHOU COLUNA PROPRIA PARA CADA COISA.
            // Codigo, cor e desconto viviam amontoados embaixo do nome,
            // numa linha de texto cinza — dava para ler um item, nao
            // para comparar dez. Com colunas, o olho desce a coluna.
            // `overflow-x` porque oito colunas nao cabem num notebook
            // pequeno, e cortar numero de dinheiro nao e opcao.
            <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[900px]">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase w-28">Cód. Produto</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Nome do Produto</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase w-36">Cor da personalização</th>
                  <th className="px-3 py-2 text-center text-xs font-semibold text-gray-500 uppercase w-24">Quantidade</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase w-32">Vr. Unitário Bruto</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase w-28">Vr. Desconto</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase w-32">Vr. Total Líquido</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase w-32">Vendedor</th>
                  <th className="w-16" />
                </tr>
              </thead>
              <tbody>
                {items.map((item, i) => (
                  <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-3 py-2">
                      {item.variant_code
                        ? <span className="text-[11px] font-mono font-semibold text-indigo-600 bg-indigo-50 rounded px-1.5 py-0.5">{item.variant_code}</span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-2">
                      <p className="font-medium text-sm">{item.name}</p>
                      {/* Borda, tinta e acabamento continuam embaixo do
                          nome: sao do COPO, e uma coluna para cada
                          deixaria a tabela com treze. A cor subiu porque
                          e a que se confere item a item. */}
                      {(() => {
                        const partes = [item.borda, item.ink_type, item.acabamentos?.length && item.acabamentos.join(', ')].filter(Boolean);
                        return partes.length ? <p className="text-[11px] text-gray-400 mt-0.5">{partes.join(' · ')}</p> : null;
                      })()}
                    </td>
                    <td className="px-3 py-2 text-sm">
                      {item.print_color || <span className="text-gray-300">—</span>}
                    </td>
                    {/* A LINHA E LEITURA; QUEM EDITA E O LAPIS.
                        Quantidade e preco eram editaveis aqui dentro, ao
                        lado dos botoes de passo — tres formas de mexer no
                        mesmo item, e nenhuma delas alcancava a cor, a
                        borda ou o acabamento, que so existiam na janela
                        de lancamento. Editar metade do item num lugar e a
                        outra metade em outro e como o item acabava
                        divergindo do que foi combinado.
                        Agora o lapis reabre o lancamento inteiro. */}
                    <td className="px-3 py-2 text-center font-bold text-sm">{item.quantity}</td>
                    <td className="px-3 py-2 text-right text-sm">
                      {fmt(item.unit_price)}
                      {item.price_tiers?.length > 0 && !item.priceTouched && (
                        <p className="text-[10px] text-blue-500 mt-0.5">faixa automática</p>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right text-sm">
                      {item.discount > 0
                        ? <span className="text-amber-600">− {fmt(item.discount)}</span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold">
                      {fmt(item.quantity * item.unit_price - (item.discount || 0))}
                    </td>
                    {/* NAO HA CODIGO DE VENDEDOR NO SISTEMA — nem em
                        USUARIOS nem em VENDEDORES existe esse campo. Vai
                        o nome de quem esta lancando, que e quem a venda
                        vai registrar como vendedor. */}
                    <td className="px-3 py-2 text-xs text-gray-500 truncate">{user?.name || '—'}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        <button onClick={() => editarItem(i)} title="Editar este item"
                          className="btn-ghost p-1 text-blue-400 hover:text-blue-600">
                          <Pencil size={14} />
                        </button>
                        <button onClick={() => removeItem(i)} title="Tirar do pedido"
                          className="btn-ghost p-1 text-red-400 hover:text-red-600">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
          </div>
        </div>

        {/* Pagamento + Totais lado a lado (menos rolagem) */}
        <div className={`grid ${isQuote ? '' : 'lg:grid-cols-2'} gap-3 items-start`}>
        {/* Forma de pagamento (só no pedido de venda) */}
        {!isQuote && (
        <div className="card p-4">
          <p className="text-sm font-semibold text-gray-700 mb-2">Pagamento</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {[
              { value: 'cash', label: '💵 Dinheiro' },
              { value: 'pix', label: '📱 Pix' },
              { value: 'card_debit', label: '💳 Débito' },
              { value: 'card_credit', label: '💳 Crédito' },
              { value: 'transfer', label: '🏦 Transf.' },
              { value: 'a_prazo', label: '🧾 A prazo' },
            ].map(pm => (
              <button key={pm.value}
                onClick={() => { setPaymentMethod(pm.value); setReceivedAmount(''); }}
                className={`py-2 px-3 rounded-lg text-sm font-medium border transition-colors ${
                  paymentMethod === pm.value
                    ? 'bg-primary-600 text-white border-primary-600'
                    : 'bg-white text-gray-700 border-gray-200 hover:border-primary-300'
                }`}>
                {pm.label}
              </button>
            ))}
          </div>

          {/* Empresa Faturadora + Conta de Destino (módulo Contábil/Fiscal) */}
          {companiesOk.length > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-100 grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-gray-500 mb-0.5">Empresa Faturadora</label>
                <select className="input text-sm w-full" value={billingCompanyId}
                  onChange={e => { setBillingCompanyId(e.target.value); setReceivingAccountId(''); }}>
                  {companiesOk.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.nome_fantasia || c.razao_social}{Number(c.pct) > 0 ? ` · ${Number(c.pct).toFixed(0)}% do limite` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-0.5">Conta de Destino</label>
                <select className="input text-sm w-full" value={receivingAccountId}
                  onChange={e => setReceivingAccountId(e.target.value)}>
                  <option value="">— Selecionar —</option>
                  {companyAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
            </div>
          )}

          {paymentMethod === 'cash' && (
            <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-gray-700">Valor recebido</span>
                <input type="text" inputMode="decimal"
                  value={receivedAmount} onChange={e => setReceivedAmount(e.target.value.replace(/[^\d.,]/g, ''))}
                  onBlur={() => { if (receivedAmount.trim() !== '') setReceivedAmount(maskMoney(parseMoney(receivedAmount))); }}
                  className="input text-right w-28 text-sm font-semibold" placeholder="0,00" />
              </div>
              {received > 0 && (
                <div className={`flex justify-between items-center p-3 rounded-xl font-bold ${
                  change >= 0 ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
                }`}>
                  <span>{change >= 0 ? '💰 Troco' : '⚠️ Faltam'}</span>
                  <span>{fmt(Math.abs(change))}</span>
                </div>
              )}
            </div>
          )}

          {paymentMethod === 'a_prazo' && (
            <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
              {!selectedCustomer && (
                <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-2 py-1.5">
                  ⚠️ Selecione o cliente — a prazo gera conta a receber no nome dele.
                </p>
              )}
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-gray-700">Parcelas</span>
                <select className="input w-32 text-sm" value={installments}
                  onChange={e => setInstallments(parseInt(e.target.value))}>
                  {[1,2,3,4,5,6,7,8,9,10,11,12].map(n => (
                    <option key={n} value={n}>{n}x de {fmt(total / n)}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-gray-700">1º vencimento</span>
                <input type="date" className="input w-40 text-sm" value={firstDueDate}
                  onChange={e => setFirstDueDate(e.target.value)} />
              </div>
            </div>
          )}
        </div>
        )}

        {/* Totais */}
        <div className="card p-4 space-y-2">
          <div className="flex justify-between text-sm text-gray-600">
            <span>{items.length} iten{items.length !== 1 ? 's' : ''}</span>
            <span>{fmt(subtotal)}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-gray-600">Desconto (R$)</span>
            <input type="text" inputMode="decimal"
              value={discount} onChange={e => setDiscount(e.target.value.replace(/[^\d.,]/g, ''))}
              onBlur={() => { if (discount.trim() !== '') setDiscount(maskMoney(parseMoney(discount))); }}
              className="input text-right w-28 text-sm" placeholder="0,00" />
          </div>

          {/* Cupom de desconto (só no pedido de venda) */}
          {!isQuote && (coupon ? (
            <div className="flex items-center justify-between gap-3 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
              <span className="text-sm text-green-700 font-medium">
                🎟️ {coupon.code} — {coupon.discount_type === 'percent' ? `${coupon.discount_value}%` : fmt(coupon.discount_value)}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-sm text-green-700 font-semibold">−{fmt(couponDiscount)}</span>
                <button type="button" onClick={() => { setCoupon(null); setCouponInput(''); }}
                  className="text-gray-400 hover:text-red-500"><X size={15} /></button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <input value={couponInput} onChange={e => setCouponInput(e.target.value.toUpperCase().replace(/\s/g, ''))}
                onKeyDown={e => { if (e.key === 'Enter' && couponInput.trim()) { e.preventDefault(); couponMut.mutate(); } }}
                className="input text-sm font-mono flex-1" placeholder="Cupom de desconto" />
              <button type="button" onClick={() => couponMut.mutate()} disabled={!couponInput.trim() || couponMut.isPending || items.length === 0}
                className="btn-secondary text-sm disabled:opacity-50">
                {couponMut.isPending ? <Loader2 size={14} className="animate-spin" /> : 'Aplicar'}
              </button>
            </div>
          ))}

          {/* Condição de pagamento (desconto / juros) */}
          {!isQuote && payTerms.length > 0 && (
            <div className="border-t border-gray-100 pt-2 space-y-1.5">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-gray-600">Condição de pagamento</span>
                <select value={payTerm?.label || ''}
                  onChange={e => setPayTerm(payTerms.find(t => t.label === e.target.value) || null)}
                  className="input text-sm w-44">
                  <option value="">À vista (sem ajuste)</option>
                  {payTerms.map((t, i) => (
                    <option key={i} value={t.label}>{t.label}{t.percent ? ` (${t.percent > 0 ? '+' : ''}${t.percent}%)` : ''}</option>
                  ))}
                </select>
              </div>
              {payTerm && paymentAdj !== 0 && (
                <div className={`flex justify-between text-sm font-medium ${paymentAdj < 0 ? 'text-green-600' : 'text-orange-600'}`}>
                  <span>{paymentAdj < 0 ? 'Desconto' : 'Juros'} {payTerm.label} ({payPercent > 0 ? '+' : ''}{payPercent}%)</span>
                  <span>{paymentAdj < 0 ? '−' : '+'}{fmt(Math.abs(paymentAdj))}</span>
                </div>
              )}
            </div>
          )}

          {/* Frete + prazo automáticos */}
          <div className="border-t border-gray-100 pt-2">
            {frete ? (
              <div className="flex items-center justify-between gap-3 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                <span className="text-sm text-blue-800">
                  🚚 Frete {frete.uf ? `(${frete.uf})` : ''}: <b>{freteValue > 0 ? fmt(freteValue) : 'Grátis'}</b>
                  {frete.days ? <> · chega em <b>{frete.days} dia{frete.days > 1 ? 's' : ''}</b></> : ''}
                </span>
                <button type="button" onClick={() => { setFrete(null); setFreightInput(''); }} className="text-gray-400 hover:text-red-500"><X size={15} /></button>
              </div>
            ) : (
              <>
                {freteValue > 0 && (
                  <div className="flex justify-between text-sm text-gray-600 mb-1.5">
                    <span>🚚 Frete</span>
                    <span className="font-medium">{fmt(freteValue)}</span>
                  </div>
                )}
                <button type="button" onClick={() => freteMut.mutate()}
                  disabled={freteMut.isPending || items.length === 0 || !selectedCustomer}
                  className="btn-secondary text-sm w-full disabled:opacity-50"
                  title={!selectedCustomer ? 'Selecione o cliente para usar o estado/CEP dele' : 'Calcula o frete e o prazo pelo estado do cliente'}>
                  {freteMut.isPending ? <Loader2 size={14} className="animate-spin" /> : '🚚'} Calcular frete e prazo
                </button>
              </>
            )}
          </div>

          <div className="flex justify-between font-bold text-2xl border-t border-gray-100 pt-2">
            <span>TOTAL</span>
            <span className="text-primary-600">{fmt(total)}</span>
          </div>
        </div>
        </div>

        {/* Finalizar */}
        <button
          onClick={isQuote ? finalizeQuote : finalizeSale}
          disabled={items.length === 0 || saleMutation.isPending || quoteMutation.isPending}
          className="btn-primary w-full py-4 text-base"
        >
          {(saleMutation.isPending || quoteMutation.isPending)
            ? <><Loader2 size={18} className="animate-spin" /> Processando...</>
            : isQuote
              ? <><Download size={18} /> Salvar e Gerar Foto do Orçamento — {fmt(total)}</>
              : <><Check size={18} /> Finalizar — {fmt(total)}</>
          }
        </button>

      {/* Card grande para escolher os produtos do pedido */}
      <Modal isOpen={productsOpen} onClose={() => setProductsOpen(false)} title="Adicionar produtos" size="full"
        footer={
          <button type="button" onClick={() => setProductsOpen(false)} className="btn-primary">
            <Check size={15} /> Concluir{items.length > 0 ? ` — ${items.length} ite${items.length > 1 ? 'ns' : 'm'} no pedido` : ''}
          </button>
        }>
        <div className="h-[65vh] flex flex-col">
          {ProductPanel}
        </div>
      </Modal>

      {/* Lançamento do produto: abre ao escolher o item na lista */}
      <Modal isOpen={!!launch} onClose={() => setLaunch(null)}
        title={Number.isInteger(launch?.editIndex) ? 'EDITAR ITEM DO PEDIDO' : 'LANÇAMENTO DE PRODUTO'} size="lg"
        footer={
          <>
            <button type="button" onClick={() => setLaunch(null)} className="btn-secondary">
              <X size={15} /> Cancelar <span className="text-gray-400 ml-1">ESC</span>
            </button>
            {/* Acumular nao existe na edicao: "lanca e continua" com um
                item ja lancado criaria uma copia dele a cada F3. */}
            {!Number.isInteger(launch?.editIndex) && (
              <button type="button" onClick={() => commitLaunch(true)} className="btn-secondary"
                title="Lança este item e continua no mesmo produto, para outra cor ou quantidade">
                <Plus size={15} /> Acumular <span className="text-gray-400 ml-1">F3</span>
              </button>
            )}
            <button type="button" onClick={() => commitLaunch(false)} className="btn-primary">
              <Check size={15} />
              {Number.isInteger(launch?.editIndex) ? 'Salvar alterações' : 'Confirmar'}
              <span className="text-white/60 ml-1">F2</span>
            </button>
          </>
        }>
        {launch && (
          <div className="flex flex-col lg:flex-row gap-4 lj-caixa-alta">

            {/* ITENS JA ADICIONADOS.
                Acumular sempre guardou o item e limpou o formulario — mas
                a unica prova disso era um toast de um segundo. Sem ver a
                lista crescer, "Acumular" parecia nao ter feito nada, e a
                unica forma de conferir o pedido era fechar a tela.
                Agora a lista fica do lado, e cada F3 aparece nela. */}
            <div className="lg:w-64 shrink-0 lg:border-r lg:pr-4 border-gray-100">
              <div className="flex items-baseline justify-between mb-2">
                <p className="text-xs font-semibold text-gray-500">
                  Itens já adicionados
                </p>
                <span className="text-xs font-bold text-primary-700">{items.length}</span>
              </div>

              {items.length === 0 ? (
                <p className="text-xs text-gray-400 leading-relaxed">
                  Nenhum item ainda. Use <b>Acumular (F3)</b> para lançar este
                  e continuar no mesmo produto, ou <b>Confirmar (F2)</b> para
                  lançar e fechar.
                </p>
              ) : (
                <>
                  <div className="space-y-1.5 overflow-y-auto pr-1" style={{ maxHeight: 300 }}>
                    {items.map((it, i) => (
                      <div key={i} className="rounded-lg px-2 py-1.5 bg-gray-50 border border-gray-100">
                        <div className="flex items-start gap-1.5">
                          <p className="text-[11px] font-medium text-gray-800 leading-snug flex-1 min-w-0">
                            {it.name}
                          </p>
                          <button type="button" onClick={() => removeItem(i)}
                            title="Tirar do pedido"
                            className="text-gray-300 hover:text-red-500 shrink-0">
                            <Trash2 size={12} />
                          </button>
                        </div>
                        {/* O que diferencia dois lancamentos do MESMO copo
                            e a cor e o acabamento — sem isso a lista vira
                            quatro linhas iguais. */}
                        {(it.print_color || it.borda || (it.acabamentos || []).length > 0) && (
                          <p className="text-[10px] text-gray-500 leading-snug">
                            {[it.print_color, it.borda, ...(it.acabamentos || []).map(a => a.nome || a)]
                              .filter(Boolean).join(' · ')}
                          </p>
                        )}
                        <p className="text-[11px] text-gray-600 mt-0.5">
                          {it.quantity} × {fmt(it.unit_price)}
                          {it.discount > 0 && <span className="text-amber-600"> − {fmt(it.discount)}</span>}
                          <b className="text-gray-800 float-right">
                            {fmt(it.quantity * it.unit_price - (it.discount || 0))}
                          </b>
                        </p>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-baseline justify-between mt-2 pt-2 border-t border-gray-100">
                    <span className="text-xs text-gray-500">Total dos itens</span>
                    <span className="text-sm font-bold text-primary-700">{fmt(subtotal)}</span>
                  </div>
                </>
              )}
            </div>

            {/* O formulario do lancamento */}
            <div className="space-y-4 flex-1 min-w-0">
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Produto</label>
              <div className="input bg-gray-50 flex items-center gap-2 text-sm">
                {launch.variantCode && (
                  <span className="text-[10px] font-mono font-semibold text-indigo-600 bg-indigo-50 rounded px-1.5 py-0.5 shrink-0">{launch.variantCode}</span>
                )}
                <span className="font-medium text-gray-800 truncate">{launch.variantName || launch.product.name}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-500 block mb-1">Quantidade</label>
                <input ref={qtyRef} type="number" min="1" step="1" className="input text-sm w-full"
                  value={launch.qty} onChange={e => launchSetQty(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 block mb-1">Valor unitário</label>
                <input type="text" inputMode="decimal" className="input text-sm w-full text-right"
                  value={launch.priceStr}
                  onChange={e => setLaunch(l => ({ ...l, priceStr: e.target.value.replace(/[^\d.,]/g, ''), priceTouched: true }))}
                  onBlur={() => setLaunch(l => ({ ...l, priceStr: maskMoney(parseMoney(l.priceStr)) }))} />
                {launch.product.price_tiers?.length > 0 && !launch.priceTouched && (
                  <p className="text-[10px] text-blue-500 mt-0.5">faixa automática</p>
                )}
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 block mb-1">Desconto %</label>
                <input type="text" inputMode="decimal" className="input text-sm w-full text-right"
                  value={launch.discPercent} onChange={e => launchSetPercent(e.target.value.replace(/[^\d.,]/g, ''))} />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 block mb-1">Desconto R$</label>
                <input type="text" inputMode="decimal" className="input text-sm w-full text-right"
                  value={launch.discStr}
                  onChange={e => launchSetDisc(e.target.value.replace(/[^\d.,]/g, ''))}
                  onBlur={() => setLaunch(l => ({ ...l, discStr: maskMoney(parseMoney(l.discStr)) }))} />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-500 block mb-1">
                  Cor da personalização <span className="text-red-500">*</span>
                </label>
                <div className="flex gap-2">
                  <select className="input text-sm flex-1" value={launch.color}
                    onChange={e => setLaunch(l => ({ ...l, color: e.target.value.toUpperCase() }))}>
                    <option value="">Selecione a tinta…</option>
                    {tintas.map(t => (
                      <option key={t.nome} value={t.nome}>
                        {t.nome}{t.valor_ml ? ` — ${maskMoney(t.valor_ml)}/ML` : ''}
                      </option>
                    ))}
                    {/* Cor que veio de um pedido antigo, antes do cadastro:
                        continua visível em vez de sumir da tela. */}
                    {launch.color && !tintas.some(t => t.nome === launch.color) && (
                      <option value={launch.color}>{launch.color}</option>
                    )}
                  </select>
                  <button type="button" title="Cadastrar uma tinta"
                    onClick={() => setNovaTinta({ nome: '', valor_ml: '' })}
                    className="btn-secondary px-3">+</button>
                </div>
                {(() => {
                  const t = tintas.find(x => x.nome === launch.color);
                  return t?.valor_ml
                    ? <p className="text-[10px] text-gray-500 mt-0.5">{maskMoney(t.valor_ml)} por ML</p>
                    : null;
                })()}
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 block mb-1">Borda</label>
                <div className="flex gap-2">
                  {['Com borda', 'Sem borda'].map(b => (
                    <button key={b} type="button" onClick={() => setLaunch(l => ({ ...l, borda: b, bordaTipo: b === 'Com borda' ? l.bordaTipo : '' }))}
                      className={`flex-1 px-3 py-2 rounded-lg border text-sm font-medium ${launch.borda === b ? 'border-primary-400 bg-primary-50 text-primary-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                      {b}
                    </button>
                  ))}
                </div>
                {launch.borda === 'Com borda' && (
                  <div className="flex gap-2 mt-2">
                    <select className="input text-sm flex-1" value={launch.bordaTipo}
                      onChange={e => setLaunch(l => ({ ...l, bordaTipo: e.target.value }))}>
                      <option value="">Selecione a borda…</option>
                      {(acabCatalog['__borda'] || []).map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                    <button type="button" title="Cadastrar borda"
                      onClick={() => addAcabValor('__borda', v => setLaunch(l => ({ ...l, bordaTipo: v })))}
                      className="px-3 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm">+</button>
                  </div>
                )}
              </div>
            </div>

            {/* Tinta (PP/PS) vem do cadastro do produto (product.ink_type) —
                não se escolhe aqui. launch.ink já é inicializado a partir dele. */}

            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Acabamentos <span className="text-gray-300">(opcionais)</span></label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                {ACABAMENTOS.map(a => (
                  <label key={a} className={`flex items-center gap-2 text-sm rounded-lg border px-2 py-1.5 cursor-pointer ${launch.acab.includes(a) ? 'border-primary-300 bg-primary-50' : 'border-gray-200 hover:bg-gray-50'}`}>
                    <input type="checkbox" className="w-4 h-4 accent-primary-600"
                      checked={launch.acab.includes(a)} onChange={() => toggleAcab(a)} />
                    <span className="truncate">{a}</span>
                  </label>
                ))}
              </div>
              {launch.acab.length > 0 && (
                <div className="mt-2 space-y-1.5">
                  {launch.acab.map(a => (
                    <div key={a} className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 w-32 shrink-0 truncate">{a} <span className="text-red-500">*</span></span>
                      <select className="input text-sm flex-1" value={launch.acabCor?.[a] || ''}
                        onChange={e => setAcabCor(a, e.target.value)}>
                        <option value="">Selecione a cor…</option>
                        {(acabCatalog[a] || []).map(v => <option key={v} value={v}>{v}</option>)}
                      </select>
                      <button type="button" title="Cadastrar cor"
                        onClick={() => addAcabValor(a, v => setAcabCor(a, v))}
                        className="px-3 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm">+</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-gray-100 pt-3">
              <div className="text-xs text-gray-400">
                {fmt(lPrice)} × {lQty}{lDisc > 0 ? ` − ${fmt(lDisc)} de desconto` : ''}
              </div>
              <div className="text-lg font-bold text-gray-900">
                Total líquido do item: <span className="text-primary-600">{fmt(lNet)}</span>
              </div>
            </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Cadastro rápido de tinta. É um diálogo e não um prompt do
          navegador porque são DOIS campos — e porque o valor por ML
          precisa ser conferido antes de virar custo em todo pedido. */}
      <Modal isOpen={!!novaTinta} onClose={() => setNovaTinta(null)} title="Cadastrar tinta" size="sm"
        footer={<>
          <button type="button" className="btn-secondary" onClick={() => setNovaTinta(null)}>Cancelar</button>
          <button type="button" className="btn-primary" onClick={salvarTinta}>Salvar tinta</button>
        </>}>
        {novaTinta && (
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Nome da tinta</label>
              <input autoFocus className="input text-sm w-full uppercase" placeholder="BRANCO"
                value={novaTinta.nome}
                onChange={e => setNovaTinta(t => ({ ...t, nome: e.target.value.toUpperCase() }))} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Valor por ML (R$)</label>
              <input className="input text-sm w-full text-right" inputMode="decimal" placeholder="0,35"
                value={novaTinta.valor_ml}
                onChange={e => setNovaTinta(t => ({ ...t, valor_ml: e.target.value.replace(/[^\d.,]/g, '') }))}
                onKeyDown={e => { if (e.key === 'Enter') salvarTinta(); }} />
              <p className="text-[10px] text-gray-400 mt-1">
                É o que faz a personalização entrar no custo em vez de ser chute.
                Cadastrar uma tinta que já existe atualiza o valor dela.
              </p>
            </div>
          </div>
        )}
      </Modal>

      {/* Foto do orçamento gerada — visualizar e baixar */}
      <Modal isOpen={!!png} onClose={() => { setPng(null); onDone?.(); }}
        title={`Orçamento #${String(png?.number ?? '').padStart(4, '0')} — foto gerada`} size="lg"
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => { setPng(null); onDone?.(); }}>Fechar</button>
            <button type="button" className="btn-primary"
              onClick={() => downloadPng(png.dataUrl, `orcamento-${String(png.number).padStart(4, '0')}.png`)}>
              <Download size={15} /> Baixar PNG
            </button>
          </>
        }>
        <img src={png?.dataUrl} alt="Foto do orçamento" className="w-full rounded-lg border border-gray-200" />
      </Modal>
    </div>
  );
}
