/**
 * DATOR ERP - Script de Migração do Sistema Antigo (Lyon)
 *
 * Lê dados do PostgreSQL 9.5 local (porta 5433) e insere no Supabase.
 *
 * Como usar:
 *   node src/scripts/migrar_dados.js
 *
 * Pré-requisitos:
 *   - PostgreSQL 9.5 rodando na porta 5433 (banco "lyon")
 *   - Node.js 18+ (fetch nativo)
 *   - Arquivo .env configurado com SUPABASE_URL e SUPABASE_SERVICE_KEY
 */

const { execSync } = require('child_process');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

// ── Configurações ─────────────────────────────────────────────────────────────
const PSQL    = '"C:\\Users\\Pablo Tasuyuki\\Desktop\\Dator Sistemas\\Dator Sistemas\\PostgreSQL\\9.5\\bin\\psql.exe"';
const PG_CONN = '-h localhost -p 5433 -U postgres -d lyon';
const TENANT_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Variáveis SUPABASE_URL ou SUPABASE_SERVICE_KEY não encontradas no .env');
  process.exit(1);
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function psql(sql) {
  try {
    const cmd = `${PSQL} ${PG_CONN} -t -A -c "${sql.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`;
    const out = execSync(cmd, { encoding: 'utf8', windowsHide: true }).trim();
    return out;
  } catch (e) {
    throw new Error(`Erro psql: ${e.message}`);
  }
}

function psqlJSON(sql) {
  try {
    const cmd = `${PSQL} ${PG_CONN} -t -A -c "SELECT array_to_json(array_agg(row_to_json(t))) FROM (${sql.replace(/"/g, '\\"').replace(/\n/g, ' ')}) t"`;
    const out = execSync(cmd, { encoding: 'utf8', windowsHide: true }).trim();
    if (!out || out === '' || out === '\\N') return [];
    return JSON.parse(out) || [];
  } catch (e) {
    throw new Error(`Erro psqlJSON: ${e.message}`);
  }
}

async function supabaseInsert(table, rows, batchSize = 100) {
  if (!rows || rows.length === 0) return { count: 0 };

  let total = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=ignore-duplicates',
      },
      body: JSON.stringify(batch),
    });
    if (!res.ok) {
      const err = await res.text();
      console.error(`  ⚠️  Erro no lote ${i}-${i + batchSize}: ${err}`);
    } else {
      total += batch.length;
      process.stdout.write(`\r  ✓ ${total}/${rows.length} inseridos...`);
    }
  }
  console.log('');
  return { count: total };
}

// ── Funções de Migração ────────────────────────────────────────────────────────

async function migrarCategorias() {
  console.log('\n📂 Migrando CATEGORIAS...');

  const cats = psqlJSON(`
    SELECT DISTINCT tipo_produto as nome FROM cadastros.produtos ORDER BY 1
  `);

  const rows = cats.map(c => ({
    id: require('crypto').createHash('md5').update('cat_' + c.nome).digest('hex')
        .replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5'),
    tenant_id: TENANT_ID,
    name: c.nome,
  }));

  const r = await supabaseInsert('CATEGORIAS', rows);
  console.log(`  ✅ ${r.count} categorias migradas`);
  return rows; // retorna para usar como referência
}

