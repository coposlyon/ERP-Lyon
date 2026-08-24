// ============================================================
// A ÁRVORE DE PERMISSÕES — O PRÓPRIO MENU, COM UMA FLAG POR ROTA.
//
// A tela antiga era uma matriz de 27 módulos abstratos: 'financial',
// 'returns', 'price-tables'. Quem configurava precisava traduzir de
// cabeça "o Financeiro vê Contas a Pagar" para uma chave técnica — e a
// tradução nem era exata, porque um módulo abre várias telas de uma
// vez, sem escolha.
//
// Aqui não há tradução: é o MESMO menu lateral que a pessoa vai ver,
// desenhado com os mesmos ícones, a mesma ordem e o mesmo recuo, com
// uma flag em cada linha. O administrador não configura permissão —
// ele olha o menu do outro e liga e desliga o que quiser.
//
// A fonte é `menuItems`, o mesmo arquivo que a Sidebar consome. Item
// novo no menu aparece aqui sozinho; não existe segunda lista para
// alguém esquecer de atualizar.
// ============================================================
import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Check, X, Minus, Plus, Search } from 'lucide-react';
import { menuItems, menuVendedor } from '@/lib/menu';

/** Todas as rotas de um item do menu (o próprio, ou as dos filhos). */
function rotasDe(item) {
  return item.children ? item.children.map(c => c.path) : (item.path ? [item.path] : []);
}

/** O menu inteiro achatado — usado pelo "marcar tudo" e pela contagem. */
function todasAsRotas() {
  return [
    ...menuItems.flatMap(rotasDe),
    ...menuVendedor.map(i => i.path),
  ].filter(Boolean);
}

// A área do vendedor é um app à parte, com menu próprio. Cada rota dela
// exige um módulo diferente na API — e nenhum desses módulos tem item
// no menu do ERP para ser marcado.
const MODULO_DO_VENDEDOR = {
  '/vendedor':              'vendedor',
  '/vendedor/pedidos':      'pedidos-vendedor',
  '/vendedor/catalogo':     'catalogo',
  '/vendedor/agenda':       'agenda',
  '/vendedor/comunicacao':  'comunicacao',
};

/**
 * Os módulos que estas rotas exigem.
 *
 * A API confere MÓDULO a cada requisição, não tela. Se alguém liberasse
 * a página de Estoque sem o módulo 'stock', o item apareceria no menu e
 * a tela abriria vazia com 403 no console — o tipo de bug que ninguém
 * associa a permissão.
 *
 * Três módulos entram sozinhos porque nenhuma tela do menu os alcança:
 *
 *   dashboard  é público e não guarda rota nenhuma da API
 *   pdv        nunca é a única exigência de rota alguma — quem tem
 *              'sales' já passa em todas elas
 *   vendedor   sai das próprias rotas da área, pelo mapa acima
 *
 * Antes isso era uma seção de caixinhas soltas no fim da tela, que
 * obrigava quem configura a saber de cor quais módulos o menu não
 * cobre. Não é conhecimento que se deva exigir de ninguém.
 */
function modulosDe(rotas) {
  const necessarios = new Set(['dashboard']);
  const visitar = itens => {
    for (const item of itens) {
      if (item.children) { visitar(item.children); continue; }
      if (!item.path || !rotas.includes(item.path) || !item.module) continue;
      for (const m of (Array.isArray(item.module) ? item.module : [item.module])) necessarios.add(m);
    }
  };
  visitar(menuItems);
  for (const [rota, modulo] of Object.entries(MODULO_DO_VENDEDOR)) {
    if (rotas.includes(rota)) necessarios.add(modulo);
  }
  if (necessarios.has('sales')) necessarios.add('pdv');
  return [...necessarios];
}

/**
 * Para onde esta pessoa vai quando entrar, e em qual dos dois apps.
 *
 * Eram dois campos que quem configura tinha de preencher à mão — e
 * errar o caminho da tela inicial jogava a pessoa numa página que ela
 * nem podia abrir. Agora as duas coisas saem do que foi marcado:
 * marcou só a área do vendedor, ela abre o app do vendedor; marcou
 * qualquer coisa do ERP, abre o ERP na primeira tela liberada.
 */
function derivarAcesso(screens) {
  const lista = screens || [];
  const rotasVendedor = Object.keys(MODULO_DO_VENDEDOR);
  const soVendedor = lista.length > 0 && lista.every(p => rotasVendedor.includes(p));
  if (soVendedor) return { layout: 'vendedor', home_path: '/vendedor' };
  const primeira = todasAsRotas().find(p => lista.includes(p));
  return { layout: 'erp', home_path: primeira || '/' };
}

