// ============================================================
// AS PEÇAS COMUNS DOS TRÊS PORTAIS.
//
// Colaborador, gestor e contador são recortes diferentes da MESMA
// empresa — e precisam parecer o mesmo sistema. Cartão, bloco, estado
// vazio e formatação de dinheiro/hora moram aqui para que "3h20" e
// "R$ 1.234,56" não sejam escritos de três jeitos nas três telas.
// ============================================================

/** '2026-08-25' → '25/08/2026'. Aceita timestamp e corta a hora. */
export const dBR = d => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—');

/** '2026-08' → '08/2026'. */
export const compBR = c => (c ? String(c).split('-').reverse().join('/') : '—');

export const brl = v =>
  (v == null || v === '' ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));

/** Minutos → '7h30'. Negativo vem com o sinal, porque saldo negativo é informação. */
export const hm = min => {
  if (min == null) return '—';
  const s = min < 0 ? '−' : '';
  const a = Math.abs(Math.round(min));
  return `${s}${Math.floor(a / 60)}h${String(a % 60).padStart(2, '0')}`;
};

/** Minutos → '1h05' | '25 min' — para contagem regressiva, onde "0h25" lê pior. */
export const espera = min => {
  if (min == null) return '—';
  const a = Math.abs(Math.round(min));
  if (a < 60) return `${a} min`;
  return `${Math.floor(a / 60)}h${String(a % 60).padStart(2, '0')}`;
};

export const iniciais = nome => String(nome || '?').trim().slice(0, 2).toUpperCase();

export function Cartao({ icone: Icone, cor = 'bg-gray-50 text-gray-600', titulo, valor, rodape }) {
  return (
    <div className="card">
      <div className="card-body">
        {Icone && (
          <span className={`w-9 h-9 rounded-lg flex items-center justify-center ${cor}`}><Icone size={17} /></span>
        )}
        <p className="text-[11px] uppercase tracking-wide text-gray-400 mt-3">{titulo}</p>
        <p className="text-2xl font-bold text-gray-900 leading-tight">{valor ?? '—'}</p>
        {rodape && <p className="text-[11px] text-gray-500 mt-0.5">{rodape}</p>}
      </div>
    </div>
  );
}

export function Bloco({ titulo, descricao, acao, children, className = '' }) {
  return (
    <section className={`card ${className}`}>
      {(titulo || acao) && (
        <div className="card-header flex items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold text-gray-900 text-[15px]">{titulo}</h2>
            {descricao && <p className="text-xs text-gray-500 mt-0.5">{descricao}</p>}
          </div>
          {acao}
        </div>
      )}
      <div className="card-body">{children}</div>
    </section>
  );
}

/**
 * O estado vazio DIZ POR QUE está vazio.
 *
 * "Nenhum documento" e "o RH ainda não pediu nada" são a mesma tela e
 * respostas opostas: a primeira parece um erro do sistema, a segunda
 * diz que não há nada a fazer.
 */
export function Vazio({ children }) {
  return <p className="text-sm text-gray-400 text-center py-6">{children}</p>;
}

const CORES_STATUS = {
  aberta: 'badge-yellow',
  em_analise: 'badge-blue',
  aprovada: 'badge-green',
  recusada: 'badge-red',
  cancelada: 'badge-gray',
  pendente: 'badge-yellow',
  anexado: 'badge-blue',
  assinado: 'badge-green',
  vencido: 'badge-red',
  concluido: 'badge-green',
};

export function Selo({ status, children }) {
  return <span className={`badge ${CORES_STATUS[status] || 'badge-gray'}`}>{children || String(status || '').replace(/_/g, ' ')}</span>;
}
