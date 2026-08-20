// ============================================================
// ADMINISTRATIVO → CATÁLOGO.
//
// A ponta de cima da corrente (§34):
//
//   ADMINISTRATIVO → catálogo → configurador → criador de arte →
//   orçamento → pagamento → pedido de venda → produção
//
// Tudo que o cliente encontra no site sai daqui. Cinco cadastros, e cada
// um resolve uma pergunta que a tela do cliente faz:
//
//   Famílias      "que categorias aparecem na vitrine?"       (§2)
//   Gabaritos     "onde a arte pode existir, em milímetros?"  (§17)
//   Caixa do liso "quantas unidades e quantas cores?"         (§9)
//   Ocasiões      "casamento, formatura, o que mais?"         (§15)
//   Artes         "que modelos prontos a Lyon oferece?"       (§20)
//
// O QUE NÃO ESTÁ AQUI, DE PROPÓSITO. Produto, acabamento, cor e a matriz
// de compatibilidade continuam onde sempre estiveram — no cadastro de
// Produtos e na configuração técnica. Se o Long Drink parar de aceitar
// "Degradê + Borda" lá, o catálogo para de oferecer sozinho, sem
// ninguém tocar nesta tela. Repetir esses cadastros aqui seria criar a
// segunda verdade que amanhã discorda da primeira.
// ============================================================
import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  LayoutGrid, Ruler, Package, Sparkles, Palette, Plus, Trash2, Save,
  Loader2, Eye, EyeOff, Star, Info,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/api';

const ABAS = [
  { key: 'familias',  label: 'Famílias',      icone: LayoutGrid, cor: 'violet' },
  { key: 'gabaritos', label: 'Gabaritos',     icone: Ruler,      cor: 'blue' },
  { key: 'embalagem', label: 'Caixa do liso', icone: Package,    cor: 'teal' },
  { key: 'ocasioes',  label: 'Ocasiões',      icone: Sparkles,   cor: 'pink' },
  { key: 'artes',     label: 'Banco de artes', icone: Palette,   cor: 'amber' },
];

