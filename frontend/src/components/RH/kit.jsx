// ============================================================
// O KIT VISUAL DO RH — o padrão aprovado nas telas de referência.
//
// As dez telas de RH compartilham a mesma gramática: fundo azul-noite,
// cartão de indicador com ícone em quadrado tingido, bloco com título
// e link de rodapé, medidor circular, pílula de status e tabela de
// linhas finas. Escrever isso uma vez aqui é o que faz as telas
// parecerem a mesma família — e o que permite corrigir a família
// inteira mexendo num arquivo só.
//
// As cores vivem em `TOM`, não espalhadas por classes: o mesmo verde
// que pinta "Enviado" pinta o anel do medidor de conformidade, e um
// dia em que esse verde mudar, muda nos dois.
//
// Este kit NÃO depende do tema claro/escuro do ERP: as telas de
// referência são escuras sempre. Por isso as cores são literais aqui,
// e não tokens que o tema possa inverter.
// ============================================================
import { ChevronRight, ArrowRight } from 'lucide-react';

/* ── A paleta da referência ──────────────────────────────── */
export const TOM = {
  fundo:     '#080D1C',
  cartao:    '#0C1426',
  cartaoAlt: '#0F1930',
  borda:     '#1B2942',
  bordaSuave:'#16223A',
  texto:     '#E7EDF9',
  texto2:    '#93A6C4',
  texto3:    '#5F739A',
  azul:      '#4D8DF6',
  verde:     '#2DD4A7',
  ambar:     '#F5B740',
  vermelho:  '#F2545B',
  violeta:   '#A78BFA',
  rosa:      '#EC4899',
  ciano:     '#38BDF8',
};

/** As sete cores nomeadas por PAPEL, que é como as telas as pedem. */
const PAPEL = {
  azul:     { fg: TOM.azul,     bg: 'rgba(77,141,246,.12)',  bd: 'rgba(77,141,246,.30)' },
  verde:    { fg: TOM.verde,    bg: 'rgba(45,212,167,.12)',  bd: 'rgba(45,212,167,.30)' },
  ambar:    { fg: TOM.ambar,    bg: 'rgba(245,183,64,.12)',  bd: 'rgba(245,183,64,.30)' },
  vermelho: { fg: TOM.vermelho, bg: 'rgba(242,84,91,.12)',   bd: 'rgba(242,84,91,.30)' },
  violeta:  { fg: TOM.violeta,  bg: 'rgba(167,139,250,.12)', bd: 'rgba(167,139,250,.30)' },
  rosa:     { fg: TOM.rosa,     bg: 'rgba(236,72,153,.12)',  bd: 'rgba(236,72,153,.30)' },
  ciano:    { fg: TOM.ciano,    bg: 'rgba(56,189,248,.12)',  bd: 'rgba(56,189,248,.30)' },
  cinza:    { fg: TOM.texto2,   bg: 'rgba(147,166,196,.10)', bd: 'rgba(147,166,196,.22)' },
};
export const cor = k => PAPEL[k] || PAPEL.cinza;

/* ── A moldura da página ─────────────────────────────────── */

/**
 * Cabeçalho da página: título, uma linha de explicação e as ações.
 * A linha de explicação não é enfeite — em todas as telas de
 * referência ela diz o que a tela FAZ por você, não o que ela é.
 */
export function Cabecalho({ titulo, descricao, acoes }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
      <div>
        <h1 className="text-2xl font-semibold" style={{ color: TOM.texto }}>{titulo}</h1>
        {descricao && <p className="text-sm mt-0.5" style={{ color: TOM.texto2 }}>{descricao}</p>}
      </div>
      {acoes && <div className="flex flex-wrap items-center gap-2">{acoes}</div>}
    </div>
  );
}

/** O fundo azul-noite que envolve a tela inteira. */
export function Pagina({ children }) {
  return (
    <div className="-m-4 sm:-m-6 p-4 sm:p-6 min-h-full" style={{ background: TOM.fundo }}>
      {children}
    </div>
  );
}

/* ── Indicador do topo ───────────────────────────────────── */

