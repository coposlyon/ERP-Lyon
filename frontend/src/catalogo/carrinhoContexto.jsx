// ============================================================
// O CARRINHO DO CATÁLOGO.
//
// Cada item guarda a CONFIGURAÇÃO, não o preço. O preço vai junto só
// para a tela poder somar sem ir ao servidor a cada tecla — mas quem
// fecha o orçamento é o servidor, que refaz a conta do zero a partir do
// cadastro. Se o carrinho ficou uma semana no navegador e a tabela
// mudou, quem manda é a tabela.
//
// Por isso o item carrega `modelo`, `acabamento_id`, `campos` e
// `projeto_id`: é o suficiente para o servidor reconstruir o item
// inteiro sozinho. Guardar só o nome bonito daria um carrinho que o
// servidor não consegue conferir.
//
// Fica no localStorage porque o visitante não tem conta. Quem monta o
// pedido às onze da noite e volta no dia seguinte encontra o carrinho no
// lugar — e isso é o normal do comércio, não um extra.
//
// O NOME DO ARQUIVO NÃO É `carrinho.jsx` DE PROPÓSITO. A tela do
// carrinho é `Carrinho.jsx`, e no Windows os dois nomes são o MESMO
// arquivo. Um sobrescreve o outro sem aviso, e o erro que aparece é um
// módulo importando a si mesmo — que não parece com o que aconteceu.
// ============================================================
import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';

const Ctx = createContext(null);
const CHAVE = 'catalogo_carrinho';

/**
 * A identidade da sessão do visitante.
 *
 * Serve para amarrar o projeto de arte a quem o desenhou antes de existir
 * cliente cadastrado. Não é rastreamento: é um número aleatório no
 * próprio navegador, sem nada de pessoal dentro.
 */
export function visitante() {
  let id = localStorage.getItem('catalogo_visitante');
  if (!id) {
    id = (crypto?.randomUUID?.() || `v${Date.now()}${Math.random().toString(36).slice(2)}`);
    localStorage.setItem('catalogo_visitante', id);
  }
  return id;
}

export function CarrinhoProvider({ children }) {
  const [itens, setItens] = useState(() => {
    try { return JSON.parse(localStorage.getItem(CHAVE)) || []; } catch { return []; }
  });

  useEffect(() => {
    try { localStorage.setItem(CHAVE, JSON.stringify(itens)); } catch { /* cota cheia: o carrinho segue na memória */ }
  }, [itens]);

  /**
   * A chave de um item é a configuração inteira.
   *
   * Dois Long Drinks degradê iguais somam quantidade; o mesmo copo com a
   * arte do casamento de outra pessoa é OUTRO item. Colapsar pela cor
   * juntaria duas artes diferentes numa linha só, e a produção
   * imprimiria a errada.
   */
  const chaveDe = useCallback(item => [
    item.modelo, item.acabamento_id || '', item.tipo_pedido || '',
    item.processo_id || '', item.posicao || '', item.projeto_id || '',
    JSON.stringify(item.campos || {}),
  ].join('::'), []);

  const adicionar = useCallback(item => {
    setItens(atual => {
      const k = chaveDe(item);
      const achado = atual.find(i => chaveDe(i) === k);
      if (!achado) return [...atual, { ...item, chave: k }];
      return atual.map(i => chaveDe(i) === k
        ? { ...i, quantidade: i.quantidade + item.quantidade }
        : i);
    });
  }, [chaveDe]);

  const mudarQtd = useCallback((chave, qtd) => {
    setItens(atual => atual.map(i => i.chave === chave
      ? { ...i, quantidade: Math.max(i.quantidade_minima || 1, Number(qtd) || 1) }
      : i));
  }, []);

  const remover = useCallback(chave => setItens(atual => atual.filter(i => i.chave !== chave)), []);
  const limpar = useCallback(() => setItens([]), []);

  const valor = useMemo(() => ({
    itens, adicionar, mudarQtd, remover, limpar, chaveDe,
    pecas: itens.reduce((s, i) => s + (Number(i.quantidade) || 0), 0),
    total: itens.reduce((s, i) => s + (Number(i.quantidade) || 0) * (Number(i.valor_unitario) || 0), 0),
  }), [itens, adicionar, mudarQtd, remover, limpar, chaveDe]);

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export const useCarrinho = () => useContext(Ctx);
