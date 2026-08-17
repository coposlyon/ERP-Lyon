// ============================================================
// Peças do painel do vendedor.
//
// Os tokens de tema e os cartões genéricos mudaram de casa para
// components/UI/theme.jsx quando o módulo de Vendas passou a usar os
// mesmos: uma tela do ERP não deveria importar de dentro da pasta de
// outra. Aqui ficou só o que é do vendedor de fato — as cores das UFs
// e o aviso de migração — e o reexporte para não quebrar os imports que
// já existiam.
// ============================================================
import { AlertTriangle } from 'lucide-react';

export {
  useVend, Hint, Panel, Kpi,
  fmtBRL, fmtUn, fmtPct, fmtDate, MESES,
} from '@/components/UI/theme';

/**
 * Uma cor por estado.
 *
 * Antes as UFs eram pintadas por desempenho — verde o melhor, laranja o
 * do meio, vermelho o pior. Só que o vendedor não abre o painel para
 * descobrir qual estado é o pior: ele abre para achar O SEU estado no
 * meio dos outros, e três cores para vinte e sete estados deixavam
 * metade do mapa da mesma cor. Agora cada UF tem a sua, igual em toda
 * tela: a barra da lista, o pedaço do mapa e o selo ao lado do nome. O
 * desempenho continua onde sempre esteve e onde se lê melhor — na
 * posição do ranking e no tamanho da barra.
 *
 * As cores não foram escolhidas a olho. São 27 matizes distribuídos
 * pelo ângulo áureo (137,5°), que é o que mais espalha um número grande
 * de tons sem deixar vizinho parecido, com a luminosidade puxada para
 * cima até cada uma bater no mínimo 5,2:1 de contraste contra o fundo
 * escuro do painel — inclusive os azuis e roxos, que nascem escuros
 * demais e sumiriam.
 */
export const UF_COR = {
  AC: '#f55c5c', AL: '#83eca2', AM: '#b96af0', AP: '#f5e25c', BA: '#83dbec',
  CE: '#ee58a9', DF: '#82f55c', ES: '#8783ec', GO: '#ed7d45', MA: '#5cf5bc',
  MG: '#e483ec', MS: '#caed45', MT: '#5ca8f5', PA: '#ec8399', PB: '#45ed54',
  PE: '#a879f6', PI: '#ecc983', PR: '#45ede6', RJ: '#f55cce', RN: '#b3ec83',
  RO: '#7488f1', RR: '#f5705c', RS: '#83ecaf', SC: '#c661ef', SE: '#f4f55c',
  SP: '#83cdec', TO: '#ee5896',
};

// Cinza translúcido para o que não é UF conhecida.
const SEM_COR = {
  base: '#94a3b8', fill: 'rgba(148,163,184,0.30)', stroke: 'rgba(148,163,184,0.45)',
  text: '#94a3b8', chip: 'rgba(148,163,184,0.15)', vazio: true,
};

/**
 * A cor de uma UF, nas formas que as telas usam.
 *
 * `comprou = false` devolve a mesma cor esvaziada: o estado do
 * território que não teve nenhuma compra no período aparece com o
 * contorno na cor dele e o miolo vazio. É de propósito — o vendedor
 * precisa ver que aquele estado é dele E que está zerado, que são duas
 * informações diferentes. Tirá-lo da lista esconderia justamente o que
 * ele tem para fazer.
 */
export const corUf = (uf, comprou = true) => {
  const base = UF_COR[String(uf || '').toUpperCase()];
  if (!base) return SEM_COR;
  return comprou
    ? { base, fill: base, stroke: base, text: base, chip: `${base}33`, vazio: false }
    : { base, fill: 'transparent', stroke: `${base}88`, text: `${base}aa`, chip: `${base}1a`, vazio: true };
};

/**
 * O troféu do Produto Líder — a taça com o número 1.
 *
 * É desenhado aqui em vez de vir do lucide porque a biblioteca não tem
 * essa: o troféu dela é uma taça lisa, e a taça lisa não diz que aquele
 * produto é o PRIMEIRO. Sendo SVG e não imagem, acompanha o tamanho da
 * fonte sem borrar e não custa uma requisição.
 */
export function TrofeuUm({ size = 44 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="trofeu-ouro" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#ffe9a3" />
          <stop offset="45%"  stopColor="#f7c948" />
          <stop offset="100%" stopColor="#d18f00" />
        </linearGradient>
      </defs>

      {/* Alças */}
      <path d="M13 11H8.5A2.5 2.5 0 0 0 6 13.5V16a8 8 0 0 0 8 8"
        stroke="url(#trofeu-ouro)" strokeWidth="2.6" strokeLinecap="round" fill="none" />
      <path d="M35 11h4.5A2.5 2.5 0 0 1 42 13.5V16a8 8 0 0 1-8 8"
        stroke="url(#trofeu-ouro)" strokeWidth="2.6" strokeLinecap="round" fill="none" />

      {/* Taça */}
      <path d="M13 6h22v12c0 6.1-4.9 11-11 11s-11-4.9-11-11V6z" fill="url(#trofeu-ouro)" />

      {/* Haste e base */}
      <rect x="21.5" y="29" width="5" height="6" fill="url(#trofeu-ouro)" />
      <path d="M15 42v-1.5A5.5 5.5 0 0 1 20.5 35h7a5.5 5.5 0 0 1 5.5 5.5V42H15z"
        fill="url(#trofeu-ouro)" />

      {/* O número 1, gravado na taça */}
      <text x="24" y="22.5" textAnchor="middle" fontSize="16" fontWeight="800"
        fill="#6b4200" style={{ fontFamily: 'inherit' }}>1</text>
    </svg>
  );
}

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
