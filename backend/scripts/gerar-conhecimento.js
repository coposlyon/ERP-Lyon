// ============================================================
// A BASE DE CONHECIMENTO DO COPILOTO, EXTRAÍDA DO PRÓPRIO CÓDIGO.
//
// O pedido foi "a IA tem que saber TUDO sobre o sistema, todas as
// regras". A tentação é sentar e escrever um manual — e é a pior opção
// disponível: manual escrito à mão nasce incompleto, envelhece na
// primeira mudança de regra e, pior, o que estiver errado nele vira uma
// resposta errada dita com confiança para quem está trabalhando.
//
// Este repositório tem uma vantagem incomum: 207 dos seus arquivos
// abrem com um bloco de comentário explicando POR QUE aquilo existe e
// QUAL regra de negócio está sendo cumprida. São 176 KB de texto
// escrito por quem construiu cada peça, no momento em que a construiu.
// Esse é o manual, e ele já está escrito.
//
// Então este script não redige nada: ele COLHE. Varre backend, frontend
// e migrations, tira o cabeçalho de cada arquivo e monta um índice de
// trechos. Regra que mudar no código muda aqui na próxima geração; não
// há segunda cópia para sair de sincronia.
//
// POR QUE UM ARQUIVO GERADO, E NÃO LEITURA EM TEMPO REAL. Em produção
// (Discloud) o processo é o mesmo servidor que atende o ERP: varrer
// centenas de arquivos a cada pergunta gastaria disco e memória de uma
// máquina de 512 MB. O JSON é gerado aqui, versionado, e lido uma vez
// quando o servidor sobe.
//
// Rodar:  node scripts/gerar-conhecimento.js
// Rodar de novo sempre que regras mudarem de forma relevante.
// ============================================================

const fs = require('fs');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..', '..');
const SAIDA = path.resolve(__dirname, '..', 'src', 'lib', 'conhecimento.json');

const PASTAS = ['backend/src', 'migrations', 'frontend/src'];

// De onde veio o trecho, em português, para o copiloto poder citar.
// A ordem importa: o primeiro padrão que casar é o que vale.
const AREAS = [
  [/fluxoPedido|atencao|sales|pedido/i,            'Pedidos de venda e etapas'],
  [/production|producao|quality|qualidade/i,       'Produção'],
  [/financial|lancamento|contas|comprovante|pix|cobranca/i, 'Financeiro'],
  [/pricing|rateio|insumo|custo|price/i,           'Preço e custos'],
  [/hr|rh-|employee|colaborador|esocial|folha|ferias|ponto/i, 'Recursos Humanos'],
  [/product|catalogo|compatibilidade|configProduto/i, 'Produtos e catálogo'],
  [/customer|cliente|crm|prime/i,                  'Clientes'],
  [/stock|estoque|purchase|compra|supplier|fornecedor/i, 'Estoque e compras'],
  [/fiscal|nfe|nota|contabil/i,                    'Fiscal e contábil'],
  [/logistic|shipping|frete|transportadora|returns|devolucao/i, 'Logística'],
  [/public-|portal|loja|store|acompanhar/i,        'Loja e portal do cliente'],
  [/vendedor|area-vendedor|meta|territorio|municipio/i, 'Área do vendedor'],
  [/setor|permiss|user|auth|audit/i,               'Permissões e usuários'],
  [/settings|config|feriado|situac/i,              'Configurações'],
];

const areaDe = arquivo => (AREAS.find(([re]) => re.test(arquivo)) || [null, 'Geral'])[1];

/** O bloco de comentário do topo, se houver e se for explicativo. */
function cabecalho(texto) {
  const inicio = texto.slice(0, 8000);

  // // ====  ...  (o estilo desta casa)
  let m = inicio.match(/^(\s*(?:\/\/[^\n]*\n){6,})/);
  if (m) return m[1].replace(/^\s*\/\/ ?/gm, '');

  // -- ====  (migrations)
  m = inicio.match(/^(\s*(?:--[^\n]*\n){6,})/);
  if (m) return m[1].replace(/^\s*-- ?/gm, '');

  // /** ... */  com corpo de verdade
  m = inicio.match(/^\s*\/\*\*([\s\S]{200,3000}?)\*\//);
  if (m) return m[1].replace(/^\s*\* ?/gm, '');

  return null;
}

function varrer(dir, saida = []) {
  let itens;
  try { itens = fs.readdirSync(dir, { withFileTypes: true }); } catch { return saida; }
  for (const e of itens) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!/^(node_modules|\.git|dist|public)$/.test(e.name)) varrer(p, saida);
    } else if (/\.(js|jsx|sql)$/.test(e.name)) {
      saida.push(p);
    }
  }
  return saida;
}

function main() {
  const trechos = [];

  for (const pasta of PASTAS) {
    for (const arq of varrer(path.join(RAIZ, pasta))) {
      const rel = path.relative(RAIZ, arq).replace(/\\/g, '/');
      let bruto;
      try { bruto = fs.readFileSync(arq, 'utf8'); } catch { continue; }

      const texto = cabecalho(bruto);
      if (!texto) continue;

      const limpo = texto.replace(/^[=\s]+|[=\s]+$/g, '').replace(/\n{3,}/g, '\n\n').trim();
      if (limpo.length < 180) continue;   // cabeçalho curto demais não ensina nada

      // A primeira linha costuma ser o título ("074. CONFIGURAÇÃO
      // TÉCNICA DO PRODUTO"), e é o que melhor identifica o trecho.
      const titulo = limpo.split('\n')[0].replace(/^\d+\.\s*/, '').slice(0, 100);

      trechos.push({
        arquivo: rel,
        area: areaDe(rel),
        titulo,
        texto: limpo.slice(0, 4000),
      });
    }
  }

  trechos.sort((a, b) => a.area.localeCompare(b.area) || a.arquivo.localeCompare(b.arquivo));
  fs.writeFileSync(SAIDA, JSON.stringify(trechos), 'utf8');

  const porArea = {};
  for (const t of trechos) porArea[t.area] = (porArea[t.area] || 0) + 1;
  const kb = Math.round(fs.statSync(SAIDA).size / 1024);

  console.log(`${trechos.length} trechos, ${kb} KB -> src/lib/conhecimento.json\n`);
  for (const [a, n] of Object.entries(porArea).sort((x, y) => y[1] - x[1])) {
    console.log(`  ${String(n).padStart(3)}  ${a}`);
  }
}

main();
