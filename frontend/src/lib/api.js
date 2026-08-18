import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
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
          localStorage.clear();
          window.location.href = '/login';
        }
      } else {
        localStorage.clear();
        window.location.href = '/login';
      }
    }
    return Promise.reject(error.response?.data || error);
  }
);

export default api;
