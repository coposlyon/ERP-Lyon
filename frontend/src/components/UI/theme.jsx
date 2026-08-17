// ============================================================
// Tokens visuais e peças que respondem ao tema do ERP.
//
// O tema aqui sai de estilos inline lidos do ThemeContext, e não das
// classes `dark:` do Tailwind: o projeto não configurou darkMode:'class',
// então `dark:` obedece ao sistema operacional e ignoraria o botão de
// tema do ERP. É o mesmo caminho que o Dashboard principal usa.
//
// Mora em components/UI porque não é só do painel do vendedor — o
// módulo de Vendas usa os mesmos tokens, e uma tela do ERP não deveria
// importar de dentro da pasta de outra.
// ============================================================
import { Info } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';

export function useVend() {
  const { isDark } = useTheme();

  const card = isDark ? {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    borderRadius: '0.75rem',
  } : {
    background: '#ffffff',
    border: '1px solid #e5e7eb',
    borderRadius: '0.75rem',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
  };

  return {
    isDark,
    card,
    divider:     isDark ? 'rgba(255,255,255,0.07)' : '#f3f4f6',
    textPrimary: isDark ? '#ffffff'                : '#111827',
    textMuted:   isDark ? 'rgba(255,255,255,0.80)' : '#6b7280',
    textSubtle:  isDark ? 'rgba(255,255,255,0.64)' : '#9ca3af',
    empty:       isDark ? 'rgba(255,255,255,0.48)' : '#d1d5db',
    surface:     isDark ? 'rgba(255,255,255,0.06)' : '#f9fafb',
    control: {
      background: isDark ? 'rgba(255,255,255,0.07)' : '#ffffff',
      border: `1px solid ${isDark ? 'rgba(255,255,255,0.12)' : '#e5e7eb'}`,
      color: isDark ? '#ffffff' : '#111827',
      borderRadius: '0.6rem',
      padding: '0.5rem 0.75rem',
      fontSize: '0.875rem',
      outline: 'none',
    },
  };
}

/** Ponto de interrogação dos rótulos: explica a conta sem ocupar espaço. */
export function Hint({ text }) {
  const { textSubtle } = useVend();
  return (
    <span title={text} className="inline-flex align-middle cursor-help">
      <Info size={12} style={{ color: textSubtle }} />
    </span>
  );
}

/** Caixa base dos blocos. */
export function Panel({ title, hint, right, children, className = '', bodyClass = 'p-4' }) {
  const { card, divider, textPrimary } = useVend();
  return (
    <div style={card} className={`flex flex-col ${className}`}>
      {(title || right) && (
        <div className="flex items-start justify-between gap-2 px-4 py-3"
          style={{ borderBottom: `1px solid ${divider}` }}>
          <h2 className="text-[11px] font-semibold uppercase tracking-wider flex items-center gap-1.5"
            style={{ color: textPrimary }}>
            {title} {hint && <Hint text={hint} />}
          </h2>
          {right}
        </div>
      )}
      <div className={`flex-1 ${bodyClass}`}>{children}</div>
    </div>
  );
}

/**
 * Cartão de indicador. O valor é o herói: vem grande e colorido, com o
 * rótulo pequeno em cima e o ícone à direita.
 */
export function Kpi({ title, hint, value, unit, color, Icon, iconBg }) {
  const { card, textSubtle } = useVend();
  return (
    <div style={{ ...card, padding: '1rem 1.15rem' }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-widest leading-relaxed flex items-start gap-1.5"
            style={{ color: textSubtle }}>
            <span>{title}</span>
            {hint && <Hint text={hint} />}
          </p>
          <p className="text-2xl font-bold mt-1.5 truncate" style={{ color }}>
            {value}
            {unit && <span className="text-sm font-semibold ml-1" style={{ opacity: 0.75 }}>{unit}</span>}
          </p>
        </div>
        {Icon && (
          <div className="w-11 h-11 rounded-full flex items-center justify-center shrink-0"
            style={{ background: iconBg || 'rgba(99,102,241,0.15)' }}>
            <Icon size={19} style={{ color }} />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Formatadores ─────────────────────────────────────────────
export const fmtBRL = v =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0);

export const fmtUn = v =>
  new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(Number(v) || 0);

export const fmtPct = v =>
  `${new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(Number(v) || 0)}%`;

export const fmtDate = iso => {
  if (!iso) return '—';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
};

export const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                      'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
