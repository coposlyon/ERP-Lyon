// ============================================================
// O CATÁLOGO DE PRODUTOS PERSONALIZADOS.
//
// Uma pergunta atravessa as seis telas: "o que dá para fazer com este
// copo?". Este arquivo responde uma vez, e a família, o modelo, o
// configurador, o editor de arte e o orçamento leem a mesma resposta.
//
// O QUE É UM "MODELO". No cadastro mestre existe um produto POR COR:
// 97 linhas para 7 categorias. O cliente não compra "LONG DRINK
// TRADICIONAL - AZUL BIC 350 ML" — ele compra um Long Drink de 350 ml e
// escolhe a cor depois. Então o modelo é o par CATEGORIA + CAPACIDADE, e
// as cores viram opção dentro dele.
//
// É a mesma leitura que o ranking de produtos já usa e que o Pablo
// aprovou: "Long Drink 350 / Twister 400". Uma leitura só, nos dois
// lugares.
//
// O NOME COMERCIAL É MONTADO, NUNCA GUARDADO.
//
//     "Long Drink"  +  "Degradê com Borda"  +  "350 ml"
//     └─ categoria     └─ acabamento          └─ capacidade
//
// Guardar significaria cadastrar 13 produtos por modelo para mudar uma
// palavra — e no dia em que a fábrica parar de fazer borda, seriam 13
// produtos para desativar em vez de uma linha de compatibilidade.
//
// NADA AQUI DECIDE REGRA. Quem decide é o Administrativo, na migração
// 074 (o que cada produto aceita) e na 076 (vitrine, gabarito, caixa,
// artes). Este arquivo lê e junta.
// ============================================================
const supabase = require('../config/supabase');
const { aplicarAmbiente } = require('./ambienteProduto');
const { precoFaixa, precoComImpressao } = require('./calc');
// A porta unica do preco — e de onde sai o adicional por faixa.
const P = require('./preco');

const tabelaAusente = err =>
  /42P01|PGRST(002|205)|does not exist|schema cache/i.test(`${err?.code || ''} ${err?.message || ''}`);

/**
 * Os produtos PUBLICADOS no catálogo.
 *
 * O cadastro mestre é quem decide (migração 077): `show_in_catalogo` é a
 * chave do catálogo personalizado e `show_in_store` é a da loja de
 * lisos. São perguntas independentes — o mesmo copo pode estar num site
 * e não no outro — e por isso são duas colunas, não uma.
 *
 * PRODUTO NOVO NÃO ENTRA SOZINHO. A coluna nasce FALSE: começar a
 * cadastrar não é publicar. Um cadastro pela metade não pode virar card
 * no ar no minuto em que o nome é digitado.
 *
 * Enquanto a 077 não rodar, a chave antiga continua valendo — o catálogo
 * não pode ficar vazio esperando migração.
 */
async function produtosPublicados(tenantId, colunas, ajustar = q => q) {
  const monta = comColuna => ajustar(
    supabase.from('PRODUTOS')
      .select(comColuna ? `${colunas}, show_in_catalogo` : colunas)
      .eq('tenant_id', tenantId).eq('is_active', true));

  let { data, error } = await monta(true);
  if (error && /show_in_catalogo/i.test(error.message || '')) {
    ({ data, error } = await monta(false));
    if (error) throw error;
    return aplicarAmbiente(tenantId, (data || []).filter(p => p.show_in_store !== false), 'catalogo');
  }
  if (error) throw error;

  // O QUE O CATALOGO TEM DE PROPRIO entra por cima do cadastro mestre:
  // preco que ja embute a personalizacao, minimo de caixa fechada, foto
  // do copo impresso (migracao 094). Sem ajuste gravado, herda tudo — que
  // e a situacao de quem nunca configurou nada.
  //
  // AQUI, e nao em cada tela do catalogo: esta funcao e por onde TODA
  // leitura da vitrine passa, e aplicar la fora seria garantir que uma
  // delas fica de fora mostrando o preco da loja.
  return aplicarAmbiente(tenantId, (data || []).filter(p => p.show_in_catalogo === true), 'catalogo');
}

