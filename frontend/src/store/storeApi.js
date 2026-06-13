import axios from 'axios';

// Cliente da loja pública — sem token / sem redirect de login.
const client = axios.create({ baseURL: '/api/public' });

const storeApi = {
  get:  (url, config) => client.get(url, config).then(r => r.data),
  post: (url, body)   => client.post(url, body).then(r => r.data),
};

export default storeApi;
