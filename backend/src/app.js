// O .env e procurado em varios lugares e o log diz qual carregou — ver
// config/env.js. Precisa ser a PRIMEIRA linha: tudo abaixo le process.env.
require('./config/env').carregarAmbiente();
const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');
const morgan  = require('morgan');
const rateLimit = require('express-rate-limit');
const path    = require('path');
const fs      = require('fs');

const routes = require('./routes');
const { captureError } = require('./lib/observability');
const { rodarMigracoes, estadoMigracoes } = require('./lib/migrate');

const app = express();
/**
 * A PORTA DO DISCLOUD E 8080, E NAO E NEGOCIAVEL.
 *
 * Aplicacao do tipo "site" na Discloud so recebe trafego na 8080: o
 * proxy deles bate ali e em mais nenhuma. Com PORT=3001 no painel o
 * servidor subia, o log dizia "running on port 3001", e o site mostrava
 * "Servico indisponivel" — de pe e surdo. Em producao, 8080 vence o que
 * o painel disser; na maquina local continua 3001.
 */
const NO_DISCLOUD = !!process.env.DISCLOUD_APP_ID || require('fs').existsSync('/home/node/discloud.config');
const PORT = NO_DISCLOUD ? 8080 : (process.env.PORT || 3001);

// Discloud (e maioria dos hosts) roda atrás de proxy reverso
app.set('trust proxy', 1);

// Provedores dos embeds de rede social da loja (Configurações → Site → Redes).
// Sem estes hosts liberados na CSP, o iframe do Facebook e os widgets de
// Instagram (SnapWidget/LightWidget) nunca carregam.
const SOCIAL_FRAME = [
  'https://www.facebook.com', 'https://web.facebook.com',
  'https://snapwidget.com', 'https://lightwidget.com', 'https://www.instagram.com',
];
const SOCIAL_SCRIPT = [
  'https://connect.facebook.net', 'https://snapwidget.com',
  'https://cdn.lightwidget.com', 'https://www.instagram.com',
];

/**
 * O STORAGE, PARA BAIXAR A ARTE COM O NOME CERTO.
 *
 * A arte já APARECE na tela sem isto — `imgSrc` libera https: inteiro, e
 * é assim que a imagem carrega. O que a CSP barrava era o `fetch` do
 * arquivo, que é como o visualizador baixa a arte renomeada
 * ("arte-LDT-02.svg" em vez de "a1b2c3d4-….svg", que é o nome que ela
 * tem no bucket).
 *
 * Sem o host aqui o download não quebra — cai no link direto e o arquivo
 * salva com o uuid. Mas um arquivo que ninguém sabe de qual pedido é
 * praticamente não foi salvo.
 *
 * É o MESMO host do SUPABASE_URL: liberar o projeto que já guarda todos
 * os dados do ERP não amplia superfície nenhuma.
 */
const STORAGE_ORIGEM = (() => {
  try { return [new URL(process.env.SUPABASE_URL).origin]; } catch { return []; }
})();

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:  ["'self'"],
      scriptSrc:   ["'self'", ...SOCIAL_SCRIPT],
      styleSrc:    ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      imgSrc:      ["'self'", "data:", "blob:", "https:"],
      fontSrc:     ["'self'", "data:", "https://fonts.gstatic.com"],
      connectSrc:  ["'self'", "https://graph.facebook.com", "https://www.instagram.com", ...STORAGE_ORIGEM],
      objectSrc:   ["'none'"],
      frameSrc:    ["'self'", ...SOCIAL_FRAME],
    },
  },
}));

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  message: { error: 'Too many requests, please try again later.' },
});
app.use('/api', limiter);

// Login/refresh: limite apertado contra força bruta de senha
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: 'Muitas tentativas de login. Aguarde alguns minutos.' },
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/refresh', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  message: { error: 'Muitas requisições. Aguarde alguns minutos.' },
}));

app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use('/api', routes);

// Rota /api desconhecida → 404 JSON (antes caía no fallback do SPA e devolvia HTML com 200)
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Rota não encontrada' });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    // Como o schema ficou na última subida. Se uma migração falhou, é
    // aqui que se descobre sem abrir o log do host.
    migrations: estadoMigracoes(),
  });
});