/** "Long Drink Degradê" → "long-drink-degrade". */
function slugify(texto) {
  return String(texto || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** "AMARELO CANÁRIO" → "Amarelo Canário". O cadastro grita; a vitrine, não. */
function capitalizar(texto) {
  const miudas = new Set(['de', 'da', 'do', 'com', 'e', 'em']);
  return String(texto || '').toLowerCase()
    .split(/\s+/).filter(Boolean)
    .map((p, i) => (i > 0 && miudas.has(p)) ? p : p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ');
}

/**
 * Desmonta o nome do cadastro em base + cor + capacidade.
 *
 * O cadastro tem duas formas, e as duas são reais:
 *
 *   "CANECA SLIM TRADICIONAL - AZUL BIC - 400 ML"      (com traço)
 *   "LONG DRINK TRADICIONAL - AMARELO CANÁRIO 350 ML"  (sem traço)
 *
 * Por isso a capacidade sai PRIMEIRO, pelo fim do texto; o que sobra
 * depois do último traço é a cor. Fazer o contrário quebraria metade do
 * cadastro — e quebraria em silêncio, oferecendo "AMARELO CANÁRIO 350
 * ML" como se fosse nome de cor.
 */
function partesDoNome(nome) {
  let resto = String(nome || '').trim();

  const mv = resto.match(/(\d+(?:[.,]\d+)?)\s*(ML|L)\s*$/i);
  const capacidade = mv ? `${mv[1].replace(',', '.')} ${mv[2].toLowerCase()}` : null;
  if (mv) resto = resto.slice(0, mv.index).trim();
  resto = resto.replace(/[-–]\s*$/, '').trim();

  const corte = resto.lastIndexOf(' - ');
  const base = corte >= 0 ? resto.slice(0, corte).trim() : resto;
  const cor  = corte >= 0 ? resto.slice(corte + 3).trim() : null;

  return { base, cor, capacidade };
}

/**
 * O nome de vitrine da categoria — O MESMO DO CADASTRO.
 *
 * É o nome da CATEGORIA, sem tradução.
 *
 * Passou por dois desvios, e os dois davam no mesmo lugar. Primeiro
 * uma regex tirava a última palavra quando ela era um acabamento, e
 * "CANECA TRADICIONAL" virava "Caneca". Tirada a regex, sobrou
 * `nome_catalogo` — um campo que guardava exatamente o resultado
 * daquela derivação ("Long Drink"), e continuava impondo o apelido.
 *
 * O efeito era o catálogo chamando de "Long Drink" o que o cadastro, o
 * pedido, o estoque e o relatório chamam de "LONG DRINK TRADICIONAL":
 * duas palavras para a mesma coisa, e ninguém sabendo que eram a
 * mesma. Uma vitrine com nome próprio é uma segunda verdade.
 *
 * Se um dia a Lyon quiser mesmo um nome comercial diferente do
 * técnico, `nome_catalogo` volta a valer aqui — mas aí como decisão
 * dita, e não como sobra de uma derivação automática.
 */
function nomeDaCategoria(categoria) {
  return String(categoria?.name || '').trim();
}

/**
  * ACABAMENTO COMBINADO COM BORDA NAO E MAIS UMA OPCAO PROPRIA.
  *
  * O cadastro tem "Degrade", "Degrade + Borda", "Jateado", "Jateado +
  * Borda"... — a mesma peca duas vezes, uma delas com a borda embutida.
  * Mas a borda ja e escolhida como ADICIONAL em qualquer acabamento, e
  * a lista dobrada so fazia o cliente escolher entre duas portas para o
  * mesmo lugar.
  *
  * O `+` no nome e o marcador da combinacao — e o mesmo que
  * `nomeDoAcabamento` troca por "com" ao mostrar. "Borda Metalizada"
  * nao tem `+` e continua: ela e um acabamento, nao a combinacao de
  * dois.
  *
  * ISTO E UM FILTRO DE EXIBICAO, e nao uma exclusao: a linha continua
  * no cadastro, e pedido antigo feito como "Tricolor + Borda" continua
  * com nome. Desativar de vez (`is_active = false`) e a decisao do
  * Administrativo, e este filtro nao atrapalha se ela for tomada.
  */
const ehCombinacaoComBorda = a => /\+/.test(String(a?.name || ''));

/** "Degradê + Borda" → "Degradê com Borda". */
function nomeDoAcabamento(acab) {
  if (acab?.label_comercial) return acab.label_comercial;
  return String(acab?.name || '').replace(/\s*\+\s*/g, ' com ');
}

/**
 * O nome que aparece na tela e vai para o pedido.
 *
 * "Tradicional" entra ("Long Drink Tradicional 350 ml" é um modelo do
 * catálogo). "Liso" não entra: liso é tipo de pedido, não acabamento —
 * o copo sem impressão continua sendo o Long Drink de 350 ml.
 */
function nomeComercial(baseNome, acabamento, capacidade) {
  const acab = acabamento ? nomeDoAcabamento(acabamento) : '';
  const semAcabamento = !acab || /^(liso)$/i.test(acab);

  // "LONG DRINK TRADICIONAL Tradicional 350 ml" — a categoria já tem a
  // palavra no nome, e o acabamento a repetia. Acontece sempre que o
  // Administrativo batiza a categoria com o acabamento junto, que é o
  // normal aqui: a linha Tradicional tem categoria Tradicional. Repetir
  // não acrescenta nada e faz o catálogo parecer defeituoso.
  const nu = t => String(t || '').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
  const jaEstaNoNome = acab && nu(baseNome).split(/\s+/).includes(nu(acab));

  return [baseNome, (semAcabamento || jaEstaNoNome) ? '' : acab, capacidade]
    .filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

/** A chave do modelo na URL: categoria + capacidade, e nada mais. */
const chaveModelo = (categoryId, capacidade) =>
  `${categoryId}__${capacidade ? slugify(capacidade) : 'unico'}`;

const lerChave = chave => {
  const [categoryId, vol] = String(chave || '').split('__');
  return { categoryId, volSlug: vol || 'unico' };
};

// ── As famílias (Tela 1) ────────────────────────────────────

/**
 * As famílias ativas, com quantos modelos cada uma tem.
 *
 * A contagem não é enfeite: família cadastrada e vazia é um card que
 * leva o cliente a uma tela em branco. Aqui ela simplesmente não sai.
 */
/**
 * As CATEGORIAS publicadas — a primeira tela do catálogo.
 *
 * Antes isto vinha de CATALOGO_FAMILIAS, uma curadoria à parte: dez
 * famílias cadastradas, quatro com vínculo. O cliente via quatro cards
 * ("Canecas", "Taças"...) enquanto a /loja mostrava sete ("CANECA SLIM
 * TRADICIONAL", "CANECA TRADICIONAL"...) — dois agrupamentos
 * diferentes do MESMO catálogo, e por isso as contagens nunca batiam:
 * "2 modelos" aqui e "14 modelos" lá, para os mesmos copos.
 *
 * Agora as duas vitrines agrupam pela mesma coisa: a categoria do
 * cadastro. Categoria nova entra nas duas sozinha, e ninguém precisa
 * lembrar de vincular nada.
 *
 * A tabela de famílias continua no banco — nada foi apagado — mas
 * deixou de decidir o que aparece.
 */
/**
 * O GRUPO DE VITRINE DE UMA CATEGORIA.
 *
 * "CANECA SLIM TRADICIONAL" e "CANECA SLIM DEGRADÊ" são a mesma peça
 * com dois acabamentos, e na vitrine têm de ser um card só. Quem diz
 * isso é `nome_catalogo` — o campo do cadastro —, e NÃO uma regex que
 * tira a última palavra do nome quando ela parece um acabamento: essa
 * derivação já foi tentada duas vezes e desfeita, porque a lista de
 * acabamentos muda e a vitrine se reagrupa sozinha, errado e calada.
 */
const grupoDaCategoria = cat =>
  String(cat?.nome_catalogo || '').trim() || nomeDaCategoria(cat) || '(sem categoria)';

/** "Caneca Slim" + "400 ml" → "caneca-slim-400-ml" (a chave da tela 2). */
const slugDoGrupo = (grupo, capacidade) =>
  slugify(capacidade ? `${grupo} ${capacidade}` : grupo);

/** "400 ml" → 400, para a vitrine ir do menor para o maior. */
const emMl = c => {
  const m = String(c || '').match(/([\d.,]+)/);
  return m ? parseFloat(m[1].replace(',', '.')) : Infinity;
};

/**
 * A VITRINE É UMA PEÇA E UM TAMANHO — "Caneca Slim 400 ml".
 *
 * Era um card por CATEGORIA, e isso dava duas telas erradas de uma vez.
 * Para cima, "CANECA SLIM TRADICIONAL" e "CANECA SLIM DEGRADÊ" abriam
 * duas portas para a mesma peça, obrigando o cliente a saber o
 * acabamento antes de ver o copo. Para baixo, o Twister aparecia uma
 * vez só e as duas capacidades (400 e 550) chegavam misturadas na tela
 * seguinte, com "AZUL BIC 400" e "AZUL BIC 550" a quatro cards de
 * distância — o tamanho tinha de ser procurado dentro do nome.
 *
 * Agora o Twister são dois cards e a Caneca Slim é um. O acabamento
 * (Tradicional, Degradê, Bicolor, Jateado…) passa a ser a escolha de
 * DENTRO, que é a ordem em que a cliente decide: primeiro a peça e o
 * tamanho, depois como ela é feita, e a cor por último.
 */
async function familias(tenantId) {
  const [visiveis, catsRes] = await Promise.all([
    produtosPublicados(tenantId, 'id, name, category_id, image_url, photos, show_in_store'),
    supabase.from('CATEGORIAS').select('id, name, nome_catalogo').eq('tenant_id', tenantId),
  ]);
  if (catsRes.error) throw catsRes.error;

  const catPorId = Object.fromEntries((catsRes.data || []).map(c => [c.id, c]));

  const grupos = new Map();
  for (const p of visiveis) {
    if (!p.category_id) continue;
    const cat = catPorId[p.category_id];
    if (!cat) continue;
    const grupo = grupoDaCategoria(cat);
    const { capacidade } = partesDoNome(p.name);
    const chave = `${grupo}__${capacidade || 'unico'}`;
    if (!grupos.has(chave)) {
      grupos.set(chave, { grupo, capacidade, produtos: [], categorias: new Set() });
    }
    const g = grupos.get(chave);
    g.produtos.push(p);
    g.categorias.add(p.category_id);
  }

  const lista = [...grupos.values()].map(g => ({
    // O id do card é o próprio slug: a tela 2 é aberta por ele, e não
    // por um uuid de categoria — o grupo pode ter mais de uma.
    id: slugDoGrupo(g.grupo, g.capacidade),
    slug: slugDoGrupo(g.grupo, g.capacidade),
    // "CANECA SLIM 400 ML" — o nome da peça e o tamanho na mesma linha,
    // que é como a cliente pede no WhatsApp.
    nome: [g.grupo, g.capacidade].filter(Boolean).join(' ').toUpperCase(),
    grupo: g.grupo,
    capacidade: g.capacidade,
    descricao: null,
    icone: null,
    // Quantas peças (cores × acabamentos) esse card abre.
    modelos: g.produtos.length,
    acabamentos: g.categorias.size,
    imagem: g.produtos.map(primeiraFoto).find(Boolean) || null,
  })).filter(f => f.modelos > 0);

  // Pela peça, e dentro dela do menor tamanho para o maior: é a ordem
  // em que a prateleira fica arrumada.
  lista.sort((a, b) => a.grupo.localeCompare(b.grupo, 'pt-BR')
    || emMl(a.capacidade) - emMl(b.capacidade));
  return { familias: lista };
}

const primeiraFoto = p => {
  if (p?.image_url) return p.image_url;
  const fotos = Array.isArray(p?.photos) ? p.photos : [];
  const primeira = fotos.find(Boolean);
  return typeof primeira === 'string' ? primeira : (primeira?.url || null);
};

/** Os produtos que caem numa família — por categoria inteira ou avulsos. */
function produtosDaFamilia(familiaId, itens, produtos) {
  const cats = new Set(), avulsos = new Set();
  for (const i of itens) {
    if (i.familia_id !== familiaId) continue;
    if (i.category_id) cats.add(i.category_id);
    if (i.product_id) avulsos.add(i.product_id);
  }
  return produtos.filter(p => cats.has(p.category_id) || avulsos.has(p.id));
}

// ── Os modelos de uma família (Tela 2) ──────────────────────

/**
 * Os modelos que o cliente vê ao entrar numa família.
 *
 * Cada card é BASE × ACABAMENTO — "Long Drink Tradicional 350 ml",
 * "Long Drink Degradê 350 ml", "Long Drink Degradê com Borda 350 ml".
 * São 13 cards de um mesmo par de linhas do cadastro, e é assim de
 * propósito: quem procura degradê procura degradê, não procura "Long
 * Drink e depois mexa nas opções".
 *
 * O acabamento vem da matriz de compatibilidade — a MESMA que a produção
 * lê. Fechar "Degradê + Borda" para o Long Drink faz o card sumir daqui
 * sem tocar em nenhuma tela.
 */
/**
 * OS ACABAMENTOS DE UM GRUPO DE VITRINE — a tela 2.
 *
 * Duas naturezas entram na mesma lista, e é de propósito:
 *
 *   CATEGORIA IRMÃ    "CANECA SLIM DEGRADÊ" é o Degradê da Caneca Slim.
 *                     Tem produto próprio, foto própria e código
 *                     próprio — é uma peça de fábrica diferente, não um
 *                     serviço aplicado.
 *   MATRIZ            Bicolor, Jateado, Preto Fosco. Não são peça: são
 *                     acabamento aplicado sobre a peça da categoria,
 *                     e quem diz quais valem é a compatibilidade.
 *
 * Misturar as duas é o que faz a tela responder à pergunta que a
 * cliente faz — "como esse copo pode ser feito?" —, em vez de expor a
 * diferença de cadastro, que é problema nosso e não dela.
 *
 * IRMÃ VENCE MATRIZ no nome repetido. Se existe a categoria Degradê E o
 * acabamento Degradê liberado, quem entra é a categoria: ela leva às
 * peças degradê de verdade, com as fotos delas.
 */
async function acabamentosDoGrupo(tenantId, produtos, catPorId) {
  const porCategoria = new Map();
  for (const p of produtos) {
    if (!porCategoria.has(p.category_id)) porCategoria.set(p.category_id, []);
    porCategoria.get(p.category_id).push(p);
  }

  const acabPorCategoria = await acabamentosPorCategoria(tenantId, [...porCategoria.keys()], { comBorda: true });

  // A categoria com mais peças é a "base" do grupo: é sobre ela que os
  // acabamentos da matriz se aplicam, e é a que responde quando o nome
  // do acabamento não corresponde a nenhuma categoria irmã.
  const base = [...porCategoria.entries()].sort((a, b) => b[1].length - a[1].length)[0];

  const lista = [];
  const vistos = new Set();

  /** O nome do acabamento que uma categoria representa. */
  const acabamentoDaCategoria = (cat, grupo) => {
    const nome = nomeDaCategoria(cat);
    // "CANECA SLIM DEGRADÊ" menos "Caneca Slim" = "Degradê". A conta é
    // sobre o GRUPO cadastrado, não sobre uma lista de palavras escrita
    // aqui — é o cadastro que decide onde a peça acaba e o acabamento
    // começa.
    const semGrupo = nome.toUpperCase().startsWith(grupo.toUpperCase())
      ? nome.slice(grupo.length).trim()
      : nome;
    return capitalizar(semGrupo || nome);
  };

  for (const [catId, itens] of porCategoria) {
    const cat = catPorId[catId];
    const grupo = grupoDaCategoria(cat);
    const nome = acabamentoDaCategoria(cat, grupo);
    const chaveNome = nome.toUpperCase();
    if (vistos.has(chaveNome)) continue;
    vistos.add(chaveNome);
    const { capacidade } = partesDoNome(itens[0].name);
    lista.push({
      id: `cat:${catId}`,
      nome,
      // A peça é de verdade: leva a chave do modelo daquela categoria.
      chave: chaveModelo(catId, capacidade),
      acabamento_id: null,
      cores: itens.length,
      imagem: itens.map(primeiraFoto).find(Boolean) || null,
      preco_de: Math.min(...itens.map(p => precoDe(p)).filter(v => v > 0), Infinity),
      qtd_minima: Math.max(...itens.map(p => p.min_order_qty || 1)),
      origem: 'peca',
    });
  }

  if (base) {
    const [baseId, baseItens] = base;
    const { capacidade } = partesDoNome(baseItens[0].name);
    for (const a of acabPorCategoria[baseId] || []) {
      const nome = nomeDoAcabamento(a);
      const chaveNome = nome.toUpperCase();
      if (vistos.has(chaveNome)) continue;
      vistos.add(chaveNome);
      lista.push({
        id: `acab:${a.id}`,
        nome,
        // Mesma peça da categoria base, com o acabamento já escolhido —
        // o configurador abre nele.
        chave: chaveModelo(baseId, capacidade),
        acabamento_id: a.id,
        cores: baseItens.length,
        imagem: baseItens.map(primeiraFoto).find(Boolean) || null,
        preco_de: Math.min(...baseItens.map(p => precoDe(p)).filter(v => v > 0), Infinity),
        qtd_minima: Math.max(...baseItens.map(p => p.min_order_qty || 1)),
        origem: 'acabamento',
      });
    }
  }

  // Peça de verdade primeiro (tem foto própria), depois os aplicados.
  return lista
    .map(a => ({ ...a, preco_de: Number.isFinite(a.preco_de) ? a.preco_de : null }))
    .sort((a, b) => (a.origem === b.origem ? a.nome.localeCompare(b.nome, 'pt-BR')
      : a.origem === 'peca' ? -1 : 1));
}

async function modelosDaFamilia(tenantId, slug) {
  const [publicados, catsRes] = await Promise.all([
    produtosPublicados(tenantId,
      'id, name, code, category_id, sale_price, price_tiers, min_order_qty, image_url, photos, show_in_store, ink_type'),
    supabase.from('CATEGORIAS').select('id, name, nome_catalogo').eq('tenant_id', tenantId),
  ]);
  if (catsRes.error) throw catsRes.error;

  const catPorId = Object.fromEntries((catsRes.data || []).map(c => [c.id, c]));

  /**
   * O SLUG AGORA É O GRUPO + O TAMANHO — "caneca-slim-400-ml".
   *
   * A vitrine passou a ter um card por peça e tamanho, e é esse o
   * endereço que ela abre. As duas formas antigas continuam vivas
   * logo abaixo: o slug da CATEGORIA, que é o que está nos links já
   * mandados por WhatsApp, e o da família, que é mais antigo ainda.
   * Link que o cliente guardou não pode morrer numa reorganização de
   * vitrine.
   */
  const doGrupo = [];
  for (const p of publicados) {
    const c = catPorId[p.category_id];
    if (!c) continue;
    const { capacidade } = partesDoNome(p.name);
    if (slugDoGrupo(grupoDaCategoria(c), capacidade) === slug) doGrupo.push(p);
  }
  if (doGrupo.length) {
    const primeira = catPorId[doGrupo[0].category_id];
    const capacidade = partesDoNome(doGrupo[0].name).capacidade;
    return {
      familia: {
        nome: [grupoDaCategoria(primeira), capacidade].filter(Boolean).join(' ').toUpperCase(),
        slug,
        grupo: grupoDaCategoria(primeira),
        capacidade,
      },
      // A TELA 2 PASSOU A SER O ACABAMENTO, e não mais a cor: é a
      // pergunta que vem depois de "qual peça e qual tamanho", e a cor
      // é a última, já dentro do configurador.
      acabamentos: await acabamentosDoGrupo(tenantId, doGrupo, catPorId),
      modelos: [],
    };
  }

  // O slug é o da CATEGORIA. Links antigos apontando para o slug de uma
  // família continuam abrindo: a família é procurada como segunda
  // tentativa e resolvida para as categorias dela.
  const cat = (catsRes.data || []).find(c => slugify(c.name) === slug);
  let produtos, tituloFamilia, slugFamilia;

  if (cat) {
    produtos = publicados.filter(p => p.category_id === cat.id);
    tituloFamilia = nomeDaCategoria(cat);
    slugFamilia = slug;
  } else {
    const { data: fam } = await supabase
      .from('CATALOGO_FAMILIAS').select('id, name, slug, descricao')
      .eq('tenant_id', tenantId).eq('slug', slug).eq('is_active', true).maybeSingle();
    if (!fam) return { erro: 'Categoria não encontrada' };
    const { data: itens } = await supabase.from('CATALOGO_FAMILIA_ITENS')
      .select('familia_id, category_id, product_id')
      .eq('tenant_id', tenantId).eq('familia_id', fam.id);
    produtos = produtosDaFamilia(fam.id, itens || [], publicados);
    tituloFamilia = fam.name;
    slugFamilia = fam.slug;
  }

  // Agrupa em modelos (categoria + capacidade).
  const grupos = new Map();
  for (const p of produtos) {
    const { capacidade } = partesDoNome(p.name);
    const chave = chaveModelo(p.category_id, capacidade);
    if (!grupos.has(chave)) {
      grupos.set(chave, { chave, categoryId: p.category_id, capacidade, produtos: [] });
    }
    grupos.get(chave).produtos.push(p);
  }
  if (!grupos.size) return { familia: { nome: tituloFamilia, slug: slugFamilia }, modelos: [] };

  const acabPorCategoria = await acabamentosPorCategoria(tenantId, [...grupos.values()].map(g => g.categoryId));

  const modelos = [];
  for (const g of grupos.values()) {
    const cat = catPorId[g.categoryId];
    const base = nomeDaCategoria(cat);
    const acabs = acabPorCategoria[g.categoryId] || [];
    const precoBase = Math.min(...g.produtos.map(p => precoDe(p)).filter(v => v > 0), Infinity);
    // AS FOTOS SÃO AS DO CADASTRO, uma por COR. O cadastro tem
    // "CANECA TRADICIONAL - PRETO - 450 ML", "- PINK OPACO -": uma linha
    // e uma foto por cor. O card alterna entre elas, como a /loja faz.
    const fotos = [...new Set(g.produtos.map(primeiraFoto).filter(Boolean))];

    // UM CARD POR PRODUTO CADASTRADO — uma cor, uma linha do cadastro.
    //
    // Esta tela já foi base × acabamento: cada acabamento da matriz
    // virava um card, e a vitrine anunciava "Caneca Degradê 450 ml",
    // "Caneca Bicolor 450 ml" — catorze produtos que não existem em
    // Produtos, saindo de UM que existe.
    //
    // Depois virou um card por MODELO, e sobrou o problema oposto: a
    // Caneca Tradicional tem catorze cores cadastradas, cada uma com
    // sua foto e seu código, e a vitrine mostrava um card só. Quem
    // queria a AZUL TRANSLÚCIDO tinha de entrar no configurador para
    // descobrir que ela existia.
    //
    // O cadastro é a resposta nos dois casos: cor é produto (tem
    // linha, código e foto), acabamento não é (é aplicado na peça, e
    // se escolhe no configurador).
    for (const p of g.produtos) {
      const foto = primeiraFoto(p);
      const cor = partesDoNome(p.name).cor || null;
      modelos.push({
        chave: g.chave,
        produto_id: p.id,
        codigo: p.code || null,
        // A cor vai no endereço para o configurador já abrir nela.
        cor,
        acabamento_id: null,
        // O NOME DO CADASTRO, inteiro. É por ele que o cliente pergunta
        // no WhatsApp e é ele que o vendedor vai procurar no pedido.
        nome: p.name,
        base, capacidade: g.capacidade,
        acabamento: null,
        categoria: cat?.name || null,
        cores: g.produtos.length,
        acabamentos: acabs.length,
        imagem: foto,
        imagens: foto ? [foto] : [],
        preco_de: precoDe(p) || (Number.isFinite(precoBase) ? precoBase : null),
        qtd_minima: p.min_order_qty || 1,
      });
    }
  }

  modelos.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  return {
    familia: { nome: tituloFamilia, slug: slugFamilia, descricao: null },
    modelos,
  };
}

/**
 * LER UMA TABELA QUE PODE AINDA NÃO TER A COLUNA NOVA.
 *
 * As migrações deste projeto são aplicadas à mão, e o código sobe
 * antes. Entre o deploy e o SQL colado no Supabase existe uma janela em
 * que o servidor pede uma coluna que o banco não tem — e o PostgREST
 * responde "column does not exist", que o `tabelaAusente` lê como
 * "tabela ausente" e vira "Catálogo não configurado" na cara do
 * cliente. Foi exatamente assim que a vitrine inteira caiu ao ganhar
 * `faixas` (migração 099).
 *
 * Aqui a consulta tenta com a coluna nova e, se o banco não a conhece,
 * repete sem ela. O catálogo perde a faixa por quantidade — que ainda
 * não existe lá mesmo — e continua de pé.
 */
async function selectTolerante(tabela, colunas, opcional, montar) {
  const primeira = await montar(supabase.from(tabela).select(colunas));
  if (!primeira.error) return primeira;

  const msg = `${primeira.error.code || ''} ${primeira.error.message || ''}`;
  if (!new RegExp(`${opcional}|does not exist|schema cache`, 'i').test(msg)) return primeira;

  const sem = colunas.split(',').map(c => c.trim()).filter(c => c !== opcional).join(', ');
  return montar(supabase.from(tabela).select(sem));
}

const precoDe = p => {
  const tiers = Array.isArray(p.price_tiers) ? p.price_tiers : [];
  const opcoes = [Number(p.sale_price) || 0, ...tiers.map(t => Number(t.price) || 0)].filter(v => v > 0);
  return opcoes.length ? Math.min(...opcoes) : 0;
};

/**
 * Os acabamentos liberados para cada categoria, de uma vez só.
 *
 * Uma consulta para todas as categorias em vez de uma por modelo: a
 * Tela 2 pode ter 20 modelos, e 20 idas ao banco para responder a mesma
 * pergunta é como a tela fica lenta sem ninguém entender por quê.
 */
async function acabamentosPorCategoria(tenantId, categoryIds, { comBorda = false } = {}) {
  const ids = [...new Set(categoryIds.filter(Boolean))];
  if (!ids.length) return {};

  const [acabRes, compatRes] = await Promise.all([
    selectTolerante('CONFIG_ACABAMENTOS',
      'id, name, seq, label_comercial, preco_adicional, faixas, preco_metodo, no_catalogo, campos, requer_pintura, requer_borda, requer_jateamento',
      'faixas',
      q => q.eq('tenant_id', tenantId).eq('is_active', true).order('seq')),
    supabase.from('PRODUTO_COMPATIBILIDADE').select('category_id, ref_id, permitido')
      .eq('tenant_id', tenantId).eq('tipo', 'acabamento').in('category_id', ids),
  ]);
  if (acabRes.error) { if (tabelaAusente(acabRes.error)) return {}; throw acabRes.error; }
  if (compatRes.error) throw compatRes.error;

  // O COMBINADO COM BORDA VOLTA NA TELA DE ACABAMENTOS.
  //
  // No configurador ele continua escondido: lá a borda é ADICIONAL,
  // marcada à parte, e oferecer "Degradê" e "Degradê com Borda" como
  // dois cards seria duas portas para o mesmo lugar. Na vitrine é o
  // contrário — "degradê metalizado" é como a peça é pedida, e some da
  // prateleira se não tiver card.
  const acabPorId = Object.fromEntries((acabRes.data || [])
    .filter(a => a.no_catalogo !== false && (comBorda || !ehCombinacaoComBorda(a)))
    .map(a => [a.id, a]));

  const saida = {};
  for (const c of compatRes.data || []) {
    if (!c.permitido || !acabPorId[c.ref_id]) continue;
    (saida[c.category_id] = saida[c.category_id] || []).push(acabPorId[c.ref_id]);
  }
  for (const k of Object.keys(saida)) saida[k].sort((a, b) => a.seq - b.seq);
  return saida;
}

// ── A configuração de um modelo (Tela 3) ────────────────────

/**
 * Tudo que o configurador precisa, numa resposta só.
 *
 * Acabamentos com os campos que cada um abre, as cores de cada grupo, o
 * processo de impressão que o material permite, o gabarito da arte e a
 * regra de caixa do liso.
 *
 * AS CORES DE PRODUTO SÃO AS QUE EXISTEM. O grupo "produto" da tabela de
 * cores é da empresa inteira — 23 cores. Mas este modelo só tem as cores
 * que estão cadastradas COMO PRODUTO nele. Oferecer "Azul Bic" num Long
 * Drink que não tem Azul Bic é vender o que não existe, e quem descobre
 * é a produção, depois de pago.
 */
async function configDoModelo(tenantId, chave) {
  const { categoryId, volSlug } = lerChave(chave);
  if (!categoryId) return { erro: 'Modelo inválido' };

  const [catRes, publicados] = await Promise.all([
    supabase.from('CATEGORIAS').select('id, name, nome_catalogo')
      .eq('tenant_id', tenantId).eq('id', categoryId).maybeSingle(),
    produtosPublicados(tenantId,
      'id, code, name, unit, ink_type, category_id, sale_price, price_tiers, print_pricing, min_order_qty, image_url, photos, show_in_store',
      q => q.eq('category_id', categoryId)),
  ]);
  if (catRes.error) throw catRes.error;
  if (!catRes.data) return { erro: 'Modelo não encontrado' };

  const membros = publicados
    .map(p => ({ ...p, partes: partesDoNome(p.name) }))
    .filter(p => slugify(p.partes.capacidade || 'unico') === volSlug);

  if (!membros.length) return { erro: 'Modelo não encontrado' };

  const capacidade = membros[0].partes.capacidade;
  const base = nomeDaCategoria(catRes.data);

  // O produto de referência: preço, ficha técnica e gabarito saem dele.
  // Prefere o transparente, que é a base física de tudo que é pintado.
  const referencia = membros.find(p => /TRANSPARENTE/i.test(p.partes.cor || '')) || membros[0];

  const [acabRes, coresRes, procRes, compatRes, gabRes, embRes, famRes] = await Promise.all([
    selectTolerante('CONFIG_ACABAMENTOS',
      'id, name, seq, label_comercial, preco_adicional, faixas, preco_metodo, no_catalogo, campos, requer_pintura, requer_borda, requer_jateamento',
      'faixas',
      q => q.eq('tenant_id', tenantId).eq('is_active', true).order('seq')),
    supabase.from('CONFIG_CORES').select('id, name, grupo, hex, seq')
      .eq('tenant_id', tenantId).eq('is_active', true).order('seq'),
    selectTolerante('CONFIG_PROCESSOS',
      'id, name, max_cores, seq, linha_tinta, preco_adicional, faixas, preco_metodo', 'faixas',
      q => q.eq('tenant_id', tenantId).eq('is_active', true).order('seq')),
    supabase.from('PRODUTO_COMPATIBILIDADE').select('tipo, ref_id, permitido, category_id, product_id')
      .eq('tenant_id', tenantId)
      .or(`category_id.eq.${categoryId},product_id.in.(${membros.map(m => m.id).join(',')})`),
    supabase.from('CATALOGO_GABARITOS')
      .select('category_id, product_id, altura_mm, largura_mm, margem_mm, permite_verso, observacao')
      .eq('tenant_id', tenantId),
    supabase.from('CATALOGO_EMBALAGEM')
      .select('category_id, product_id, caixa_qtd, max_cores_caixa, min_caixas')
      .eq('tenant_id', tenantId),
    // A FAMÍLIA DO MODELO — e é ela que diz qual o FORMATO do copo.
    //
    // A prévia desenhava um copo só, tapered, para tudo: quem escolhia
    // caneca via um long drink com a cor certa, e a primeira reação é
    // achar que o site pegou o produto errado. O formato não é palpite
    // pelo nome da categoria: é a família declarada no catálogo, a mesma
    // que monta a vitrine.
    supabase.from('CATALOGO_FAMILIA_ITENS')
      .select('familia_id, CATALOGO_FAMILIAS(slug)')
      .eq('tenant_id', tenantId).eq('category_id', categoryId),
  ]);
  const falha = [acabRes, coresRes, procRes, compatRes].find(r => r.error);
  if (falha) { if (tabelaAusente(falha.error)) return { config_ausente: true }; throw falha.error; }

  const idsMembros = new Set(membros.map(m => m.id));

  /**
   * O QUE CADA COR ACEITA — porque a regra por cor não é a regra do modelo.
   *
   * `permitidos` acima devolve a UNIÃO: tudo que alguma cor deste modelo
   * aceita. Ela existe para montar as listas, e está certa para isso.
   * Errado era usá-la como resposta final: a Lyon liberou o Transfer SÓ
   * no LONG DRINK TRANSPARENTE e ele apareceu em todas as vinte e quatro
   * cores, porque a página do catálogo é do MODELO — as vinte e quatro
   * juntas — e uma cor que abre abria para todas.
   *
   * Aqui a resposta é por cor: para cada produto do modelo, a regra dele
   * quando existe, e a da categoria quando não existe. É a mesma conta
   * que a tela de Editar Produto mostra com "Herdar · Sim / Sim / Não",
   * e agora o catálogo faz a mesma conta.
   *
   * Vai no corpo da resposta porque quem escolhe a cor é a cliente,
   * depois da página carregada: refazer a viagem ao servidor a cada
   * troca de cor seria uma espera por clique.
   */
  const regraDoProduto = new Map();   // `${tipo}|${ref}|${produto}` -> bool
  const regraDaCategoria = new Map(); // `${tipo}|${ref}`            -> bool
  for (const r of compatRes.data || []) {
    if (r.product_id) {
      if (idsMembros.has(r.product_id)) regraDoProduto.set(`${r.tipo}|${r.ref_id}|${r.product_id}`, !!r.permitido);
    } else if (r.category_id === categoryId) {
      regraDaCategoria.set(`${r.tipo}|${r.ref_id}`, !!r.permitido);
    }
  }
  const aceita = (tipo, ref, produtoId) => {
    const doProduto = regraDoProduto.get(`${tipo}|${ref}|${produtoId}`);
    if (doProduto !== undefined) return doProduto;
    return regraDaCategoria.get(`${tipo}|${ref}`) === true;
  };

  /**
   * O QUE ESTE MODELO OFERECE — a lista, e só a lista.
   *
   * Aqui é a UNIÃO: entra o que ALGUMA cor do modelo aceita. Quem
   * decide se aquela cor específica aceita é `aceita`, logo acima, e é
   * o mapa `por_cor` que a tela consulta na hora que a cliente escolhe.
   *
   * ANTES ERA O CONTRÁRIO — "bloquear vence permitir" — e havia um bom
   * motivo: a tela não perguntava a cor, então oferecer o que alguma
   * cor fecha era vender o que a fábrica pode não fazer, e quem
   * descobria era a produção depois de pago.
   *
   * Só que o remédio virou a doença. A Lyon liberou o Transfer no LONG
   * DRINK TRANSPARENTE e o bloqueou nas outras 23; a regra apagava o
   * Transfer do modelo INTEIRO, inclusive do transparente — a cor onde
   * ela acabara de liberar. A opção sumia justamente de onde deveria
   * estar.
   *
   * O motivo antigo caiu porque a tela agora pergunta a cor antes da
   * impressão e filtra por ela, e o servidor confere o mesmo no
   * fechamento. Uma cor fechada não vende mais nada — ela só não apaga
   * as outras.
   */
  const permitidos = tipo => {
    const candidatos = new Set();
    for (const r of compatRes.data || []) {
      if (r.tipo !== tipo || !r.permitido) continue;
      if (r.product_id) { if (idsMembros.has(r.product_id)) candidatos.add(r.ref_id); }
      else if (r.category_id === categoryId) candidatos.add(r.ref_id);
    }
    const fim = new Set();
    for (const ref of candidatos) {
      if (membros.some(m => aceita(tipo, ref, m.id))) fim.add(ref);
    }
    return fim;
  };

  const okAcab = permitidos('acabamento');
  const okCor  = permitidos('cor');
  const okProc = permitidos('processo');


  const acabamentos = (acabRes.data || [])
    .filter(a => okAcab.has(a.id) && a.no_catalogo !== false && !ehCombinacaoComBorda(a))
    .map(a => ({
      id: a.id,
      nome: nomeDoAcabamento(a),
      nome_interno: a.name,
      campos: Array.isArray(a.campos) ? a.campos : [],
      preco_adicional: Number(a.preco_adicional) || 0,
      requer: { pintura: a.requer_pintura, borda: a.requer_borda, jateamento: a.requer_jateamento },
      nome_comercial: nomeComercial(base, a, capacidade),
    }));

  // As cores de PRODUTO viram as cores que existem de verdade neste
  // modelo, cada uma amarrada ao produto que ela é.
  const corPorNome = new Map();
  for (const c of coresRes.data || []) {
    if (c.grupo !== 'produto') continue;
    corPorNome.set(String(c.name || '').toUpperCase(), c);
  }

  const cores = { produto: [] };
  for (const m of membros) {
    const nomeCor = String(m.partes.cor || '').toUpperCase();
    const cfg = corPorNome.get(nomeCor);
    // A cor precisa estar liberada para o produto E existir como
    // produto. Falhar num dos dois lados é motivo para não oferecer.
    if (cfg && !okCor.has(cfg.id)) continue;
    cores.produto.push({
      id: cfg?.id || `produto:${m.id}`,
      name: capitalizar(m.partes.cor || m.name),
      hex: cfg?.hex || null,
      produto_id: m.id,
      codigo: m.code,
      // A FOTO DAQUELA COR. Cada cor do modelo é um produto de verdade
      // no cadastro, com foto de verdade — e é ela que a prévia mostra
      // quando o cliente escolhe a cor. O `hex` continua servindo para a
      // bolinha da paleta; a foto é a peça.
      imagem: primeiraFoto(m),
    });
  }
  cores.produto.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

  for (const c of coresRes.data || []) {
    if (c.grupo === 'produto' || !okCor.has(c.id)) continue;
    (cores[c.grupo] = cores[c.grupo] || []).push({ id: c.id, name: c.name, hex: c.hex });
  }

  /**
   * A PALETA DA PEÇA É A DA CATEGORIA — e não uma lista de nomes soltos.
   *
   * O grupo «pintura» nasceu com doze nomes genéricos (Amarelo, Azul
   * Royal, Rosa, Roxo...) escritos no cadastro inicial. Nenhum deles é
   * uma cor que a Lyon tem. O cliente abria o LONG DRINK TRADICIONAL —
   * que a fábrica faz em vinte e tantas cores DE VERDADE: Amarelo
   * Canário, Azul Bic, Pérola, Rubi Translúcido — e escolhia entre doze
   * que não são nenhuma delas. O pedido saía com uma cor que não existe,
   * e quem descobria era a produção.
   *
   * Agora quem manda é o cadastro do produto: as cores oferecidas para
   * pintar a peça são EXATAMENTE as deste modelo, uma por uma, as
   * mesmas que aparecem na vitrine.
   *
   * A EXCEÇÃO É O CAMPO QUE PEDE COR PELO NOME. A boca é «Gelo» ou
   * «Transparente», e Gelo não é peça — é acabamento; ela não está e
   * nem deveria estar na lista de cores do copo. Esses campos ganham
   * grupo próprio, com a lista original, para que a paleta livre (Cor
   * 1, Cor 2, Cor 3) continue sendo só a da categoria.
   */
  const paletaAntiga = cores.pintura || [];
  if (cores.produto.length) cores.pintura = cores.produto;

  for (const a of acabamentos) {
    a.campos = (a.campos || []).map(campo => {
      if (campo.grupo !== 'pintura') return campo;
      if (!Array.isArray(campo.apenas) || !campo.apenas.length) return campo;
      const querem = campo.apenas.map(x => String(x).toLowerCase());
      const grupo = `pintura_${campo.key}`;
      cores[grupo] = paletaAntiga.filter(c => querem.includes(String(c.name).toLowerCase()));
      return { ...campo, grupo };
    });
  }

  // O PROCESSO NÃO É ESCOLHA DO CLIENTE. A tinta tem que casar com o
  // material do copo: PS pede tinta PS. O cliente escolhe a COR da arte;
  // a química quem determina é a ficha técnica.
  const linha = referencia.ink_type || null;
  const processos = (procRes.data || [])
    .filter(p => okProc.has(p.id))
    .filter(p => !linha || !p.linha_tinta || p.linha_tinta === linha)
    .map(p => ({
      id: p.id, nome: p.name, max_cores: p.max_cores,
      linha_tinta: p.linha_tinta || linha || null,
      preco_adicional: Number(p.preco_adicional) || 0,
    }));

  // O mapa que a tela consulta a cada troca de cor: por produto, o que
  // aquela cor aceita de acabamento e de impressão. Só entram os ids que
  // já estão nas listas acima — o resto a tela nem conhece.
  const porCor = {};
  for (const m of membros) {
    porCor[m.id] = {
      acabamentos: acabamentos.filter(a => aceita('acabamento', a.id, m.id)).map(a => a.id),
      processos: processos.filter(p => aceita('processo', p.id, m.id)).map(p => p.id),
    };
  }

  return {
    por_cor: porCor,
    modelo: {
      chave, base, capacidade,
      categoria: catRes.data.name,
      category_id: categoryId,
      linha,
      produto_referencia: referencia.id,
      codigo: referencia.code,
      unidade: referencia.unit,
      qtd_minima: Math.max(...membros.map(m => m.min_order_qty || 1)),
      preco_base: precoDe(referencia),
      imagem: membros.map(primeiraFoto).find(Boolean) || null,
      familia: famRes?.data?.[0]?.CATALOGO_FAMILIAS?.slug || null,
      nome: nomeComercial(base, null, capacidade),
    },
    acabamentos,
    cores,
    processos,
    gabarito: escolherPorAlvo(gabRes.data, categoryId, referencia.id, {
      altura_mm: null, largura_mm: null, margem_mm: 2, permite_verso: true,
    }),
    embalagem: escolherPorAlvo(embRes.data, categoryId, referencia.id, {
      caixa_qtd: 100, max_cores_caixa: 4, min_caixas: 1,
    }),
  };
}

/**
 * Regra de produto vence regra de categoria; sem nenhuma, vale o padrão.
 *
 * O padrão existe para o catálogo funcionar no dia em que ninguém tiver
 * cadastrado gabarito ainda — mas ele vem marcado (`padrao: true`) para
 * a tela poder avisar que aquela medida não foi conferida por ninguém.
 */
function escolherPorAlvo(linhas, categoryId, productId, padrao) {
  const lista = linhas || [];
  const doProduto = lista.find(l => l.product_id === productId);
  if (doProduto) return { ...doProduto, origem: 'produto' };
  const daCategoria = lista.find(l => l.category_id === categoryId);
  if (daCategoria) return { ...daCategoria, origem: 'categoria' };
  return { ...padrao, padrao: true, origem: 'padrao' };
}

// ── O preço, em tempo real ──────────────────────────────────

/**
 * O preço de um item configurado.
 *
 * Ordem: a faixa de quantidade do produto → o acabamento → a impressão.
 * O acabamento e o processo preferem a tabela que a ficha de
 * Precificação já tem (`print_pricing`), e só caem no acréscimo fixo
 * quando o Administrativo não amarrou um método. Duas tabelas de preço
 * para a mesma coisa é como o site e o ERP passam a discordar.
 */
function precoDoItem({ produto, quantidade, acabamento, processo }) {
  const qtd = Math.max(1, Number(quantidade) || 1);

  const metodo = acabamento?.preco_metodo || processo?.preco_metodo || null;
  const unitario = metodo
    ? precoComImpressao(produto, metodo, qtd)
    : precoFaixa(produto.price_tiers, produto.sale_price, qtd);

  // OS EXTRAS TAMBEM ANDAM POR FAIXA (migracao 099). Antes eram um
  // numero so, cobrado igual para dez pecas e para dois mil — e e
  // justamente aqui que a escala aparece: a tela da serigrafia custa o
  // mesmo para 50 ou 500 copos.
  const extras = (metodo ? 0 : P.adicionalPorFaixa(acabamento, qtd))
    + P.adicionalPorFaixa(processo, qtd);

  const valorUnitario = Math.round((unitario + extras) * 100) / 100;
  return { unitario: valorUnitario, total: Math.round(valorUnitario * qtd * 100) / 100 };
}

/**
 * QUAL COR DO MODELO A ESCOLHA APONTA — o produto de verdade.
 *
 * Duas portas, e as duas valem: o campo de grupo «produto» do acabamento
 * (Bicolor pede a cor da peça) e a primeira cor da impressão, que desde
 * que a paleta virou a da categoria É a cor do copo. Pintura, borda e
 * jateado não entram: são serviço sobre o copo, não outro copo.
 *
 * Serve para duas coisas que têm que concordar: qual linha de produto é
 * vendida (preço, código, estoque) e o que aquela cor aceita de
 * acabamento e de impressão.
 */
function produtoDaEscolha(config, escolha = {}) {
  const acab = (config.acabamentos || []).find(a => a.id === escolha.acabamento_id);
  for (const campo of acab?.campos || []) {
    if (campo.grupo !== 'produto') continue;
    const achado = (config.cores?.produto || []).find(c => c.id === escolha.campos?.[campo.key]);
    if (achado?.produto_id) return achado.produto_id;
  }
  const primeira = (escolha.cores_arte || []).find(Boolean);
  if (primeira) {
    const achado = (config.cores?.produto || []).find(c => c.id === primeira);
    if (achado?.produto_id) return achado.produto_id;
  }
  return null;
}

/**
 * A escolha é produzível?
 *
 * Repetido no servidor de propósito: a tela já não deixa escolher o
 * proibido, mas a tela é do cliente e a requisição é de quem quiser.
 */
function validarEscolha(config, escolha = {}) {
  const problemas = [];
  const acab = (config.acabamentos || []).find(a => a.id === escolha.acabamento_id);
  if (!acab) return { ok: false, problemas: ['Escolha um acabamento liberado para este modelo.'] };

  // A MESMA COR NAO ENTRA DUAS VEZES. Tricolor com as tres iguais e
  // pagar por tres verdes: o cliente escolhe, a fabrica produz, e o que
  // chega e um copo de uma cor so — com a conta de tres. A tela ja nao
  // deixa escolher repetido; isto aqui e porque a tela e do cliente e a
  // requisicao e de quem quiser.
  const jaUsada = new Map();   // cor escolhida -> rotulo do campo

  for (const campo of acab.campos) {
    const valor = escolha.campos?.[campo.key];
    if (!valor) {
      if (campo.obrigatorio) problemas.push(`Falta informar: ${campo.label}.`);
      continue;
    }
    const disponiveis = config.cores?.[campo.grupo] || [];
    if (!disponiveis.some(c => c.id === valor)) {
      problemas.push(`${campo.label}: essa opção não está liberada para este modelo.`);
      continue;
    }
    if (jaUsada.has(valor)) {
      const cor = disponiveis.find(c => c.id === valor)?.name || 'essa cor';
      problemas.push(`${campo.label}: ${cor} já foi escolhida em ${jaUsada.get(valor)}. Cada campo pede uma cor diferente.`);
      continue;
    }
    jaUsada.set(valor, campo.label);
  }

  /**
   * A ARTE PRECISA DIZER QUAIS CORES.
   *
   * "Serigrafia 2 cores" imprime duas; escolher a impressao e nao dizer
   * quais e mandar para a producao um pedido que ela nao consegue
   * executar sem telefonar. E a mesma cor duas vezes e pagar por duas e
   * receber uma — a mesma regra dos campos do acabamento.
   *
   * `max_cores` vazio e arte colorida (transfer, DTF): nao ha cor de
   * tinta a escolher, e nada e exigido.
   */
  const proc = (config.processos || []).find(p => p.id === escolha.processo_id);
  const exigidas = Number(proc?.max_cores) || 0;
  if (exigidas > 0 && escolha.tipo_pedido !== 'liso') {
    const escolhidas = (escolha.cores_arte || []).filter(Boolean);
    if (escolhidas.length < exigidas) {
      problemas.push(`${proc.nome || 'A impressão'} imprime ${exigidas} cor(es): informe todas.`);
    } else if (new Set(escolhidas).size !== escolhidas.length) {
      problemas.push('A mesma cor foi escolhida duas vezes na arte. Cada cor da impressão é diferente.');
    }
  }

  if (escolha.tipo_pedido === 'liso') {
    const { caixa_qtd, max_cores_caixa, min_caixas } = config.embalagem || {};
    const minimo = (Number(caixa_qtd) || 1) * (Number(min_caixas) || 1);
    if (Number(escolha.quantidade) < minimo) {
      problemas.push(`No modo liso o mínimo é ${minimo} unidades (caixa de ${caixa_qtd}).`);
    }
    const cores = Array.isArray(escolha.cores_liso) ? escolha.cores_liso.length : 1;
    if (max_cores_caixa && cores > max_cores_caixa) {
      problemas.push(`A caixa aceita no máximo ${max_cores_caixa} cores.`);
    }
  } else if (escolha.processo_id) {
    const proc = (config.processos || []).find(p => p.id === escolha.processo_id);
    if (!proc) problemas.push('Esse tipo de impressão não é compatível com este produto.');
  }

  /**
   * E A COR ESCOLHIDA ACEITA ISSO?
   *
   * A tela já não deixa escolher o proibido, mas a tela é do cliente e a
   * requisição é de quem quiser. Sem esta conferência, "Transfer só no
   * transparente" seria uma regra que qualquer um contorna trocando um
   * campo no corpo da requisição — e a produção receberia um pedido que
   * não sabe fazer.
   *
   * Enquanto a cor não foi escolhida não há o que conferir: quem cobra
   * a cor é a regra das cores da impressão, logo acima.
   */
  const produtoId = produtoDaEscolha(config, escolha);
  const daCor = produtoId ? config.por_cor?.[produtoId] : null;
  if (daCor) {
    const nomeDaCor = (config.cores?.produto || [])
      .find(c => c.produto_id === produtoId)?.name || 'essa cor';
    if (acab && !daCor.acabamentos.includes(acab.id)) {
      problemas.push(`${acab.nome} não está liberado para ${nomeDaCor}.`);
    }
    if (escolha.processo_id && escolha.tipo_pedido !== 'liso'
        && !daCor.processos.includes(escolha.processo_id)) {
      const nome = (config.processos || []).find(p => p.id === escolha.processo_id)?.nome || 'Essa impressão';
      problemas.push(`${nome} não está liberado para ${nomeDaCor}.`);
    }
  }

  return { ok: problemas.length === 0, problemas, acabamento: acab };
}

module.exports = {
  slugify, capitalizar, partesDoNome,
  nomeDaCategoria, nomeDoAcabamento, nomeComercial,
  chaveModelo, lerChave,
  familias, modelosDaFamilia, configDoModelo,
  precoDoItem, validarEscolha, produtoDaEscolha,
  escolherPorAlvo, produtosDaFamilia, primeiraFoto, produtosPublicados,
};
