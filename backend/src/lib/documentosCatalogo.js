// ============================================================
// O CATÁLOGO DE DOCUMENTOS DO RH.
//
// Esta lista é a resposta à pergunta que a tela de Documentos existe
// para responder: "o que está FALTANDO?". Sem ela, o sistema só sabe
// dizer o que já foi anexado — e ninguém descobre a ausência do ASO no
// dia da admissão, mas no dia da fiscalização.
//
// A TAXONOMIA É A DO KIT DA LYON, e ela importa:
//
//   gerado    o ERP produz (contrato, termo de experiência, ficha de
//             registro, acordo de jornada, termo de ciência, declaração
//             de dependentes). Não se pede ao colaborador o que o
//             próprio sistema sabe emitir.
//   politica  cadastrada e versionada UMA vez no Administrativo; o
//             colaborador aceita a versão vigente — o aceite vira o
//             Termo de Ciência, arquivado aqui automaticamente.
//   externo   emitido por terceiros (RG, CPF, CNH, CTPS, ASO,
//             certidões, comprovantes). O ERP nunca gera — só cobra,
//             recebe e guarda.
//
// AS CORREÇÕES DO ITEM 9 ESTÃO AQUI, NÃO NUM COMENTÁRIO SOLTO:
//   · Comprovante de residência é documento PESSOAL (não financeiro).
//   · Dados bancários viram "Comprovante Bancário" — o comprovante da
//     conta onde o salário cai.
//   · Termo de Ciência das Políticas existe como documento gerado.
//   · `sem_validade: true` marca o que NÃO VENCE. Contrato por prazo
//     indeterminado nunca deve aparecer na lista de "vencendo".
// ============================================================

const CATALOGO = [
  // ── Gerados pelo ERP ─────────────────────────────────────
  { key: 'contrato_trabalho', titulo: 'Contrato individual de trabalho', categoria: 'contratual',
    origem: 'gerado', obrigatorio: true, sem_validade: true, assina: true,
    contratos: ['CLT', 'Aprendiz', 'Temporário'],
    ajuda: 'Prazo indeterminado — não vence.' },
  { key: 'termo_experiencia', titulo: 'Contrato / termo de experiência', categoria: 'contratual',
    origem: 'gerado', obrigatorio: true, assina: true, valida_por: 'experiencia_fim',
    contratos: ['CLT'], ajuda: 'Vence no fim do período de experiência.' },
  { key: 'ficha_registro', titulo: 'Ficha de registro de empregado', categoria: 'contratual',
    origem: 'gerado', obrigatorio: true, sem_validade: true,
    contratos: ['CLT', 'Aprendiz', 'Temporário', 'Estágio'] },
  { key: 'acordo_jornada', titulo: 'Acordo individual de compensação de jornada', categoria: 'contratual',
    origem: 'gerado', obrigatorio: false, sem_validade: true, assina: true, contratos: ['CLT'] },
  { key: 'termo_ciencia', titulo: 'Termo de ciência e aceite das políticas', categoria: 'politica',
    origem: 'gerado', obrigatorio: true, sem_validade: true, assina: true,
    ajuda: 'Gerado a partir dos aceites da etapa Contrato e Políticas.' },
  { key: 'declaracao_dependentes', titulo: 'Declaração de dependentes', categoria: 'dependente',
    origem: 'gerado', obrigatorio: false, sem_validade: true,
    ajuda: 'Só quando houver dependentes cadastrados.', condicao: 'tem_filhos' },
  { key: 'aditivo', titulo: 'Aditivo contratual', categoria: 'contratual',
    origem: 'gerado', obrigatorio: false, sem_validade: true, assina: true,
    ajuda: 'Quando houver mudança de cargo, salário, jornada ou local.' },

  // ── Documentos pessoais (externos) ───────────────────────
  { key: 'rg', titulo: 'RG / documento de identidade', categoria: 'pessoal', origem: 'externo', obrigatorio: true, sem_validade: true },
  { key: 'cpf', titulo: 'CPF', categoria: 'pessoal', origem: 'externo', obrigatorio: true, sem_validade: true },
  { key: 'cnh', titulo: 'CNH', categoria: 'pessoal', origem: 'externo', obrigatorio: false, tem_validade: true },
  { key: 'certidao_nascimento', titulo: 'Certidão de nascimento ou casamento', categoria: 'pessoal', origem: 'externo', obrigatorio: true, sem_validade: true },
  { key: 'titulo_eleitor', titulo: 'Título de eleitor', categoria: 'pessoal', origem: 'externo', obrigatorio: false, sem_validade: true },
  // Item 9: comprovante de residência é documento PESSOAL.
  { key: 'comprovante_residencia', titulo: 'Comprovante de residência', categoria: 'pessoal', origem: 'externo',
    obrigatorio: true, tem_validade: true, ajuda: 'Conta de luz, água ou telefone — até 90 dias.' },
  { key: 'foto', titulo: 'Foto 3x4 / foto atual', categoria: 'pessoal', origem: 'externo', obrigatorio: false, sem_validade: true },
  { key: 'reservista', titulo: 'Certificado de reservista', categoria: 'pessoal', origem: 'externo', obrigatorio: false, sem_validade: true },
  { key: 'escolaridade', titulo: 'Comprovante de escolaridade', categoria: 'pessoal', origem: 'externo', obrigatorio: false, sem_validade: true },

  // ── Trabalhistas ─────────────────────────────────────────
  { key: 'ctps', titulo: 'Carteira de trabalho (CTPS)', categoria: 'trabalhista', origem: 'externo',
    obrigatorio: true, sem_validade: true, contratos: ['CLT', 'Aprendiz', 'Temporário'] },
  { key: 'pis', titulo: 'PIS / NIS / PASEP', categoria: 'trabalhista', origem: 'externo',
    obrigatorio: true, sem_validade: true, contratos: ['CLT', 'Aprendiz', 'Temporário'] },
  { key: 'antecedentes', titulo: 'Certidão de antecedentes criminais', categoria: 'trabalhista', origem: 'externo',
    obrigatorio: false, tem_validade: true, ajuda: 'Quando o cargo exigir.' },

  // ── Médicos ──────────────────────────────────────────────
  { key: 'aso_admissional', titulo: 'ASO — exame admissional', categoria: 'medico', origem: 'externo',
    obrigatorio: true, tem_validade: true, ajuda: 'Obrigatório ANTES do primeiro dia de trabalho (NR-7).' },
  { key: 'aso_periodico', titulo: 'ASO — exame periódico', categoria: 'medico', origem: 'externo',
    obrigatorio: false, tem_validade: true },
  { key: 'aso_retorno', titulo: 'ASO — retorno ao trabalho', categoria: 'medico', origem: 'externo',
    obrigatorio: false, tem_validade: true, ajuda: 'Exigido após afastamento acima de 30 dias.' },
  { key: 'aso_demissional', titulo: 'ASO — exame demissional', categoria: 'medico', origem: 'externo',
    obrigatorio: false, tem_validade: true, ajuda: 'No desligamento, quando aplicável.' },

  // ── Financeiro ───────────────────────────────────────────
  // Item 9: não é "dados bancários", é o COMPROVANTE da conta.
  { key: 'comprovante_bancario', titulo: 'Comprovante bancário', categoria: 'financeiro', origem: 'externo',
    obrigatorio: true, sem_validade: true,
    ajuda: 'Extrato, cartão ou contrato da conta onde o salário será depositado.' },

  // ── Cônjuge e filhos ─────────────────────────────────────
  { key: 'conjuge_documento', titulo: 'RG / CPF do cônjuge', categoria: 'conjuge', origem: 'externo',
    obrigatorio: false, sem_validade: true, condicao: 'casado' },
  { key: 'certidao_casamento', titulo: 'Certidão de casamento', categoria: 'conjuge', origem: 'externo',
    obrigatorio: false, sem_validade: true, condicao: 'casado' },
  { key: 'filho_certidao', titulo: 'Certidão de nascimento dos filhos', categoria: 'dependente', origem: 'externo',
    obrigatorio: false, sem_validade: true, condicao: 'tem_filhos' },
  { key: 'filho_vacinacao', titulo: 'Carteira de vacinação (até 7 anos)', categoria: 'dependente', origem: 'externo',
    obrigatorio: false, tem_validade: true, condicao: 'tem_filhos' },
  { key: 'filho_escolar', titulo: 'Comprovante escolar', categoria: 'dependente', origem: 'externo',
    obrigatorio: false, tem_validade: true, condicao: 'tem_filhos' },
];

