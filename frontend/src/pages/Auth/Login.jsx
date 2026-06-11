import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

// ─── Partículas flutuantes ────────────────────────────────────────────────────
const PARTICLE_COLORS = [
  '#E8187A', '#E8187A',          // pink (mais frequente)
  '#00B4D8', '#005CB8',          // cyan + blue
  '#F5C400',                      // yellow
  '#7B2FBE',                      // purple
  '#76BB00',                      // green
  '#CC1199',                      // magenta
];

function useParticles() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    function resize() {
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    const particles = Array.from({ length: 55 }, () => ({
      x:     Math.random() * window.innerWidth,
      y:     Math.random() * window.innerHeight,
      r:     Math.random() * 1.8 + 0.4,
      vx:    (Math.random() - 0.5) * 0.25,
      vy:    (Math.random() - 0.5) * 0.25,
      alpha: Math.random() * 0.3 + 0.06,
      color: PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)],
    }));

    // Alguns "brilhos" maiores, mais suaves
    const glows = Array.from({ length: 8 }, () => ({
      x:     Math.random() * window.innerWidth,
      y:     Math.random() * window.innerHeight,
      r:     Math.random() * 3.5 + 2,
      vx:    (Math.random() - 0.5) * 0.12,
      vy:    (Math.random() - 0.5) * 0.12,
      alpha: Math.random() * 0.15 + 0.04,
      color: PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)],
    }));

    let animId;
    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      [...particles, ...glows].forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.alpha;
        ctx.fill();

        p.x += p.vx;
        p.y += p.vy;
        if (p.x < -10) p.x = canvas.width  + 10;
        if (p.x > canvas.width  + 10) p.x = -10;
        if (p.y < -10) p.y = canvas.height + 10;
        if (p.y > canvas.height + 10) p.y = -10;
      });

      ctx.globalAlpha = 1;
      animId = requestAnimationFrame(draw);
    }

    draw();
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return canvasRef;
}

// ─── SVG fiel ao logo Lyon Copos ─────────────────────────────────────────────
//
// Estrutura (da esquerda p/ direita):
//   Grupo esquerdo  — 3 copos П cada vez mais altos (amarelo → limão → verde)
//   Copo central    — copo-herói com boca larga + corpo afunilado (ciano + azul)
//   Grupo direito   — espelho do esquerdo (violeta → roxo → magenta)
//
// Todos são formas П (barra no topo = boca do copo, laterais = paredes, base aberta)
// ViewBox: 0 0 280 196
// ─────────────────────────────────────────────────────────────────────────────
function LyonCoposLogoSVG({ width = 280 }) {
  const sw   = 2.8;   // stroke-width padrão
  const swIn = 2.3;   // stroke-width do copo interno
  const cap  = 'round';
  const join = 'round';
  const base = 186;   // linha de base (y onde todos os copos terminam)

  return (
    <svg
      width={width}
      height={width * (196 / 280)}
      viewBox="0 0 280 196"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* ── GRUPO ESQUERDO ── */}

      {/* L1 — Amarelo (mais baixo, mais externo) */}
      <path
        d={`M3,${base} L3,132 L25,132 L25,${base}`}
        stroke="#F5C400" strokeWidth={sw} strokeLinecap={cap} strokeLinejoin={join}
      />

      {/* L2 — Limão */}
      <path
        d={`M31,${base} L31,100 L55,100 L55,${base}`}
        stroke="#BFDA00" strokeWidth={sw} strokeLinecap={cap} strokeLinejoin={join}
      />

      {/* L3 — Verde (mais alto, mais interno) */}
      <path
        d={`M61,${base} L61,61 L85,61 L85,${base}`}
        stroke="#76BB00" strokeWidth={sw} strokeLinecap={cap} strokeLinejoin={join}
      />

      {/* ── COPO CENTRAL ── */}

      {/* Contorno externo — ciano — П largo (boca do copo aberta em cima) */}
      <path
        d={`M93,${base} L93,8 L187,8 L187,${base}`}
        stroke="#00B4D8" strokeWidth={sw} strokeLinecap={cap} strokeLinejoin={join}
      />

      {/* Copo interno — azul — afunilado (boca larga, corpo mais estreito) */}
      {/* Boca: x=105 até x=175 em y=22; corpo: x=113 até x=167 em y=56 até base */}
      <path
        d={`M113,${base} L113,56 L105,22 L175,22 L167,56 L167,${base}`}
        stroke="#005CB8" strokeWidth={swIn} strokeLinecap={cap} strokeLinejoin={join}
      />

      {/* ── GRUPO DIREITO (espelho) ── */}

      {/* R1 — Violeta (mais alto, mais interno) */}
      <path
        d={`M195,${base} L195,61 L219,61 L219,${base}`}
        stroke="#7B2FBE" strokeWidth={sw} strokeLinecap={cap} strokeLinejoin={join}
      />

      {/* R2 — Roxo */}
      <path
        d={`M225,${base} L225,100 L249,100 L249,${base}`}
        stroke="#9C27B0" strokeWidth={sw} strokeLinecap={cap} strokeLinejoin={join}
      />

      {/* R3 — Magenta (mais baixo, mais externo) */}
      <path
        d={`M255,${base} L255,132 L277,132 L277,${base}`}
        stroke="#CC1199" strokeWidth={sw} strokeLinecap={cap} strokeLinejoin={join}
      />
    </svg>
  );
}

