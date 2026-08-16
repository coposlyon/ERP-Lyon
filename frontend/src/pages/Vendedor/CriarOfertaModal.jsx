// ============================================================
// TELA 4 — Criar oferta / WhatsApp
//
// Recebe da Tela 3 os clientes marcados (nome, telefone, histórico) e
// monta a campanha. Duas regras moldam a tela:
//
// 1. O produto vem das promoções LIBERADAS pelo Administrativo. Sem
//    promoção cadastrada não há o que ofertar — é isso que impede um
//    preço promocional de nascer no meio da conversa.
// 2. A IA escreve, não envia. Ela devolve o texto no editor e o
//    vendedor edita antes de disparar.
//
// O envio é individual: cada cliente recebe a mensagem com o próprio
// nome no lugar de {Nome do cliente}.
// ============================================================
import { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  Tag, X, Users, Package, Percent, MessageCircle, Sparkles, Image as ImageIcon,
  Bold, Italic, Strikethrough, List, ListOrdered, Link2, Smile, Bookmark, Eye,
  Send, Loader2, Lock, Calendar, ChevronDown,
} from 'lucide-react';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { useVend, fmtBRL, fmtUn, fmtDate } from './ui';

const VARIAVEIS = ['{Nome do cliente}', '{Produto}', '{Quantidade}', '{Validade}'];
const EMOJIS = ['😊', '👍', '🎉', '🥂', '🍻', '✨', '📦', '🚚', '💙'];
const TEMPLATE_KEY = 'vendedor-oferta-modelo';