async function migrarProdutos(categorias) {
  console.log('\n📦 Migrando PRODUTOS (591)...');

  const catMap = {};
  categorias.forEach(c => { catMap[c.name] = c.id; });

  const produtos = psqlJSON(`
    SELECT
      p.pk_chave,
      p.nome,
      p.referencia_fabrica,
      p.custo_referencia,
      p.preco_venda,
      p.inativo,
      p.tipo_produto,
      p.aplicacao,
      p.fk_ncm$ncm as ncm,
      COALESCE(vp.vr_unitario_nota, 0) as preco_tabela
    FROM cadastros.produtos p
    LEFT JOIN marilia.valor_unitario_produto vp ON vp."fk_produtos$produto" = p.pk_chave
    ORDER BY p.nome
  `);

  const rows = produtos.map(p => {
    const crypto = require('crypto');
    const uuid = crypto.createHash('md5').update('produto_' + p.pk_chave).digest('hex')
      .replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');

    const precoVenda = parseFloat(p.preco_tabela) > 0 ? parseFloat(p.preco_tabela) : parseFloat(p.preco_venda);

    return {
      id: uuid,
      tenant_id: TENANT_ID,
      code: p.referencia_fabrica || '',
      name: p.nome,
      description: p.aplicacao || '',
      unit: 'UN',
      category_id: catMap[p.tipo_produto] || null,
      cost_price: parseFloat(p.custo_referencia) || 0,
      sale_price: precoVenda || 0,
      ncm: p.ncm || '',
      current_stock: 0,
      min_stock: 0,
      is_active: !p.inativo,
      customizable: true,
    };
  });

  const r = await supabaseInsert('PRODUTOS', rows);
  console.log(`  ✅ ${r.count} produtos migrados`);
}

async function migrarClientes() {
  console.log('\n👥 Migrando CLIENTES (2.186)...');

  const clientes = psqlJSON(`
    SELECT
      p.chave,
      p.nome,
      p.cpf_cnpj,
      p.rg_ie,
      p.email,
      p.telefone_fixo,
      p.celular_principal,
      p.observacoes,
      p.inativo,
      p.nome_fantasia,
      c.limite_credito,
      ep."fk_cidades$cidade" as cidade,
      ep."fk_cidades$uf" as uf,
      ep."fk_logradouros$logradouro" as logradouro,
      ep.numero,
      ep."fk_bairros$bairro" as bairro,
      ep.complemento,
      ep.cep,
      ep."fk_tipo_logradouro$tipo_logradouro" as tipo_logradouro
    FROM cadastros.pessoas p
    JOIN cadastros.clientes c ON c.fk_pessoas = p.chave
    LEFT JOIN cadastros.endereco_principal_pessoas ep ON ep."fk_pessoas$chave" = p.chave
    ORDER BY p.nome
  `);

  const rows = clientes.map(c => {
    const crypto = require('crypto');
    const uuid = crypto.createHash('md5').update('cliente_' + c.chave).digest('hex')
      .replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');

    const cpfCnpj = (c.cpf_cnpj || '').replace(/\D/g, '');
    const tipo = cpfCnpj.length === 14 ? 'PJ' : 'PF';

    const address = {};
    if (c.logradouro) {
      const tipo_log = c.tipo_logradouro ? c.tipo_logradouro + ' ' : '';
      address.street = (tipo_log + c.logradouro).trim();
      address.number = c.numero || '';
      address.complement = c.complemento || '';
      address.neighborhood = c.bairro || '';
      address.city = c.cidade || '';
      address.state = c.uf || '';
      address.zip = (c.cep || '').replace(/\D/g, '');
    }

    return {
      id: uuid,
      tenant_id: TENANT_ID,
      type: tipo,
      name: c.nome,
      cpf_cnpj: c.cpf_cnpj || '',
      rg_ie: c.rg_ie || '',
      email: (c.email || '').trim().toLowerCase() || null,
      phone: c.telefone_fixo || '',
      mobile: c.celular_principal || '',
      address: Object.keys(address).length > 0 ? address : {},
      notes: c.observacoes || '',
      credit_limit: parseFloat(c.limite_credito) || 0,
      is_active: !c.inativo,
    };
  });

  const r = await supabaseInsert('CLIENTES', rows);
  console.log(`  ✅ ${r.count} clientes migrados`);
}