// ─── Página de login ──────────────────────────────────────────────────────────
export default function Login() {
  const [email,        setEmail]        = useState('');
  const [password,     setPassword]     = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading,      setLoading]      = useState(false);
  const { login }  = useAuth();
  const navigate   = useNavigate();
  const canvasRef  = useParticles();

  async function handleSubmit(e) {
    e.preventDefault();
    if (!email || !password) { toast.error('Preencha email e senha'); return; }
    setLoading(true);
    try {
      await login(email, password);
      navigate('/', { replace: true });
    } catch (err) {
      toast.error(err.error || 'Email ou senha incorretos');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="relative min-h-screen flex items-center justify-center p-4 overflow-hidden"
      style={{ background: '#0d0d0d' }}
    >
      {/* ── Canvas de partículas ── */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 pointer-events-none"
        style={{ zIndex: 0 }}
      />

      {/* ── Halos de luz difusa (por trás do conteúdo) ── */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 1 }}>
        <div className="absolute -top-32 -left-32 w-[500px] h-[500px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(232,24,122,0.12) 0%, transparent 70%)' }} />
        <div className="absolute top-1/2 -right-40 w-[400px] h-[400px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(0,92,184,0.10) 0%, transparent 70%)' }} />
        <div className="absolute -bottom-20 left-1/3 w-[320px] h-[320px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(123,47,190,0.09) 0%, transparent 70%)' }} />
      </div>

      {/* ── Conteúdo central ── */}
      <div className="relative w-full max-w-sm" style={{ zIndex: 2 }}>

        {/* Logo + nome */}
        <div className="flex flex-col items-center mb-8 select-none">

          {/* SVG do logo */}
          <LyonCoposLogoSVG width={260} />

          {/* LYON COPOS */}
          <div className="mt-2 leading-none" style={{ fontFamily: "'Montserrat', sans-serif" }}>
            <span
              className="text-[2.6rem] font-black tracking-wide"
              style={{ color: '#E8187A', fontFamily: 'inherit', letterSpacing: '0.04em' }}
            >
              LYON
            </span>
            <span
              className="text-[2.6rem] font-black tracking-wide ml-2"
              style={{ color: '#ffffff', fontFamily: 'inherit', letterSpacing: '0.04em' }}
            >
              COPOS
            </span>
          </div>

          {/* acrílicos */}
          <p
            className="text-sm mt-0.5"
            style={{
              fontFamily: "'Montserrat', sans-serif",
              color: '#E8187A',
              fontWeight: 400,
              letterSpacing: '0.12em',
            }}
          >
            acrílicos
          </p>
        </div>

        {/* Card do formulário */}
        <div
          className="rounded-2xl px-8 pt-7 pb-8 shadow-2xl"
          style={{
            background: 'rgba(255,255,255,0.045)',
            border: '1px solid rgba(255,255,255,0.08)',
            backdropFilter: 'blur(18px)',
            WebkitBackdropFilter: 'blur(18px)',
          }}
        >
          <h2
            className="text-base font-semibold mb-6"
            style={{ color: 'rgba(255,255,255,0.85)' }}
          >
            Entrar na sua conta
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">

            {/* E-mail */}
            <div>
              <label
                className="block text-xs font-medium mb-1.5"
                style={{ color: 'rgba(255,255,255,0.5)' }}
              >
                E-mail
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="seu@email.com"
                autoFocus
                disabled={loading}
                className="w-full px-4 py-2.5 rounded-lg text-sm text-white placeholder-gray-600 outline-none transition-all focus:ring-1 focus:ring-pink-500"
                style={{
                  background: 'rgba(255,255,255,0.07)',
                  border: '1px solid rgba(255,255,255,0.1)',
                }}
              />
            </div>

            {/* Senha */}
            <div>
              <label
                className="block text-xs font-medium mb-1.5"
                style={{ color: 'rgba(255,255,255,0.5)' }}
              >
                Senha
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  disabled={loading}
                  className="w-full px-4 py-2.5 pr-11 rounded-lg text-sm text-white placeholder-gray-600 outline-none transition-all focus:ring-1 focus:ring-pink-500"
                  style={{
                    background: 'rgba(255,255,255,0.07)',
                    border: '1px solid rgba(255,255,255,0.1)',
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 transition-opacity hover:opacity-80"
                  style={{ color: 'rgba(255,255,255,0.35)' }}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Botão entrar */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 mt-2 rounded-lg font-semibold text-sm text-white flex items-center justify-center gap-2 transition-all hover:brightness-110 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: 'linear-gradient(135deg, #E8187A 0%, #B80F5E 100%)',
                boxShadow: '0 4px 24px rgba(232,24,122,0.4)',
                fontFamily: "'Montserrat', sans-serif",
              }}
            >
              {loading
                ? <><Loader2 size={16} className="animate-spin" /> Entrando...</>
                : 'Entrar'}
            </button>

          </form>

          <p
            className="text-center text-[11px] mt-7"
            style={{ color: 'rgba(255,255,255,0.18)' }}
          >
            © {new Date().getFullYear()} Lyon Copos — Gestão Comercial
          </p>
        </div>

      </div>
    </div>
  );
}