export default function CriarOfertaModal({ open, onClose, customers = [], produtoSugerido, sellerName }) {
  const v = useVend();
  const textRef = useRef(null);
  const fileRef = useRef(null);

  const [promoId, setPromoId]   = useState('');
  const [qtd, setQtd]           = useState('');
  const [mensagem, setMensagem] = useState('');
  const [personalizar, setPersonalizar] = useState(true);
  const [imagem, setImagem]     = useState(null);
  const [verTodos, setVerTodos] = useState(false);
  const [briefing, setBriefing] = useState('');
  const [pedirIA, setPedirIA]   = useState(false);
  const [emojis, setEmojis]     = useState(false);
  const [resultado, setResultado] = useState(null);

  const { data: promocoes = [], isLoading: carregandoPromos } = useQuery({
    queryKey: ['vendedor-promocoes'],
    queryFn: () => api.get('/vendedor/promocoes'),
    enabled: open,
  });

  const promo = promocoes.find(p => p.id === promoId) || null;
  const produto = promo?.PRODUTOS || null;
  const foto = Array.isArray(produto?.photos) ? produto.photos[0] : null;

  // Ao abrir: escolhe a promoção do produto que veio da Tela 2, quando
  // existir uma liberada para ele; senão, a primeira da lista.
  useEffect(() => {
    if (!open || !promocoes.length || promoId) return;
    const doProduto = produtoSugerido?.product_id
      && promocoes.find(p => p.product_id === produtoSugerido.product_id);
    setPromoId((doProduto || promocoes[0]).id);
  }, [open, promocoes, promoId, produtoSugerido]);

  // Quantidade e mensagem seguem a promoção escolhida, sem apagar o que
  // o vendedor já digitou por cima.
  useEffect(() => {
    if (!promo) return;
    setQtd(q => q || (promo.suggested_qty != null ? String(promo.suggested_qty) : ''));
    setMensagem(m => m || promo.message_template || rascunhoPadrao(sellerName, produto?.name));
  }, [promo]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) { setResultado(null); setPedirIA(false); setBriefing(''); }
  }, [open]);

  const semTelefone = customers.filter(c => String(c.phone || '').replace(/\D/g, '').length < 10).length;
  const ufs = useMemo(() => customers.map(c => c.uf).filter(Boolean), [customers]);

  // Substitui as variáveis para a pré-visualização (e é o mesmo texto do
  // primeiro cliente da fila).
  const preview = useMemo(() => {
    const primeiro = customers[0];
    return String(mensagem || '')
      .replace(/\{nome do cliente\}/gi, personalizar ? (primeiro?.name || '{Nome do cliente}') : '{Nome do cliente}')
      .replace(/\{produto\}/gi, produto?.name || '')
      .replace(/\{quantidade\}/gi, qtd ? `${fmtUn(qtd)} unidades` : '')
      .replace(/\{validade\}/gi, promo?.valid_until ? fmtDate(promo.valid_until) : '');
  }, [mensagem, personalizar, customers, produto, qtd, promo]);

  const enviar = useMutation({
    mutationFn: () => api.post('/vendedor/oferta/enviar', {
      customers: customers.map(c => ({ customer_id: c.customer_id, name: c.name, phone: c.phone })),
      // As variáveis fixas já vão resolvidas; o nome é resolvido por cliente no servidor.
      message: String(mensagem)
        .replace(/\{produto\}/gi, produto?.name || '')
        .replace(/\{quantidade\}/gi, qtd ? `${fmtUn(qtd)} unidades` : '')
        .replace(/\{validade\}/gi, promo?.valid_until ? fmtDate(promo.valid_until) : ''),
      promo_id: promo?.id || null,
      product_id: promo?.product_id || null,
      image: imagem,
      personalize: personalizar,
    }),
    onSuccess: r => {
      setResultado(r.results);
      if (r.results?.sent > 0) toast.success(`Oferta enviada para ${r.results.sent} cliente(s)`);
      else toast.error(r.results?.error || 'Nenhuma mensagem foi entregue');
    },
    onError: e => toast.error(e.error || 'Erro ao enviar a oferta'),
  });

  const gerarIA = useMutation({
    mutationFn: () => api.post('/vendedor/oferta/texto', { brief: briefing, product: produto?.name || '' }),
    onSuccess: r => { setMensagem(r.message); setPedirIA(false); setBriefing(''); toast.success('Texto gerado — revise antes de enviar'); },
    onError: e => toast.error(e.error || 'Não foi possível gerar o texto'),
  });

  if (!open) return null;

  // Envolve a seleção com os marcadores que o WhatsApp entende.
  function envolver(marcador) {
    const el = textRef.current;
    if (!el) return;
    const { selectionStart: a, selectionEnd: b } = el;
    const txt = mensagem;
    const novo = `${txt.slice(0, a)}${marcador}${txt.slice(a, b) || 'texto'}${marcador}${txt.slice(b)}`;
    setMensagem(novo);
    setTimeout(() => el.focus(), 0);
  }

  function inserir(trecho) {
    const el = textRef.current;
    const pos = el ? el.selectionStart : mensagem.length;
    setMensagem(m => `${m.slice(0, pos)}${trecho}${m.slice(pos)}`);
    setTimeout(() => el?.focus(), 0);
  }

  function prefixarLinhas(prefixo) {
    const el = textRef.current;
    if (!el) return;
    const { selectionStart: a, selectionEnd: b } = el;
    const antes = mensagem.slice(0, a), sel = mensagem.slice(a, b) || 'item', depois = mensagem.slice(b);
    const linhas = sel.split('\n').map((l, i) => `${typeof prefixo === 'function' ? prefixo(i) : prefixo}${l}`);
    setMensagem(`${antes}${linhas.join('\n')}${depois}`);
    setTimeout(() => el.focus(), 0);
  }

  function anexar(e) {
    const f = e.target.files?.[0]; if (!f) return; e.target.value = '';
    const r = new FileReader();
    r.onload = ev => setImagem(ev.target.result);
    r.readAsDataURL(f);
  }

  // Modelo guardado no próprio navegador do vendedor: é rascunho de
  // trabalho dele, não conteúdo aprovado pela empresa.
  function salvarModelo() {
    try { localStorage.setItem(TEMPLATE_KEY, mensagem); toast.success('Modelo salvo neste navegador'); }
    catch { toast.error('Não foi possível salvar o modelo'); }
  }
  function carregarModelo() {
    const m = localStorage.getItem(TEMPLATE_KEY);
    if (m) { setMensagem(m); toast.success('Modelo carregado'); }
    else toast.error('Nenhum modelo salvo ainda');
  }

  const btnTool = { color: v.textMuted, padding: '0.3rem', borderRadius: '0.4rem' };

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-0 sm:p-6 overflow-y-auto">
      <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-6xl my-auto flex flex-col" style={{ ...v.card, maxHeight: '95vh' }}>

        {/* Cabeçalho */}
        <div className="flex items-start justify-between gap-3 px-5 py-4 shrink-0"
          style={{ borderBottom: `1px solid ${v.divider}` }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
              style={{ background: 'rgba(59,130,246,0.16)' }}>
              <Tag size={20} style={{ color: '#60a5fa' }} />
            </div>
            <div>
              <h2 className="text-xl font-bold" style={{ color: v.textPrimary }}>Criar oferta</h2>
              <p className="text-sm" style={{ color: v.textSubtle }}>
                Crie uma oferta personalizada e envie pelo WhatsApp para seus clientes.
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:opacity-70" style={{ color: v.textMuted }}>
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-3 gap-4 p-5">

          {/* ── Coluna do formulário ─────────────────────────── */}
          <div className="lg:col-span-2 space-y-3">

            {/* Clientes */}
            <Bloco v={v} Icon={Users} titulo={`${customers.length} clientes selecionados`}
              sub="Sua oferta será personalizada e enviada individualmente."
              direita={
                <button onClick={() => setVerTodos(x => !x)} className="btn-secondary btn-sm">
                  {verTodos ? 'Ocultar' : 'Ver todos'}
                </button>
              }>
              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                {(verTodos ? customers : customers.slice(0, 5)).map(c => (
                  <span key={c.customer_id} className="text-[11px] px-2 py-1 rounded-full"
                    style={{ background: v.surface, color: v.textMuted }}>
                    {verTodos ? c.name : (c.uf || '—')}
                  </span>
                ))}
                {!verTodos && customers.length > 5 && (
                  <span className="text-[11px] px-2 py-1 rounded-full"
                    style={{ background: v.surface, color: v.textMuted }}>+{customers.length - 5}</span>
                )}
              </div>
              {semTelefone > 0 && (
                <p className="text-[11px] mt-2" style={{ color: '#fbbf24' }}>
                  {semTelefone} cliente(s) sem telefone cadastrado não receberão a mensagem.
                </p>
              )}
              {!verTodos && ufs.length > 0 && (
                <p className="text-[10px] mt-1" style={{ color: v.textSubtle }}>
                  UFs na seleção: {[...new Set(ufs)].join(', ')}
                </p>
              )}
            </Bloco>

            {/* Produto em oferta */}
            <Bloco v={v} Icon={Package} titulo="Produto em oferta"
              sub="Escolha entre as promoções liberadas pelo Administrativo."
              direita={
                carregandoPromos ? <Loader2 size={16} className="animate-spin" style={{ color: v.textMuted }} /> :
                promocoes.length > 0 && (
                  <select value={promoId} onChange={e => setPromoId(e.target.value)} style={{ ...v.control, minWidth: 220 }}>
                    {promocoes.map(p => (
                      <option key={p.id} value={p.id}>{p.title || p.PRODUTOS?.name || 'Promoção'}</option>
                    ))}
                  </select>
                )
              }>
              {!carregandoPromos && promocoes.length === 0 && (
                <p className="text-sm flex items-start gap-2 mt-1" style={{ color: '#fbbf24' }}>
                  <Lock size={14} className="shrink-0 mt-0.5" />
                  Nenhuma promoção liberada. Peça ao Administrativo para criar uma em
                  Painel do Vendedor → Administrar → Promoções.
                </p>
              )}
              {promo && (
                <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs mt-2" style={{ color: v.textMuted }}>
                  <span>Produto: <b style={{ color: v.textPrimary }}>{produto?.name || '—'}</b></span>
                  {promo.promo_price != null && <span>Preço liberado: <b style={{ color: '#4ade80' }}>{fmtBRL(promo.promo_price)}</b></span>}
                  {promo.discount_pct != null && <span>Desconto: <b style={{ color: '#4ade80' }}>{promo.discount_pct}%</b></span>}
                </div>
              )}
            </Bloco>

            {/* Condição especial */}
            <Bloco v={v} Icon={Percent} titulo="Condição especial"
              sub="Defina os detalhes da condição que será apresentada.">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-2">
                <div>
                  <label className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: v.textSubtle }}>
                    Quantidade sugerida
                  </label>
                  <input type="number" min="0" value={qtd} onChange={e => setQtd(e.target.value)}
                    style={{ ...v.control, width: '100%', marginTop: 4 }} placeholder="Ex.: 4800" />
                  <p className="text-[10px] mt-1" style={{ color: v.textSubtle }}>Sugestão da campanha; ajuste pelo histórico do cliente.</p>
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: v.textSubtle }}>
                    Validade da oferta
                  </label>
                  <div className="flex items-center gap-2 mt-1 px-3 py-2 rounded-[0.6rem]"
                    style={{ background: v.surface, border: v.control.border }}>
                    <Calendar size={13} style={{ color: v.textMuted }} />
                    <span className="text-sm" style={{ color: v.textPrimary }}>
                      {promo?.valid_until ? fmtDate(promo.valid_until) : 'sem data'}
                    </span>
                  </div>
                  <p className="text-[10px] mt-1" style={{ color: v.textSubtle }}>Definida pelo Administrativo.</p>
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: v.textSubtle }}>
                    Envio personalizado
                  </label>
                  <label className="flex items-center gap-2 mt-2 text-sm cursor-pointer" style={{ color: v.textPrimary }}>
                    <input type="checkbox" checked={personalizar} onChange={e => setPersonalizar(e.target.checked)}
                      className="w-4 h-4 accent-blue-600" />
                    Personalizar com o nome de cada cliente
                  </label>
                  <p className="text-[10px] mt-1" style={{ color: v.textSubtle }}>Cada cliente recebe a própria mensagem.</p>
                </div>
              </div>
            </Bloco>

            {/* Mensagem */}
            <Bloco v={v} Icon={MessageCircle} titulo="Mensagem para WhatsApp"
              sub="Escreva a mensagem — a IA ajuda, mas quem envia é você."
              iconColor="#16a34a"
              direita={
                <div className="flex items-center gap-2">
                  <button onClick={() => setPedirIA(x => !x)} className="btn-secondary btn-sm">
                    <Sparkles size={13} /> Gerar com IA
                  </button>
                  <button onClick={() => fileRef.current?.click()} className="btn-secondary btn-sm">
                    <ImageIcon size={13} /> Anexar imagem
                  </button>
                </div>
              }>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={anexar} />

              {pedirIA && (
                <div className="rounded-lg p-3 mt-2 space-y-2" style={{ background: v.surface, border: v.control.border }}>
                  <p className="text-xs" style={{ color: v.textMuted }}>
                    Diga em poucas palavras o que quer dizer. A IA escreve o texto — ela não envia nada
                    e não inventa preço ou prazo.
                  </p>
                  <textarea rows={2} value={briefing} onChange={e => setBriefing(e.target.value)}
                    placeholder="Ex.: Promoção Long Drink. Cliente antigo. Oferta profissional."
                    style={{ ...v.control, width: '100%', resize: 'none' }} />
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setPedirIA(false)} className="btn-secondary btn-sm">Cancelar</button>
                    <button onClick={() => gerarIA.mutate()} disabled={!briefing.trim() || gerarIA.isPending}
                      className="btn-primary btn-sm">
                      {gerarIA.isPending ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                      Gerar texto
                    </button>
                  </div>
                </div>
              )}

              {/* Barra de formatação — os marcadores são os do WhatsApp */}
              <div className="flex flex-wrap items-center gap-1 mt-2 px-1 py-1 rounded-lg"
                style={{ background: v.surface }}>
                <button onClick={() => envolver('*')} style={btnTool} title="Negrito (*texto*)"><Bold size={14} /></button>
                <button onClick={() => envolver('_')} style={btnTool} title="Itálico (_texto_)"><Italic size={14} /></button>
                <button onClick={() => envolver('~')} style={btnTool} title="Tachado (~texto~)"><Strikethrough size={14} /></button>
                <span className="w-px h-4 mx-1" style={{ background: v.divider }} />
                <button onClick={() => prefixarLinhas('• ')} style={btnTool} title="Lista"><List size={14} /></button>
                <button onClick={() => prefixarLinhas(i => `${i + 1}. `)} style={btnTool} title="Lista numerada"><ListOrdered size={14} /></button>
                <button onClick={() => inserir('https://')} style={btnTool} title="Link"><Link2 size={14} /></button>
                <div className="relative">
                  <button onClick={() => setEmojis(x => !x)} style={btnTool} title="Emoji"><Smile size={14} /></button>
                  {emojis && (
                    <div className="absolute z-20 mt-1 p-2 rounded-lg flex gap-1 flex-wrap w-44"
                      style={{ ...v.card, boxShadow: '0 8px 24px rgba(0,0,0,0.35)' }}>
                      {EMOJIS.map(e => (
                        <button key={e} className="text-lg hover:scale-110 transition-transform"
                          onClick={() => { inserir(e); setEmojis(false); }}>{e}</button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="ml-auto relative">
                  <select value="" onChange={e => e.target.value && inserir(e.target.value)}
                    style={{ ...v.control, padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}>
                    <option value="">Inserir variável</option>
                    {VARIAVEIS.map(x => <option key={x} value={x}>{x}</option>)}
                  </select>
                </div>
              </div>

              <textarea ref={textRef} rows={7} value={mensagem} onChange={e => setMensagem(e.target.value)}
                style={{ ...v.control, width: '100%', marginTop: 8, resize: 'vertical', lineHeight: 1.6 }}
                placeholder="Olá, {Nome do cliente}. Aqui é o ..." />

              <div className="flex items-center justify-between mt-1">
                <p className="text-[10px]" style={{ color: v.textSubtle }}>
                  <b>{'{Nome do cliente}'}</b> vira o nome de cada cliente no envio.
                </p>
                <span className="text-[11px]" style={{ color: mensagem.length > 900 ? '#f87171' : '#4ade80' }}>
                  {mensagem.length} caracteres
                </span>
              </div>

              {imagem && (
                <div className="relative inline-block mt-2">
                  <img src={imagem} alt="" className="max-h-32 rounded-lg" style={{ border: v.control.border }} />
                  <button onClick={() => setImagem(null)}
                    className="absolute -top-2 -right-2 bg-white rounded-full shadow p-1 text-gray-500 hover:text-red-500">
                    <X size={12} />
                  </button>
                  <p className="text-[10px] mt-1" style={{ color: v.textSubtle }}>
                    A imagem fica registrada na campanha; o texto é o que segue pelo WhatsApp.
                  </p>
                </div>
              )}
            </Bloco>

            {resultado && (
              <div className="rounded-lg p-3 text-sm"
                style={{ background: v.surface, border: `1px solid ${resultado.sent > 0 ? 'rgba(34,197,94,0.4)' : 'rgba(248,113,113,0.4)'}` }}>
                <p style={{ color: v.textPrimary }}>
                  <b>{resultado.sent}</b> enviada(s) · <b>{resultado.failed}</b> falha(s)
                  {resultado.no_phone > 0 && <> · <b>{resultado.no_phone}</b> sem telefone</>}
                </p>
                {resultado.error && <p className="text-xs mt-1" style={{ color: '#f87171' }}>{resultado.error}</p>}
              </div>
            )}
          </div>

          {/* ── Pré-visualização ─────────────────────────────── */}
          <div>
            <p className="text-sm font-semibold" style={{ color: v.textPrimary }}>Pré-visualização</p>
            <p className="text-[11px] mb-2" style={{ color: v.textSubtle }}>
              Veja como sua oferta aparecerá para o cliente.
            </p>

            <div className="rounded-xl overflow-hidden" style={{ background: '#e9e3da', padding: '0.75rem' }}>
              {/* Cartão do produto */}
              <div className="rounded-lg p-3 flex items-center gap-3" style={{ background: '#0f1c33' }}>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-bold tracking-wider" style={{ color: '#f5a623' }}>CONDIÇÃO ESPECIAL</p>
                  <p className="text-sm font-bold leading-snug text-white truncate">{produto?.name || 'Produto da oferta'}</p>
                  <p className="text-[10px] mt-1.5 text-white/60">LYON COPOS</p>
                </div>
                {foto
                  ? <img src={foto} alt="" className="w-14 h-16 object-contain rounded shrink-0" />
                  : <div className="w-14 h-16 rounded shrink-0 flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.08)' }}>
                      <Package size={20} className="text-white/40" />
                    </div>}
              </div>

              {/* Balão do WhatsApp */}
              <div className="mt-2 rounded-lg px-3 py-2 text-[13px] whitespace-pre-wrap break-words"
                style={{ background: '#dcf8c6', color: '#111827' }}>
                {preview || <span className="opacity-40">Sua mensagem aparece aqui.</span>}
                <div className="text-[10px] text-right mt-1" style={{ color: '#4b8f6b' }}>
                  {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} ✓✓
                </div>
              </div>
            </div>

            <button onClick={carregarModelo} className="btn-secondary btn-sm w-full mt-3">
              <ChevronDown size={13} /> Carregar modelo salvo
            </button>
          </div>
        </div>

        {/* Rodapé */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 shrink-0"
          style={{ borderTop: `1px solid ${v.divider}` }}>
          <p className="text-[11px] flex items-center gap-1.5" style={{ color: v.textSubtle }}>
            <Lock size={12} />
            Enviamos individualmente para cada cliente selecionado, respeitando seu histórico de compra.
          </p>
          <div className="flex flex-wrap gap-2">
            <button onClick={salvarModelo} className="btn-secondary btn-sm"><Bookmark size={13} /> Salvar modelo</button>
            <button onClick={() => textRef.current?.blur()} className="btn-secondary btn-sm"><Eye size={13} /> Pré-visualizar</button>
            <button onClick={() => enviar.mutate()}
              disabled={enviar.isPending || !mensagem.trim() || !customers.length}
              className="btn"
              style={{ background: '#16a34a', color: 'white', opacity: enviar.isPending ? 0.6 : 1 }}>
              {enviar.isPending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
              Enviar pelo WhatsApp
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Caixinha com ícone, título e ação à direita — repete quatro vezes na tela.
function Bloco({ v, Icon, titulo, sub, direita, children, iconColor = '#60a5fa' }) {
  return (
    <div className="rounded-xl p-3" style={{ background: v.surface, border: `1px solid ${v.divider}` }}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: `${iconColor}26` }}>
            <Icon size={17} style={{ color: iconColor }} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold" style={{ color: v.textPrimary }}>{titulo}</p>
            {sub && <p className="text-[11px]" style={{ color: v.textSubtle }}>{sub}</p>}
          </div>
        </div>
        {direita}
      </div>
      {children}
    </div>
  );
}

function rascunhoPadrao(vendedor, produto) {
  return [
    `Olá, {Nome do cliente}. Aqui é o ${vendedor || 'time'} da Lyon Copos.`,
    '',
    `Estamos com uma condição especial para ${produto || '{Produto}'} e lembrei de você pelo seu histórico de compras conosco.`,
    '',
    'Se tiver interesse, posso preparar uma proposta na quantidade que costuma utilizar.',
  ].join('\n');
}
