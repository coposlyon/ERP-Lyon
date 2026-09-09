// ============================================================
// O QUE TODO PEDIDO DE TESTE PRECISA — num lugar só.
//
// Existem dois cenários de teste (cinco pedidos de um item cada, e um
// pedido com cinco itens no carrinho) e eles precisam das MESMAS
// quatro coisas: a marca que identifica o ensaio, o cliente de teste,
// a régua de status para montar um histórico crível e a arte falsa.
//
// Escrever isso duas vezes seria duas réguas para divergir — e a que
// divergisse produziria um pedido com a linha do tempo em ordem errada,
// que é exatamente o tipo de defeito que um seed de teste deveria
// ajudar a encontrar, não a criar.
//
// A MARCA É UMA SÓ para todos os cenários: uma limpeza geral por
// `notes LIKE '[PEDIDO DE TESTE]%'` encontra tudo. Cada script assina
// a nota com o próprio nome de arquivo, e é por essa assinatura que o
// `--limpar` dele apaga só o que ele criou.
// ============================================================
const supabase = require('../src/config/supabase');
const { uploadDataUrl } = require('../src/lib/storage');

const MARCA = '[PEDIDO DE TESTE]';
const CLIENTE_TESTE = 'CLIENTE DE TESTE — NAO FATURAR';
const BUCKET = 'loja-publico';

/**
 * COMO SE ENTRA NO PORTAL DO CLIENTE — e por que o CPF é este.
 *
 * O portal (/acompanhar) não tem senha: o acesso é CPF + DATA DE
 * NASCIMENTO, os dois do mesmo cadastro (routes/public-pedido.js, POST
 * /acesso). Sem esses dois campos preenchidos, o cliente de teste
 * existe no ERP mas não consegue abrir o próprio pedido — e ver o
 * pedido pelos olhos do cliente é metade do que um ensaio serve.
 *
 * O CPF é 000.000.000-00 DE PROPÓSITO. Ele reprova no dígito
 * verificador, então nenhuma nota fiscal sai com ele — a barreira que
 * protege o cadastro de teste continua de pé. O portal não valida
 * dígito, só compara os números, então entra normalmente. Um CPF
 * "válido" inventado seria o caminho para o cadastro de teste virar
 * faturável no dia em que alguém esquecesse o que ele é.
 *
 * O preço disso: quem digitar esse CPF e essa data entra no portal e vê
 * os pedidos de teste. Não há dado real ali dentro, e o `--limpar`
 * apaga o cadastro junto — mas é bom saber que a porta existe.
 */
const CPF_TESTE = '000.000.000-00';
const NASCIMENTO_TESTE = '2000-01-01';

/** Data relativa a hoje, para o teste continuar valendo semana que vem. */
const dia = n => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

/** PV-000042 — o mesmo código que a tela mostra. */
const pv = n => `PV-${String(n).padStart(4, '0')}`;

// ── A RÉGUA ─────────────────────────────────────────────────
// A mesma ordem de lib/atencao.js: o começo vale para todo pedido, a
// serigrafia só existe onde há o que gravar, e o fim volta a valer para
// os dois. O histórico de um pedido é esta lista cortada no status dele.
const INICIO = [
  'iniciando_pedido', 'aguardando_financeiro', 'pagamento_confirmado',
  'aguardando_estoque', 'estoque_confirmado',
];
const SERIGRAFIA = [
  'aguardando_arte', 'arte_aprovada', 'aguardando_vegetal', 'vegetal_impresso',
  'aguardando_revelacao', 'revelacao_finalizada',
];
const FIM = [
  'aguardando_producao', 'producao_finalizada', 'aguardando_qualidade',
  'qualidade_finalizada', 'aguardando_embalagem', 'embalagem_finalizada',
  'aguardando_foto', 'foto_enviada', 'aguardando_coleta',
];

function trilha(alvo, personalizado) {
  const passos = [...INICIO, ...(personalizado ? SERIGRAFIA : []), ...FIM];
  const i = passos.indexOf(alvo);
  if (i < 0) throw new Error(`Status fora da régua: ${alvo}`);
  return passos.slice(0, i + 1);
}

