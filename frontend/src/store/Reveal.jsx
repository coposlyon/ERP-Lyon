import { useRef, useEffect, useState } from 'react';

// Revela o conteúdo quando entra na viewport.
export function Reveal({ children, delay = 0, scale = false, className = '', as: Tag = 'div', ...rest }) {
  const ref = useRef(null);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setSeen(true); io.disconnect(); }
    }, { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const base = scale ? 'st-reveal-scale' : 'st-reveal';
  return (
    <Tag ref={ref} className={`${base} ${seen ? 'st-in' : ''} ${className}`} style={{ transitionDelay: `${delay}ms` }} {...rest}>
      {children}
    </Tag>
  );
}

// Contador animado (count-up) ao entrar na tela.
export function CountUp({ to = 0, suffix = '', prefix = '', duration = 1600, className = '' }) {
  const ref = useRef(null);
  const [val, setVal] = useState(0);
  const started = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !started.current) {
        started.current = true;
        const t0 = performance.now();
        const tick = now => {
          const p = Math.min((now - t0) / duration, 1);
          setVal(Math.round(to * (1 - Math.pow(1 - p, 3))));
          if (p < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
        io.disconnect();
      }
    }, { threshold: 0.4 });
    io.observe(el);

    // Rede de segurança: sem quadros (aba em segundo plano) o requestAnimationFrame
    // nunca roda e o número ficaria travado em zero — pior que não animar.
    const rede = setTimeout(() => setVal(v => (v === 0 && to !== 0 ? to : v)), duration + 900);
    return () => { io.disconnect(); clearTimeout(rede); };
  }, [to, duration]);

  return <span ref={ref} className={className}>{prefix}{val}{suffix}</span>;
}
