import { useEffect, useRef } from 'react';

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
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let disparou = false;

    const io = new IntersectionObserver(entradas => {
      disparou = true;
      entradas.forEach(e => {
        const dentro = e.intersectionRatio > limite;
        if (umaVez) { if (dentro) el.classList.add('lj-vis'); }
        else el.classList.toggle('lj-vis', dentro);
        if (dentro && aoEntrar) aoEntrar(el);
      });
    }, { threshold: [0, limite, 0.5] });

    io.observe(el);
    const rede = setTimeout(() => { if (!disparou) el.classList.add('lj-vis'); }, 1200);
    return () => { io.disconnect(); clearTimeout(rede); };
  }, [umaVez, aoEntrar, limite]);

  return ref;
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
