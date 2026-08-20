// ============================================================
// O cliente de rede do catálogo.
//
// Axios cru, sem o interceptor do ERP: aqui não existe token, não existe
// refresh e não existe redirecionar para /login. Quem abre o catálogo é
// um visitante — mandá-lo para a tela de login do ERP seria mandá-lo
// para uma porta que ele não tem chave nem motivo para abrir.
// ============================================================
import axios from 'axios';

const cliente = axios.create({ baseURL: '/api/catalogo', timeout: 20000 });

const mensagem = err =>
  err?.response?.data?.error
  || (err?.code === 'ECONNABORTED' ? 'A conexão demorou demais. Tente de novo.' : null)
  || 'Não foi possível carregar agora. Tente de novo em instantes.';

const catalogoApi = {
  get: (url, config) => cliente.get(url, config).then(r => r.data)
    .catch(err => { throw new Error(mensagem(err)); }),
  post: (url, corpo) => cliente.post(url, corpo).then(r => r.data)
    .catch(err => { throw new Error(mensagem(err)); }),
};

// ── A porta da loja, reaproveitada ──────────────────────────
//
// Frete por CEP, conferência de CPF e status do pedido pago já existem
// em /api/public e são as MESMAS perguntas que o catálogo faz. Copiar
// para /api/catalogo criaria um segundo cálculo de frete que discorda do
// primeiro no dia em que alguém mexer só em um.
const lojaCliente = axios.create({ baseURL: '/api/public', timeout: 20000 });

export const lojaApi = {
  get: (url, config) => lojaCliente.get(url, config).then(r => r.data)
    .catch(err => { throw new Error(mensagem(err)); }),
  post: (url, corpo) => lojaCliente.post(url, corpo).then(r => r.data)
    .catch(err => { throw new Error(mensagem(err)); }),
};

/**
 * O erro do servidor com o código junto.
 *
 * `LOGIN_REQUIRED` não é falha: é o pedido chegando na hora do cadastro
 * (§30). A tela precisa distinguir "deu erro" de "agora falta o
 * cadastro", e para isso o código tem que sobreviver ao caminho.
 */
export function codigoDoErro(err) {
  return err?.codigo || null;
}

catalogoApi.postComCodigo = (url, corpo) =>
  cliente.post(url, corpo).then(r => r.data).catch(err => {
    const e = new Error(mensagem(err));
    e.codigo = err?.response?.data?.code || null;
    e.status = err?.response?.status || null;
    throw e;
  });

export default catalogoApi;