export default function CatalogoAdmin() {
  const [aba, setAba] = useState('familias');

  // Categorias e produtos são o alfabeto dos cinco cadastros: quem vira
  // família, quem ganha gabarito, quem tem caixa. Buscados uma vez e
  // repassados — cinco abas pedindo a mesma lista seria cinco esperas.
  const { data: categorias = [] } = useQuery({
    queryKey: ['products', 'categories', 'list'],
    queryFn: () => api.get('/products/categories/list'),
    staleTime: 5 * 60 * 1000,
  });
  const { data: produtosResp } = useQuery({
    queryKey: ['catalogo-admin', 'produtos'],
    queryFn: () => api.get('/products?limit=1000&is_active=true'),
    staleTime: 5 * 60 * 1000,
  });
  const produtos = produtosResp?.data || produtosResp?.products || produtosResp || [];

  const Atual = {
    familias: Familias, gabaritos: Gabaritos, embalagem: Embalagem,
    ocasioes: Ocasioes, artes: Artes,
  }[aba];

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-violet-100 rounded-lg flex items-center justify-center">
            <LayoutGrid size={18} className="text-violet-600" />
          </div>
          <div>
            <h1 className="page-title">Catálogo</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              O que o cliente vê no catálogo de produtos personalizados
            </p>
          </div>
        </div>
      </div>

      <div className="flex gap-1.5 flex-wrap">
        {ABAS.map(a => (
          <button key={a.key} onClick={() => setAba(a.key)}
            className={`px-3.5 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors ${
              aba === a.key ? 'bg-violet-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}>
            <a.icone size={15} /> {a.label}
          </button>
        ))}
      </div>

      <Atual categorias={Array.isArray(categorias) ? categorias : []}
        produtos={Array.isArray(produtos) ? produtos : []} />
    </div>
  );
}

// ── Famílias (§2) ───────────────────────────────────────────

/**
 * A vitrine. Uma família reúne várias categorias técnicas: "Canecas"
 * junta CANECA TRADICIONAL e CANECA SLIM TRADICIONAL, porque o cliente
 * procura "caneca" e não o nome que a fábrica usa.
 *
 * FAMÍLIA VAZIA NÃO APARECE NO SITE. Cadastrar "Squeezes" antes de ter
 * squeeze é normal e não quebra nada: o card só nasce quando houver
 * produto dentro.
 */
function Familias({ categorias }) {
  const qc = useQueryClient();
  const [editando, setEditando] = useState(null);

  const { data: familias = [], isLoading } = useQuery({
    queryKey: ['catalogo-admin', 'familias'],
    queryFn: () => api.get('/catalogo-admin/familias'),
  });

  const salvar = useMutation({
    mutationFn: f => (f.id
      ? api.put(`/catalogo-admin/familias/${f.id}`, f)
      : api.post('/catalogo-admin/familias', f)),
    onSuccess: () => {
      toast.success('Família salva');
      setEditando(null);
      qc.invalidateQueries(['catalogo-admin', 'familias']);
    },
    onError: e => toast.error(e.error || 'Erro ao salvar'),
  });

  const excluir = useMutation({
    mutationFn: id => api.delete(`/catalogo-admin/familias/${id}`),
    onSuccess: () => { toast.success('Família removida'); qc.invalidateQueries(['catalogo-admin', 'familias']); },
    onError: e => toast.error(e.error || 'Erro ao remover'),
  });

  const nova = () => setEditando({
    name: '', slug: '', descricao: '', icone: '', seq: (familias.length + 1) * 10,
    is_active: true, categorias: [], produtos: [],
  });

  if (isLoading) return <Carregando />;

  return (
    <div className="space-y-4">
      <Explicacao>
        Cada família é um card da primeira tela do catálogo. O cliente clica e vê os modelos de
        dentro. Família sem produto vinculado não aparece para o cliente.
      </Explicacao>

      <button onClick={nova} className="btn btn-primary btn-sm">
        <Plus size={15} /> Nova família
      </button>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {familias.map(f => (
          <div key={f.id} className="card p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold text-gray-900 truncate">{f.name}</p>
                <p className="text-xs text-gray-500 font-mono">/catalogo/{f.slug}</p>
              </div>
              {!f.is_active && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 shrink-0">
                  inativa
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-2">
              {f.itens?.length || 0} vínculo(s) · ordem {f.seq}
              {f.icone ? ` · ícone ${f.icone}` : ''}
            </p>
            <div className="flex gap-2 mt-3">
              <button className="btn-secondary btn-sm"
                onClick={() => setEditando({
                  ...f,
                  categorias: (f.itens || []).filter(i => i.category_id).map(i => i.category_id),
                  produtos: (f.itens || []).filter(i => i.product_id).map(i => i.product_id),
                })}>
                Editar
              </button>
              <button className="btn-secondary btn-sm text-red-600"
                onClick={() => confirmar(`Remover a família "${f.name}"?`) && excluir.mutate(f.id)}>
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        ))}
        {!familias.length && <Vazio texto="Nenhuma família cadastrada ainda." />}
      </div>

      {editando && (
        <Modal titulo={editando.id ? 'Editar família' : 'Nova família'} onFechar={() => setEditando(null)}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Texto rotulo="Nome da família" valor={editando.name}
              dica="É o que o cliente lê no card. Ex.: Canecas"
              onMudar={v => setEditando(a => ({ ...a, name: v }))} />
            <Texto rotulo="Endereço na URL (slug)" valor={editando.slug}
              dica="Vazio = derivado do nome. Mudar depois quebra links já enviados."
              onMudar={v => setEditando(a => ({ ...a, slug: v }))} />
            <Texto rotulo="Ícone (nome lucide)" valor={editando.icone}
              dica="Ex.: Coffee, CupSoda, Wine. Nome errado cai no ícone padrão."
              onMudar={v => setEditando(a => ({ ...a, icone: v }))} />
            <Numero rotulo="Ordem na vitrine" valor={editando.seq}
              onMudar={v => setEditando(a => ({ ...a, seq: v }))} />
          </div>

          <Texto rotulo="Descrição (opcional)" valor={editando.descricao}
            onMudar={v => setEditando(a => ({ ...a, descricao: v }))} />

          <Interruptor rotulo="Aparece no catálogo" ligado={editando.is_active !== false}
            onMudar={v => setEditando(a => ({ ...a, is_active: v }))} />

          <div className="mt-4">
            <label className="label text-xs">Categorias desta família</label>
            <p className="text-[11px] text-gray-500 mb-2">
              Marque as categorias técnicas que entram na vitrine desta família.
            </p>
            <div className="max-h-56 overflow-y-auto border rounded-lg p-2 space-y-1">
              {categorias.map(c => (
                <label key={c.id} className="flex items-center gap-2 text-sm px-1.5 py-1 rounded hover:bg-gray-50">
                  <input type="checkbox" checked={editando.categorias.includes(c.id)}
                    onChange={e => setEditando(a => ({
                      ...a,
                      categorias: e.target.checked
                        ? [...a.categorias, c.id]
                        : a.categorias.filter(x => x !== c.id),
                    }))} />
                  <span className="truncate">{c.name}</span>
                </label>
              ))}
              {!categorias.length && <p className="text-xs text-gray-400 p-2">Nenhuma categoria cadastrada.</p>}
            </div>
          </div>

          <BotoesModal ocupado={salvar.isPending}
            onCancelar={() => setEditando(null)}
            onSalvar={() => salvar.mutate(editando)} />
        </Modal>
      )}
    </div>
  );
}

// ── Gabaritos (§17) ─────────────────────────────────────────

/**
 * A medida da área de impressão, em milímetros.
 *
 * SEM ISSO O EDITOR DE ARTE NÃO ABRE, e é assim de propósito. Deixar o
 * cliente montar arte sem medida é prometer uma impressão que ninguém
 * sabe se cabe — e a arte volta cortada da gráfica, com prejuízo da
 * Lyon e o cliente jurando que na tela estava certo.
 *
 * Regra de PRODUTO vence regra de CATEGORIA: o normal é cadastrar por
 * categoria e abrir exceção só onde a peça foge do padrão.
 */
function Gabaritos({ categorias, produtos }) {
  return (
    <RegraPorAlvo
      chave="gabaritos"
      titulo="Gabarito da arte"
      explicacao="A área em que a arte pode existir, em milímetros. A linha vermelha do editor é este retângulo; a azul é a margem de segurança."
      categorias={categorias} produtos={produtos}
      padrao={{ altura_mm: 120, largura_mm: 45, margem_mm: 2, permite_verso: true, observacao: '' }}
      colunas={[
        { key: 'altura_mm', rotulo: 'Altura (mm)', tipo: 'numero' },
        { key: 'largura_mm', rotulo: 'Largura (mm)', tipo: 'numero' },
        { key: 'margem_mm', rotulo: 'Margem segura (mm)', tipo: 'numero' },
        { key: 'permite_verso', rotulo: 'Aceita verso', tipo: 'sim_nao' },
        { key: 'observacao', rotulo: 'Observação', tipo: 'texto' },
      ]}
      resumo={r => `${r.largura_mm} × ${r.altura_mm} mm · margem ${r.margem_mm} mm${r.permite_verso === false ? ' · só frente' : ''}`} />
  );
}

// ── Caixa do pedido liso (§9) ───────────────────────────────

/**
 * "Caixa de 100, até 4 cores."
 *
 * É regra COMERCIAL, e regra comercial muda. Fica aqui e não na página
 * porque amanhã a caneca pode vir 48 por caixa sem que ninguém precise
 * abrir o código.
 */
function Embalagem({ categorias, produtos }) {
  return (
    <RegraPorAlvo
      chave="embalagem"
      titulo="Caixa do pedido liso"
      explicacao="No modo liso o cliente compra caixa fechada. Estes números viram o mínimo de unidades e o teto de cores que a tela do cliente aceita."
      categorias={categorias} produtos={produtos}
      padrao={{ caixa_qtd: 100, max_cores_caixa: 4, min_caixas: 1 }}
      colunas={[
        { key: 'caixa_qtd', rotulo: 'Unidades por caixa', tipo: 'numero' },
        { key: 'max_cores_caixa', rotulo: 'Máximo de cores na caixa', tipo: 'numero' },
        { key: 'min_caixas', rotulo: 'Mínimo de caixas', tipo: 'numero' },
      ]}
      resumo={r => `caixa de ${r.caixa_qtd} un · até ${r.max_cores_caixa} cores · mínimo ${r.min_caixas} caixa(s)`} />
  );
}

/**
 * O cadastro de uma regra que vale para uma CATEGORIA ou um PRODUTO.
 *
 * Gabarito e caixa do liso têm a mesma forma: escolha o alvo, informe os
 * números. Escrever duas telas quase iguais seria duas telas para
 * consertar quando o botão mudar de lugar.
 */
function RegraPorAlvo({ chave, titulo, explicacao, categorias, produtos, padrao, colunas, resumo }) {
  const qc = useQueryClient();
  const [editando, setEditando] = useState(null);

  const { data: regras = [], isLoading } = useQuery({
    queryKey: ['catalogo-admin', chave],
    queryFn: () => api.get(`/catalogo-admin/${chave}`),
  });

  const salvar = useMutation({
    mutationFn: r => (r.id
      ? api.put(`/catalogo-admin/${chave}/${r.id}`, r)
      : api.post(`/catalogo-admin/${chave}`, r)),
    onSuccess: () => {
      toast.success('Regra salva');
      setEditando(null);
      qc.invalidateQueries(['catalogo-admin', chave]);
    },
    onError: e => toast.error(e.error || 'Erro ao salvar'),
  });

  const excluir = useMutation({
    mutationFn: id => api.delete(`/catalogo-admin/${chave}/${id}`),
    onSuccess: () => { toast.success('Regra removida'); qc.invalidateQueries(['catalogo-admin', chave]); },
    onError: e => toast.error(e.error || 'Erro ao remover'),
  });

  const nomeDoAlvo = useMemo(() => {
    const mapa = new Map();
    for (const c of categorias) mapa.set(`c:${c.id}`, `Categoria · ${c.name}`);
    for (const p of produtos) mapa.set(`p:${p.id}`, `Produto · ${p.name}`);
    return mapa;
  }, [categorias, produtos]);

  const rotuloAlvo = r => nomeDoAlvo.get(r.category_id ? `c:${r.category_id}` : `p:${r.product_id}`)
    || '(alvo removido do cadastro)';

  if (isLoading) return <Carregando />;

  return (
    <div className="space-y-4">
      <Explicacao>{explicacao}</Explicacao>

      <button onClick={() => setEditando({ ...padrao, category_id: '', product_id: '' })}
        className="btn btn-primary btn-sm">
        <Plus size={15} /> Nova regra
      </button>

      <div className="card divide-y">
        {regras.map(r => (
          <div key={r.id} className="p-3.5 flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-medium text-sm text-gray-900 truncate">{rotuloAlvo(r)}</p>
              <p className="text-xs text-gray-500 mt-0.5">{resumo(r)}</p>
            </div>
            <button className="btn-secondary btn-sm" onClick={() => setEditando(r)}>Editar</button>
            <button className="btn-secondary btn-sm text-red-600"
              onClick={() => confirmar('Remover esta regra?') && excluir.mutate(r.id)}>
              <Trash2 size={13} />
            </button>
          </div>
        ))}
        {!regras.length && <Vazio texto={`Nenhum ${titulo.toLowerCase()} cadastrado.`} />}
      </div>

      {editando && (
        <Modal titulo={editando.id ? `Editar ${titulo.toLowerCase()}` : titulo} onFechar={() => setEditando(null)}>
          {!editando.id && (
            <>
              <p className="text-[11px] text-gray-500 mb-2">
                A regra vale para uma categoria inteira OU para um produto específico. Produto vence
                categoria — cadastre por categoria e abra exceção só onde a peça foge do padrão.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="label text-xs">Categoria</label>
                  <select className="input text-sm" value={editando.category_id || ''}
                    onChange={e => setEditando(a => ({ ...a, category_id: e.target.value, product_id: '' }))}>
                    <option value="">—</option>
                    {categorias.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label text-xs">…ou produto</label>
                  <select className="input text-sm" value={editando.product_id || ''}
                    onChange={e => setEditando(a => ({ ...a, product_id: e.target.value, category_id: '' }))}>
                    <option value="">—</option>
                    {produtos.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
              </div>
            </>
          )}

          <div className="grid gap-3 sm:grid-cols-2 mt-3">
            {colunas.map(col => (
              col.tipo === 'sim_nao' ? (
                <Interruptor key={col.key} rotulo={col.rotulo} ligado={editando[col.key] !== false}
                  onMudar={v => setEditando(a => ({ ...a, [col.key]: v }))} />
              ) : col.tipo === 'numero' ? (
                <Numero key={col.key} rotulo={col.rotulo} valor={editando[col.key]}
                  onMudar={v => setEditando(a => ({ ...a, [col.key]: v }))} />
              ) : (
                <Texto key={col.key} rotulo={col.rotulo} valor={editando[col.key]}
                  onMudar={v => setEditando(a => ({ ...a, [col.key]: v }))} />
              )
            ))}
          </div>

          <BotoesModal ocupado={salvar.isPending}
            onCancelar={() => setEditando(null)}
            onSalvar={() => salvar.mutate(editando)} />
        </Modal>
      )}
    </div>
  );
}

// ── Ocasiões (§15) ──────────────────────────────────────────

/**
 * Casamento, formatura, aniversário — e o que vier.
 *
 * "Em destaque" é o que aparece nos botões da frente do editor; o resto
 * fica dentro de "+ Mais opções". Cinco botões e uma lista é diferente
 * de dezesseis botões atravancando a tela.
 */
function Ocasioes() {
  const qc = useQueryClient();
  const [editando, setEditando] = useState(null);

  const { data: ocasioes = [], isLoading } = useQuery({
    queryKey: ['catalogo-admin', 'ocasioes'],
    queryFn: () => api.get('/catalogo-admin/ocasioes'),
  });

  const salvar = useMutation({
    mutationFn: o => (o.id
      ? api.put(`/catalogo-admin/ocasioes/${o.id}`, o)
      : api.post('/catalogo-admin/ocasioes', o)),
    onSuccess: () => {
      toast.success('Ocasião salva');
      setEditando(null);
      qc.invalidateQueries(['catalogo-admin', 'ocasioes']);
    },
    onError: e => toast.error(e.error || 'Erro ao salvar'),
  });

  const excluir = useMutation({
    mutationFn: id => api.delete(`/catalogo-admin/ocasioes/${id}`),
    onSuccess: () => { toast.success('Ocasião removida'); qc.invalidateQueries(['catalogo-admin', 'ocasioes']); },
    onError: e => toast.error(e.error || 'Erro ao remover'),
  });

  if (isLoading) return <Carregando />;

  return (
    <div className="space-y-4">
      <Explicacao>
        A ocasião filtra as artes que o cliente vê no editor. As marcadas como destaque aparecem
        direto na tela; as demais ficam em “+ Mais opções”.
      </Explicacao>

      <button onClick={() => setEditando({
        name: '', slug: '', icone: '', seq: (ocasioes.length + 1) * 10, destaque: false, is_active: true,
      })} className="btn btn-primary btn-sm">
        <Plus size={15} /> Nova ocasião
      </button>

      <div className="card divide-y">
        {ocasioes.map(o => (
          <div key={o.id} className="p-3 flex flex-wrap items-center gap-3">
            <span className="font-medium text-sm text-gray-900 flex items-center gap-1.5">
              {o.destaque && <Star size={13} className="text-amber-500 fill-amber-400" />}
              {o.name}
            </span>
            <span className="text-xs text-gray-400 font-mono">{o.slug}</span>
            {!o.is_active && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">inativa</span>
            )}
            <span className="ml-auto flex gap-2">
              <button className="btn-secondary btn-sm" onClick={() => setEditando(o)}>Editar</button>
              <button className="btn-secondary btn-sm text-red-600"
                onClick={() => confirmar(`Remover "${o.name}"?`) && excluir.mutate(o.id)}>
                <Trash2 size={13} />
              </button>
            </span>
          </div>
        ))}
        {!ocasioes.length && <Vazio texto="Nenhuma ocasião cadastrada." />}
      </div>

      {editando && (
        <Modal titulo={editando.id ? 'Editar ocasião' : 'Nova ocasião'} onFechar={() => setEditando(null)}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Texto rotulo="Nome" valor={editando.name}
              onMudar={v => setEditando(a => ({ ...a, name: v }))} />
            <Texto rotulo="Ícone (nome lucide)" valor={editando.icone}
              dica="Ex.: Heart, Cake, GraduationCap"
              onMudar={v => setEditando(a => ({ ...a, icone: v }))} />
            <Numero rotulo="Ordem" valor={editando.seq}
              onMudar={v => setEditando(a => ({ ...a, seq: v }))} />
          </div>
          <Interruptor rotulo="Em destaque (aparece direto na tela)" ligado={!!editando.destaque}
            onMudar={v => setEditando(a => ({ ...a, destaque: v }))} />
          <Interruptor rotulo="Ativa" ligado={editando.is_active !== false}
            onMudar={v => setEditando(a => ({ ...a, is_active: v }))} />
          <BotoesModal ocupado={salvar.isPending}
            onCancelar={() => setEditando(null)}
            onSalvar={() => salvar.mutate(editando)} />
        </Modal>
      )}
    </div>
  );
}

// ── Banco de artes (§20) ────────────────────────────────────

/**
 * As artes prontas que o cliente escolhe no editor.
 *
 * O VETOR CARREGA SEUS PRÓPRIOS BURACOS. Onde o cliente pode escrever, o
 * SVG tem `<text data-campo="nome1">%NOME1%</text>`, e a lista de campos
 * editáveis abaixo diz quais são. O que não está marcado é intocável —
 * é isso que impede o cliente de desmontar a arte sem querer.
 *
 * A miniatura é a PRÓPRIA arte desenhada pequena, aqui e no editor do
 * cliente. Assim não existe o dia em que a miniatura mostra uma coisa e
 * o editor abre outra.
 */
function Artes() {
  const qc = useQueryClient();
  const [editando, setEditando] = useState(null);

  const { data: artes = [], isLoading } = useQuery({
    queryKey: ['catalogo-admin', 'artes'],
    queryFn: () => api.get('/catalogo-admin/artes'),
  });
  const { data: ocasioes = [] } = useQuery({
    queryKey: ['catalogo-admin', 'ocasioes'],
    queryFn: () => api.get('/catalogo-admin/ocasioes'),
  });

  const salvar = useMutation({
    mutationFn: a => (a.id
      ? api.put(`/catalogo-admin/artes/${a.id}`, a)
      : api.post('/catalogo-admin/artes', a)),
    onSuccess: () => {
      toast.success('Arte salva');
      setEditando(null);
      qc.invalidateQueries(['catalogo-admin', 'artes']);
    },
    onError: e => toast.error(e.error || 'Erro ao salvar'),
  });

  const excluir = useMutation({
    mutationFn: id => api.delete(`/catalogo-admin/artes/${id}`),
    onSuccess: () => { toast.success('Arte removida'); qc.invalidateQueries(['catalogo-admin', 'artes']); },
    onError: e => toast.error(e.error || 'Erro ao remover'),
  });

  async function abrir(id) {
    try { setEditando(await api.get(`/catalogo-admin/artes/${id}`)); }
    catch (e) { toast.error(e.error || 'Não consegui abrir a arte'); }
  }

  const nomeOcasiao = id => ocasioes.find(o => o.id === id)?.name || '—';

  if (isLoading) return <Carregando />;

  return (
    <div className="space-y-4">
      <Explicacao>
        Cada arte é um vetor SVG com os pontos editáveis marcados. Comprar um pacote de artes novo
        é cadastrar aqui — o editor do cliente não precisa de nenhuma alteração.
      </Explicacao>

      <button onClick={() => setEditando({
        codigo: '', name: '', ocasiao_id: '', svg: '', elementos: [], fontes: [],
        seq: (artes.length + 1) * 10, is_active: true,
      })} className="btn btn-primary btn-sm">
        <Plus size={15} /> Nova arte
      </button>

      <div className="card divide-y">
        {artes.map(a => (
          <div key={a.id} className="p-3 flex flex-wrap items-center gap-3">
            <span className="font-mono text-xs text-gray-500 w-20 shrink-0">{a.codigo}</span>
            <span className="font-medium text-sm text-gray-900 min-w-0 truncate flex-1">{a.name}</span>
            <span className="text-xs text-gray-500">{nomeOcasiao(a.ocasiao_id)}</span>
            <span className="text-xs text-gray-400">{(a.elementos || []).length} campo(s)</span>
            <span className="text-gray-400">{a.is_active ? <Eye size={14} /> : <EyeOff size={14} />}</span>
            <span className="flex gap-2">
              <button className="btn-secondary btn-sm" onClick={() => abrir(a.id)}>Editar</button>
              <button className="btn-secondary btn-sm text-red-600"
                onClick={() => confirmar(`Remover a arte ${a.codigo}?`) && excluir.mutate(a.id)}>
                <Trash2 size={13} />
              </button>
            </span>
          </div>
        ))}
        {!artes.length && <Vazio texto="Nenhuma arte cadastrada." />}
      </div>

      {editando && (
        <Modal largo titulo={editando.id ? `Arte ${editando.codigo}` : 'Nova arte'}
          onFechar={() => setEditando(null)}>
          <div className="grid gap-3 sm:grid-cols-3">
            <Texto rotulo="Código" valor={editando.codigo}
              dica="Ex.: CAS-007" onMudar={v => setEditando(a => ({ ...a, codigo: v }))} />
            <Texto rotulo="Nome" valor={editando.name}
              onMudar={v => setEditando(a => ({ ...a, name: v }))} />
            <div>
              <label className="label text-xs">Ocasião</label>
              <select className="input text-sm" value={editando.ocasiao_id || ''}
                onChange={e => setEditando(a => ({ ...a, ocasiao_id: e.target.value }))}>
                <option value="">—</option>
                {ocasioes.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2 mt-4">
            <div>
              <label className="label text-xs">Vetor (SVG)</label>
              <p className="text-[11px] text-gray-500 mb-1.5">
                Desenhe num quadro 0–100. Onde o cliente pode escrever, use
                <code className="mx-1 px-1 bg-gray-100 rounded">{'<text data-campo="nome1">%NOME1%</text>'}</code>.
              </p>
              <textarea className="input text-xs font-mono" rows={12} value={editando.svg || ''}
                onChange={e => setEditando(a => ({ ...a, svg: e.target.value }))} />
            </div>

            <div>
              <label className="label text-xs">Prévia</label>
              <div className="border rounded-lg bg-white aspect-square max-w-[240px] p-3 text-gray-900">
                {editando.svg
                  ? <div className="w-full h-full" dangerouslySetInnerHTML={{ __html: editando.svg }} />
                  : <p className="text-xs text-gray-400 h-full flex items-center justify-center text-center">
                      Cole o SVG ao lado para ver a arte aqui.
                    </p>}
              </div>

              <label className="label text-xs mt-4">Fontes liberadas</label>
              <input className="input text-sm" value={(editando.fontes || []).join(', ')}
                placeholder="Georgia, Playfair Display, Montserrat"
                onChange={e => setEditando(a => ({
                  ...a, fontes: e.target.value.split(',').map(s => s.trim()).filter(Boolean),
                }))} />
              <p className="text-[11px] text-gray-500 mt-1">
                Só o que a gráfica tem instalado. Fonte que ela não tem vira Arial na hora de imprimir.
              </p>
            </div>
          </div>

          <CamposEditaveis elementos={editando.elementos || []}
            onMudar={elementos => setEditando(a => ({ ...a, elementos }))} />

          <div className="flex flex-wrap gap-4 mt-3">
            <Numero rotulo="Ordem" valor={editando.seq}
              onMudar={v => setEditando(a => ({ ...a, seq: v }))} />
            <Interruptor rotulo="Ativa no catálogo" ligado={editando.is_active !== false}
              onMudar={v => setEditando(a => ({ ...a, is_active: v }))} />
          </div>

          <BotoesModal ocupado={salvar.isPending}
            onCancelar={() => setEditando(null)}
            onSalvar={() => salvar.mutate(editando)} />
        </Modal>
      )}
    </div>
  );
}

/**
 * Os campos que a arte deixa o cliente mexer.
 *
 * A `chave` tem que casar com o `data-campo` do SVG e com o marcador
 * `%CHAVE%` — é o que amarra o formulário do cliente ao ponto certo do
 * desenho. Chave sem par no vetor simplesmente não aparece para o
 * cliente; marcador sem campo aqui é apagado antes de imprimir, para
 * não sair "%FRASE%" gravado no copo.
 */
function CamposEditaveis({ elementos, onMudar }) {
  const mexer = (i, patch) => onMudar(elementos.map((c, j) => (j === i ? { ...c, ...patch } : c)));

  return (
    <div className="mt-4">
      <label className="label text-xs">Campos que o cliente pode editar</label>
      <div className="space-y-2">
        {elementos.map((c, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1.4fr_0.8fr_0.7fr_auto] items-end">
            <div>
              <span className="text-[10px] text-gray-500">Chave (= data-campo)</span>
              <input className="input text-sm font-mono" value={c.key || ''}
                placeholder="nome1" onChange={e => mexer(i, { key: e.target.value.trim() })} />
            </div>
            <div>
              <span className="text-[10px] text-gray-500">Rótulo para o cliente</span>
              <input className="input text-sm" value={c.label || ''}
                placeholder="Alterar nome 1" onChange={e => mexer(i, { label: e.target.value })} />
            </div>
            <div>
              <span className="text-[10px] text-gray-500">Exemplo</span>
              <input className="input text-sm" value={c.padrao || ''}
                onChange={e => mexer(i, { padrao: e.target.value })} />
            </div>
            <div>
              <span className="text-[10px] text-gray-500">Máx. caracteres</span>
              <input type="number" className="input text-sm" value={c.max || ''}
                onChange={e => mexer(i, { max: Number(e.target.value) || null })} />
            </div>
            <button className="btn-secondary btn-sm text-red-600 mb-0.5"
              onClick={() => onMudar(elementos.filter((_, j) => j !== i))}>
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>
      <button className="btn-secondary btn-sm mt-2"
        onClick={() => onMudar([...elementos, { key: '', label: '', tipo: 'texto', padrao: '', max: 20 }])}>
        <Plus size={13} /> Adicionar campo
      </button>
    </div>
  );
}

// ── Peças de tela ───────────────────────────────────────────

const confirmar = msg => window.confirm(msg);

const Carregando = () => (
  <div className="flex justify-center py-16">
    <Loader2 size={26} className="animate-spin text-violet-500" />
  </div>
);

const Vazio = ({ texto }) => (
  <p className="text-sm text-gray-400 text-center py-10">{texto}</p>
);

const Explicacao = ({ children }) => (
  <div className="flex items-start gap-2 text-[12.5px] text-gray-600 bg-violet-50 rounded-lg p-3">
    <Info size={14} className="text-violet-500 shrink-0 mt-0.5" />
    <span>{children}</span>
  </div>
);

function Texto({ rotulo, valor, dica, onMudar }) {
  return (
    <div>
      <label className="label text-xs">{rotulo}</label>
      <input className="input text-sm" value={valor ?? ''} onChange={e => onMudar(e.target.value)} />
      {dica && <p className="text-[11px] text-gray-500 mt-1">{dica}</p>}
    </div>
  );
}

function Numero({ rotulo, valor, onMudar }) {
  return (
    <div>
      <label className="label text-xs">{rotulo}</label>
      <input type="number" step="any" className="input text-sm" value={valor ?? ''}
        onChange={e => onMudar(e.target.value === '' ? '' : Number(e.target.value))} />
    </div>
  );
}

function Interruptor({ rotulo, ligado, onMudar }) {
  return (
    <label className="flex items-center gap-2 text-sm text-gray-700 mt-3 cursor-pointer">
      <input type="checkbox" checked={!!ligado} onChange={e => onMudar(e.target.checked)} />
      {rotulo}
    </label>
  );
}

function Modal({ titulo, largo, children, onFechar }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto bg-black/45">
      <div className={`bg-white rounded-2xl shadow-2xl w-full my-8 ${largo ? 'max-w-4xl' : 'max-w-2xl'}`}>
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <h2 className="font-bold text-gray-900">{titulo}</h2>
          <button onClick={onFechar} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function BotoesModal({ ocupado, onCancelar, onSalvar }) {
  return (
    <div className="flex justify-end gap-2 mt-5 pt-4 border-t">
      <button className="btn-secondary" onClick={onCancelar}>Cancelar</button>
      <button className="btn btn-primary" onClick={onSalvar} disabled={ocupado}>
        {ocupado ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Salvar
      </button>
    </div>
  );
}
