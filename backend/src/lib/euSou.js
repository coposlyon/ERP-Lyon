// ============================================================
// QUEM É O COLABORADOR POR TRÁS DO USUÁRIO LOGADO.
//
// Esta pergunta era respondida em DOIS lugares com respostas
// diferentes: o app de marcação casava só por `CLIENTES.email`, e o
// portal casava por `admission_data.access_email` OU `email`. O
// resultado é o pior tipo de bug de RH — silencioso e assimétrico:
// quem tivesse e-mail de acesso diferente do e-mail pessoal batia o
// ponto ("não encontrado") e abria o portal, ou o contrário.
//
// Identidade é uma só. Ela mora aqui, e as duas telas perguntam para
// o mesmo lugar.
//
// A ordem do casamento importa:
//   1. access_email — o campo que a admissão preenche PARA criar o
//      login. É a ligação declarada, e ganha de qualquer outra.
//   2. email        — o e-mail pessoal do cadastro. Vale como
//      fallback dos cadastros antigos, feitos antes de existir campo
//      de acesso.
//
// Sem a ordem, um cadastro cujo e-mail pessoal coincide com o e-mail
// de acesso de OUTRA pessoa poderia responder primeiro — e alguém
// abriria o holerite alheio.
// ============================================================
const supabase = require('../config/supabase');

const minusculo = v => String(v || '').trim().toLowerCase();

const CAMPOS = 'id, name, cpf_cnpj, birth_date, phone, email, address, created_at, admission_data, is_active';

/**
 * O cadastro de colaborador (CLIENTES type 'CO') ligado a quem está
 * logado. `null` quando não há vínculo — e quem chama decide o que
 * dizer, porque a frase certa depende da tela.
 */
async function euSou(req, { campos = CAMPOS } = {}) {
  const emails = [minusculo(req.userProfile?.email), minusculo(req.user?.email)].filter(Boolean);
  if (!emails.length) return null;

  const { data } = await supabase.from('CLIENTES')
    .select(campos)
    .eq('tenant_id', req.tenantId).eq('type', 'CO');

  const pessoas = data || [];
  const porAcesso = pessoas.find(p => emails.includes(minusculo(p.admission_data?.access_email)));
  if (porAcesso) return porAcesso;
  return pessoas.find(p => emails.includes(minusculo(p.email))) || null;
}

/**
 * A resposta de "você não está ligado a um cadastro".
 *
 * Não é um 403 de permissão: a pessoa TEM acesso, o que falta é o RH
 * ter escrito o e-mail de acesso na admissão. Por isso a dica diz onde
 * se resolve, em vez de mandar a pessoa procurar suporte.
 */
function semVinculo(res) {
  return res.status(404).json({
    error: 'Seu usuário não está ligado a um cadastro de colaborador.',
    dica: 'O RH precisa preencher o e-mail de acesso na admissão para o portal reconhecer você.',
    code: 'NO_EMPLOYEE',
  });
}

module.exports = { euSou, semVinculo };
