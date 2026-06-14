import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info?.componentStack);
    if (window.Sentry) { try { window.Sentry.captureException(error); } catch {} }
  }
  reset = () => { this.setState({ hasError: false, error: null }); };

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center p-6">
        <div className="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center mb-4 text-3xl">⚠️</div>
        <h1 className="text-xl font-bold text-gray-900">Algo deu errado nesta tela</h1>
        <p className="text-sm text-gray-500 mt-2 max-w-md">
          Tivemos um problema ao carregar esta parte do sistema. O resto continua funcionando.
        </p>
        <div className="flex gap-3 mt-6">
          <button onClick={this.reset} className="btn-secondary">Tentar de novo</button>
          <button onClick={() => { window.location.href = '/'; }} className="btn-primary">Ir para o início</button>
        </div>
        {import.meta.env.DEV && this.state.error && (
          <pre className="mt-6 text-xs text-left text-red-600 bg-red-50 p-3 rounded-lg max-w-lg overflow-auto">
            {String(this.state.error?.stack || this.state.error)}
          </pre>
        )}
      </div>
    );
  }
}
