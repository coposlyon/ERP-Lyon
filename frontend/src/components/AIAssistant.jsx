import { useState, useRef, useEffect } from 'react';
import { Sparkles, X, Send, Loader2 } from 'lucide-react';
import api from '@/lib/api';

const SUGGESTIONS = [
  'Quanto vendi esse mês?',
  'Quais produtos estão acabando?',
  'Tenho contas vencidas?',
  'Quanto tenho a receber?',
];

const FAB_SIZE = 56;            // tamanho do botão (w-14 h-14)
const POS_KEY = 'lyon_ai_fab_pos';

// Mantém o botão dentro da tela
function clampPos(x, y) {
  const maxX = window.innerWidth  - FAB_SIZE - 8;
  const maxY = window.innerHeight - FAB_SIZE - 8;
  return { x: Math.max(8, Math.min(x, maxX)), y: Math.max(8, Math.min(y, maxY)) };
}

export default function AIAssistant() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const endRef = useRef(null);

  // Posição do botão flutuante (arrastável + salva)
  const [pos, setPos] = useState(null); // null = ainda não calculado
  const btnRef = useRef(null);
  const drag = useRef(null);

  // Posição inicial: salva no localStorage ou canto inferior direito
  useEffect(() => {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(POS_KEY) || 'null'); } catch { /* ignore */ }
    if (saved && typeof saved.x === 'number') setPos(clampPos(saved.x, saved.y));
    else setPos(clampPos(window.innerWidth - FAB_SIZE - 20, window.innerHeight - FAB_SIZE - 20));
  }, []);

  // Reposiciona se a janela for redimensionada
  useEffect(() => {
    function onResize() { setPos(p => (p ? clampPos(p.x, p.y) : p)); }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  function onPointerDown(e) {
    const rect = btnRef.current.getBoundingClientRect();
    drag.current = { offX: e.clientX - rect.left, offY: e.clientY - rect.top, moved: false };
    btnRef.current.setPointerCapture?.(e.pointerId);
  }
  function onPointerMove(e) {
    const d = drag.current; if (!d) return;
    const next = clampPos(e.clientX - d.offX, e.clientY - d.offY);
    if (Math.abs(next.x - pos.x) > 3 || Math.abs(next.y - pos.y) > 3) d.moved = true;
    if (d.moved) setPos(next);
  }
  function onPointerUp() {
    const d = drag.current; drag.current = null;
    if (!d) return;
    if (d.moved) { try { localStorage.setItem(POS_KEY, JSON.stringify(pos)); } catch { /* ignore */ } }
    else setOpen(true); // foi um clique, não um arraste → abre o chat
  }

  // Posição do painel aberto: cresce a partir do botão e fica dentro da tela
  function panelStyle() {
    if (!pos) return { right: 20, bottom: 20 };
    const w = Math.min(384, window.innerWidth * 0.92);
    const h = Math.min(560, window.innerHeight * 0.7);
    const left = Math.max(8, Math.min(pos.x + FAB_SIZE - w, window.innerWidth - w - 8));
    const top  = Math.max(8, Math.min(pos.y + FAB_SIZE - h, window.innerHeight - h - 8));
    return { left, top };
  }

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs, loading]);

  async function send(text) {
    const question = (text ?? q).trim();
    if (!question || loading) return;
    setQ('');
    setMsgs(m => [...m, { role: 'user', text: question }]);
    setLoading(true);
    try {
      const res = await api.post('/ai/assistant', { question });
      setMsgs(m => [...m, { role: 'ai', text: res.answer }]);
    } catch (e) {
      setMsgs(m => [...m, { role: 'ai', text: e.error || 'IA não configurada. Defina ANTHROPIC_API_KEY no servidor.', err: true }]);
    } finally { setLoading(false); }
  }

  return (
    <>
      {!open && pos && (
        <button ref={btnRef}
          onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
          style={{ left: pos.x, top: pos.y }}
          className="fixed z-50 w-14 h-14 rounded-full bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white shadow-xl flex items-center justify-center hover:scale-105 transition-transform touch-none cursor-grab active:cursor-grabbing select-none"
          title="Assistente IA — arraste para mover, clique para abrir">
          <Sparkles size={22} />
        </button>
      )}

      {open && (
        <div style={panelStyle()}
          className="fixed z-50 w-[92vw] max-w-sm h-[70vh] max-h-[560px] bg-white rounded-2xl shadow-2xl border border-gray-100 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white">
            <div className="flex items-center gap-2 font-semibold"><Sparkles size={18} /> Assistente IA</div>
            <button onClick={() => setOpen(false)} className="hover:opacity-80"><X size={18} /></button>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-gray-50">
            {msgs.length === 0 && (
              <div className="text-center text-gray-400 text-sm pt-6">
                <Sparkles size={28} className="mx-auto mb-2 text-violet-300" />
                <p>Pergunte sobre o seu negócio.</p>
                <div className="flex flex-col gap-1.5 mt-4">
                  {SUGGESTIONS.map(s => (
                    <button key={s} onClick={() => send(s)}
                      className="text-xs bg-white border border-gray-200 rounded-lg px-3 py-2 hover:border-violet-300 transition-colors">{s}</button>
                  ))}
                </div>
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap ${
                  m.role === 'user' ? 'bg-violet-600 text-white' : m.err ? 'bg-red-50 text-red-700' : 'bg-white border border-gray-100 text-gray-800'
                }`}>{m.text}</div>
              </div>
            ))}
            {loading && <div className="flex justify-start"><div className="bg-white border border-gray-100 rounded-2xl px-3 py-2"><Loader2 size={15} className="animate-spin text-violet-500" /></div></div>}
            <div ref={endRef} />
          </div>

          <form onSubmit={e => { e.preventDefault(); send(); }} className="p-2 border-t border-gray-100 flex gap-2">
            <input className="flex-1 px-3 py-2 rounded-xl border border-gray-200 focus:border-violet-400 outline-none text-sm"
              placeholder="Pergunte algo..." value={q} onChange={e => setQ(e.target.value)} />
            <button type="submit" disabled={loading || !q.trim()} className="w-10 h-10 rounded-xl bg-violet-600 text-white flex items-center justify-center disabled:opacity-40">
              <Send size={16} />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