/**
 * Os marcos espalhados entre "nasceu há N dias" e "duas horas atrás",
 * no mesmo formato que lib/fluxoPedido.js grava.
 */
function historico(passos, diasAtras, usuario) {
  const fim = Date.now() - 2 * 3600e3;
  const ini = Date.now() - diasAtras * 86400e3;
  const salto = passos.length > 1 ? (fim - ini) / (passos.length - 1) : 0;
  return passos.map((action, i) => ({
    stage: 'status',
    action,
    at: new Date(ini + i * salto).toISOString(),
    user_id: usuario.id,
    user: usuario.name,
  }));
}

// ── A arte de teste ─────────────────────────────────────────
// Um SVG gerado aqui e subido no MESMO bucket público em que a rota de
// upload guarda a arte de verdade (lib/storage.js → artes-pedido).
// Podia ser uma URL inventada; seria um card de arte quebrado na tela,
// e a diferença entre "sem arte" e "com arte que não abre" é justamente
// o que estes testes precisam mostrar.
const svgArte = (codigo, linha1, linha2 = 'NAO PRODUZIR - arquivo gerado para teste do sistema') =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="500" viewBox="0 0 900 500">
  <rect width="900" height="500" fill="#0f172a"/>
  <rect x="18" y="18" width="864" height="464" fill="none" stroke="#e8187a" stroke-width="6" stroke-dasharray="20 14"/>
  <text x="450" y="190" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="76" font-weight="bold" fill="#e8187a">ARTE DE TESTE</text>
  <text x="450" y="270" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="40" fill="#22d3ee">${codigo}</text>
  <text x="450" y="340" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="28" fill="#e2e8f0">${linha1}</text>
  <text x="450" y="400" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="24" fill="#94a3b8">${linha2}</text>
