// Observabilidade: log estruturado (JSON) + Sentry opcional.
// O Sentry só ativa se @sentry/node estiver instalado E SENTRY_DSN setado.
// Sem nada disso, vira no-op — não quebra.
let Sentry = null;
try {
  if (process.env.SENTRY_DSN) {
    Sentry = require('@sentry/node');
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV || 'production',
      tracesSampleRate: 0.1,
    });
    console.log('[observability] Sentry ativo');
  }
} catch {
  Sentry = null;
}

function log(level, msg, meta) {
  const line = JSON.stringify({ t: new Date().toISOString(), level, msg, ...(meta || {}) });
  (level === 'error' ? console.error : console.log)(line);
}

function captureError(err, context) {
  log('error', err?.message || String(err), { stack: err?.stack, ...(context || {}) });
  if (Sentry) { try { Sentry.captureException(err, context ? { extra: context } : undefined); } catch {} }
}

module.exports = { log, captureError, Sentry };
