// ============================================================
// FRETE — DUAS REGRAS, E UMA ORDEM CLARA ENTRE ELAS.
//
// Aqui existiram três jeitos de descobrir o frete: a API da J&T, a
// cotação da BrasPress e uma tabela por estado usada só quando as duas
// falhavam. Três respostas para a mesma pergunta, e a que o cliente via
// dependia de qual servidor estava de pé naquele minuto — o mesmo pedido
// para Curitiba custava um valor de manhã e outro à tarde. As três
// viraram uma: o valor digitado por estado, e ponto.
//
// A TOTAL EXPRESS ENTRA AGORA, e não repete aquele erro. Ela não é uma
// quarta opinião sobre o mesmo número: ela responde uma pergunta que a
// tabela por estado não sabe responder — quanto custa ESTE pedido, com
// este peso, este volume e este CEP. Dez copos e mil copos para o mesmo
// endereço custam o mesmo na tabela por estado, e é isso que ela conserta.
//
// A ORDEM É FIXA E NÃO DEPENDE DE QUEM ESTÁ NO AR:
//
//   Total Express   quando está ligada, tem tabela carregada, o pedido
//                   tem itens mensuráveis e o CEP está na abrangência.
//   Tabela/estado   em todo o resto — inclusive na pergunta sem pedido
//                   ("quanto custa para o RJ?"), que é metade das vezes.
//
// Nada disso é cotação externa: a tabela da Total Express mora no banco
// (migração 118). Não há chamada HTTP para dar preço, e por isso não há
// o dia em que o preço muda porque a transportadora saiu do ar.
//
// A BRASPRESS VOLTOU AO PREÇO, mas só no carrinho do site/catálogo e
// como OPÇÃO ao lado da Total Express (cotarOpcoes): o cliente vê as
// duas e escolhe. A carga que vai para ela é a mesma das caixas — peso,
// medidas e volumes de Logística → Caixas e frete, com o acréscimo de
// ocupação e o valor das caixas. Se a API dela não responder, a opção
// some e sobra a outra (ou a tabela por estado); o carrinho não trava.
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

    // Total Express — a tabela negociada, calculada por peso, cubagem e
    // faixa de CEP (migração 118). Desligada por padrão: só passa a
    // valer quando alguém liga em Configurações, e mesmo ligada só
    // responde se a tabela estiver carregada e a carga, mensurável.
    tex_enabled:   !!s.tex_enabled,

    // ANDIRÁ, e não Londrina. A tabela negociada tem "Origem:
    // LONDRINA/PR" no cabeçalho porque Londrina é a BASE da Total
    // Express que atende a região — mas a coleta sai da Lyon, que fica
    // em Andirá (CONFIG_FISCAL: município Andirá, CEP 86380-000).
    //
    // A diferença não é cosmética: este campo decide ISS ou ICMS. Com
    // 'LONDRINA' aqui, entrega dentro de Andirá pagaria ICMS de 19,5%
    // em vez de ISS de 5%, e entrega para Londrina pagaria ISS sem ser
    // no mesmo município.
    tex_municipio_origem: s.tex_municipio_origem || 'ANDIRA',
    tex_iss_pct:   Number(s.tex_iss_pct) || 0.05,
    // Confirmado pela Total Express em 11/09/2026: o imposto é somado
    // depois do frete, não embutido nele.
    tex_imposto_modo: s.tex_imposto_modo || 'por_fora',

    // O WEBSERVICE da Total Express (EDI ICS V24): transmite as coletas e
    // traz o rastreio. Não tem nada a ver com o preço acima — é a outra
    // metade da integração (lib/totalexpressWs.js).
    tex_ws_url:      s.tex_ws_url || process.env.TOTALEXPRESS_WS_URL || 'https://edi.totalexpress.com.br/webservice24.php',
    tex_ws_user:     s.tex_ws_user || process.env.TOTALEXPRESS_WS_USER || '',
    tex_ws_password: s.tex_ws_password || process.env.TOTALEXPRESS_WS_PASSWORD || '',
    // REID: o código da empresa na Total Express, usado no link de rastreio.
    tex_reid:        String(s.tex_reid || process.env.TOTALEXPRESS_REID || ''),
    // Serviço contratado (manual, campo TipoServico): 1 = Expresso.
    tex_servico:     Number(s.tex_servico) || 1,
    tex_natureza:    s.tex_natureza || 'COPOS PERSONALIZADOS',
    tex_carrier_id:  s.tex_carrier_id || null,
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