/**
 * O cartão de número grande. `rodape` recebe a cor do papel quando é
 * uma variação ("+2 esta semana", "2 críticos") e cinza quando é só
 * contexto ("Competência 05/2025").
 */
export function Indicador({ icone: Icone, tom = 'azul', titulo, valor, rodape, rodapeTom }) {
  const c = cor(tom);
  return (
    <div className="rounded-xl p-4 flex items-start gap-3"
      style={{ background: TOM.cartao, border: `1px solid ${TOM.borda}` }}>
      <span className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
        style={{ background: c.bg, color: c.fg, border: `1px solid ${c.bd}` }}>
        <Icone size={19} />
      </span>
      <div className="min-w-0">
        <p className="text-[12px] leading-tight" style={{ color: TOM.texto2 }}>{titulo}</p>
        <p className="text-[26px] font-semibold leading-tight tabular-nums" style={{ color: TOM.texto }}>
          {valor ?? '—'}
        </p>
        {rodape && (
          <p className="text-[11px] leading-tight mt-0.5"
            style={{ color: rodapeTom ? cor(rodapeTom).fg : TOM.texto3 }}>{rodape}</p>
        )}
      </div>
    </div>
  );
}

/** A faixa de indicadores. Seis ou oito por linha, como na referência. */
export function Indicadores({ children, colunas = 6 }) {
  return (
    <div className={`grid gap-3 mb-4 grid-cols-2 lg:grid-cols-3 xl:grid-cols-${colunas}`}>
      {children}
    </div>
  );
}

/* ── Bloco ───────────────────────────────────────────────── */

/**
 * O cartão de conteúdo. O `rodape` é sempre um link de "ver tudo" —
 * é assim em todas as telas de referência, e é o que mantém a tela
 * curta sem esconder o resto.
 */
export function Bloco({ titulo, descricao, icone: Icone, tomIcone = 'azul', acao, rodape, aoClicarRodape, children, className = '', semPadding }) {
  const c = cor(tomIcone);
  return (
    <section className={`rounded-xl flex flex-col ${className}`}
      style={{ background: TOM.cartao, border: `1px solid ${TOM.borda}` }}>
      {(titulo || acao) && (
        <div className="flex items-start justify-between gap-3 px-4 pt-3.5 pb-2">
          <div className="flex items-start gap-2.5 min-w-0">
            {Icone && (
              <span className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                style={{ background: c.bg, color: c.fg }}>
                <Icone size={15} />
              </span>
            )}
            <div className="min-w-0">
              <h2 className="text-[15px] font-medium leading-tight" style={{ color: TOM.texto }}>{titulo}</h2>
              {descricao && <p className="text-[11.5px] mt-0.5" style={{ color: TOM.texto3 }}>{descricao}</p>}
            </div>
          </div>
          {acao}
        </div>
      )}
      <div className={`flex-1 ${semPadding ? '' : 'px-4 pb-3.5'}`}>{children}</div>
      {rodape && (
        <button type="button" onClick={aoClicarRodape}
          className="flex items-center justify-between px-4 py-2.5 text-[12px] transition-colors hover:bg-white/[.03]"
          style={{ color: TOM.azul, borderTop: `1px solid ${TOM.bordaSuave}` }}>
          <span>{rodape}</span>
          <ArrowRight size={13} />
        </button>
      )}
    </section>
  );
}

/* ── Pílula de status ────────────────────────────────────── */

export function Pilula({ tom = 'cinza', children, ponto }) {
  const c = cor(tom);
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap"
      style={{ background: c.bg, color: c.fg, border: `1px solid ${c.bd}` }}>
      {ponto && <span className="w-1.5 h-1.5 rounded-full" style={{ background: c.fg }} />}
      {children}
    </span>
  );
}

/* ── Medidor circular ────────────────────────────────────── */

/**
 * O anel de percentual. Desenhado em SVG porque é um número só: subir
 * uma biblioteca de gráficos para desenhar um círculo custaria mais
 * do que o círculo.
 *
 * `fatias` desenha o anel dividido (o SLA, o resumo financeiro). Sem
 * `fatias`, desenha o progresso simples.
 */
