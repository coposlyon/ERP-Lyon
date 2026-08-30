// ============================================================
// UM COLABORADOR DE EXEMPLO, COMPLETO, PARA TESTAR O RH.
//
// O modulo de RH so mostra o que sabe fazer quando ha alguem dentro
// dele: a tela de Documentos com pendencia de verdade, o aceite das
// politicas com data e versao, os dados do conjuge que so aparecem
// quando o estado civil pede, a certidao do filho que so e cobrada
// quando existe filho. Com o cadastro vazio, todas essas regras ficam
// invisiveis - e e justamente nelas que o erro se esconde.
//
// A RENATA E FICTICIA, e de proposito: CPF, RG, PIS e conta bancaria
// sao numeros invalidos montados para teste. Nada aqui pode ser
// confundido com pessoa real nem ir para o eSocial.
//
// IDEMPOTENTE: rodar de novo apaga a Renata anterior e recria. Assim da
// para testar o fluxo do zero quantas vezes for preciso.
//
// Rodar:  node scripts/seed-colaborador-exemplo.js
//         node scripts/seed-colaborador-exemplo.js --remover
// ============================================================
require('dotenv').config();
const supabase = require('../src/config/supabase');
const { exigidosPara } = require('../src/lib/documentosCatalogo');

const REMOVER = process.argv.includes('--remover');
const CPF = '11122233344';            // invalido de proposito
const NOME = 'RENATA ALVES MOREIRA (EXEMPLO)';

// O que ja veio e o que ainda falta. Uma admissao pela metade e mais
// util para testar que uma completa: e a metade que exercita a tela de
// pendencias, o bloqueio e o alerta.
const ANEXADOS = [
  'rg', 'cpf', 'certidao_nascimento', 'comprovante_residencia', 'foto',
  'ctps', 'pis', 'comprovante_bancario', 'certidao_casamento', 'conjuge_documento',
  'filho_certidao', 'contrato_trabalho', 'termo_experiencia', 'ficha_registro',
  'termo_ciencia', 'declaracao_dependentes',
];

