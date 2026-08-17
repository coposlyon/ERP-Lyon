/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],

  // 'class' e não 'media': o ERP tem botão próprio de tema, que põe a
  // classe `dark` no <html>. Sem esta linha, todo `dark:` do código
  // obedecia ao sistema operacional e ignorava o botão — era por isso
  // que o tema escuro só pegava onde alguém escreveu estilo inline.
  darkMode: 'class',

  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eef2ff',
          100: '#e0e7ff',
          200: '#c7d2fe',
          300: '#a5b4fc',
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          800: '#3730a3',
          900: '#312e81',
        },
        sidebar: '#1e1b4b',
        'sidebar-hover': '#2d2a6e',

        // Paleta do tema escuro (o visual aprovado). Azul-marinho de
        // fundo, borda neon e ciano nos números — os nomes dizem o
        // papel, não a cor, para trocar a tinta num lugar só.
        noite: {
          fundo:    '#060a1f',   // fora dos cards
          painel:   '#0a1130',   // superfície do card
          elevado:  '#101a44',   // superfície sobre o card (hover, input)
          borda:    '#1d2b6b',   // borda padrão
          neon:     '#2f6bff',   // borda acesa / foco
          texto:    '#eaf0ff',
          suave:    '#9db2e8',   // texto secundário
          apagado:  '#5f74ad',   // texto terciário
          ciano:    '#22d3ee',   // valores em destaque
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        // O brilho que dá o ar "neon" das telas aprovadas
        neon:      '0 0 0 1px rgba(47,107,255,0.35), 0 0 22px rgba(47,107,255,0.14)',
        'neon-forte': '0 0 0 1px rgba(47,107,255,0.6), 0 0 28px rgba(47,107,255,0.30)',
      },
    },
  },
  plugins: [],
};
