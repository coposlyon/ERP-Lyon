require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');
const morgan  = require('morgan');
const rateLimit = require('express-rate-limit');
const path    = require('path');
const fs      = require('fs');

const routes = require('./routes');
const { captureError } = require('./lib/observability');

const app = express();
const PORT = process.env.PORT || 3001;

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

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:  ["'self'"],
      scriptSrc:   ["'self'", ...SOCIAL_SCRIPT],
      styleSrc:    ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      imgSrc:      ["'self'", "data:", "blob:", "https:"],
      fontSrc:     ["'self'", "data:", "https://fonts.gstatic.com"],
      connectSrc:  ["'self'", "https://graph.facebook.com", "https://www.instagram.com"],
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
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
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

app.listen(PORT, () => {
  console.log(`Dator ERP Backend running on port ${PORT}`);
});

module.exports = app;
