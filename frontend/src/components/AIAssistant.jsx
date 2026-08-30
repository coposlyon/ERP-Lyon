import { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Sparkles, X, Send, Loader2, ImagePlus, ArrowRight, Trash2 } from 'lucide-react';
import api from '@/lib/api';
import { TELAS, telaDoCaminho } from '@/lib/menu';
import { lerTela } from '@/lib/lerTela';
import { useAuth } from '@/contexts/AuthContext';

const SUGESTOES = [
  'Como faço um cadastro de cliente?',
  'Como funciona a precificação?',
  'Por que meu pedido não avança de etapa?',
  'Onde vejo os pedidos de venda?',
];

// O BOTÃO É ANCORADO POR CSS, NÃO POR COORDENADA.
//
// Ele já foi arrastável, e a posição x/y ficava salva em localStorage.
// Duas coisas quebraram isso ao mesmo tempo:
//
//   1. o `.erp-shell` tem `zoom: 0.8` (a escala de 80% do sistema).
//      `position: fixed` dentro de um elemento com zoom resolve no
//      sistema de coordenadas JÁ ESCALADO, mas `window.innerWidth`
//      devolve o viewport SEM escala. Guardar o pixel numa régua e
//      reaplicá-lo na outra empurra o botão para dentro da tela — foi
//      assim que ele foi parar no meio do formulário de admissão.
//   2. a posição era persistida, então o erro não passava com um F5:
//      voltava exatamente para o lugar errado.
//
// `bottom`/`right` fixos não têm esse problema: o canto é o canto nas
// duas réguas. Sem arrastar, sem localStorage, sem posição salva.
const POS_KEY = 'lyon_ai_fab_pos';   // só para limpar o que a versão arrastável deixou

const MAX_MB = 4;

