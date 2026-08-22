// ============================================================
// O QUE ESTÁ ESCRITO NAS TELAS DE CADASTRO.
//
// Os três links públicos (cliente, fornecedor, transportadora) são a
// mesma jornada em três vozes: abertura → vídeo → formulário →
// conclusão. Cada frase dessa jornada estava fixa no código, o que
// significava que trocar "Leva menos de 1 minuto" por outra coisa era
// tarefa de programador.
//
// Agora as frases moram aqui como PADRÃO e podem ser sobrescritas em
// Sites → Cadastro. O padrão continua no código de propósito: cadastro
// que ainda não foi personalizado (ou campo deixado em branco) não pode
// aparecer vazio para o cliente — cai no texto de fábrica.
//
// O TEXTO MUDA POR TIPO porque a promessa é outra. O cliente cadastra
// para andar com o pedido dele; a transportadora, para receber cotação.
// Prometer "continuidade ao seu pedido" a uma transportadora seria texto
// de enfeite, e texto de enfeite é o que ninguém lê.
//
// Esta lista é a mesma que o editor desenha (CAMPOS_CADASTRO) — campo novo
// acrescentado aqui aparece sozinho na tela de edição.
// ============================================================

const COMUM = {
  abertura_titulo: 'Realizar Cadastro',
  abertura_botao: 'INICIAR CADASTRO',
  video: true,
  form_botao: 'Enviar cadastro',
};

export const CADASTRO_PADRAO = {
  cliente: {
    ...COMUM,
    abertura_subtitulo: 'Preencha seus dados para iniciar seu atendimento e dar continuidade ao pedido.',
    abertura_promessa: 'Após o cadastro, você poderá dar continuidade ao seu pedido com mais agilidade.',
    abertura_ajuda: 'Precisa de ajuda? Fale com o vendedor',
    form_titulo: 'FAÇA O SEU CADASTRO NO NOSSO SISTEMA LYON COPOS!',
    form_subtitulo: 'Preencha seus dados abaixo. Leva menos de 1 minuto.',
    form_privacidade: 'Seus dados são usados apenas para atendimento e pedidos.',
    pergunta_instagram: 'Podemos publicar a foto do seu produto e te marcar no Instagram?',
  },
  fornecedor: {
    ...COMUM,
    abertura_subtitulo: 'Preencha os dados da sua empresa para iniciarmos o cadastro de fornecedor.',
    abertura_promessa: 'Após o cadastro, sua empresa poderá receber pedidos de compra da Lyon Copos.',
    // Fornecedor não tem vendedor da Lyon designado — mandá-lo "falar
    // com o vendedor" seria mandá-lo procurar alguém que não existe.
    abertura_ajuda: 'Precisa de ajuda? Fale com a Lyon Copos',
    form_titulo: 'CADASTRE SUA EMPRESA COMO FORNECEDORA DA LYON COPOS!',
    form_subtitulo: 'Preencha os dados da sua empresa abaixo. Leva menos de 1 minuto.',
    form_privacidade: 'Seus dados são usados apenas para o cadastro de fornecedores.',
  },
  transportadora: {
    ...COMUM,
    abertura_subtitulo: 'Preencha os dados da sua empresa para iniciarmos o cadastro de transportadora.',
    abertura_promessa: 'Após o cadastro, sua empresa poderá receber solicitações de cotação e coleta.',
    abertura_ajuda: 'Precisa de ajuda? Fale com a Lyon Copos',
    form_titulo: 'CADASTRE SUA TRANSPORTADORA NA LYON COPOS!',
    form_subtitulo: 'Preencha os dados da sua transportadora abaixo. Leva menos de 1 minuto.',
    form_privacidade: 'Seus dados são usados apenas para o cadastro de transportadoras.',
  },
};

/** Título do card final. Comum aos três — é a mesma porta de saída. */
export const DONE_PADRAO = {
  titulo: 'VOCÊ CONCLUIU O CADASTRO',
  mensagem: 'Você concluiu o cadastro! Volte para o WhatsApp.',
};

/**
 * O texto que a tela deve mostrar: o que foi salvo, e o padrão onde não
 * houver nada. Campo em branco NÃO vale como escolha — quem apagou o
 * texto quer o de fábrica de volta, não um espaço vazio na tela do
 * cliente.
 *
 * `cfg` é o objeto `cadastro` que /store devolve.
 */
export function textosCadastro(tipo, cfg) {
  const padrao = CADASTRO_PADRAO[tipo] || CADASTRO_PADRAO.cliente;
  const salvo = cfg?.textos?.[tipo] || {};
  const out = { ...padrao };
  for (const [k, v] of Object.entries(salvo)) {
    if (typeof v === 'boolean') out[k] = v;
    else if (typeof v === 'string' && v.trim()) out[k] = v;
  }
  return out;
}

// ── O que o editor desenha ──────────────────────────────────
// Uma lista só, para a tela de edição não virar um formulário escrito à
// mão que esquece o campo novo.
export const CAMPOS_CADASTRO = [
  {
    grupo: 'Abertura',
    ajuda: 'O primeiro cartão, antes do vídeo e do formulário.',
    campos: [
      { k: 'abertura_titulo',    label: 'Título' },
      { k: 'abertura_subtitulo', label: 'Subtítulo', linhas: 2 },
      { k: 'abertura_botao',     label: 'Texto do botão' },
      { k: 'abertura_ajuda',     label: 'Linha de ajuda', dica: 'O link no rodapé do cartão.' },
      { k: 'abertura_promessa',  label: 'Promessa (rodapé)', linhas: 2, dica: 'A frase com o escudo azul.' },
      { k: 'video',              label: 'Mostrar o vídeo de abertura', tipo: 'liga', dica: 'Desligado, o cliente vai direto da abertura para o formulário.' },
    ],
  },
  {
    grupo: 'Formulário',
    ajuda: 'A tela onde a pessoa preenche os dados.',
    campos: [
      { k: 'form_titulo',      label: 'Título', linhas: 2 },
      { k: 'form_subtitulo',   label: 'Subtítulo' },
      { k: 'form_botao',       label: 'Texto do botão de enviar' },
      { k: 'form_privacidade', label: 'Aviso de privacidade', linhas: 2, dica: 'A frase cinza embaixo do botão.' },
      { k: 'pergunta_instagram', label: 'Pergunta do Instagram', linhas: 2, so: 'cliente' },
    ],
  },
];

export const TIPOS_CADASTRO = [
  { key: 'cliente',        label: 'Cliente',        caminho: '/cadastro' },
  { key: 'fornecedor',     label: 'Fornecedor',     caminho: '/cadastro-fornecedor' },
  { key: 'transportadora', label: 'Transportadora', caminho: '/cadastro-transportadora' },
];

/** De qual site do módulo Sites veio → qual tipo de cadastro editar. */
export const TIPO_POR_SITE = {
  'cadastro': 'cliente',
  'cadastro-fornecedor': 'fornecedor',
  'cadastro-transportadora': 'transportadora',
};
