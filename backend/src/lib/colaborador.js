// ============================================================
// O QUE UM CADASTRO DE COLABORADOR PRECISA TER PARA EXISTIR.
//
// Não é burocracia: cada campo desta lista é usado por uma conta que
// roda sozinha depois. Cadastro pela metade não fica "incompleto" —
// ele fica ERRADO em silêncio, e o erro só aparece no dia do
// fechamento, do eSocial ou da rescisão, quando já é tarde.
//
//   sem CARGO      → o eSocial rejeita o S-2200 e o vínculo não abre
//   sem ADMISSÃO   → férias, 13º e rescisão calculam sobre o nada
//   sem SALÁRIO    → a folha soma zero e ninguém percebe
//   sem ESCALA     → o ponto não sabe o que é atraso nem o que é falta
//   sem CONTRATO   → o catálogo de documentos cobra papel errado
//                    (estagiário não assina contrato CLT)
//   sem CPF        → não há como transmitir nada ao eSocial
//
// A lista mora AQUI, e não na tela, porque a tela não é a única porta:
// importação, integração e correção manual entram pela mesma API. Se a
// regra vivesse no formulário, bastaria não usar o formulário.
// ============================================================

/** Um valor que veio de formulário: '' e '  ' são vazio, 0 não é. */
const vazio = v => v == null || String(v).trim() === '';

/** Dinheiro digitado ('1.234,56') vira número. */
function numero(v) {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return v;
  const n = parseFloat(String(v).replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

// `etapa` aponta a etapa do cadastro onde o campo mora, para a tela
// levar a pessoa direto ao lugar do problema em vez de só reclamar.
const EXIGIDOS = [
  { campo: 'name', etapa: 1, rotulo: 'Nome',
    ok: c => !vazio(c.name),
    porque: 'É o nome que aparece na folha, no holerite e no eSocial.' },

  { campo: 'cpf_cnpj', etapa: 1, rotulo: 'CPF',
    ok: c => !vazio(c.cpf_cnpj),
    porque: 'Sem CPF nenhum evento do eSocial pode ser transmitido.' },

  { campo: 'sector', etapa: 2, rotulo: 'Departamento',
    ok: c => !vazio(c.admission_data?.sector),
    porque: 'Define o centro de custo e quem é o gestor que aprova.' },

  { campo: 'role', etapa: 2, rotulo: 'Cargo',
    ok: c => !vazio(c.admission_data?.role),
    porque: 'O eSocial rejeita a admissão (S-2200) sem cargo informado.' },

  { campo: 'contract_type', etapa: 2, rotulo: 'Tipo de contrato',
    ok: c => !vazio(c.admission_data?.contract_type),
    porque: 'Decide quais documentos são exigidos — estagiário não assina contrato CLT.' },

  { campo: 'start_date', etapa: 2, rotulo: 'Data de admissão',
    ok: c => !vazio(c.admission_data?.start_date),
    porque: 'Férias, 13º proporcional e rescisão são contados a partir dela.' },

  { campo: 'salary', etapa: 2, rotulo: 'Salário',
    ok: c => numero(c.admission_data?.salary) > 0,
    porque: 'Sem salário a folha fecha em zero sem avisar ninguém.' },

  { campo: 'scale_id', etapa: 2, rotulo: 'Escala / jornada',
    ok: c => !vazio(c.admission_data?.scale_id),
    porque: 'É a escala que diz o que é atraso, o que é falta e o que é hora extra.' },
];

/**
 * O que falta para este cadastro poder existir.
 * Devolve [] quando está tudo certo.
 */
function pendenciasDoCadastro(colaborador = {}) {
  return EXIGIDOS
    .filter(e => !e.ok(colaborador))
    .map(({ campo, etapa, rotulo, porque }) => ({ campo, etapa, rotulo, porque }));
}

/** A mensagem que a pessoa lê — direta, com o motivo junto. */
function mensagemDePendencias(pendencias) {
  if (!pendencias.length) return null;
  const nomes = pendencias.map(p => p.rotulo).join(', ');
  return pendencias.length === 1
    ? `Falta preencher: ${nomes}. ${pendencias[0].porque}`
    : `Faltam ${pendencias.length} campos obrigatórios: ${nomes}.`;
}

module.exports = { pendenciasDoCadastro, mensagemDePendencias, EXIGIDOS };