export default function AIAssistant() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState([]);
  const [q, setQ] = useState('');
  const [img, setImg] = useState(null);       // data URL do print anexado
  const [loading, setLoading] = useState(false);
  const endRef = useRef(null);
  const fileRef = useRef(null);

  const navigate = useNavigate();
  const location = useLocation();
  const { hasScreen } = useAuth();

  // As telas que ESTA pessoa pode abrir. O copiloto só recebe estas, e
  // o servidor só transforma em botão um caminho que veio daqui.
  const telas = useMemo(
    () => TELAS.filter(t => hasScreen(t.path)).map(t => ({ label: t.label, path: t.path, grupo: t.grupo })),
    [hasScreen]
  );

  // Apaga a coordenada que a versão arrastável deixou gravada. Sem isto
  // o dado morto fica no navegador de quem já usou o sistema.
  useEffect(() => {
    try { localStorage.removeItem(POS_KEY); } catch { /* ignore */ }
  }, []);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs, loading]);

  // O PRINT VAI REDUZIDO.
  //
  // Um PrintScreen de tela cheia vira 3 a 8 MB depois do base64, e esse
  // peso todo nao compra nada: a propria Groq reduz a imagem antes de
  // olhar (um print 1920x1080 chega la como ~785 tokens). O que o peso
  // compra e risco - limite de corpo em proxy, limite de tokens por
  // minuto, e a espera de subir megabytes numa conexao de fabrica.
  //
  // 1400px na maior aresta mantem texto de tela legivel e derruba o
  // arquivo para dezenas de KB. JPEG porque print de interface comprime
  // bem e a fidelidade de pixel nao importa aqui.
  const LADO_MAX = 1400;

  function reduzir(dataUrl) {
    return new Promise(resolve => {
      const im = new Image();
      im.onload = () => {
        const escala = Math.min(1, LADO_MAX / Math.max(im.width, im.height));
        if (escala === 1 && dataUrl.length < 700000) return resolve(dataUrl);
        const c = document.createElement('canvas');
        c.width = Math.round(im.width * escala);
        c.height = Math.round(im.height * escala);
        c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
        try { resolve(c.toDataURL('image/jpeg', 0.85)); }
        catch { resolve(dataUrl); }   // canvas sujo: manda o original
      };
      im.onerror = () => resolve(dataUrl);
      im.src = dataUrl;
    });
  }

  function carregarArquivo(file) {
    if (!file || !file.type.startsWith('image/')) return;
    if (file.size > MAX_MB * 1024 * 1024) {
      setMsgs(m => [...m, { role: 'assistant', text: `Esse print tem ${(file.size / 1024 / 1024).toFixed(1)} MB e o limite é ${MAX_MB} MB. Recorte só a parte que importa e mande de novo.`, err: true }]);
      return;
    }
    const r = new FileReader();
    r.onload = async () => setImg(await reduzir(r.result));
    r.readAsDataURL(file);
  }

  // Colar print direto no campo — é como a pessoa vai usar de verdade:
  // PrintScreen, Ctrl+V, pergunta.
  function onPaste(e) {
    const item = [...(e.clipboardData?.items || [])].find(i => i.type.startsWith('image/'));
    if (item) { e.preventDefault(); carregarArquivo(item.getAsFile()); }
  }

  async function enviar(texto) {
    const pergunta = (texto ?? q).trim();
    if ((!pergunta && !img) || loading) return;

    const anexo = img;
    setQ(''); setImg(null);
    setMsgs(m => [...m, { role: 'user', text: pergunta, img: anexo }]);
    setLoading(true);

    try {
      const res = await api.post('/ai/copiloto', {
        pergunta, imagem: anexo, telas,
        tela_atual: telaDoCaminho(location.pathname)?.label || null,
        // O ESQUELETO DA TELA ABERTA - titulos, botoes, abas, rotulos.
        // Sem isto ele responde sobre um sistema que nunca viu, e foi
        // assim que "clique em + Adicionar filho" virou "recarregue a
        // pagina e procure o suporte". Vao os ROTULOS, nunca os valores
        // digitados: ver o cabecalho de lib/lerTela.js.
        contexto_tela: lerTela(),
        // Só texto no histórico: reenviar os prints antigos a cada
        // pergunta multiplicaria o tamanho da requisição.
        historico: msgs.slice(-8).map(m => ({ role: m.role, text: m.text })),
      });
      setMsgs(m => [...m, { role: 'assistant', text: res.resposta, acao: res.acao }]);
    } catch (e) {
      // NAO ENGOLIR O ERRO.
      //
      // Isto era `e.error || 'Nao consegui responder agora.'`. Quando a
      // resposta nao trazia um {error} - proxy devolvendo HTML, corpo
      // grande demais, rede caindo - a pessoa lia a frase generica e nao
      // havia como saber o que tinha acontecido. Um print falhou assim e
      // custou uma investigacao inteira as cegas.
      const detalhe = e?.error
        || (e?.response?.status ? `o servidor respondeu ${e.response.status}` : null)
        || (e?.message === 'Network Error' ? 'não deu para falar com o servidor' : e?.message)
        || 'motivo desconhecido';
      setMsgs(m => [...m, { role: 'assistant', text: `Não consegui responder: ${detalhe}.`, err: true }]);
    } finally { setLoading(false); }
  }

  function abrir(acao) {
    navigate(acao.path);
    setOpen(false);
  }

  return (
    <>
      {!open && (
        <button onClick={() => setOpen(true)}
          className="fixed bottom-3 right-3 z-50 w-9 h-9 rounded-full bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white shadow-lg flex items-center justify-center opacity-70 hover:opacity-100 hover:scale-110 transition-all select-none"
          title="Assistente do sistema">
          <Sparkles size={15} />
        </button>
      )}

      {open && (
        <div data-copiloto className="fixed bottom-3 right-3 z-50 w-[92vw] max-w-sm h-[70vh] max-h-[560px] bg-white rounded-2xl shadow-2xl border border-gray-100 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white">
            <div className="flex items-center gap-2 font-semibold text-sm"><Sparkles size={16} /> Assistente do sistema</div>
            <div className="flex items-center gap-1">
              {msgs.length > 0 && (
                <button onClick={() => setMsgs([])} className="hover:opacity-80 p-1" title="Limpar conversa"><Trash2 size={15} /></button>
              )}
              <button onClick={() => setOpen(false)} className="hover:opacity-80 p-1" title="Fechar"><X size={17} /></button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-gray-50">
            {msgs.length === 0 && (
              <div className="text-center text-gray-400 text-sm pt-4">
                <Sparkles size={26} className="mx-auto mb-2 text-violet-300" />
                <p className="px-4">Pergunte qualquer dúvida sobre o sistema.<br />
                  <span className="text-xs">Pode colar um print da tela (Ctrl+V).</span></p>
                <div className="flex flex-col gap-1.5 mt-4">
                  {SUGESTOES.map(s => (
                    <button key={s} onClick={() => enviar(s)}
                      className="text-xs bg-white border border-gray-200 rounded-lg px-3 py-2 hover:border-violet-300 transition-colors">{s}</button>
                  ))}
                </div>
              </div>
            )}

            {msgs.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[88%] px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap ${
                  m.role === 'user' ? 'bg-violet-600 text-white' : m.err ? 'bg-red-50 text-red-700' : 'bg-white border border-gray-100 text-gray-800'
                }`}>
                  {m.img && <img src={m.img} alt="print enviado" className="rounded-lg mb-1.5 max-h-40 w-auto" />}
                  {m.text}
                  {/* A ação só aparece quando o servidor a validou contra
                      as telas permitidas — um caminho inventado pelo
                      modelo não chega até aqui. */}
                  {m.acao?.tipo === 'navegar' && (
                    <button onClick={() => abrir(m.acao)}
                      className="mt-2 w-full flex items-center justify-between gap-2 text-xs font-medium px-3 py-2 rounded-xl bg-violet-50 text-violet-700 border border-violet-200 hover:bg-violet-100 transition-colors">
                      Abrir {m.acao.label} <ArrowRight size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}

            {loading && <div className="flex justify-start"><div className="bg-white border border-gray-100 rounded-2xl px-3 py-2"><Loader2 size={15} className="animate-spin text-violet-500" /></div></div>}
            <div ref={endRef} />
          </div>

          {img && (
            <div className="px-2 pt-2 flex items-center gap-2 border-t border-gray-100">
              <img src={img} alt="print a enviar" className="h-11 w-auto rounded-lg border border-gray-200" />
              <span className="text-xs text-gray-500 flex-1">Print anexado</span>
              <button onClick={() => setImg(null)} className="text-gray-400 hover:text-red-500 p-1" title="Remover"><X size={15} /></button>
            </div>
          )}

          <form onSubmit={e => { e.preventDefault(); enviar(); }} className="p-2 border-t border-gray-100 flex gap-1.5 items-center">
            <input ref={fileRef} type="file" accept="image/*" className="hidden"
              onChange={e => { carregarArquivo(e.target.files?.[0]); e.target.value = ''; }} />
            <button type="button" onClick={() => fileRef.current?.click()}
              className="w-9 h-9 shrink-0 rounded-xl border border-gray-200 text-gray-500 flex items-center justify-center hover:border-violet-300 hover:text-violet-600 transition-colors"
              title={`Anexar print (até ${MAX_MB} MB)`}>
              <ImagePlus size={16} />
            </button>
            <input className="flex-1 min-w-0 px-3 py-2 rounded-xl border border-gray-200 focus:border-violet-400 outline-none text-sm"
              placeholder="Pergunte ou cole um print..." value={q}
              onChange={e => setQ(e.target.value)} onPaste={onPaste} />
            <button type="submit" disabled={loading || (!q.trim() && !img)}
              className="w-9 h-9 shrink-0 rounded-xl bg-violet-600 text-white flex items-center justify-center disabled:opacity-40">
              <Send size={15} />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