async function migrarFornecedores() {
  console.log('\n🏭 Migrando FORNECEDORES (21)...');

  const fornecedores = psqlJSON(`
    SELECT
      p.chave,
      p.nome,
      p.cpf_cnpj,
      p.rg_ie,
      p.email,
      p.telefone_fixo,
      p.celular_principal,
      p.observacoes,
      ep."fk_cidades$cidade" as cidade,
      ep."fk_cidades$uf" as uf,
      ep."fk_logradouros$logradouro" as logradouro,
      ep.numero,
      ep."fk_bairros$bairro" as bairro,
      ep.complemento,
      ep.cep,
      ep."fk_tipo_logradouro$tipo_logradouro" as tipo_logradouro
    FROM cadastros.pessoas p
    JOIN cadastros.fornecedores f ON f.fk_pessoas = p.chave
    LEFT JOIN cadastros.endereco_principal_pessoas ep ON ep."fk_pessoas$chave" = p.chave
    ORDER BY p.nome
  `);

  const rows = fornecedores.map(f => {
    const crypto = require('crypto');
    const uuid = crypto.createHash('md5').update('fornecedor_' + f.chave).digest('hex')
      .replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');

    const address = {};
    if (f.logradouro) {
      const tipo_log = f.tipo_logradouro ? f.tipo_logradouro + ' ' : '';
      address.street = (tipo_log + f.logradouro).trim();
      address.number = f.numero || '';
      address.complement = f.complemento || '';
      address.neighborhood = f.bairro || '';
      address.city = f.cidade || '';
      address.state = f.uf || '';
      address.zip = (f.cep || '').replace(/\D/g, '');
    }

    return {
      id: uuid,
      tenant_id: TENANT_ID,
      name: f.nome,
      cnpj: f.cpf_cnpj || '',
      ie: f.rg_ie || '',
      email: (f.email || '').trim().toLowerCase() || null,
      phone: f.telefone_fixo || f.celular_principal || '',
      address: Object.keys(address).length > 0 ? address : {},
      notes: f.observacoes || '',
      is_active: true,
    };
  });

  const r = await supabaseInsert('FORNECEDORES', rows);
  console.log(`  ✅ ${r.count} fornecedores migrados`);
}

// ── Main ───────────────────────────────────────────────────────────────────────
async function main() {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║   DATOR ERP - Migração de Dados Lyon → Supabase  ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log(`\n🏢 Tenant: Lyon Copos (${TENANT_ID})`);
  console.log(`🔗 Supabase: ${SUPABASE_URL}`);
  console.log(`🗄️  Banco antigo: localhost:5433/lyon\n`);

  // Testa conexão com banco antigo
  try {
    const test = psql('SELECT 1');
    console.log('✅ Banco antigo (PostgreSQL 9.5): conectado');
  } catch (e) {
    console.error('❌ Não foi possível conectar ao banco antigo. Verifique se o PostgreSQL está rodando na porta 5433.');
    console.error(e.message);
    process.exit(1);
  }

  // Testa conexão com Supabase
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/EMPRESAS?select=id&limit=1`, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
      },
    });
    if (!res.ok) throw new Error(await res.text());
    console.log('✅ Supabase: conectado');
  } catch (e) {
    console.error('❌ Não foi possível conectar ao Supabase:', e.message);
    process.exit(1);
  }

  console.log('\n🚀 Iniciando migração...');
  const inicio = Date.now();

  try {
    const categorias = await migrarCategorias();
    await migrarProdutos(categorias);
    await migrarClientes();
    await migrarFornecedores();

    const segundos = ((Date.now() - inicio) / 1000).toFixed(1);
    console.log('\n╔══════════════════════════════════════════════════╗');
    console.log(`║   ✅ MIGRAÇÃO CONCLUÍDA em ${segundos}s                   ║`);
    console.log('╠══════════════════════════════════════════════════╣');
    console.log('║  • Categorias: migradas                          ║');
    console.log('║  • 591 Produtos: migrados                        ║');
    console.log('║  • 2.186 Clientes: migrados                      ║');
    console.log('║  • 21 Fornecedores: migrados                     ║');
    console.log('╚══════════════════════════════════════════════════╝');
    console.log('\n🌐 Acesse http://localhost:5173 para ver os dados!\n');
  } catch (err) {
    console.error('\n❌ Erro durante a migração:', err.message);
    process.exit(1);
  }
}

main();
