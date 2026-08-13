import { useEffect, useState } from 'react';

/**
 * Marca `.lj-vis` no elemento quando ele entra em cena, para o CSS animar o
 * conteúdo de dentro (.lj-an, .lj-masc, .lj-copo, .lj-cor).
 *
 * A rede de segurança não é opcional: tudo que usa .lj-an nasce com opacity 0.
 * Se o observador não disparar — aba em segundo plano, navegador antigo, JS que
 * morreu antes — a seção ficaria em branco para sempre. Melhor aparecer sem
 * animação do que não aparecer.
 *
 * (Arquivo separado do Reveal.jsx de propósito: no Windows os dois nomes
 * colidiriam, porque o sistema de arquivos não diferencia maiúsculas.)
 */
export function useReveal({ umaVez = true, aoEntrar = null, limite = 0.18 } = {}) {
  // Guarda o nó em estado, não em ref: várias seções só existem depois que o
  // catálogo carrega (antes disso o componente devolve null). Com useRef, o
  // efeito rodava uma vez com o elemento ainda inexistente, saía na hora e
  // nunca mais voltava — a seção nascia e ficava invisível para sempre.
  const [el, setEl] = useState(null);

  useEffect(() => {
    if (!el) return;

    const io = new IntersectionObserver(entradas => {
      entradas.forEach(e => {
        const dentro = e.intersectionRatio > limite;
        if (umaVez) { if (dentro) el.classList.add('lj-vis'); }
        else el.classList.toggle('lj-vis', dentro);
        if (dentro && aoEntrar) aoEntrar(el);
      });
    }, { threshold: [0, limite, 0.5] });
    io.observe(el);

    // Rede de segurança: se passou o tempo, a seção está na tela e mesmo assim
    // ninguém a revelou, o observador não está funcionando (aba em segundo
    // plano, navegador antigo). Revela sem animação — melhor que sumir.
    const rede = setTimeout(() => {
      if (el.classList.contains('lj-vis')) return;
      const r = el.getBoundingClientRect();
      if (r.top < window.innerHeight && r.bottom > 0) {
        el.classList.add('lj-vis');
        if (aoEntrar) aoEntrar(el);
      }
    }, 1400);

    return () => { io.disconnect(); clearTimeout(rede); };
  }, [el, umaVez, aoEntrar, limite]);

  return setEl;   // ref de callback: React chama quando o nó entra/sai do DOM
}

/** Título em que cada linha sobe de dentro de uma máscara, em sequência. */
export function Mascara({ linhas = [] }) {
  return (
    <>
      {linhas.filter(Boolean).map((l, i) => (
        <span key={i} className={`lj-masc${i === 1 ? ' m2' : i >= 2 ? ' m3' : ''}`}>
          <span>{l}</span>
        </span>
      ))}
    </>
  );
}