/** O nome que a pessoa vê no menu para uma rota — não o caminho. */
function rotuloDaRota(path) {
  for (const item of menuItems) {
    if (item.path === path) return item.label;
    for (const filho of item.children || []) if (filho.path === path) return `${item.label} › ${filho.label}`;
  }
  const v = menuVendedor.find(i => i.path === path);
  return v ? `Área do vendedor › ${v.label}` : 'Dashboard';
}

/** A flag da linha: o que esta rota é para esta pessoa. */
function Flag({ estado, onClick, somenteLeitura }) {
  const visual = {
    liberado:  { Icone: Check, cls: 'bg-emerald-500/90 text-white border-emerald-400', titulo: 'Liberado' },
    bloqueado: { Icone: X,     cls: 'bg-transparent text-indigo-400/50 border-indigo-500/40', titulo: 'Bloqueado' },
    extra:     { Icone: Plus,  cls: 'bg-sky-500/90 text-white border-sky-400', titulo: 'Liberado só para esta pessoa' },
    retirado:  { Icone: Minus, cls: 'bg-rose-500/90 text-white border-rose-400', titulo: 'Retirado desta pessoa' },
  }[estado];
  const { Icone, cls, titulo } = visual;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={somenteLeitura}
      title={titulo}
      aria-label={titulo}
      aria-pressed={estado !== 'bloqueado'}
      className={`w-[18px] h-[18px] shrink-0 rounded border flex items-center justify-center
        transition-colors ${cls} ${somenteLeitura ? 'cursor-default opacity-70' : 'hover:brightness-110'}`}
    >
      <Icone size={12} strokeWidth={3} />
    </button>
  );
}

