import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
});

/**
 * As rotas do acompanhamento do cliente respondem 401 como RESPOSTA DE
 * NEGÓCIO — "esse CPF e esse pedido não conferem" — e não como sessão
 * expirada. Sem esta exceção, o cliente que erra um dígito do CPF era
 * jogado na tela de login do ERP, que ele não tem como usar, em vez de
 * ler "dados de acesso inválidos". Pior: o localStorage.clear() abaixo
 * derrubava de quebra a sessão de quem estivesse logado no ERP no mesmo
 * navegador.
 */
const rotaPublica = url =>
  /^\/?acompanhar(\/|$)/.test(String(url || '').replace(/^\/api/, ''));

// A PÁGINA aberta é do cliente (loja, catálogo, cadastro)? Lá, sessão do
// ERP vencida não é problema de ninguém: o AuthProvider confere o acesso
// em toda abertura, e o 401 jogava quem abriu o link do catálogo na tela
// de login — e o clear() levava junto o carrinho do visitante.
const paginaPublica = () =>
  /^\/(loja|personalizados|catalogo|acompanhar|cadastro)/.test(window.location.pathname);

function derrubarSessao() {
  if (paginaPublica()) {
    ['access_token', 'refresh_token', 'user', 'tenant'].forEach(k => localStorage.removeItem(k));
    return;
  }
  localStorage.clear();
  window.location.href = '/login';
}

api.interceptors.request.use((config) => {
  // O ACOMPANHAMENTO DO CLIENTE NÃO LEVA O TOKEN DO ERP.
  //
  // Este interceptor sobrescrevia o Authorization de QUALQUER chamada
  // com o token do ERP guardado no navegador. Resultado: o vendedor que
  // abrisse o link de acompanhamento na mesma janela em que está logado
  // mandava o próprio Bearer no lugar do token do cliente — e o
  // servidor, que confere o cabeçalho primeiro, respondia "sessão
  // expirada" logo depois de o login ter dado certo.
  if (rotaPublica(config.url)) return config;

  // Quem passou o cabeçalho na chamada sabe o que está fazendo.
  if (config.headers?.Authorization) return config;

  const token = localStorage.getItem('access_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response.data,
  async (error) => {
    if (error.response?.status === 401 && !rotaPublica(error.config?.url)) {
      const refreshToken = localStorage.getItem('refresh_token');
      if (refreshToken) {
        try {
          const res = await axios.post('/api/auth/refresh', { refresh_token: refreshToken });
          localStorage.setItem('access_token', res.data.access_token);
          localStorage.setItem('refresh_token', res.data.refresh_token);
          error.config.headers.Authorization = `Bearer ${res.data.access_token}`;
          return api.request(error.config);
        } catch {
          derrubarSessao();
        }
      } else {
        derrubarSessao();
      }
    }
    return Promise.reject(error.response?.data || error);
  }
);

export default api;