export function Medidor({ valor = 0, tom = 'verde', tamanho = 120, espessura = 10, rotulo, sub, fatias }) {
  const r = (tamanho - espessura) / 2;
  const circ = 2 * Math.PI * r;
  const centro = tamanho / 2;

  let acumulado = 0;
  const partes = (fatias || []).filter(f => f.valor > 0);
  const total = partes.reduce((s, f) => s + f.valor, 0) || 1;

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: tamanho, height: tamanho }}>
      <svg width={tamanho} height={tamanho} className="-rotate-90">
        <circle cx={centro} cy={centro} r={r} fill="none" strokeWidth={espessura} stroke={TOM.bordaSuave} />
        {partes.length ? partes.map((f, i) => {
          const frac = f.valor / total;
          const dash = `${circ * frac} ${circ * (1 - frac)}`;
          const off = -circ * acumulado;
          acumulado += frac;
          return <circle key={i} cx={centro} cy={centro} r={r} fill="none" strokeWidth={espessura}
            stroke={cor(f.tom).fg} strokeDasharray={dash} strokeDashoffset={off} strokeLinecap="butt" />;
        }) : (
          <circle cx={centro} cy={centro} r={r} fill="none" strokeWidth={espessura}
            stroke={cor(tom).fg} strokeLinecap="round"
            strokeDasharray={`${circ * (Math.min(100, Math.max(0, valor)) / 100)} ${circ}`} />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-semibold leading-none tabular-nums"
          style={{ color: TOM.texto, fontSize: tamanho * 0.22 }}>
          {rotulo ?? `${Math.round(valor)}%`}
        </span>
        {sub && <span className="text-[10px] mt-1 text-center px-2 leading-tight" style={{ color: TOM.texto3 }}>{sub}</span>}
      </div>
    </div>
  );
}

/* ── Tabela ──────────────────────────────────────────────── */

