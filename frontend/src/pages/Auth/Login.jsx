import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

/* ─── SVG logo — recriação dos copos coloridos ──────────────────────── */
function CoposIcon() {
  // Cada entrada: [x, y, largura, altura, cor]
  const cups = [
    [2,   44, 12, 41, '#F5C400'],   // amarelo curto esq.
    [17,  27, 12, 58, '#F5C400'],   // amarelo alto esq.
    [33,  14, 12, 71, '#8CC63F'],   // verde
    [49,   4, 13, 81, '#00B8D4'],   // ciano esq. (mais alto)
    [65,   4, 13, 81, '#005CB8'],   // azul centro (mais alto)
    [81,  14, 12, 71, '#00B8D4'],   // ciano dir.
    [97,  27, 12, 58, '#7B2C8B'],   // roxo alto
    [113, 44, 12, 41, '#7B2C8B'],   // roxo curto dir.
  ];

  return (
    <svg width="128" height="88" viewBox="0 0 128 88" fill="none" xmlns="http://www.w3.org/2000/svg">
      {cups.map(([x, y, w, h, color], i) => (
        <rect key={i} x={x} y={y} width={w} height={h}
          rx="1.5" stroke={color} strokeWidth="2.4" fill="none" />
      ))}
    </svg>
  );
}

/* ─── Decoração de fundo — brilhos suaves ───────────────────────────── */
function BgGlows() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
      <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full blur-3xl opacity-[0.08]"
        style={{ background: '#E8187A' }} />
      <div className="absolute top-1/2 -right-32 w-80 h-80 rounded-full blur-3xl opacity-[0.07]"
        style={{ background: '#005CB8' }} />
      <div className="absolute -bottom-16 left-1/3 w-64 h-64 rounded-full blur-3xl opacity-[0.06]"
        style={{ background: '#7B2C8B' }} />
    </div>
  );
}

/* ─── Componente principal ──────────────────────────────────────────── */
export default function Login() {
  const [email,        setEmail]        = useState('');
  const [password,     setPassword]     = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading,      setLoading]      = useState(false);
  const { login } = useAuth();
  const navigate  = useNavigate();

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
      className="relative min-h-screen flex items-center justify-center p-4"
      style={{ background: '#0d0d0d' }}
    >
      <BgGlows />

      <div className="relative z-10 w-full max-w-sm">

        {/* ── Logo + Nome ── */}
        <div className="text-center mb-8 select-none">
          <div className="flex justify-center mb-3">
            <CoposIcon />
          </div>
          <h1 className="text-4xl font-black tracking-wider leading-none">
            <span style={{ color: '#E8187A' }}>LYON</span>
            <span className="text-white ml-1.5">COPOS</span>
          </h1>
          <p className="text-xs font-semibold tracking-widest uppercase mt-2"
            style={{ color: '#E8187A' }}>
            Gestão Comercial
          </p>
        </div>

        {/* ── Card do formulário ── */}
        <div
          className="rounded-2xl p-8 shadow-2xl"
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.09)',
            backdropFilter: 'blur(16px)',
          }}
        >
          <h2 className="text-base font-semibold text-white mb-6">
            Entrar na sua conta
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">

            {/* E-mail */}
            <div>
              <label className="block text-xs font-medium mb-1.5"
                style={{ color: 'rgba(255,255,255,0.55)' }}>
                E-mail
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="seu@email.com"
                autoFocus
                disabled={loading}
                className="w-full px-4 py-2.5 rounded-lg text-sm text-white placeholder-gray-600
                  outline-none transition-all
                  focus:ring-1 focus:ring-pink-500 focus:border-pink-500"
                style={{
                  background: 'rgba(255,255,255,0.07)',
                  border: '1px solid rgba(255,255,255,0.1)',
                }}
              />
            </div>

            {/* Senha */}
            <div>
              <label className="block text-xs font-medium mb-1.5"
                style={{ color: 'rgba(255,255,255,0.55)' }}>
                Senha
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  disabled={loading}
                  className="w-full px-4 py-2.5 pr-11 rounded-lg text-sm text-white placeholder-gray-600
                    outline-none transition-all
                    focus:ring-1 focus:ring-pink-500 focus:border-pink-500"
                  style={{
                    background: 'rgba(255,255,255,0.07)',
                    border: '1px solid rgba(255,255,255,0.1)',
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
                  style={{ color: 'rgba(255,255,255,0.35)' }}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Botão */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 mt-1 rounded-lg font-semibold text-sm text-white
                flex items-center justify-center gap-2
                transition-all hover:brightness-110 active:scale-[0.99]
                disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: loading
                  ? '#C0155F'
                  : 'linear-gradient(135deg, #E8187A 0%, #C0155F 100%)',
                boxShadow: '0 4px 20px rgba(232,24,122,0.35)',
              }}
            >
              {loading
                ? <><Loader2 size={16} className="animate-spin" /> Entrando...</>
                : 'Entrar'}
            </button>

          </form>

          <p className="text-center text-xs mt-7" style={{ color: 'rgba(255,255,255,0.2)' }}>
            © {new Date().getFullYear()} Lyon Copos — Gestão Comercial
          </p>
        </div>

      </div>
    </div>
  );
}
