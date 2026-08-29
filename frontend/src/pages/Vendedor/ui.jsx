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

/**
 * UMA COR POR VENDEDOR — a paleta do mapa de cobertura.
 *
 * O mapa de cobertura responde "quem atende onde", e para isso a cor
 * precisa ser da PESSOA, não do estado: quatro estados do mesmo vendedor
 * têm que sair da mesma cor, senão o mapa conta quatro histórias em vez
 * de uma.
 *
 * São catorze tons tirados da paleta das UFs (já medidos contra o fundo
 * escuro do painel) e reordenados para que vizinhos na lista fiquem
 * longes no círculo cromático — com poucos vendedores, que é o caso, as
 * cores sorteadas nunca saem parecidas.
 */
export const CORES_VENDEDOR = [
  '#5cf5bc', '#f55c5c', '#5ca8f5', '#f5e25c', '#c661ef', '#82f55c', '#ed7d45',
  '#45ede6', '#ee58a9', '#b3ec83', '#8783ec', '#f55cce', '#ecc983', '#7488f1',
];

/**
 * A cor de cada vendedor, estável entre recarregamentos.
 *
 * A ordem é a do `user_id`, e não a do nome: renomear alguém não pode
 * trocar a cor do mapa inteiro. Mais vendedores que cores, a lista dá a
 * volta — com equipe desse tamanho, isso não acontece.
 */
export function coresDosVendedores(cobertura) {
  const ids = [...new Set(Object.values(cobertura || {}).flat().map(p => p.user_id))].sort();
  return Object.fromEntries(ids.map((id, i) => [id, CORES_VENDEDOR[i % CORES_VENDEDOR.length]]));
}

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
 * O troféu do pódio — a taça com o número dentro.
 *
 * É desenhado aqui em vez de vir do lucide porque a biblioteca não tem
 * essa: o troféu dela é uma taça lisa, e taça lisa não diz que aquele
 * produto é o PRIMEIRO. Sendo SVG e não imagem, acompanha o tamanho da
 * fonte sem borrar e não custa uma requisição.
 *
 * O mesmo desenho serve o 1º, o 2º e o 3º trocando só o metal — é
 * assim que o pódio se lê de relance, sem precisar ler o número.
 */
export const TONS_PODIO = {
  ouro:   { claro: '#ffe9a3', meio: '#f7c948', escuro: '#d18f00', numero: '#6b4200', texto: '#fbbf24' },
  prata:  { claro: '#ffffff', meio: '#d3dceb', escuro: '#93a4bb', numero: '#3a4557', texto: '#e2e8f0' },
  bronze: { claro: '#ffd2a8', meio: '#f0913f', escuro: '#a95a06', numero: '#5a2d00', texto: '#fb923c' },
};

// Pódio por posição: 1º ouro, 2º prata, 3º bronze. Do 4º em diante não
// há medalha — inventar uma quarta cor de pódio só diria que existe um
// pódio de oito lugares.
export const TOM_DA_POSICAO = pos => ['ouro', 'prata', 'bronze'][pos - 1] || null;

export function Trofeu({ size = 44, numero = 1, tom = 'ouro' }) {
  const t = TONS_PODIO[tom] || TONS_PODIO.ouro;
  // O gradiente precisa de id próprio por metal: com o id repetido, o
  // primeiro <defs> da página pinta todos os outros de ouro.
  const id = `trofeu-${tom}`;
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={t.claro} />
          <stop offset="45%"  stopColor={t.meio} />
          <stop offset="100%" stopColor={t.escuro} />
        </linearGradient>
      </defs>

      {/* Alças */}
      <path d="M13 11H8.5A2.5 2.5 0 0 0 6 13.5V16a8 8 0 0 0 8 8"
        stroke={`url(#${id})`} strokeWidth="2.6" strokeLinecap="round" fill="none" />
      <path d="M35 11h4.5A2.5 2.5 0 0 1 42 13.5V16a8 8 0 0 1-8 8"
        stroke={`url(#${id})`} strokeWidth="2.6" strokeLinecap="round" fill="none" />

      {/* Taça */}
      <path d="M13 6h22v12c0 6.1-4.9 11-11 11s-11-4.9-11-11V6z" fill={`url(#${id})`} />

      {/* Haste e base */}
      <rect x="21.5" y="29" width="5" height="6" fill={`url(#${id})`} />
      <path d="M15 42v-1.5A5.5 5.5 0 0 1 20.5 35h7a5.5 5.5 0 0 1 5.5 5.5V42H15z"
        fill={`url(#${id})`} />

      {/* O número, gravado na taça */}
      <text x="24" y="22.5" textAnchor="middle" fontSize="16" fontWeight="800"
        fill={t.numero} style={{ fontFamily: 'inherit' }}>{numero}</text>
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
