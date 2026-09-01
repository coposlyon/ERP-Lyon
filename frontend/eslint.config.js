// ============================================================
// O LINT QUE PEGA TELA BRANCA.
//
// `npm run lint` existia no package.json e NUNCA RODOU: não havia
// arquivo de configuração, e o ESLint 9 exige um. O comando morria na
// primeira linha, com um texto sobre guia de migração, e por isso a
// classe de erro mais cara do projeto passava direto para produção —
// um nome que não existe mais no arquivo derruba a tela inteira, e o
// `vite build` não vê problema nenhum nisso (para ele é só uma
// variável que só se resolve em tempo de execução).
//
// Foi o que aconteceu duas vezes seguidas: `itemsBadge` lido antes de
// ser declarado, e `naFaseDoPagamento` usado depois de eu ter apagado
// a declaração. Nos dois casos o build passou e a tela quebrou.
//
// POR ISSO A LISTA DE REGRAS É CURTA. Não é um guia de estilo: é o
// conjunto do que quebra a tela em produção.
//
//   no-undef             nome que não existe. É a tela branca.
//   no-use-before-define ler um `const` antes da linha que o declara.
//                        Fica em AVISO, e não em erro, porque o
//                        projeto tem ~27 casos antigos dentro de
//                        callbacks — que rodam depois do corpo do
//                        componente e nunca quebraram nada. Se
//                        virassem erro, o lint nasceria vermelho e
//                        ninguém olharia mais para ele.
//
// Rodar:  npm run lint      (na pasta frontend)
// ============================================================

import globals from 'globals';

// O codigo tem `// eslint-disable-next-line react-hooks/exhaustive-deps`
// espalhado, de quando esse plugin era esperado. Sem o plugin
// instalado, cada um desses comentarios vira um ERRO de "regra nao
// encontrada" — treze erros que nao sao problema nenhum e afogam os
// que sao. Este plugin de mentira registra a regra como um no-op: os
// comentarios continuam validos e calados, e no dia em que o
// eslint-plugin-react-hooks de verdade entrar, e so trocar aqui.
const reactHooksNoOp = {
  rules: {
    'exhaustive-deps': { create: () => ({}) },
    'rules-of-hooks': { create: () => ({}) },
  },
};

export default [
  {
    files: ['src/**/*.{js,jsx}'],
    plugins: { 'react-hooks': reactHooksNoOp },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.es2021,
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    // JSX usa os componentes como se fossem variáveis soltas; sem isto
    // todo `<Modal />` viraria "Modal não é usado" e, pior, o React
    // importado seria acusado de sobrar.
    rules: {
      'no-undef': 'error',
      'no-use-before-define': ['warn', { variables: true, functions: false, classes: false }],
    },
  },
];