(async () => {
  const { data: emp } = await supabase.from('EMPRESAS').select('id').limit(1).maybeSingle();
  if (!emp) { console.error('Nenhuma empresa cadastrada.'); process.exit(1); }
  const t = emp.id;

  // ── limpa a anterior (idempotencia) ───────────────────────
  const { data: antiga } = await supabase.from('CLIENTES')
    .select('id').eq('tenant_id', t).eq('doc_digits', CPF).maybeSingle();
  if (antiga) {
    await supabase.from('RH_POLITICAS_ACEITES').delete().eq('employee_id', antiga.id);
    await supabase.from('RH_DOCUMENTOS').delete().eq('employee_id', antiga.id);
    await supabase.from('RH_ADMISSOES').delete().eq('employee_id', antiga.id);
    await supabase.from('CLIENTES').delete().eq('id', antiga.id);
    console.log('Renata anterior removida.');
  }
  if (REMOVER) { console.log('Pronto - nada foi recriado (--remover).'); return; }

  // ── 1. o colaborador ──────────────────────────────────────
  const admission = {
    // Dados pessoais (etapa 1)
    nome_social: 'Renata Moreira',
    estado_civil: 'Casado',
    genero: 'Feminino',
    nacionalidade: 'Brasileira',
    mother_name: 'Sonia Alves Moreira',
    father_name: 'Jorge Luiz Moreira',
    rg_emissor: 'SSP/PR',
    rg_emissao: '2012-03-18',
    pis: '12345678901',
    tem_cnh: true,
    cnh: { numero: '04812345678', categoria: 'B', validade: '2031-06-30', primeira: '2011-06-30' },

    conjuge: { nome: 'Marcelo Moreira', cpf: '55566677788', nascimento: '1989-11-02', telefone: '(43) 98811-2233' },
    filhos: [
      { nome: 'Helena Alves Moreira', nascimento: '2019-04-12', genero: 'Feminino', cpf: '99988877766' },
    ],

    // Dados trabalhistas (etapa 2)
    sector: 'COMERCIAL',
    role: 'Vendedora Interna',
    cbo: '5211-10',
    contract_type: 'CLT',
    start_date: '2027-01-05',
    experiencia_dias: 90,
    experiencia_fim: '2027-04-05',
    scale: '44 horas semanais',
    salary: 2400,
    tipo_salario: 'Mensal',
    centro_custo: 'COM-01 - Comercial',
    local_trabalho: 'Andira - PR',
    gestor: 'LAION CESAR FARINHA',
    modalidade: 'Presencial',

    work_start: '07:30', work_end: '17:48',
    intervalo_inicio: '12:00', intervalo_fim: '13:30',
    dias_trabalho: 'Segunda a Sexta',
    metodo_ponto: 'Reconhecimento Facial',
    tolerancia_min: 5,
    canal_notificacao: 'WhatsApp corporativo',
    justificativa_obrigatoria: true,
    exige_comprovante: true,

    commission_pct: 2,
    sales_goal: 15000,
    benefit_vt: true, benefit_vr: true, benefit_health: true,

    // Contrato e politicas (etapa 3)
    tipo_admissao: 'Admissao',
    contrato_inicio: '2027-01-05',
    contrato_fim: null,
    contrato_assinado_em: '2027-01-05T09:00:00.000Z',
    // O ACEITE E A DATA EM QUE FOI ACEITO, NAO UM SIM.
    //
    // A primeira versao gravou booleanos e inventou tres chaves que nao
    // existem ('seguranca', 'recursos', 'anticorrupcao'), deixando de
    // fora tres que existem. A tela faz `aceite.split('-')` para mostrar
    // "Aceito em 05/01/2027": com `true` no lugar da data, a etapa
    // Contrato e Politicas inteira caia em "Algo deu errado nesta tela".
    //
    // As chaves sao as de POLITICAS, em passos.jsx. Um exemplo que nao
    // usa as chaves de verdade nao testa nada.
    politicas: {
      termo_sistema: '2027-01-05',
      lgpd:          '2027-01-05',
      imagem:        '2027-01-05',
      epi:           '2027-01-05',
      conduta:       '2027-01-05',
      sigilo:        '2027-01-05',
    },

    // Acesso
    has_access: true,
    access_email: 'renata.moreira@lyoncopos.com.br',
    allowed_modules: ['sales', 'pedidos-vendedor'],
    attachments: [],
  };

  const { data: pessoa, error: erroPessoa } = await supabase.from('CLIENTES').insert({
    tenant_id: t, type: 'CO', name: NOME,
    cpf_cnpj: '111.222.333-44', rg_ie: '12.345.678-9',
    birth_date: '1992-07-21',
    email: 'renata.moreira@lyoncopos.com.br',
    phone: '(43) 3322-1100', mobile: '(43) 99911-2233',
    address: {
      zip: '86020-000', street: 'Rua Prefeito Faria Lima', number: '123',
      complement: 'Apto 45', neighborhood: 'Centro', city: 'Londrina', state: 'PR',
    },
    notes: 'Colaboradora de EXEMPLO criada por script para testar o modulo de RH. Dados ficticios.',
    is_active: true,
    admission_data: admission,
  }).select('id, name').single();
  if (erroPessoa) throw erroPessoa;
  console.log(`Colaboradora criada: ${pessoa.name}`);

  // ── 2. os documentos ──────────────────────────────────────
  //
  // O catalogo decide QUAIS documentos ela deve - casada e com uma
  // filha, entao entram os do conjuge e os da crianca. O script so
  // marca quais ja chegaram.
  const exigidos = exigidosPara({ admission_data: admission });
  const linhas = exigidos.map(d => {
    const anexado = ANEXADOS.includes(d.key);
    return {
      tenant_id: t, employee_id: pessoa.id,
      doc_key: d.key, type: d.key, description: d.titulo,
      category: d.categoria, origin: d.origem,
      required: !!d.obrigatorio,
      sem_validade: !!d.sem_validade,
      status: anexado ? 'anexado' : 'pendente',
      file_url: anexado ? `exemplo/renata/${d.key}.pdf` : null,
      document_date: anexado ? '2027-01-05' : null,
      expires_at: anexado && d.tem_validade ? '2027-12-31' : null,
      // `signed_by` e uuid do usuario que assinou, nao o nome - a
      // primeira versao deste script mandou o nome e o Postgres recusou.
      signed_at: anexado && d.assina ? '2027-01-05T09:00:00.000Z' : null,
    };
  });
  const { error: erroDocs } = await supabase.from('RH_DOCUMENTOS').insert(linhas);
  if (erroDocs) throw erroDocs;

  const faltando = linhas.filter(l => l.status === 'pendente' && l.required);
  console.log(`Documentos: ${linhas.length} no checklist, ${linhas.filter(l => l.status === 'anexado').length} anexados, ${faltando.length} obrigatorios pendentes`);
  if (faltando.length) console.log('  pendentes:', faltando.map(f => f.description).join(' | '));

  // ── 3. o aceite das politicas ─────────────────────────────
  const { data: politicas } = await supabase.from('RH_POLITICAS')
    .select('id, chave, versao').eq('tenant_id', t).eq('is_active', true);
  if (politicas?.length) {
    await supabase.from('RH_POLITICAS_ACEITES').insert(politicas.map(pol => ({
      tenant_id: t, politica_id: pol.id, employee_id: pessoa.id,
      versao: pol.versao, aceito_em: '2027-01-05T09:00:00.000Z',
      ip: '127.0.0.1', origem: 'seed-exemplo',
    })));
    console.log(`Politicas aceitas: ${politicas.length} (${politicas.map(p => p.chave).join(', ')})`);
  }

  // ── 4. o processo de admissao ─────────────────────────────
  const { error: erroAdm } = await supabase.from('RH_ADMISSOES').insert({
    tenant_id: t, employee_id: pessoa.id,
    candidate_name: NOME,
    stage: 'documentacao',
    expected_date: '2027-01-05',
    status: 'em_andamento',
  });
  if (erroAdm) console.log('(admissao nao criada:', erroAdm.message, ')');
  else console.log('Processo de admissao criado na etapa Documentacao.');

  console.log('\nPronto. Abra RH -> Colaboradores e procure por "RENATA".');
  console.log('Para remover:  node scripts/seed-colaborador-exemplo.js --remover');
})().catch(e => { console.error('ERRO:', e.message); process.exit(1); });
