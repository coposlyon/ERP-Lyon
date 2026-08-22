// ============================================================
// O CATÁLOGO DOS SITES DO SISTEMA.
//
// O ERP não tem "um site": tem vários endereços públicos que o cliente
// abre sem login — a loja de lisos, o catálogo de personalizados, o
// acompanhamento do pedido e os três autocadastros. Cada um nasceu numa
// época e foi parar num canto diferente das Configurações: a loja numa
// aba, o catálogo numa tela do Administrativo, o resto em lugar nenhum.
//
// Esta lista é o índice único. Quem acrescentar um endereço público novo
// registra aqui — e ele aparece sozinho no menu, no painel de Sites e
// ganha pré-visualização, link para copiar e botão de editar.
//
// O CAMPO `editor` É O QUE MUDA A VIDA. Ele diz QUAL tela edita aquele
// site, para o Sites abrir o editor de verdade em vez de mandar o
// usuário procurar. `null` quer dizer "esta página não tem conteúdo
// editável" — e a tela diz isso na cara, em vez de fingir um botão.
//
// POR QUE ESTE ARQUIVO NÃO SE CHAMA sites.js. Chamava — e derrubava o
// painel. O Windows não distingue maiúsculas no nome do arquivo, então
// o `import('@/pages/Sites/Sites')` do App achava `sites.js` (que casa
// com "Sites.js") antes de chegar em `Sites.jsx`. O lazy recebia um
// módulo sem export default e a tela morria com o React #306 — só no
// pacote gerado, porque o servidor de desenvolvimento resolve
// diferente. Nome diferente do componente, problema impossível.
// ============================================================
import {
  Store, Palette, PackageSearch, UserPlus, Truck, Building2, Fingerprint,
} from 'lucide-react';

export const SITES = [
  {
    key: 'loja',
    nome: 'Loja Online',
    caminho: '/loja',
    resumo: 'Copos lisos — o cliente compra direto',
    descricao: 'Vitrine de copos sem impressão: o cliente escolhe cor e quantidade, '
      + 'vê o frete pelo CEP e paga sozinho. Quem quer personalização vai para o Catálogo.',
    icone: Store,
    cor: 'violet',
    publico: true,
    editor: 'loja',
    editorTitulo: 'Editar a loja',
    editorResumo: 'Topo, fotos dos copos, ordem das seções, promoções, textos, rodapé e redes.',
  },
  {
    key: 'catalogo',
    nome: 'Catálogo Personalizado',
    caminho: '/catalogo',
    resumo: 'Copo com arte — o link que o vendedor manda',
    descricao: 'O caminho inteiro do copo personalizado: família, modelo, acabamento, '
      + 'criação da arte, visualização em 3D e pedido. É o link principal para o cliente.',
    icone: Palette,
    cor: 'pink',
    publico: true,
    editor: 'catalogo',
    editorTitulo: 'Editar o catálogo',
    editorResumo: 'Famílias, gabaritos da arte, caixa do liso, ocasiões e banco de artes.',
  },
  {
    key: 'acompanhar',
    nome: 'Acompanhar Pedido',
    caminho: '/acompanhar',
    resumo: 'O cliente vê onde está o pedido dele',
    descricao: 'O cliente entra com o telefone e acompanha a produção, os pagamentos e a '
      + 'entrega — sem precisar perguntar ao vendedor. O conteúdo vem dos pedidos, não de um cadastro.',
    icone: PackageSearch,
    cor: 'blue',
    publico: true,
    editor: 'empresa',
    editorTitulo: 'Dados que aparecem para o cliente',
    editorResumo: 'Nome, logo e contatos da empresa — é o que esta página mostra no topo.',
  },
  {
    key: 'cadastro',
    nome: 'Cadastro de Cliente',
    caminho: '/cadastro',
    resumo: 'Autocadastro — link para enviar ao cliente',
    descricao: 'O cliente preenche os próprios dados e o cadastro entra no ERP para aprovação, '
      + 'em vez de alguém digitar ficha a ficha.',
    icone: UserPlus,
    cor: 'emerald',
    publico: true,
    editor: 'cadastro',
    editorTitulo: 'O que acontece depois do cadastro',
    editorResumo: 'Modo manutenção, mensagem final e WhatsApp do botão de retorno.',
  },
  {
    key: 'cadastro-fornecedor',
    nome: 'Cadastro de Fornecedor',
    caminho: '/cadastro-fornecedor',
    resumo: 'Autocadastro — link para enviar à fornecedora',
    descricao: 'Mesma ideia do cadastro de cliente, com os campos que a fornecedora precisa informar.',
    icone: Building2,
    cor: 'amber',
    publico: true,
    editor: 'cadastro',
    editorTitulo: 'O que acontece depois do cadastro',
    editorResumo: 'Modo manutenção, mensagem final e WhatsApp do botão de retorno.',
  },
  {
    key: 'cadastro-transportadora',
    nome: 'Cadastro de Transportadora',
    caminho: '/cadastro-transportadora',
    resumo: 'Autocadastro — link para enviar à transportadora',
    descricao: 'A transportadora informa dados, regiões atendidas e contatos direto pelo link.',
    icone: Truck,
    cor: 'teal',
    publico: true,
    editor: 'cadastro',
    editorTitulo: 'O que acontece depois do cadastro',
    editorResumo: 'Modo manutenção, mensagem final e WhatsApp do botão de retorno.',
  },
  {
    key: 'marcacao',
    nome: 'Bater Ponto',
    caminho: '/marcacao',
    resumo: 'Tela de ponto do colaborador (exige login)',
    descricao: 'Não é um site público: é a tela cheia que o colaborador abre no celular para '
      + 'marcar o próprio ponto. Está aqui porque tem endereço próprio e vive fora do ERP.',
    icone: Fingerprint,
    cor: 'slate',
    publico: false,
    editor: null,
  },
];

/** As cores de cada site, resolvidas em classes Tailwind (nada de string dinâmica). */
export const CORES = {
  violet:  { chip: 'bg-violet-100 text-violet-600',   ponto: 'bg-violet-500' },
  pink:    { chip: 'bg-pink-100 text-pink-600',       ponto: 'bg-pink-500' },
  blue:    { chip: 'bg-blue-100 text-blue-600',       ponto: 'bg-blue-500' },
  emerald: { chip: 'bg-emerald-100 text-emerald-600', ponto: 'bg-emerald-500' },
  amber:   { chip: 'bg-amber-100 text-amber-600',     ponto: 'bg-amber-500' },
  teal:    { chip: 'bg-teal-100 text-teal-600',       ponto: 'bg-teal-500' },
  slate:   { chip: 'bg-gray-100 text-gray-600',       ponto: 'bg-gray-400' },
};

export const acharSite = key => SITES.find(s => s.key === key) || null;

/** O endereço completo. Os sites moram na mesma origem do ERP. */
export const urlDoSite = site => `${window.location.origin}${site.caminho}`;

/**
 * Copia texto para a área de transferência, com o caminho antigo de
 * reserva para navegador sem a API moderna. Devolve se conseguiu.
 */
export async function copiarTexto(texto) {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = texto; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }
}