/**
 * Cotação do pedido.
 *
 * DUAS RESPOSTAS POSSÍVEIS, E A ORDEM É DELIBERADA:
 *
 *   1. A TOTAL EXPRESS, quando está ligada, tem tabela carregada e a
 *      carga pode ser medida. É a resposta boa: cobra pelo que o pedido
 *      realmente é — peso, espaço, distância e risco do CEP.
 *
 *   2. A TABELA POR ESTADO, no resto dos casos. Continua valendo, e
 *      continua sendo o que responde quando o pedido não tem itens (o
 *      carrinho pedindo "quanto custa para o RJ?" antes de escolher
 *      produto), quando falta peso no cadastro, ou quando o CEP está
 *      fora da abrangência da Total Express.
 *
 * Sem itens, nem se tenta a Total Express: sem carga não há peso, e sem
 * peso o cálculo por peso não existe. O comentário está aqui porque a
 * tentação de "cotar 1 kg por padrão" é grande e a conta sairia errada
 * para todo mundo.
 */
async function cotar(tenantId, { uf, cep, subtotal, itens, valor_nota, forcar_total_express } = {}) {
  const cfg = await getFreteConfig(tenantId);
  const estado = String(uf || '').toUpperCase() || ufFromCep(cep);

  const gratis = cfg.free_above > 0 && Number(subtotal) >= cfg.free_above;

  // `forcar_total_express` é do simulador da Logística: confere a conta
  // antes de ela ser ligada para o cliente.
  if ((cfg.tex_enabled || forcar_total_express) && cep && Array.isArray(itens) && itens.length && !gratis) {
    const tex = await cotarPelaTotalExpress(tenantId, cfg, { cep, itens, valor_nota, subtotal });
    if (tex.ok) return tex.cotacao;

    // Não soube calcular. A venda continua: cai na tabela por estado,
    // que é o que valia antes de tudo isto. O motivo viaja junto em
    // `tex_pendencia` para a tela poder avisar que o número na frente do
    // vendedor é o do estado, e não o calculado — falhar em silêncio
    // aqui significaria cobrar o valor antigo por meses sem ninguém
    // perceber que o cálculo nunca chegou a rodar.
    const base = freteDoEstado(cfg, { uf: estado, subtotal });
    return tex.pendencia ? { ...base, tex_pendencia: tex.pendencia } : base;
  }

  return freteDoEstado(cfg, { uf: estado, subtotal });
}

/**
 * A tentativa pela Total Express.
 *
 * Devolve `{ ok: true, cotacao }` quando sabe responder, e
 * `{ ok: false, pendencia }` quando não sabe. `pendencia` só vem
 * preenchida no caso que dá para consertar — falta de cadastro. CEP
 * fora da abrangência não é pendência de ninguém: é uma cidade que a
 * Total Express não atende, e a tabela por estado resolve.
 */