// ── Serve frontend buildado (produção / Discloud) ─────────────────
const frontendDist = path.join(__dirname, '../public');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist, {
    setHeaders: (res, filePath) => {
      // index.html nunca em cache (aponta sempre p/ os chunks da versão atual);
      // assets têm hash no nome → podem ser cacheados "para sempre".
      if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
      else if (filePath.includes(`${path.sep}assets${path.sep}`)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    },
  }));
  // Arquivo que não existe é 404, e não o index.html. Um chunk de um deploy
  // antigo que voltava HTML com status 200 quebrava o módulo, e o navegador
  // (e o service worker) guardavam esse HTML no lugar do JS: tela branca.
  app.get(/^\/assets\/|\.(js|mjs|css|map|png|jpe?g|svg|webp|ico|json|webmanifest|woff2?)$/i, (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.status(404).type('text/plain').send('Not found');
  });
  // SPA fallback — qualquer rota não-API devolve o index.html (sem cache)
  app.get('*', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

app.use((err, req, res, next) => {
  captureError(err, { path: req.originalUrl, method: req.method, tenant: req.tenantId, user: req.user?.id });
  const status = err.status || 500;
  // Erros 5xx em produção não expõem detalhes internos (mensagem do banco, stack etc.)
  const isDev = process.env.NODE_ENV === 'development';
  const message = (status < 500 || isDev) ? (err.message || 'Internal server error') : 'Erro interno do servidor';
  res.status(status).json({
    error: message,
    ...(isDev && { stack: err.stack }),
  });
});

/**
 * Sobe o servidor depois de acertar o schema.
 *
 * As migrações rodam ANTES do listen: subir aceitando requisição com o
 * banco meio migrado é o pior dos mundos. Se elas falharem, o servidor
 * sobe assim mesmo, com o schema anterior — que funcionava até o deploy
 * de agora. O erro fica no log e em /api/health.
 *
 * AUTO_MIGRATE=false desliga, para quem preferir aplicar à mão.
 */
// Teto de tempo para a etapa de migração na subida. Uma migração pesada
// pode passar disso e continua rodando até o fim — o que este prazo faz
// é liberar o listen em vez de deixar o ERP fora do ar esperando.
const MIGRACAO_TIMEOUT_MS = Number(process.env.MIGRATE_BOOT_TIMEOUT_MS) || 90000;

async function iniciar() {
  if (process.env.AUTO_MIGRATE !== 'false') {
    try {
      // Nada aqui pode segurar o servidor para sempre: um Postgres
      // inalcançável travaria o boot e o 503 viraria permanente. Passado
      // o prazo, sobe assim mesmo e o estado fica em /health.
      const r = await Promise.race([
        rodarMigracoes(),
        new Promise(resolve => setTimeout(
          () => resolve({ estado: 'demorou_demais', aplicadas: [], pendentes: [],
                          erro: `migração passou de ${MIGRACAO_TIMEOUT_MS}ms — servidor subiu sem esperar` }),
          MIGRACAO_TIMEOUT_MS)),
      ]);
      if (r.erro) console.error(`[migrate] ${r.estado}: ${r.erro}`);
    } catch (err) {
      console.error('[migrate] erro inesperado:', err.message);
    }
  } else {
    console.log('[migrate] AUTO_MIGRATE=false — migrações não foram aplicadas.');
  }

  app.listen(PORT, () => {
    console.log(`Dator ERP Backend running on port ${PORT}`);
    // Rastreio da Total Express de hora em hora. Só age em empresa com o
    // webservice configurado e encomenda ainda não entregue.
    try { require('./lib/totalexpressServico').iniciarAgendamento(); }
    catch (err) { console.error('[total-express] agendamento não iniciou:', err.message); }
    // Backup diário automático de cada empresa (Configurações › Backup).
    try { require('./lib/backup').iniciarAgendamento(); }
    catch (err) { console.error('[backup] agendamento não iniciou:', err.message); }
  });
}

iniciar();

module.exports = app;
