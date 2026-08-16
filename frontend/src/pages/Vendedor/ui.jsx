// ============================================================
// Peças do painel do vendedor.
//
// Os tokens de tema e os cartões genéricos mudaram de casa para
// components/UI/theme.jsx quando o módulo de Vendas passou a usar os
// mesmos: uma tela do ERP não deveria importar de dentro da pasta de
// outra. Aqui ficou só o que é do vendedor de fato — o semáforo das UFs
// e o aviso de migração — e o reexporte para não quebrar os imports que
// já existiam.
// ============================================================
import { AlertTriangle } from 'lucide-react';

export {
  useVend, Hint, Panel, Kpi,
  fmtBRL, fmtUn, fmtPct, fmtDate, MESES,
} from '@/components/UI/theme';

/**
 * Semáforo de desempenho por estado. O nível (alto/médio/baixo) vem
 * calculado do servidor; aqui só existe a cor. A lista, o indicador da
 * UF e o mapa leem daqui — é o que garante que o Paraná não apareça
 * verde num lugar e laranja no outro.
 */
export const NIVEL = {
  alto:  { fill: '#22c55e', stroke: '#4ade80', text: '#4ade80', chip: 'rgba(34,197,94,0.20)',  label: 'maior desempenho' },
  medio: { fill: '#f97316', stroke: '#fb923c', text: '#fb923c', chip: 'rgba(249,115,22,0.20)', label: 'desempenho intermediário' },
  baixo: { fill: '#dc2626', stroke: '#f87171', text: '#f87171', chip: 'rgba(220,38,38,0.20)',  label: 'menor desempenho' },
};

// UF sem venda no período não tem desempenho a classificar — fica neutra.
export const nivelDe = n => NIVEL[n] || {
  fill: 'rgba(148,163,184,0.35)', stroke: 'rgba(148,163,184,0.5)',
  text: '#94a3b8', chip: 'rgba(148,163,184,0.15)', label: 'sem compras no período',
};

/**
 * As tabelas do painel nascem nas migrações 065–067, que hoje rodam
 * sozinhas na subida do servidor. Este aviso cobre o caso de o servidor
 * não ter conseguido aplicá-las (sem DATABASE_URL, por exemplo): as
 * vendas continuam aparecendo, mas meta, território e promoções não têm
 * onde ser guardados — e é melhor dizer isso do que mostrar meta zero
 * como se fosse a configuração real.
 */
export function MigracaoPendente() {
  return (
    <div className="rounded-lg px-3 py-2.5 text-sm flex items-start gap-2"
      style={{ background: 'rgba(248,113,113,0.12)', color: '#f87171' }}>
      <AlertTriangle size={15} className="shrink-0 mt-0.5" />
      <span>
        As tabelas do Painel do Vendedor ainda não existem no banco. Confira{' '}
        <b>/api/health</b> → <b>migrations</b>: se estiver <b>sem_database_url</b>, falta a
        variável <b>DATABASE_URL</b> no ambiente do servidor.
      </span>
    </div>
  );
}
