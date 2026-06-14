import { Component } from 'react';

// Erros de carregamento de chunk (deploy novo invalidou o JS em cache).
const CHUNK_RE = /(ChunkLoadError|Loading chunk|dynamically imported module|module script failed|Failed to fetch)/i;
const isChunkError = (e) => CHUNK_RE.test(e?.message || e?.name || String(e || ''));

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, chunk: false };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error, chunk: isChunkError(error) };
  }
  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info?.componentStack);
    if (window.Sentry) { try { window.Sentry.captureException(error); } catch {} }
    // Chunk antigo após deploy: recarrega 1x p/ pegar a versão nova
    // (timestamp evita loop — só recarrega se não recarregou nos últimos 12s).
    if (isChunkError(error)) {
      const last = Number(sessionStorage.getItem('eb-reloaded') || 0);
      if (Date.now() - last > 12000) {
        sessionStorage.setItem('eb-reloaded', String(Date.now()));
        window.location.reload();
      }
    }
  }
  reset = () => { this.setState({ hasError: false, error: null, chunk: false }); };
  reload = () => { sessionStorage.removeItem('eb-reloaded'); window.location.reload(); };

  render() {
    if (!this.state.hasError) return this.props.children;
    const { chunk, error } = this.state;
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center p-6">
        <div className="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center mb-4 text-3xl">{chunk ? '🔄' : '⚠️'}</div>
        <h1 className="text-xl font-bold text-gray-900">{chunk ? 'Nova versão disponível' : 'Algo deu errado nesta tela'}</h1>
        <p className="text-sm text-gray-500 mt-2 max-w-md">
          {chunk
            ? 'O sistema foi atualizado. Clique em Atualizar para carregar a versão nova.'
            : 'Tivemos um problema ao carregar esta parte do sistema. O resto continua funcionando.'}
        </p>
        <div className="flex gap-3 mt-6">
          {chunk ? (
            <button onClick={this.reload} className="btn-primary">Atualizar agora</button>
          ) : (
            <>
              <button onClick={this.reset} className="btn-secondary">Tentar de novo</button>
              <button onClick={() => { window.location.href = '/'; }} className="btn-primary">Ir para o início</button>
            </>
          )}
        </div>
        {!chunk && error && (
          <pre className="mt-6 text-[11px] text-left text-red-500 bg-red-50 p-3 rounded-lg max-w-lg overflow-auto max-h-44">
            {String(error?.message || error)}
          </pre>
        )}
      </div>
    );
  }
}