const CATEGORIAS = {
  pessoal: 'Documentos pessoais',
  trabalhista: 'Documentos trabalhistas',
  contratual: 'Contratuais',
  medico: 'Médicos (ASO)',
  financeiro: 'Comprovante bancário',
  politica: 'Políticas internas',
  conjuge: 'Cônjuge',
  dependente: 'Filhos e dependentes',
};

const porChave = Object.fromEntries(CATALOGO.map(d => [d.key, d]));

/**
 * O que ESTA pessoa precisa entregar.
 *
 * O catálogo é geral; a exigência é individual. Estagiário não assina
 * contrato CLT, quem não tem filho não deve certidão de nascimento de
 * filho, e cobrar isso de todo mundo transforma a lista de pendências
 * em ruído que ninguém lê.
 */
function exigidosPara(colaborador) {
  const adm = colaborador?.admission_data || {};
  const contrato = adm.contract_type || 'CLT';
  const casado = /casad|uni/i.test(adm.estado_civil || '');
  const temFilhos = Array.isArray(adm.filhos) && adm.filhos.length > 0;

  return CATALOGO.filter(d => {
    if (d.contratos && !d.contratos.includes(contrato)) return false;
    if (d.condicao === 'casado' && !casado) return false;
    if (d.condicao === 'tem_filhos' && !temFilhos) return false;
    return true;
  }).map(d => ({
    ...d,
    // A obrigatoriedade pode mudar por condição: certidão de filho é
    // opcional no catálogo, mas quem TEM filho precisa entregar.
    obrigatorio: d.obrigatorio || (d.condicao === 'tem_filhos' && temFilhos && d.key === 'filho_certidao'),
  }));
}

module.exports = { CATALOGO, CATEGORIAS, porChave, exigidosPara };