async function cotarPelaTotalExpress(tenantId, cfg, { cep, itens, valor_nota, subtotal, envio: medido }) {
  // A caixa sai do cadastro de Logística → Caixas e frete: caixa padrão
  // ou a menor, peso da caixa cheia ÷ unidades, acréscimo por ocupação
  // e o valor das caixas (lib/logisticaCaixas.js).
  const { medirComCaixas, aplicarAoFrete } = require('./logisticaCaixas');
  const { cotarTotalExpress, temTabela } = require('./totalexpress');

  if (!(await temTabela(tenantId))) {
    return { ok: false, pendencia: { motivo: 'A tabela da Total Express não foi carregada neste banco.' } };
  }

  const envio = medido || await medirComCaixas(tenantId, itens);
  if (!envio.ok) {
    return {
      ok: false,
      pendencia: {
        motivo: `Frete por estado: falta cadastro de caixa para calcular (${envio.faltas.slice(0, 3).join(' · ')}).`,
        faltas: envio.faltas,
      },
    };
  }

  const r = await cotarTotalExpress(tenantId, {
    cep,
    peso_real: envio.peso_real,
    peso_cubado: envio.peso_cubado,
    valor_nota: Number(valor_nota) || Number(subtotal) || 0,
    opcoes: {
      municipio_origem: cfg.tex_municipio_origem,
      iss_pct: cfg.tex_iss_pct,
      imposto_modo: cfg.tex_imposto_modo,
    },
  });

  // CEP fora da abrangência não é erro: é a hora da tabela por estado.
  if (!r.ok) return { ok: false, pendencia: null };

  const conta = aplicarAoFrete(r.price, envio);
  return {
    ok: true,
    cotacao: {
      source: 'total_express',
      uf: r.memoria.uf,
      // O preço é o que o cliente paga: frete + acréscimo + caixas.
      price: conta.total,
      days: r.days,
      free: false,
      sem_regra: false,
      volumes: envio.volumes,
      caixas: envio.detalhe.map(d => ({ nome: d.caixa.nome, volumes: d.volumes, unidades: d.unidades, caixa_pequena: d.caixa_pequena })),
      memoria: {
        ...r.memoria,
        frete_total_express: conta.frete_base,
        ocupacao_pct: envio.ocupacao_pct,
        acrescimo_pct: envio.aplica_acrescimo ? envio.acrescimo_pct : 0,
        acrescimo_valor: conta.acrescimo,
        valor_caixas: conta.valor_caixas,
      },
      avisos: [...(r.avisos || []), ...avisosDoEnvio(envio)],
    },
  };
}

function avisosDoEnvio(envio) {
  return envio?.usou_unidades_padrao
    ? [`Unidades por caixa pelo padrão (${envio.config?.unidades_padrao ?? 50}) — a regra da categoria não informa.`]
    : [];
}

/**
 * A cotação pela BrasPress, com a mesma carga das caixas.
 *
 * A API quer as medidas em METROS e o peso em kg. O peso é o real; o
 * cubado a própria BrasPress calcula pelas medidas. Por cima do frete
 * dela entram as mesmas regras da Lyon: acréscimo por ocupação e o
 * valor das caixas.
 */
async function cotarPelaBraspress(tenantId, cfg, { cep, valor_nota, subtotal, envio }) {
  const { braspressCotar } = require('./braspress');
  const { aplicarAoFrete } = require('./logisticaCaixas');
  if (!envio?.ok) return { ok: false };

  const cubagem = envio.detalhe.map(d => ({
    comprimento: (Number(d.caixa.comprimento_cm) || 0) / 100,
    largura: (Number(d.caixa.largura_cm) || 0) / 100,
    altura: (Number(d.caixa.altura_cm) || 0) / 100,
    volumes: d.volumes,
  }));

  let r;
  try {
    r = await braspressCotar(cfg, {
      cepOrigem: cfg.origin_cep,
      cepDestino: cep,
      vlrMercadoria: Number(valor_nota) || Number(subtotal) || 0,
      peso: envio.peso_real,
      volumes: envio.volumes,
      cubagem,
      // CIF SEMPRE: quem paga a BrasPress é a Lyon, que cobra do cliente
      // no carrinho. FOB (tipo 2, destinatário paga) saía quase 4× mais
      // caro — R$ 196,84 contra R$ 54,34 na mesma caixa para o RS.
      tipoFrete: 1,
      timeoutMs: 8000,
    });
  } catch (err) {
    console.warn('[frete] BrasPress sem cotação:', err.message);
    return { ok: false };
  }
  if (!(Number(r.price) > 0)) return { ok: false };

  const conta = aplicarAoFrete(r.price, envio);
  return {
    ok: true,
    cotacao: {
      source: 'braspress',
      uf: ufFromCep(cep),
      price: conta.total,
      days: r.days,
      free: false,
      sem_regra: false,
      volumes: envio.volumes,
      caixas: envio.detalhe.map(d => ({ nome: d.caixa.nome, volumes: d.volumes, unidades: d.unidades, caixa_pequena: d.caixa_pequena })),
      memoria: {
        cotacao_id: r.id,
        frete_braspress: conta.frete_base,
        ocupacao_pct: envio.ocupacao_pct,
        acrescimo_pct: envio.aplica_acrescimo ? envio.acrescimo_pct : 0,
        acrescimo_valor: conta.acrescimo,
        valor_caixas: conta.valor_caixas,
      },
      avisos: avisosDoEnvio(envio),
    },
  };
}

