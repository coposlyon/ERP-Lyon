import { needsBorder } from './colors';

// Garrafa/shaker estilizada que assume a cor da variante.
// gradient = efeito degradê (transparente embaixo).
export default function Bottle({ color = '#C9CDD3', gradient = false, size = 160 }) {
  const id = 'g' + color.replace('#', '') + (gradient ? 'd' : 's');
  const border = needsBorder(color) ? '#D8DCE2' : 'transparent';
  const w = size, h = size * 1.5;

  return (
    <svg width={w} height={h} viewBox="0 0 100 150" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          {gradient ? (
            <>
              <stop offset="0%"  stopColor={color} />
              <stop offset="55%" stopColor={color} stopOpacity="0.55" />
              <stop offset="100%" stopColor={color} stopOpacity="0.12" />
            </>
          ) : (
            <>
              <stop offset="0%"  stopColor={color} />
              <stop offset="100%" stopColor={color} />
            </>
          )}
        </linearGradient>
      </defs>

      {/* corpo */}
      <rect x="22" y="30" width="56" height="110" rx="14" fill={`url(#${id})`} stroke={border} strokeWidth="1.5" />
      {/* brilho */}
      <rect x="29" y="40" width="9" height="88" rx="4" fill="#ffffff" opacity="0.20" />
      {/* rosca/gargalo */}
      <rect x="30" y="22" width="40" height="12" rx="3" fill={color} stroke={border} strokeWidth="1" />
      {/* tampa flip */}
      <path d="M28 22 q22 -18 44 0 l0 2 q-22 -14 -44 0 Z" fill={color} stroke={border} strokeWidth="1" />
      <rect x="46" y="6" width="9" height="10" rx="2" fill={color} stroke={border} strokeWidth="1" />
    </svg>
  );
}
