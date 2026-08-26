// ============================================================
// TELA CHEIA DO MÓDULO.
//
// O menu lateral e o cabeçalho existem para NAVEGAR. Quando a pessoa já
// chegou onde queria e vai passar a tarde ali — conferindo a fila de
// pedidos, batendo prazo por prazo — eles deixam de ajudar e passam a
// cobrar: 260 pontos de largura e 64 de altura que a tabela não tem.
//
// Este é o interruptor que apaga a moldura. Quem acende é o módulo, com
// um botão na própria tela; quem obedece é o Layout, que deixa de
// desenhar menu, cabeçalho e rodapé e devolve a janela inteira ao
// conteúdo. Sai com ESC ou pelo mesmo botão.
//
// NÃO é o tela-cheia do navegador (F11). Aquele tira também a barra de
// endereço e as abas, e é do navegador, não nosso: quem quiser os dois
// aperta F11 depois. Este aqui é o do sistema, e volta ao normal sozinho
// quando a pessoa navega para outro módulo — tela cheia é um jeito de
// olhar uma tela, não um estado do sistema inteiro.
// ============================================================
import { createContext, useContext } from 'react';

const TelaCheiaContext = createContext({ ativo: false, alternar: () => {}, sair: () => {} });

export const TelaCheiaProvider = TelaCheiaContext.Provider;

/**
 * @returns { ativo, alternar, sair } — `ativo` para trocar o ícone do
 * botão, `sair` para o ESC do módulo devolver a moldura antes de fazer
 * qualquer outra coisa.
 */
export function useTelaCheia() {
  return useContext(TelaCheiaContext);
}
