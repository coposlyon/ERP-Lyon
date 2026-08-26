// ============================================================
// ESCOLHER A ORIGEM DA VENDA VENDO A MARCA.
//
// Este campo era um <select> nativo, e <option> não aceita nada além de
// texto: nem <img>, nem SVG, nem componente. Para o canal aparecer com
// alguma cara, alguém colou um emoji na frente do nome — 🛍️ Shopee,
// 🏬 Magalu — e o resultado é o que o emoji sempre dá: duas bolsinhas
// cinza iguais, que mudam de desenho conforme o sistema operacional e
// não têm relação nenhuma com a cor da marca.
//
// A resposta certa não é procurar um emoji melhor. É parar de usar o
// <select> nativo, que é o que prende a lista ao texto puro. Aqui a
// lista é feita de botões, e cada linha usa o MESMO selo de marca que
// as telas de Vendas e da carteira do vendedor já mostram
// (components/UI/LogoOrigem.jsx). Uma origem nova entra em um lugar só
// e aparece nos três.
//
// O que se perde ao abrir mão do <select>: o teclado do celular não
// abre a roleta nativa, e a navegação por setas some. Em troca, o
// operador identifica o canal pela cor antes de ler — que é o que ele
// faz trinta vezes por dia.
// ============================================================
import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check, CircleSlash } from 'lucide-react';
import LogoOrigem from './LogoOrigem';

/**
 * @param origens   a lista vinda de /sales/origens ({ key, grupo })
 * @param value     a origem escolhida, ou '' para "não informar"
 * @param onChange  recebe a nova origem (ou '')
 */
export default function SeletorOrigem({ origens = [], value = '', onChange, disabled = false }) {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef(null);

  // Fecha ao clicar fora e no Esc. Sem isso a lista fica pendurada por
  // cima do formulário depois que o operador desistiu dela.
  useEffect(() => {
    if (!aberto) return;
    const fora = e => { if (caixa.current && !caixa.current.contains(e.target)) setAberto(false); };
    const esc = e => { if (e.key === 'Escape') setAberto(false); };
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', fora);
      document.removeEventListener('keydown', esc);
    };
  }, [aberto]);

  // Agrupa preservando a ordem em que o servidor mandou: o grupo aparece
  // onde seu primeiro canal aparece, então a lista não se reordena
  // sozinha quando um marketplace novo entrar lá atrás.
  const grupos = [];
  for (const o of origens) {
    const nome = o.grupo || 'Outros';
    let g = grupos.find(x => x.nome === nome);
    if (!g) { g = { nome, itens: [] }; grupos.push(g); }
    g.itens.push(o);
  }

  const escolher = k => { onChange?.(k); setAberto(false); };

  return (
    <div className="relative" ref={caixa}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setAberto(v => !v)}
        className="input text-sm w-full flex items-center gap-2 text-left"
        title="De onde este cliente veio. Fica gravado no pedido e alimenta o relatório de canal.">
        {value
          ? <LogoOrigem origem={value} size={18} />
          : <CircleSlash size={16} className="text-gray-400 shrink-0" />}
        <span className={`truncate flex-1 ${value ? '' : 'text-gray-400'}`}>
          {value || 'não informar'}
        </span>
        <ChevronDown size={14} className={`shrink-0 text-gray-400 transition-transform ${aberto ? 'rotate-180' : ''}`} />
      </button>

      {aberto && (
        <div className="card absolute z-50 mt-1 left-0 right-0 min-w-[220px] max-h-72 overflow-y-auto shadow-xl py-1">
          <Linha selecionada={!value} onClick={() => escolher('')}>
            <CircleSlash size={16} className="text-gray-400 shrink-0" />
            <span className="truncate text-gray-500">não informar</span>
          </Linha>

          {grupos.map(g => (
            <div key={g.nome}>
              <p className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wider text-gray-400">{g.nome}</p>
              {g.itens.map(o => (
                <Linha key={o.key} selecionada={value === o.key} onClick={() => escolher(o.key)}>
                  <LogoOrigem origem={o.key} size={18} />
                  <span className="truncate">{o.key}</span>
                </Linha>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Linha({ selecionada, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left transition-colors
                  text-gray-800 dark:text-white hover:bg-primary-50 dark:hover:bg-[#1d2b6b]
                  ${selecionada ? 'font-semibold' : ''}`}>
      {children}
      {selecionada && <Check size={14} className="ml-auto shrink-0 text-primary-600" />}
    </button>
  );
}
