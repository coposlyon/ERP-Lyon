// ============================================================
// As cidades de uma UF, para a tela de território do vendedor.
//
// Nada aqui é calculado: é uma cópia local de dados públicos, guardada
// em MUNICIPIOS (migração 073) porque o vendedor abre essa tela várias
// vezes por dia e não faz sentido bater no IBGE toda vez — nem ficar
// refém de o IBGE estar no ar às nove da manhã de segunda.
//
// De onde vem cada coisa:
//
//   nome, distritos      IBGE / localidades
//   capital              lista fixa das 27, conferida contra o IBGE
//   região metropolitana IBGE / regiões metropolitanas
//   habitantes           IBGE / Censo 2022 (agregado 4709, variável 93)
//   DDD                  BrasilAPI
//   faixa de CEP         NÃO EXISTE de graça — ver abaixo
//
// A faixa de CEP por município está no DNE dos Correios, que é um
// produto pago. Não há API pública que devolva "de 80000-000 até
// 82999-999". Dá para descobrir o CEP de UMA rua (ViaCEP), não a faixa
// da cidade. Então cep_start/cep_end ficam vazios até alguém trazer a
// base — e a tela mostra vazio, não um palpite.
// ============================================================
const supabase = require('../config/supabase');

const IBGE = 'https://servicodados.ibge.gov.br/api/v1/localidades';
const IBGE_AGREGADOS = 'https://servicodados.ibge.gov.br/api/v3/agregados';
const BRASILAPI = 'https://brasilapi.com.br/api';

// Códigos do IBGE, não nomes: nome de cidade tem acento, tem grafia que
// muda ("Moji" virou "Mogi") e tem homônimo em outro estado. O código
// nunca muda.
const CAPITAIS = {
  RO: '1100205', AC: '1200401', AM: '1302603', RR: '1400100', PA: '1501402',
  AP: '1600303', TO: '1721000', MA: '2111300', PI: '2211001', CE: '2304400',
  RN: '2408102', PB: '2507507', PE: '2611606', AL: '2704302', SE: '2800308',
  BA: '2927408', MG: '3106200', ES: '3205309', RJ: '3304557', SP: '3550308',
  PR: '4106902', SC: '4205407', RS: '4314902', MS: '5002704', MT: '5103403',
  GO: '5208707', DF: '5300108',
};

const UFS = Object.keys(CAPITAIS);

// A tabela nasce na migração 073. Enquanto ela não roda, a tela precisa
// dizer isso em vez de devolver um erro de Postgres cru.
const tabelaAusente = err =>
  /42P01|PGRST(002|205)|does not exist|schema cache/i.test(`${err?.code || ''} ${err?.message || ''}`);

async function buscarJson(url, tentativas = 3) {
  let ultimo;
  for (let i = 0; i < tentativas; i++) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 45000);
      const r = await fetch(url, { signal: ctrl.signal });
      clearTimeout(t);
      if (!r.ok) throw new Error(`HTTP ${r.status} em ${url}`);
      return await r.json();
    } catch (err) {
      ultimo = err;
      // O IBGE devolve 503 esporádico em horário de pico. Esperar um
      // pouco resolve com mais frequência do que desistir.
      await new Promise(r => setTimeout(r, 1500 * (i + 1)));
    }
  }
  throw ultimo;
}

