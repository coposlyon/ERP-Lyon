// ============================================================
// FRETE — UMA REGRA SÓ: O ESTADO DO CLIENTE.
//
// Aqui existiam três jeitos de descobrir o valor do frete: a API da J&T,
// a cotação da BrasPress e uma tabela por estado usada só quando as duas
// falhavam. Três respostas possíveis para a mesma pergunta, e a que o
// cliente via dependia de qual servidor estava de pé naquele minuto — o
// mesmo pedido para Curitiba custava um valor de manhã e outro à tarde.
//
// Agora o preço é o que a Lyon escreveu na tabela para aquele estado, em
// Configurações → Transportadora. Sem cotação externa, sem cálculo por
// peso, sem acréscimo escondido: o valor digitado é o valor cobrado.
//
// A BrasPress continua no ERP, mas só onde sempre foi útil de verdade —
// rastrear a carga pela nota. Ela não decide mais preço.
// ============================================================
const supabase = require('../config/supabase');

// Faixas de CEP → UF, para descobrir o estado quando só temos o CEP.
const CEP_UF = [
  [1000000, 19999999, 'SP'], [20000000, 28999999, 'RJ'], [29000000, 29999999, 'ES'],
  [30000000, 39999999, 'MG'], [40000000, 48999999, 'BA'], [49000000, 49999999, 'SE'],
  [50000000, 56999999, 'PE'], [57000000, 57999999, 'AL'], [58000000, 58999999, 'PB'],
  [59000000, 59999999, 'RN'], [60000000, 63999999, 'CE'], [64000000, 64999999, 'PI'],
  [65000000, 65999999, 'MA'], [66000000, 68899999, 'PA'], [68900000, 68999999, 'AP'],
  [69000000, 69299999, 'AM'], [69300000, 69399999, 'RR'], [69400000, 69899999, 'AM'],
  [69900000, 69999999, 'AC'], [70000000, 72799999, 'DF'], [72800000, 72999999, 'GO'],
  [73000000, 73699999, 'DF'], [73700000, 76799999, 'GO'], [76800000, 76999999, 'RO'],
  [77000000, 77999999, 'TO'], [78000000, 78899999, 'MT'], [79000000, 79999999, 'MS'],
  [80000000, 87999999, 'PR'], [88000000, 89999999, 'SC'], [90000000, 99999999, 'RS'],
];

function ufFromCep(cep) {
  const n = parseInt(String(cep || '').replace(/\D/g, ''), 10);
  if (!n) return '';
  const f = CEP_UF.find(([a, b]) => n >= a && n <= b);
  return f ? f[2] : '';
}

/** Configuração de frete (EMPRESAS.settings.frete). */
async function getFreteConfig(tenantId) {
  let s = {};
  try {
    const { data } = await supabase.from('EMPRESAS').select('settings').eq('id', tenantId).maybeSingle();
    s = (data?.settings && data.settings.frete) || {};
  } catch { s = {}; }
  return {
    // BrasPress — rastreio pela nota no ERP. Não entra no preço.
    bp_enabled:   !!s.bp_enabled || !!(process.env.BRASPRESS_USER && process.env.BRASPRESS_PASSWORD && process.env.BRASPRESS_CNPJ),
    bp_base_url:  s.bp_base_url || process.env.BRASPRESS_BASE_URL || 'https://api.braspress.com',
    bp_user:      s.bp_user || process.env.BRASPRESS_USER || '',
    bp_password:  s.bp_password || process.env.BRASPRESS_PASSWORD || '',
    bp_cnpj:      s.bp_cnpj || process.env.BRASPRESS_CNPJ || '',
    bp_cnpj_dest: s.bp_cnpj_dest || process.env.BRASPRESS_CNPJ_DEST || '',
    bp_modal:     s.bp_modal || process.env.BRASPRESS_MODAL || 'R',
    bp_tipo_frete: s.bp_tipo_frete || process.env.BRASPRESS_TIPO_FRETE || 1,

    origin_cep:    String(s.origin_cep || '').replace(/\D/g, ''),
    free_above:    Number(s.free_above) || 0,                  // frete grátis acima de R$
    table:         Array.isArray(s.table) ? s.table : [],      // [{ uf, price, days }]
    default_price: Number(s.default_price) || 0,               // estado sem valor na tabela
    default_days:  Number(s.default_days) || 0,
  };
}

/**
 * O frete daquele estado.
 *
 * Estado sem valor na tabela cai no padrão. Padrão também vazio devolve
 * `sem_regra`: quem chamou decide o que dizer ("a combinar"), porque
 * mostrar R$ 0,00 seria prometer frete grátis que ninguém combinou.
 */
function freteDoEstado(cfg, { uf, subtotal } = {}) {
  const alvo = String(uf || '').toUpperCase();
  const row = (cfg.table || []).find(r => String(r.uf || '').toUpperCase() === alvo);

  const temValor = row && row.price !== '' && row.price != null;
  const price = temValor ? Number(row.price) || 0 : cfg.default_price;
  const days = (row && Number(row.days) > 0) ? Number(row.days) : cfg.default_days;
  const semRegra = !temValor && !(cfg.default_price > 0);

  const gratis = cfg.free_above > 0 && Number(subtotal) >= cfg.free_above;

  return {
    source: 'tabela',
    uf: alvo,
    price: gratis ? 0 : Math.round(price * 100) / 100,
    days: days || null,
    free: gratis,
    sem_regra: semRegra && !gratis,
  };
}

/** Cotação do pedido: o estado manda. O CEP só serve para descobrir o estado. */
async function cotar(tenantId, { uf, cep, subtotal } = {}) {
  const cfg = await getFreteConfig(tenantId);
  const estado = String(uf || '').toUpperCase() || ufFromCep(cep);
  return freteDoEstado(cfg, { uf: estado, subtotal });
}

module.exports = { getFreteConfig, freteDoEstado, cotar, ufFromCep };