export function Tabela({ colunas, children, vazio = 'Nada por aqui.' }) {
  const temLinhas = Array.isArray(children) ? children.filter(Boolean).length > 0 : !!children;
  return (
    <div className="overflow-x-auto -mx-1 px-1">
      <table className="w-full text-[13px]" style={{ borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {colunas.map((c, i) => (
              <th key={i} className={`text-left font-normal pb-2 pt-1 px-2 text-[11.5px] whitespace-nowrap ${c.alinha || ''}`}
                style={{ color: TOM.texto3, borderBottom: `1px solid ${TOM.bordaSuave}` }}>
                {c.rotulo}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{temLinhas ? children : (
          <tr><td colSpan={colunas.length} className="text-center py-8 text-[13px]" style={{ color: TOM.texto3 }}>{vazio}</td></tr>
        )}</tbody>
      </table>
    </div>
  );
}

export function Linha({ children, aoClicar }) {
  return (
    <tr onClick={aoClicar} className={aoClicar ? 'cursor-pointer hover:bg-white/[.03]' : ''}
      style={{ borderBottom: `1px solid ${TOM.bordaSuave}` }}>
      {children}
    </tr>
  );
}

export function Cel({ children, className = '', style }) {
  return (
    <td className={`py-2.5 px-2 align-middle ${className}`} style={{ color: TOM.texto2, ...style }}>
      {children}
    </td>
  );
}

/* ── Pessoa (avatar + nome + subtítulo) ──────────────────── */

const CORES_AVATAR = ['#4D8DF6', '#2DD4A7', '#A78BFA', '#F5B740', '#EC4899', '#38BDF8', '#F2545B'];

export function Pessoa({ nome, sub, foto, tamanho = 30 }) {
  const iniciais = String(nome || '?').trim().split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase();
  const idx = String(nome || '').split('').reduce((s, ch) => s + ch.charCodeAt(0), 0) % CORES_AVATAR.length;
  return (
    <div className="flex items-center gap-2.5 min-w-0">
      {foto
        ? <img src={foto} alt="" className="rounded-full object-cover shrink-0" style={{ width: tamanho, height: tamanho }} />
        : <span className="rounded-full flex items-center justify-center shrink-0 font-semibold"
            style={{ width: tamanho, height: tamanho, fontSize: tamanho * 0.36,
                     background: `${CORES_AVATAR[idx]}22`, color: CORES_AVATAR[idx] }}>
            {iniciais}
          </span>}
      <div className="min-w-0">
        <p className="truncate leading-tight" style={{ color: TOM.texto }}>{nome}</p>
        {sub && <p className="text-[11px] truncate leading-tight" style={{ color: TOM.texto3 }}>{sub}</p>}
      </div>
    </div>
  );
}

/* ── Lista de itens do painel lateral ────────────────────── */

/** Linha de "chave: valor" — o Resumo que aparece em toda tela. */
export function ItemResumo({ rotulo, valor, tom }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 text-[13px]">
      <span style={{ color: TOM.texto2 }}>{rotulo}</span>
      <span className="font-medium tabular-nums" style={{ color: tom ? cor(tom).fg : TOM.texto }}>
        {valor ?? '—'}
      </span>
    </div>
  );
}

/** Linha com ícone à esquerda, texto e um valor/pílula à direita. */
export function ItemLista({ icone: Icone, tom = 'azul', titulo, sub, direita, aoClicar }) {
  const c = cor(tom);
  return (
    <div onClick={aoClicar}
      className={`flex items-center gap-2.5 py-2 ${aoClicar ? 'cursor-pointer hover:bg-white/[.03] -mx-2 px-2 rounded-lg' : ''}`}>
      {Icone && (
        <span className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: c.bg, color: c.fg }}>
          <Icone size={14} />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[13px] leading-tight truncate" style={{ color: TOM.texto }}>{titulo}</p>
        {sub && <p className="text-[11px] leading-tight truncate" style={{ color: TOM.texto3 }}>{sub}</p>}
      </div>
      {direita && <div className="shrink-0">{direita}</div>}
    </div>
  );
}

/** Item de checklist: ícone de estado + texto + marca à direita. */
export function ItemCheck({ ok, titulo, direita, tomPendente = 'ambar' }) {
  const c = cor(ok ? 'verde' : tomPendente);
  return (
    <div className="flex items-center gap-2.5 py-1.5">
      <span className="w-4 h-4 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold"
        style={{ background: c.bg, color: c.fg, border: `1px solid ${c.bd}` }}>
        {ok ? '✓' : '!'}
      </span>
      <span className="flex-1 text-[12.5px] min-w-0 truncate" style={{ color: TOM.texto2 }}>{titulo}</span>
      {direita}
    </div>
  );
}

/* ── Botões ──────────────────────────────────────────────── */

export function Botao({ tom = 'azul', primario, children, ...props }) {
  const c = cor(tom);
  return (
    <button type="button" {...props}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12.5px] font-medium
                 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      style={primario
        ? { background: c.fg, color: '#07101F' }
        : { background: 'transparent', color: TOM.texto2, border: `1px solid ${TOM.borda}` }}>
      {children}
    </button>
  );
}

/** Link discreto com seta, o "ver tudo" que aparece solto no meio. */
export function LinkSeta({ children, ...props }) {
  return (
    <button type="button" {...props}
      className="inline-flex items-center gap-1 text-[12px] hover:underline" style={{ color: TOM.azul }}>
      {children} <ChevronRight size={13} />
    </button>
  );
}

/** Campo de seleção com a cara da referência (mês, filtro). */
export function Campo({ children, className = '' }) {
  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-[12.5px] ${className}`}
      style={{ background: TOM.cartao, border: `1px solid ${TOM.borda}`, color: TOM.texto2 }}>
      {children}
    </div>
  );
}

/* ── Barra horizontal (usada em progresso de etapa) ──────── */

export function Barra({ valor = 0, tom = 'azul', altura = 4 }) {
  return (
    <div className="w-full rounded-full overflow-hidden" style={{ height: altura, background: TOM.bordaSuave }}>
      <div className="h-full rounded-full transition-all"
        style={{ width: `${Math.min(100, Math.max(0, valor))}%`, background: cor(tom).fg }} />
    </div>
  );
}