</svg>`;

/** Sobe a arte falsa e devolve a URL pública (ou lança). */
async function subirArte(codigo, linha1, linha2) {
  const svg = svgArte(codigo, linha1, linha2);
  const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;
  const url = await uploadDataUrl(dataUrl, 'artes-pedido');
  if (!url) throw new Error(`Não consegui subir a arte de ${codigo}.`);
  return url;
}

// ── A base ──────────────────────────────────────────────────
async function empresaEUsuario() {
  const { data: emp } = await supabase.from('EMPRESAS').select('id, name').limit(1);
  if (!emp?.length) throw new Error('Nenhuma empresa na base.');
  const tenantId = emp[0].id;

  const { data: usuario, error } = await supabase.from('USUARIOS')
    .select('id, name').eq('tenant_id', tenantId).eq('is_active', true)
    .eq('role', 'admin').limit(1).single();
  if (error) throw new Error(`Nenhum admin ativo: ${error.message}`);

  return { tenantId, empresa: emp[0].name, usuario };
}

/**
 * O cliente de teste, criado uma vez e reaproveitado por todos os
 * cenários — é o mesmo comprador ensaiando compras diferentes.
 *
 * `doc_digits` NÃO entra no insert: é coluna gerada a partir do
 * cpf_cnpj (migração 015), e escrever nela é erro do Postgres.
 *
 * O cadastro que já existe sem CPF ou sem nascimento é COMPLETADO, e
 * não recriado: os pedidos que já apontam para ele continuariam
 * apontando para o cadastro velho, e o portal seguiria fechado.
 */
async function garantirCliente(tenantId, assinatura) {
  const campos = {
    cpf_cnpj: CPF_TESTE,
    birth_date: NASCIMENTO_TESTE,
  };

  const { data: existente } = await supabase.from('CLIENTES')
    .select('id, name, display_id, cpf_cnpj, birth_date')
    .eq('tenant_id', tenantId).eq('name', CLIENTE_TESTE).maybeSingle();

  if (existente) {
    const faltando = Object.entries(campos).filter(([k]) => !existente[k]);
    if (!faltando.length) return { cliente: existente, criado: false, completado: false };

    const { data, error } = await supabase.from('CLIENTES')
      .update(Object.fromEntries(faltando)).eq('id', existente.id)
      .select('id, name, display_id, cpf_cnpj, birth_date').single();
    if (error) throw new Error(`Cliente de teste: ${error.message}`);
    return { cliente: data, criado: false, completado: true };
  }

  const { data, error } = await supabase.from('CLIENTES').insert({
    tenant_id: tenantId,
    type: 'PF',
    name: CLIENTE_TESTE,
    email: 'teste@teste.invalid',
    is_active: true,
    ...campos,
    notes: `${MARCA} cadastro criado por ${assinatura}. Não faturar, não emitir nota. `
      + `Portal do cliente (/acompanhar): CPF ${CPF_TESTE} + nascimento ${NASCIMENTO_TESTE}.`,
  }).select('id, name, display_id, cpf_cnpj, birth_date').single();
  if (error) throw new Error(`Cliente de teste: ${error.message}`);
  return { cliente: data, criado: true, completado: false };
}

/** Continua de onde a numeração parou, para não colidir com pedido real. */
async function ultimoNumero(tenantId) {
  const { data } = await supabase.from('VENDAS')
    .select('number').eq('tenant_id', tenantId).order('number', { ascending: false }).limit(1);
  return data?.[0]?.number || 0;
}

/** Os pedidos que um script criou — reconhecidos pela assinatura na nota. */
async function pedidosDe(tenantId, assinatura) {
  const { data } = await supabase.from('VENDAS')
    .select('id, number, artwork_url, VENDA_ITENS(id, customization)')
    .eq('tenant_id', tenantId)
    .like('notes', `${MARCA}%`)
    .like('notes', `%${assinatura}%`);
  return data || [];
}

/**
 * DESFAZER O ENSAIO INTEIRO.
 *
 * Apaga os pedidos do script, os itens, as artes no Storage e — só se
 * não sobrou pedido nenhum nele — o cliente de teste. As artes contam
 * as do pedido E as dos itens: num carrinho com três personalizados são
 * três arquivos, e apagar só o do pedido deixaria dois órfãos num
 * bucket público, que é lixo que ninguém acha depois.
 */
async function limparPor(tenantId, assinatura) {
  const alvos = await pedidosDe(tenantId, assinatura);

  if (!alvos.length) {
    console.log('Nada deste script para apagar.');
  } else {
    const urls = new Set();
    for (const v of alvos) {
      if (v.artwork_url) urls.add(v.artwork_url);
      for (const it of v.VENDA_ITENS || []) {
        const u = it.customization?.arte_cliente?.url;
        if (u) urls.add(u);
      }
    }
    const caminhos = [...urls].map(u => u.split(`/${BUCKET}/`)[1]).filter(Boolean);
    if (caminhos.length) {
      const { error } = await supabase.storage.from(BUCKET).remove(caminhos);
      if (error) console.warn('Artes no Storage:', error.message);
      else console.log(`Artes removidas do Storage: ${caminhos.length}`);
    }

    await supabase.from('VENDA_ITENS').delete().in('sale_id', alvos.map(v => v.id));
    await supabase.from('VENDAS').delete().in('id', alvos.map(v => v.id));
    console.log(`Pedidos apagados: ${alvos.map(v => pv(v.number)).join(', ')}`);
  }

  const { data: cli } = await supabase.from('CLIENTES')
    .select('id').eq('tenant_id', tenantId).eq('name', CLIENTE_TESTE).maybeSingle();
  if (cli) {
    const { count } = await supabase.from('VENDAS')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId).eq('customer_id', cli.id);
    if (!count) {
      await supabase.from('CLIENTES').delete().eq('id', cli.id);
      console.log(`Cliente de teste removido: ${CLIENTE_TESTE}`);
    } else {
      console.log(`Cliente de teste MANTIDO — ainda tem ${count} pedido(s).`);
    }
  }
}

module.exports = {
  MARCA, CLIENTE_TESTE, CPF_TESTE, NASCIMENTO_TESTE,
  dia, pv, trilha, historico, svgArte, subirArte,
  empresaEUsuario, garantirCliente, ultimoNumero, pedidosDe, limparPor,
};