// "SÃO JOSÉ DOS PINHAIS" e "São José dos Pinhais" são a mesma cidade.
// O IBGE escreve com acento e caixa mista, a BrasilAPI escreve em caixa
// alta — o cruzamento dos dois só fecha por esta chave.
const chave = s => String(s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toUpperCase().replace(/[^A-Z0-9]/g, '');

/** Distância de edição, para casar grafias que divergem por pouco. */
function distancia(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 99;
  let linha = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const nova = [i];
    for (let j = 1; j <= b.length; j++) {
      nova[j] = Math.min(
        linha[j] + 1,
        nova[j - 1] + 1,
        linha[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    linha = nova;
  }
  return linha[b.length];
}

/**
 * Todos os municípios do país, indexados por nome e por UF.
 *
 * Serve de árbitro entre as duas bases: é o IBGE que diz em que estado
 * cada cidade fica, e é por isso que ele existe aqui.
 */
async function indiceNacional() {
  const lista = await buscarJson(`${IBGE}/municipios`);
  const porNome = new Map();   // "PONTAGROSSA" -> [{ id, uf }]
  const porUf   = new Map();   // "PR" -> [{ id, chave }]

  for (const m of lista || []) {
    const uf = m.microrregiao?.mesorregiao?.UF?.sigla
            || m['regiao-imediata']?.['regiao-intermediaria']?.UF?.sigla;
    if (!uf) continue;
    const id = String(m.id);
    const k  = chave(m.nome);
    if (!porNome.has(k)) porNome.set(k, []);
    porNome.get(k).push({ id, uf });
    if (!porUf.has(uf)) porUf.set(uf, []);
    porUf.get(uf).push({ id, chave: k });
  }
  return { porNome, porUf, total: lista?.length || 0 };
}

/**
 * DDD de cada município, pelo código do IBGE.
 *
 * A BrasilAPI responde no sentido contrário do que precisamos (dado um
 * DDD, quais cidades) — então varremos os 89 códigos possíveis uma vez
 * e viramos o mapa. DDD que não existe devolve 404 e é simplesmente
 * pulado: é mais barato tentar do que manter à mão a lista de quais dos
 * 89 são válidos.
 *
 * DUAS ARMADILHAS, as duas descobertas conferindo o resultado:
 *
 * 1. O campo `state` da resposta NÃO é confiável. O DDD 42 vem marcado
 *    como SC sendo inteiro do Paraná, e o 61 vem como DF trazendo as
 *    cidades goianas do entorno junto. Confiar nele deixou Ponta Grossa,
 *    Guarapuava e Luziânia sem telefone. Então o estado de cada cidade
 *    é perguntado ao IBGE, nunca à lista de DDD — e onde o nome é
 *    ambíguo ("Bom Jesus" existe em seis estados), quem desempata é a UF
 *    dominante do próprio bloco de DDD.
 *
 * 2. Os nomes divergem além do acento: o IBGE registra "São Valério"
 *    onde a telefonia registra "SÃO VALÉRIO DA NATIVIDADE", e "Assú"
 *    onde a outra escreve "Açu". Daí o casamento aproximado no fim —
 *    sempre exigindo candidato único, porque com duas cidades parecidas
 *    prefiro deixar sem DDD a escrever o telefone errado.
 */
async function mapaDDD(indice = null) {
  const idx = indice || await indiceNacional();
  const achados = new Map();   // ibge_code -> Set de DDDs

  const codigos = [];
  for (let d = 11; d <= 99; d++) codigos.push(d);

  const anota = (id, ddd) => {
    if (!achados.has(id)) achados.set(id, new Set());
    achados.get(id).add(String(ddd));
  };

  // Em blocos: sequencial demora demais, tudo de uma vez leva a 429.
  for (let i = 0; i < codigos.length; i += 8) {
    await Promise.all(codigos.slice(i, i + 8).map(async ddd => {
      let cidades;
      try {
        // Com repetição: um 503 passageiro aqui não some com o DDD de
        // uma cidade, some com o de todas as cidades daquele código.
        const r = await buscarJson(`${BRASILAPI}/ddd/v1/${ddd}`, 3);
        cidades = r.cities || [];
      } catch { return; }   // DDD inexistente ou fora do ar

      // Qual UF manda neste bloco: contada só pelos nomes que existem
      // uma única vez no país, que são os que não deixam dúvida.
      const votos = new Map();
      for (const cidade of cidades) {
        const cand = idx.porNome.get(chave(cidade));
        if (cand?.length === 1) votos.set(cand[0].uf, (votos.get(cand[0].uf) || 0) + 1);
      }
      const dominante = [...votos.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;

      for (const cidade of cidades) {
        const k = chave(cidade);
        const cand = idx.porNome.get(k) || [];

        if (cand.length === 1) { anota(cand[0].id, ddd); continue; }
        if (cand.length > 1) {
          const doEstado = cand.filter(c => c.uf === dominante);
          if (doEstado.length === 1) anota(doEstado[0].id, ddd);
          continue;   // homônimo sem desempate: melhor vazio que errado
        }

        // Nome que o IBGE não tem com essa grafia: procura parecido,
        // dentro da UF dominante e só se houver um único candidato.
        const lista = idx.porUf.get(dominante) || [];
        const prefixo = lista.filter(c => c.chave.startsWith(k) || k.startsWith(c.chave));
        if (prefixo.length === 1) { anota(prefixo[0].id, ddd); continue; }
        const perto = lista.filter(c => distancia(k, c.chave) <= 2);
        if (perto.length === 1) anota(perto[0].id, ddd);
      }
    }));
  }

  // Cidade em dois DDDs (acontece em divisa e em área desmembrada):
  // fica com o menor, só para a resposta não mudar a cada execução.
  const mapa = new Map();
  for (const [id, ddds] of achados) {
    mapa.set(id, [...ddds].sort()[0]);
  }
  return { get: id => mapa.get(String(id)) || null, tamanho: mapa.size };
}

/** Quais municípios estão em região metropolitana, e em qual. */
async function mapaMetropolitano() {
  const mapa = new Map();
  try {
    const regioes = await buscarJson(`${IBGE}/regioes-metropolitanas`);
    for (const rm of regioes || []) {
      for (const m of rm.municipios || []) mapa.set(String(m.id), rm.nome);
    }
  } catch { /* sem RM, a coluna fica nula — o resto da tela continua útil */ }
  return mapa;
}

/**
 * Distritos por município, sem o distrito-sede.
 *
 * O IBGE conta a sede como distrito, então toda cidade tem pelo menos
 * um com o mesmo nome dela. Repetir isso na tela não informa nada: o
 * que interessa ao vendedor é o distrito SEPARADO, aquele povoado a 40
 * km da sede que ele vai descobrir existir quando a entrega voltar.
 */
async function mapaDistritos(uf) {
  const mapa = new Map();
  try {
    const lista = await buscarJson(`${IBGE}/estados/${uf}/distritos`);
    for (const d of lista || []) {
      const id = String(d.municipio?.id || '');
      if (!id || chave(d.nome) === chave(d.municipio?.nome)) continue;
      if (!mapa.has(id)) mapa.set(id, []);
      mapa.get(id).push(d.nome);
    }
  } catch { /* sem distritos, a coluna fica vazia */ }
  for (const lista of mapa.values()) lista.sort((a, b) => a.localeCompare(b, 'pt-BR'));
  return mapa;
}

/** População do Censo 2022, por município da UF. */
async function mapaPopulacao(codigoUf) {
  const mapa = new Map();
  try {
    // Os colchetes precisam ir codificados: o serviço do IBGE devolve
    // 200 com corpo vazio quando eles chegam crus.
    const loc = encodeURIComponent(`N6[N3[${codigoUf}]]`);
    const r = await buscarJson(`${IBGE_AGREGADOS}/4709/periodos/2022/variaveis/93?localidades=${loc}`);
    for (const serie of r?.[0]?.resultados?.[0]?.series || []) {
      const valor = Object.values(serie.serie || {})[0];
      const n = Number(valor);
      if (Number.isFinite(n)) mapa.set(String(serie.localidade.id), n);
    }
  } catch { /* sem população, a coluna fica nula */ }
  return mapa;
}

/**
 * Baixa uma UF inteira e grava. Devolve quantas cidades entraram.
 *
 * `ddd` vem de fora quando estamos sincronizando várias UFs de uma vez:
 * a varredura dos 89 códigos é a parte cara e serve para o país todo,
 * não faz sentido repeti-la 27 vezes.
 */
async function sincronizarUF(uf, dddCompartilhado = null) {
  const sigla = String(uf || '').toUpperCase();
  if (!UFS.includes(sigla)) throw new Error(`UF inválida: ${uf}`);

  const municipios = await buscarJson(`${IBGE}/estados/${sigla}/municipios`);
  if (!Array.isArray(municipios) || !municipios.length) {
    throw new Error(`O IBGE não devolveu municípios para ${sigla}`);
  }

  const codigoUf = String(municipios[0].id).slice(0, 2);
  const [metros, distritos, populacao, ddd] = await Promise.all([
    mapaMetropolitano(),
    mapaDistritos(sigla),
    mapaPopulacao(codigoUf),
    dddCompartilhado ? Promise.resolve(dddCompartilhado) : mapaDDD(),
  ]);

  const capital = CAPITAIS[sigla];
  const linhas = municipios.map(m => {
    const id = String(m.id);
    return {
      ibge_code:  id,
      uf:         sigla,
      name:       m.nome,
      is_capital: id === capital,
      metro_name: metros.get(id) || null,
      districts:  distritos.get(id) || [],
      ddd:        ddd.get(id),
      population: populacao.get(id) ?? null,
      synced_at:  new Date().toISOString(),
    };
  });

  // upsert e não delete+insert: se um dia alguém preencher a faixa de
  // CEP à mão, uma ressincronização não pode apagar esse trabalho.
  // cep_start/cep_end não estão no payload justamente por isso.
  const { error } = await supabase
    .from('MUNICIPIOS').upsert(linhas, { onConflict: 'ibge_code' });
  if (error) throw error;

  return linhas.length;
}

/**
 * As cidades de uma UF para a tela.
 *
 * Se a UF ainda não foi baixada, baixa na hora. A primeira abertura de
 * cada estado custa alguns segundos; as seguintes vêm do banco.
 */
async function cidadesDaUf(uf) {
  const sigla = String(uf || '').toUpperCase();
  if (!UFS.includes(sigla)) return { erro: 'UF inválida', cidades: [] };

  const ler = () => supabase
    .from('MUNICIPIOS')
    .select('ibge_code, name, is_capital, metro_name, districts, ddd, population, cep_start, cep_end, synced_at')
    .eq('uf', sigla)
    .order('name');

  let { data, error } = await ler();
  if (error) {
    if (tabelaAusente(error)) return { tabela_ausente: true, cidades: [] };
    throw error;
  }

  if (!data?.length) {
    await sincronizarUF(sigla);
    ({ data, error } = await ler());
    if (error) throw error;
  }

  const cidades = (data || []).map(c => ({
    ibge_code:  c.ibge_code,
    name:       c.name,
    capital:    !!c.is_capital,
    metro:      c.metro_name || null,
    districts:  c.districts || [],
    ddd:        c.ddd || null,
    population: c.population ?? null,
    cep_start:  c.cep_start || null,
    cep_end:    c.cep_end || null,
  }));

  return {
    uf: sigla,
    cidades,
    total: cidades.length,
    habitantes: cidades.reduce((s, c) => s + (c.population || 0), 0),
    synced_at: data?.[0]?.synced_at || null,
    // A tela precisa saber que o vazio é falta de fonte, não falta de
    // dado, para escrever o motivo em vez de um traço mudo.
    cep_indisponivel: cidades.every(c => !c.cep_start),
  };
}

module.exports = { UFS, CAPITAIS, cidadesDaUf, sincronizarUF, mapaDDD, indiceNacional };