/**
 * As opções de envio para o CLIENTE escolher no carrinho.
 *
 * Total Express (se ligada) e BrasPress (se configurada), cada uma com
 * a carga das caixas, da mais barata para a mais cara. Nenhuma das duas
 * respondeu — cadastro de caixa incompleto, CEP fora, API fora do ar —
 * vale a tabela por estado, como sempre. Frete grátis também é a tabela.
 *
 * Devolve `{ opcoes: [cotacao...], pendencias: [...] }`.
 */
async function cotarOpcoes(tenantId, { uf, cep, subtotal, itens, valor_nota } = {}) {
  const cfg = await getFreteConfig(tenantId);
  const estado = String(uf || '').toUpperCase() || ufFromCep(cep);
  const gratis = cfg.free_above > 0 && Number(subtotal) >= cfg.free_above;
  const pendencias = [];
  const opcoes = [];

  const { bpReady } = require('./braspress');
  const usaTex = !!cfg.tex_enabled;
  const usaBp = !!cfg.bp_enabled && bpReady(cfg) && !!cfg.origin_cep;

  if ((usaTex || usaBp) && cep && Array.isArray(itens) && itens.length && !gratis) {
    const { medirComCaixas } = require('./logisticaCaixas');
    const envio = await medirComCaixas(tenantId, itens);
    if (!envio.ok) {
      pendencias.push({ motivo: `Falta cadastro de caixa para calcular (${envio.faltas.slice(0, 3).join(' · ')}).`, faltas: envio.faltas });
    } else {
      const [tex, bp] = await Promise.all([
        usaTex ? cotarPelaTotalExpress(tenantId, cfg, { cep, itens, valor_nota, subtotal, envio }) : null,
        usaBp ? cotarPelaBraspress(tenantId, cfg, { cep, valor_nota, subtotal, envio }) : null,
      ]);
      if (tex?.ok) opcoes.push(tex.cotacao); else if (tex?.pendencia) pendencias.push(tex.pendencia);
      if (bp?.ok) opcoes.push(bp.cotacao);
    }
  }

  if (!opcoes.length) return { opcoes: [freteDoEstado(cfg, { uf: estado, subtotal })], pendencias };
  opcoes.sort((a, b) => a.price - b.price);
  return { opcoes, pendencias };
}

/** Id estável de uma cotação — o que o carrinho devolve como escolha. */
const idDaOpcao = c => (c?.source === 'total_express' || c?.source === 'braspress' ? c.source : 'estado');

/** Uma linha legível do frete calculado, para o rodapé do pedido. */
function resumoDoFrete(c) {
  if (!c || (c.source !== 'total_express' && c.source !== 'braspress')) return null;
  const brl = v => `R$ ${(Number(v) || 0).toFixed(2).replace('.', ',')}`;
  const m = c.memoria || {};
  const cx = (c.caixas || []).map(x => `${x.volumes}× ${x.nome}`).join(', ');
  const nome = c.source === 'braspress' ? 'BrasPress' : 'Total Express';
  const base = c.source === 'braspress' ? m.frete_braspress : m.frete_total_express;
  return `Frete ${nome} ${brl(c.price)} = frete ${brl(base)}`
    + (m.acrescimo_valor ? ` + ${m.acrescimo_pct}% ocupação ${m.ocupacao_pct}% (${brl(m.acrescimo_valor)})` : '')
    + (m.valor_caixas ? ` + caixas ${brl(m.valor_caixas)}` : '')
    + (cx ? ` · ${cx}` : '');
}

module.exports = { getFreteConfig, freteDoEstado, cotar, cotarOpcoes, idDaOpcao, ufFromCep, resumoDoFrete };
