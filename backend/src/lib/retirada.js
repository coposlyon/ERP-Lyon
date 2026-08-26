// ============================================================
// A AUTORIZAÇÃO DE RETIRADA.
//
// Quem vai buscar o pedido, e como isso é conferido na porta.
//
// A regra de negócio inteira cabe em três frases:
//
//   1. O cliente informa NOME e CPF de quem vai retirar.
//   2. Essa pessoa apresenta documento no ato.
//   3. Se aparecer OUTRA pessoa, ela retira apresentando o código do
//      pedido (PV-000123) — combinado por WhatsApp com o cliente — e
//      substitui a autorização anterior.
//
// A terceira existe porque a segunda sozinha trava o mundo real: quem
// ia buscar ficou doente, mandou o irmão, e o pedido não pode virar
// refém de um formulário. O código do pedido é o segredo compartilhado
// que só quem comprou tem — e a substituição fica registrada, com data,
// no lugar da anterior.
// ============================================================

const soDigitos = v => String(v || '').replace(/\D/g, '');

/**
 * CPF válido — dígito verificador, não só contagem de números.
 *
 * Conferir só o tamanho aceita 111.111.111-11 e qualquer sequência
 * digitada de qualquer jeito. O documento vai ser conferido na porta:
 * um CPF que não existe transforma a conferência num constrangimento
 * com o cliente parado no balcão.
 */
function cpfValido(valor) {
  const cpf = soDigitos(valor);
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  const digito = (ate) => {
    let soma = 0;
    for (let i = 0; i < ate; i++) soma += Number(cpf[i]) * (ate + 1 - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return digito(9) === Number(cpf[9]) && digito(10) === Number(cpf[10]);
}

/** 02005463922 → 020.054.639-22 */
function formatarCpf(valor) {
  const d = soDigitos(valor);
  return d.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : String(valor || '');
}

/**
 * O CPF de volta para a tela, mascarado.
 *
 * Quem digitou já sabe o número; mostrar inteiro só serve para vazar em
 * print de tela e em ombro alheio. O suficiente para a pessoa reconhecer
 * o que informou são os três do meio: ***.054.639-**
 */
function mascararCpf(valor) {
  const d = soDigitos(valor);
  if (d.length !== 11) return null;
  return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`;
}

/** Nome de gente: pelo menos duas palavras, sem números. */
function nomeValido(valor) {
  const nome = String(valor || '').trim().replace(/\s+/g, ' ');
  if (nome.length < 5 || /\d/.test(nome)) return false;
  return nome.split(' ').filter(p => p.length >= 2).length >= 2;
}

/** Monta o registro que vai para o banco. Devolve `{ erro }` quando não dá. */
function montarAutorizacao({ nome, cpf, origem = 'portal' }) {
  const limpo = String(nome || '').trim().replace(/\s+/g, ' ');
  if (!nomeValido(limpo)) {
    return { erro: 'Informe o nome completo de quem vai retirar (nome e sobrenome).' };
  }
  if (!cpfValido(cpf)) {
    return { erro: 'CPF inválido. Confira os números e tente de novo.' };
  }
  return {
    autorizacao: {
      nome: limpo,
      cpf: soDigitos(cpf),
      informado_em: new Date().toISOString(),
      informado_por: origem,
    },
  };
}

/**
 * O que a TELA DO CLIENTE pode ver.
 *
 * CPF mascarado, e nada além do que ele mesmo informou.
 */
function paraOCliente(pickup) {
  if (!pickup?.nome) return null;
  return {
    nome: pickup.nome,
    cpf: mascararCpf(pickup.cpf),
    informado_em: pickup.informado_em || null,
  };
}

/**
 * O que o BALCÃO precisa ver — o CPF inteiro, que é o que confere com
 * o documento na mão da pessoa. Só para quem está dentro do ERP.
 */
function paraOBalcao(pickup) {
  if (!pickup?.nome) return null;
  return {
    nome: pickup.nome,
    cpf: formatarCpf(pickup.cpf),
    informado_em: pickup.informado_em || null,
    informado_por: pickup.informado_por || null,
  };
}

module.exports = { cpfValido, formatarCpf, mascararCpf, nomeValido, montarAutorizacao, paraOCliente, paraOBalcao };