function Grupo({ item, telas, referencia, alternar, alternarVarias, somenteLeitura, busca, abertoInicial }) {
  const rotas = rotasDe(item);
  const filhos = item.children || (item.path ? [item] : []);

  const casa = t =>
    !busca ||
    t.label.toLowerCase().includes(busca) ||
    String(t.path).toLowerCase().includes(busca) ||
    item.label.toLowerCase().includes(busca);

  const visiveis = filhos.filter(casa);
  const [aberto, setAberto] = useState(abertoInicial);
  if (!visiveis.length) return null;

  const ligadas = rotas.filter(p => telas.includes(p)).length;
  const tudo = ligadas === rotas.length && rotas.length > 0;
  const abertoAgora = aberto || !!busca;

  // Item solto do menu (Dashboard): vira uma linha, não um grupo.
  if (!item.children) {
    const p = item.path;
    return (
      <Linha
        item={item} path={p} telas={telas} referencia={referencia}
        alternar={alternar} somenteLeitura={somenteLeitura} tamanho={18} raiz
      />
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-indigo-200">
        <button type="button" onClick={() => setAberto(v => !v)}
          className="flex items-center gap-3 flex-1 min-w-0 text-left hover:text-white transition-colors">
          <item.icon size={18} className="shrink-0" />
          <span className="flex-1 truncate">{item.label}</span>
          <span className={`text-[10px] font-mono tabular-nums px-1.5 py-0.5 rounded ${
            ligadas === 0 ? 'text-indigo-400/60'
              : tudo ? 'bg-emerald-500/20 text-emerald-300'
                : 'bg-amber-500/20 text-amber-300'
          }`}>
            {ligadas}/{rotas.length}
          </span>
          {abertoAgora ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        {!somenteLeitura && (
          <button type="button" onClick={() => alternarVarias(rotas, !tudo)}
            className="text-[10px] uppercase tracking-wide text-indigo-300 hover:text-white px-1.5 py-0.5 rounded hover:bg-white/10 shrink-0">
            {tudo ? 'nada' : 'tudo'}
          </button>
        )}
      </div>

      {abertoAgora && (
        <div className="ml-4 mt-1 space-y-0.5 border-l border-indigo-700 pl-3">
          {visiveis.map(filho => (
            <Linha
              key={filho.path} item={filho} path={filho.path} telas={telas} referencia={referencia}
              alternar={alternar} somenteLeitura={somenteLeitura} tamanho={15}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Linha({ item, path, telas, referencia, alternar, somenteLeitura, tamanho, raiz }) {
  const ligada = telas.includes(path);

  // No modo usuário, `referencia` são as telas do setor. A flag deixa de
  // ser sim/não e passa a dizer o que FOI MUDADO em relação ao setor —
  // que é a pergunta real de quem revisa um acesso individual.
  let estado = ligada ? 'liberado' : 'bloqueado';
  if (referencia) {
    const noSetor = referencia.includes(path);
    if (ligada && !noSetor) estado = 'extra';
    if (!ligada && noSetor) estado = 'retirado';
  }

  return (
    <div className={`flex items-center gap-3 px-3 py-1.5 rounded-lg group ${
      raiz ? 'text-sm font-medium' : 'text-xs'
    } text-indigo-200 hover:bg-white/5 transition-colors`}>
      <item.icon size={tamanho} className="shrink-0 opacity-80" />
      <span className={`flex-1 truncate ${ligada ? '' : 'opacity-45'}`}>{item.label}</span>
      <code className="text-[9px] text-indigo-400/50 font-mono truncate max-w-[9rem] hidden sm:block">{path}</code>
      <Flag estado={estado} somenteLeitura={somenteLeitura} onClick={() => alternar(path)} />
    </div>
  );
}

/**
 * @param {string[]|null} telas  rotas liberadas; null = herda (mostra a referência)
 * @param {string[]|null} referencia  telas do setor, no modo usuário
 */
export default function ArvorePermissoes({
  telas, aoMudar, referencia = null, somenteLeitura = false, rodape = null,
}) {
  const [busca, setBusca] = useState('');
  const efetivas = telas || referencia || [];
  const TODAS = useMemo(todasAsRotas, []);

  function alternarVarias(rotas, ligar) {
    const base = new Set(efetivas);
    for (const r of rotas) { if (ligar) base.add(r); else base.delete(r); }
    const lista = [...base];
    aoMudar({ screens: lista, modules: modulosDe(lista) });
  }
  const alternar = rota => alternarVarias([rota], !efetivas.includes(rota));

  const q = busca.trim().toLowerCase();
  const total = efetivas.length;

  return (
    <div className="rounded-xl overflow-hidden border border-indigo-900/40">
      {/* Barra de controle — fora do "menu" para não confundir com ele */}
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 bg-[#171442] border-b border-indigo-900/50">
        <div className="relative flex-1 min-w-[10rem]">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-indigo-400/70" />
          <input
            value={busca} onChange={e => setBusca(e.target.value)}
            placeholder="Buscar tela…"
            className="w-full bg-white/5 border border-indigo-800/60 rounded-lg pl-8 pr-2 py-1.5
                       text-xs text-indigo-100 placeholder-indigo-400/60 focus:outline-none
                       focus:ring-1 focus:ring-primary-500"
          />
        </div>
        <span className="text-[11px] font-mono tabular-nums text-indigo-300">
          {total}/{TODAS.length} telas
        </span>
        {!somenteLeitura && (
          <div className="flex gap-1">
            <button type="button"
              onClick={() => aoMudar({ screens: TODAS, modules: modulosDe(TODAS) })}
              className="text-[10px] uppercase tracking-wide px-2 py-1 rounded bg-white/5 text-indigo-200 hover:bg-white/10">
              Tudo
            </button>
            <button type="button"
              onClick={() => aoMudar({ screens: [], modules: [] })}
              className="text-[10px] uppercase tracking-wide px-2 py-1 rounded bg-white/5 text-indigo-200 hover:bg-white/10">
              Nada
            </button>
          </div>
        )}
      </div>

      {/* O menu, igual ao que a pessoa vai ver */}
      <div className="bg-sidebar px-2 py-3 space-y-1 max-h-[32rem] overflow-y-auto">
        {menuItems.map(item => (
          <Grupo
            key={item.label} item={item} telas={efetivas} referencia={referencia}
            alternar={alternar} alternarVarias={alternarVarias}
            somenteLeitura={somenteLeitura} busca={q} abertoInicial={false}
          />
        ))}

        {/* A área do vendedor é outro layout — por isso vem separada,
            e não misturada com os grupos do ERP. */}
        <div className="pt-2 mt-2 border-t border-indigo-800/60">
          <p className="px-3 pb-1 text-[10px] uppercase tracking-wider text-indigo-400/70">
            Área do vendedor · layout próprio
          </p>
          <div className="space-y-0.5">
            {menuVendedor
              .filter(i => !q || i.label.toLowerCase().includes(q) || i.path.includes(q))
              .map(i => (
                <Linha
                  key={i.path} item={i} path={i.path} telas={efetivas} referencia={referencia}
                  alternar={alternar} somenteLeitura={somenteLeitura} tamanho={15}
                />
              ))}
          </div>
        </div>
      </div>

      {rodape && (
        <div className="px-3 py-2 bg-[#171442] border-t border-indigo-900/50 text-[11px] text-indigo-300">
          {rodape}
        </div>
      )}
    </div>
  );
}

export { modulosDe, todasAsRotas, derivarAcesso, rotuloDaRota };
