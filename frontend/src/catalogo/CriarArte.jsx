// ============================================================
// TELA 4 — CRIAR SUA ARTE.
//
// NÃO É UM CORELDRAW NO NAVEGADOR, e é de propósito. O cliente escolhe
// uma arte que a Lyon já fechou e troca o que a arte deixa trocar: nome,
// data, frase, fonte, alinhamento e posição. O vetor em si é intocável.
// Um editor livre devolveria arquivos que a serigrafia não consegue
// gravar, e quem descobre isso é a produção, depois de pago.
//
// O GABARITO MANDA (§17). A linha vermelha é o limite físico da área de
// impressão daquele produto, em milímetros, vinda do Administrativo. A
// azul é a área segura. A arte é encaixada DENTRO da azul — então ela
// não tem como vazar por construção, e o que ainda pode estourar (um
// nome comprido demais) é medido de verdade antes de confirmar.
//
// SEM GABARITO CADASTRADO NÃO SE DESENHA. Deixar montar arte sem medida
// seria prometer ao cliente uma impressão que ninguém sabe se cabe.
//
// A TELA NÃO SABE O QUE É CASAMENTO. Ocasião, arte e campos editáveis
// vêm do banco. Pacote de artes novo é INSERT, não deploy (§20).
// ============================================================
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, Check, Loader2, Sparkles, Undo2, Redo2, Type, Wand2,
  AlignLeft, AlignCenter, AlignRight, Move, ZoomIn, ZoomOut, RotateCcw,
  AlertTriangle, Info, Ruler, Layers, Search, PenTool, Send,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from './api';
// O acompanhamento do pedido mora fora do catálogo (/api/acompanhar), e
// o interceptor de `lib/api` já sabe não misturar o token do ERP com o
// do cliente naquelas rotas.
import apiErp from '@/lib/api';
import {
  CatalogoShell, Painel, NEON, bordaNeon, corComAlfa,
  Rotulo, Opcao, Botao, Campo, Seletor, Nota,
} from './ui';
import { aplicarValores, valoresPadrao, cabeNoGabarito, medidasDoGabarito, ESTILO_PADRAO } from './arte';
import { lerRascunho, gravarRascunho } from './rascunho';
import { visitante } from './carrinhoContexto';

/** Uma face vazia: sem arte escolhida, nada digitado. */
const FACE_VAZIA = () => ({ arte_id: null, valores: {}, estilo: { ...ESTILO_PADRAO } });

export default function CriarArte() {
  const { chave } = useParams();

  /**
   * O EDITOR TAMBÉM ABRE DE DENTRO DE UM PEDIDO JÁ PAGO.
   *
   * A personalização saiu do caminho da compra: no catálogo a cliente só
   * diz que quer, e monta a arte depois de pagar, entrando pelo "Faça
   * login". Vindo de lá, a URL traz o pedido e o item — e o fim do
   * caminho muda: em vez de voltar para o configurador com um rascunho,
   * a arte é anexada AO ITEM e a tela volta para o pedido.
   */
  const [buscaParams] = useSearchParams();
  const doPedido = buscaParams.get('pedido');
  const doItem = buscaParams.get('item');
  const navigate = useNavigate();

  // O rascunho é a ponte com o configurador: o cliente veio de lá com
  // acabamento, cores e "frente e verso" já escolhidos, e volta para lá
  // sem ter perdido nada.
  const rascunho = useMemo(() => lerRascunho(chave) || {}, [chave]);
  const posicao = rascunho.posicao === 'frente_verso' ? 'frente_verso' : 'frente';
  const duasFaces = posicao === 'frente_verso';

  const [ocasiao, setOcasiao] = useState(rascunho.ocasiao || null);
  const [verTodas, setVerTodas] = useState(false);
  const [busca, setBusca] = useState('');
  const [face, setFace] = useState('frente');
  const [salvando, setSalvando] = useState(false);
  // A segunda pergunta, só para quem está montando a arte de um pedido
  // JÁ PAGO: ali o "confirmar" não volta ao carrinho, dispara a
  // personalização. Quem está montando um rascunho de catálogo continua
  // confirmando num clique — não há o que interromper.
  const [confirmandoPedido, setConfirmandoPedido] = useState(false);

  // O estado das duas faces, com histórico. Desfazer/refazer (§21) só
  // significa alguma coisa se as duas faces andarem juntas — desfazer na
  // frente e o verso voltar sozinho seria pior que não ter o botão.
  const projetoAnterior = rascunho.projeto?.dados || null;
  const [historico, setHistorico] = useState(() => [projetoAnterior || {
    frente: FACE_VAZIA(), verso: FACE_VAZIA(),
  }]);
  const [passo, setPasso] = useState(0);
  const faces = historico[passo];

  /**
   * Guarda um passo no histórico.
   *
   * `agrupar` existe para digitar um nome não virar dezoito passos de
   * desfazer: enquanto o cliente digita no mesmo campo, o passo é
   * substituído; trocar de arte ou de campo abre um passo novo.
   */
  const ultimoGrupo = useRef(null);
  const registrar = useCallback((proximo, agrupar = null) => {
    setHistorico(h => {
      const cortado = h.slice(0, passo + 1);
      if (agrupar && agrupar === ultimoGrupo.current && cortado.length > 1) {
        return [...cortado.slice(0, -1), proximo];
      }
      return [...cortado, proximo];
    });
    setPasso(p => (agrupar && agrupar === ultimoGrupo.current && p > 0 ? p : p + 1));
    ultimoGrupo.current = agrupar;
  }, [passo]);

  const mudarFace = useCallback((qual, patch, agrupar) => {
    registrar({ ...faces, [qual]: { ...faces[qual], ...patch } }, agrupar);
  }, [faces, registrar]);

  const desfazer = () => { setPasso(p => Math.max(0, p - 1)); ultimoGrupo.current = null; };
  const refazer = () => { setPasso(p => Math.min(historico.length - 1, p + 1)); ultimoGrupo.current = null; };

  // ── O que vem do cadastro ─────────────────────────────────
  const { data: cfg, isLoading: carregandoModelo } = useQuery({
    queryKey: ['catalogo', 'modelo', chave],
    queryFn: () => api.get(`/modelo/${chave}`),
    staleTime: 5 * 60 * 1000,
  });

  const { data: ocasioesData } = useQuery({
    queryKey: ['catalogo', 'ocasioes'],
    queryFn: () => api.get('/ocasioes'),
    staleTime: 30 * 60 * 1000,
  });

  const { data: artesData, isLoading: carregandoArtes } = useQuery({
    queryKey: ['catalogo', 'artes', ocasiao || 'todas'],
    queryFn: () => api.get(ocasiao ? `/artes?ocasiao=${ocasiao}` : '/artes'),
    staleTime: 10 * 60 * 1000,
  });

  const ocasioes = ocasioesData?.ocasioes || [];
  const artes = artesData?.artes || [];
  const gabarito = cfg?.gabarito || null;
  const medidas = useMemo(() => medidasDoGabarito(gabarito, duasFaces ? 300 : 360), [gabarito, duasFaces]);

  const artesFiltradas = useMemo(() => {
    const t = busca.trim().toLowerCase();
    if (!t) return artes;
    return artes.filter(a => a.nome.toLowerCase().includes(t) || a.codigo.toLowerCase().includes(t));
  }, [artes, busca]);

  const arteDaFace = qual => artes.find(a => a.id === faces[qual].arte_id) || null;
  const arteAtual = arteDaFace(face);

  /** O vetor de uma face, já com o que o cliente digitou dentro. */
  const montar = useCallback(qual => {
    const dados = faces[qual];
    const arte = artes.find(a => a.id === dados.arte_id);
    if (!arte?.svg) return null;
    return aplicarValores(arte.svg, arte.elementos, dados.valores, dados.estilo);
  }, [faces, artes]);

  const svgFrente = useMemo(() => montar('frente'), [montar]);
  const svgVerso = useMemo(() => (duasFaces ? montar('verso') : null), [montar, duasFaces]);

  // A conferência do gabarito roda a cada mexida: acusar o estouro na
  // hora é o que permite o cliente encurtar o nome enquanto ainda está
  // olhando para ele, em vez de descobrir no botão de confirmar.
  const estouro = useMemo(() => {
    const problemas = [];
    for (const [qual, svg] of [['frente', svgFrente], ['verso', svgVerso]]) {
      if (!svg) continue;
      const r = cabeNoGabarito(svg);
      if (!r.ok) problemas.push({ face: qual, campos: r.estouros });
    }
    return problemas;
  }, [svgFrente, svgVerso]);

  /** Escolher uma arte zera os campos para os exemplos dela. */
  function escolherArte(arte) {
    mudarFace(face, {
      arte_id: arte.id,
      valores: { ...valoresPadrao(arte.elementos), ...faces[face].valores },
      estilo: { ...faces[face].estilo, fonte: faces[face].estilo.fonte || arte.fontes?.[0] || null },
    }, null);
  }

  function limparFace() {
    mudarFace(face, FACE_VAZIA(), null);
  }

  // ── Confirmar arte e voltar (§23) ─────────────────────────
  /**
   * O QUE O BOTÃO FAZ DEPENDE DE ONDE ELE FOI APERTADO.
   *
   * Vindo do catálogo, confirmar guarda o rascunho e devolve ao
   * configurador — reversível, e por isso um clique basta.
   *
   * Vindo de um PEDIDO PAGO (a URL traz `?pedido=&item=`), confirmar
   * MANDA a arte para a produção: ela vira vegetal, tela e copo, e a
   * troca a partir dali só existe falando com um atendente. Aí a
   * pergunta é feita de novo, com o que acontece escrito na frente —
   * é a mesma regra do portal, e as duas portas precisam avisar igual.
   */
  function aoConfirmar() {
    if (!svgFrente) { toast.error('Escolha um modelo de arte para a frente.'); return; }
    if (duasFaces && !svgVerso) { toast.error('Escolha também a arte do verso.'); return; }
    if (estouro.length) {
      toast.error('Um dos textos passou da área segura. Encurte o texto ou reduza a arte.');
      return;
    }
    if (doPedido && doItem) { setConfirmandoPedido(true); return; }
    confirmar();
  }

  async function confirmar() {
    setConfirmandoPedido(false);
    setSalvando(true);
    try {
      // O servidor grava o gabarito VIGENTE junto do projeto e devolve o
      // id. O que vai no corpo é o vetor montado — é ele que a gráfica
      // vai gravar, e é ele que o cliente aprovou olhando.
      const r = await api.post('/projeto', {
        modelo: chave,
        arte_id: faces.frente.arte_id,
        posicao,
        visitor_id: visitante(),
        faces: {
          frente: { ...faces.frente, svg: svgFrente },
          ...(duasFaces ? { verso: { ...faces.verso, svg: svgVerso } } : {}),
        },
      });

      gravarRascunho(chave, {
        ...rascunho,
        posicao,
        ocasiao,
        projeto: {
          id: r.id,
          // A prévia que o configurador desenha no copo.
          faces: { frente: svgFrente, verso: duasFaces ? svgVerso : null },
          // O estado editável, para quem voltar ao editor continuar de onde parou.
          dados: faces,
        },
      });

      // Veio de um pedido pago: a arte é do ITEM, e não de um rascunho
      // de carrinho que já foi fechado.
      if (doPedido && doItem) {
        await apiErp.post(`/acompanhar/pedido/${doPedido}/arte`, {
          item_id: doItem, projeto_id: r.id,
        }, { headers: { Authorization: `Bearer ${sessionStorage.getItem('acompanhar_token') || ''}` } });
        toast.success('Arte enviada para a produção');
        navigate(`/acompanhar/pedido/${doPedido}`);
        return;
      }

      toast.success('Arte confirmada');
      navigate(`/personalizados/configurar/${chave}`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSalvando(false);
    }
  }

  // ── Estados de carregamento e de impedimento ──────────────
  if (carregandoModelo) {
    return (
      <CatalogoShell titulo="Abrindo o editor…">
        <div className="flex justify-center py-24">
          <Loader2 size={30} className="animate-spin" style={{ color: NEON.roxo }} />
        </div>
      </CatalogoShell>
    );
  }

  if (!medidas) {
    return (
      <CatalogoShell titulo="Criar sua arte"
        trilha={[{ nome: 'Catálogo', para: '/personalizados' }, { nome: 'Criar sua arte' }]}>
        <div className="max-w-md mx-auto text-center">
          <AlertTriangle size={34} className="mx-auto mb-3" style={{ color: '#fbbf24' }} />
          <p className="text-sm leading-relaxed" style={{ color: NEON.suave }}>
            Este modelo ainda não tem o gabarito de arte cadastrado — sem a medida da área de
            impressão não dá para montar a personalização com segurança.
            Fale com um de nossos atendentes que montamos para você.
          </p>
          <div className="mt-5">
            <Botao icone={ArrowLeft} onClick={() => navigate(`/personalizados/configurar/${chave}`)}>
              Voltar à configuração
            </Botao>
          </div>
        </div>
      </CatalogoShell>
    );
  }

  const nomeOcasiao = ocasioes.find(o => o.id === ocasiao)?.nome || null;
  const emDestaque = ocasioes.filter(o => o.destaque);
  const escondidas = ocasioes.filter(o => !o.destaque);

  return (
    <CatalogoShell
      titulo="Criar sua arte"
      subtitulo={`${cfg?.modelo?.nome || ''} — área de impressão ${medidas.largura_mm} × ${medidas.altura_mm} mm`}
      trilha={[
        { nome: 'Catálogo', para: '/personalizados' },
        { nome: cfg?.modelo?.base || '…', para: '/personalizados' },
        { nome: 'Criar sua arte' },
      ]}>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(340px,0.95fr)]">

        {/* ═══ ESQUERDA — o gabarito ═══ */}
        <div className="space-y-4">
          <Painel titulo="Gabarito da arte" cor={NEON.ciano} icone={Ruler}>
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <Botao cor={NEON.azul} icone={ArrowLeft} className="!w-auto !py-2 !px-3 !text-[12.5px]"
                onClick={() => navigate(`/personalizados/configurar/${chave}`)}>
                Voltar
              </Botao>
              <div className="flex gap-1.5 ml-auto">
                <BotaoIcone titulo="Desfazer" icone={Undo2} onClick={desfazer} desativado={passo === 0} />
                <BotaoIcone titulo="Refazer" icone={Redo2} onClick={refazer}
                  desativado={passo >= historico.length - 1} />
                <BotaoIcone titulo="Limpar esta face" icone={RotateCcw} onClick={limparFace}
                  desativado={!faces[face].arte_id} />
              </div>
            </div>

            <div className="flex flex-wrap items-start justify-center gap-6">
              <Gabarito medidas={medidas} svg={svgFrente} rotulo="Frente"
                ativo={face === 'frente'} onClick={() => setFace('frente')}
                selecionavel={duasFaces} />
              {duasFaces && (
                <Gabarito medidas={medidas} svg={svgVerso} rotulo="Verso"
                  ativo={face === 'verso'} onClick={() => setFace('verso')}
                  selecionavel />
              )}
            </div>

            <div className="flex flex-wrap items-center justify-center gap-4 mt-4 text-[10.5px]"
              style={{ color: NEON.suave }}>
              <span className="inline-flex items-center gap-1.5">
                <i className="inline-block w-4 h-0 border-t-2" style={{ borderColor: '#ef4444' }} />
                Limite do gabarito — {medidas.largura_mm} × {medidas.altura_mm} mm
              </span>
              <span className="inline-flex items-center gap-1.5">
                <i className="inline-block w-4 h-0 border-t-2 border-dashed" style={{ borderColor: '#38bdf8' }} />
                Área segura — {medidas.margem_mm} mm de margem
              </span>
            </div>

            {estouro.length > 0 && (
              <Nota icone={AlertTriangle} cor="#fca5a5">
                {estouro.map(e => `${e.face === 'verso' ? 'Verso' : 'Frente'}: o texto passou da área segura.`).join(' ')}
                {' '}Encurte o texto ou diminua a arte para conseguir confirmar.
              </Nota>
            )}

            {gabarito?.observacao && <Nota icone={Info} cor={NEON.ciano}>{gabarito.observacao}</Nota>}
          </Painel>

          {/* Os campos editáveis da face selecionada (§21) */}
          <Painel titulo={`Editar ${duasFaces ? (face === 'verso' ? 'o verso' : 'a frente') : 'a arte'}`}
            cor={NEON.roxo} icone={Type}>
            {!arteAtual ? (
              <p className="text-[12.5px]" style={{ color: NEON.fraco }}>
                Escolha um modelo de arte ao lado para começar a editar.
              </p>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  {(arteAtual.elementos || []).map(campo => (
                    <div key={campo.key}>
                      <Rotulo>{campo.label}</Rotulo>
                      <Campo
                        value={faces[face].valores?.[campo.key] ?? ''}
                        maxLength={campo.max || 60}
                        inputMode={campo.tipo === 'data' ? 'numeric' : 'text'}
                        placeholder={campo.padrao || ''}
                        onChange={e => mudarFace(face, {
                          valores: { ...faces[face].valores, [campo.key]: e.target.value },
                        }, `${face}:${campo.key}`)} />
                    </div>
                  ))}
                </div>

                <div className="grid gap-3 sm:grid-cols-2 mt-4">
                  <div>
                    <Rotulo>Fonte</Rotulo>
                    <Seletor value={faces[face].estilo.fonte || ''}
                      onChange={e => mudarFace(face, {
                        estilo: { ...faces[face].estilo, fonte: e.target.value || null },
                      })}>
                      <option value="">Fonte da arte</option>
                      {(arteAtual.fontes || []).map(f => <option key={f} value={f}>{f}</option>)}
                    </Seletor>
                    {!arteAtual.fontes?.length && (
                      <p className="text-[10.5px] mt-1" style={{ color: NEON.fraco }}>
                        Esta arte tem tipografia fechada pelo designer.
                      </p>
                    )}
                  </div>

                  <div>
                    <Rotulo>Alinhamento</Rotulo>
                    <div className="grid grid-cols-3 gap-1.5">
                      {[
                        { v: 'esquerda', i: AlignLeft }, { v: 'centro', i: AlignCenter }, { v: 'direita', i: AlignRight },
                      ].map(o => (
                        <Opcao key={o.v} icone={o.i} titulo="" cor={NEON.ciano}
                          ativo={faces[face].estilo.alinhamento === o.v}
                          onClick={() => mudarFace(face, {
                            estilo: { ...faces[face].estilo, alinhamento: o.v },
                          })} />
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-4">
                  <Rotulo>Posição e tamanho dentro do gabarito</Rotulo>
                  <Posicionador estilo={faces[face].estilo}
                    onMudar={estilo => mudarFace(face, { estilo }, `${face}:posicao`)} />
                </div>
              </>
            )}
          </Painel>

          <AssistenteIA
            arte={arteAtual}
            valores={faces[face].valores}
            onAplicar={valores => mudarFace(face, { valores: { ...faces[face].valores, ...valores } }, null)} />
        </div>

        {/* ═══ DIREITA — ocasião, modelos de arte e confirmação ═══ */}
        <div className="space-y-4">
          <Painel titulo="Ocasião do evento" cor={NEON.rosa} icone={Sparkles}>
            <div className="flex flex-wrap gap-1.5">
              {(verTodas ? ocasioes : emDestaque).map(o => (
                <Opcao key={o.id} titulo={o.nome} cor={NEON.rosa}
                  ativo={ocasiao === o.id}
                  onClick={() => setOcasiao(ocasiao === o.id ? null : o.id)} />
              ))}
              {!verTodas && escondidas.length > 0 && (
                <Opcao titulo="+ Mais opções" cor={NEON.azul} onClick={() => setVerTodas(true)} />
              )}
            </div>
          </Painel>

          <Painel titulo={`Modelos de arte${nomeOcasiao ? ` — ${nomeOcasiao}` : ''}`}
            cor={NEON.magenta} icone={Layers}>
            <div className="relative mb-3">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: NEON.ciano }} />
              <Campo value={busca} onChange={e => setBusca(e.target.value)}
                placeholder="Buscar arte" aria-label="Buscar arte" style={{ paddingLeft: 32 }} />
            </div>

            {carregandoArtes ? (
              <div className="flex justify-center py-10">
                <Loader2 size={22} className="animate-spin" style={{ color: NEON.magenta }} />
              </div>
            ) : !artesFiltradas.length ? (
              <p className="text-[12.5px] py-6 text-center" style={{ color: NEON.suave }}>
                {artes.length
                  ? 'Nenhuma arte com esse nome.'
                  : 'Ainda não temos artes prontas para essa ocasião. Fale com um atendente — montamos a sua.'}
              </p>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5 max-h-[420px] overflow-y-auto pr-1">
                {artesFiltradas.map(a => {
                  const escolhida = faces[face].arte_id === a.id;
                  return (
                    <button key={a.id} type="button" onClick={() => escolherArte(a)}
                      title={`${a.codigo} — ${a.nome}`}
                      className="p-1.5 rounded-lg transition-transform active:scale-[0.97]"
                      style={{
                        background: escolhida ? corComAlfa(NEON.magenta, 0.18) : 'rgba(255,255,255,0.04)',
                        border: `1px solid ${escolhida ? corComAlfa(NEON.magenta, 0.85) : 'rgba(255,255,255,0.10)'}`,
                      }}>
                      {/* A miniatura é a PRÓPRIA arte desenhada pequena — nunca
                          uma imagem à parte que possa discordar do editor. */}
                      <span className="block aspect-square rounded flex items-center justify-center overflow-hidden"
                        style={{ background: '#fff', color: '#111318' }}>
                        <span className="w-full h-full p-1 block"
                          dangerouslySetInnerHTML={{
                            __html: aplicarValores(a.svg, a.elementos, valoresPadrao(a.elementos), ESTILO_PADRAO) || '',
                          }} />
                      </span>
                      <span className="block text-[9.5px] mt-1 truncate" style={{ color: NEON.suave }}>
                        {a.nome}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            <Nota icone={Info} cor={NEON.magenta}>
              {duasFaces
                ? `A arte escolhida entra na face selecionada (${face === 'verso' ? 'verso' : 'frente'}). Cada lado pode ter a sua.`
                : 'Clique numa arte para ela entrar no gabarito.'}
            </Nota>
          </Painel>

          <div className="space-y-2.5">
            <Botao cheio icone={Check} onClick={aoConfirmar}
              disabled={salvando || !svgFrente || (duasFaces && !svgVerso) || estouro.length > 0}>
              {salvando ? 'Salvando…'
                : doPedido ? 'Enviar esta arte para a produção'
                : 'Confirmar arte e voltar'}
            </Botao>
            <Botao cor={NEON.azul} icone={ArrowLeft}
              onClick={() => (doPedido ? navigate(`/acompanhar/pedido/${doPedido}`) : navigate(`/personalizados/configurar/${chave}`))}>
              Voltar sem salvar
            </Botao>
          </div>
        </div>
      </div>

      {/* ── A SEGUNDA PERGUNTA, só no caminho sem volta ──────── */}
      {confirmandoPedido && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          style={{ background: 'rgba(3,6,18,0.85)' }} onClick={() => setConfirmandoPedido(false)}>
          <div className="w-full max-w-lg rounded-2xl p-5" onClick={e => e.stopPropagation()}
            style={{ background: 'linear-gradient(180deg,#0b1024 0%,#080d1e 100%)',
                     border: bordaNeon(NEON.magenta), boxShadow: `0 0 30px ${corComAlfa(NEON.magenta, 0.15)}` }}>
            <h3 className="text-white font-bold text-[17px] flex items-center gap-2">
              <Send size={18} style={{ color: NEON.magenta }} /> Enviar esta arte para a produção?
            </h3>
            <p className="text-[14px] mt-3 text-white">
              Você tem certeza que deseja enviar a arte que montou? Confira os nomes, as datas e as
              frases — é exatamente este desenho que vai para o copo.
            </p>
            <p className="text-[12.5px] mt-3 rounded-xl px-3.5 py-2.5 flex gap-2"
              style={{ background: corComAlfa(NEON.magenta, 0.12), color: '#fcd34d',
                       border: bordaNeon(NEON.magenta, 0.35) }}>
              <AlertTriangle size={15} className="shrink-0 mt-0.5" />
              <span>Ao confirmar, a personalização deste item COMEÇA: a arte vira vegetal, tela e copo
                impresso. Desse ponto em diante o processo não pode ser interrompido, e trocar a arte
                só falando com um atendente.</span>
            </p>
            <div className="flex items-center justify-end gap-2 mt-5">
              <Botao cor={NEON.azul} onClick={() => setConfirmandoPedido(false)}>Voltar e revisar</Botao>
              <Botao cheio icone={Check} onClick={confirmar} disabled={salvando}>
                {salvando ? 'Enviando…' : 'Sim, enviar para a produção'}
              </Botao>
            </div>
          </div>
        </div>
      )}
    </CatalogoShell>
  );
}

// ── O gabarito desenhado ────────────────────────────────────

/**
 * O retângulo da área de impressão, na proporção real do produto.
 *
 * Vermelho é o limite; azul tracejado é a área segura. A arte é
 * colocada DENTRO do azul: assim ela não vaza por construção, e o único
 * estouro possível é o texto crescer além do quadro — que é exatamente
 * o que `cabeNoGabarito` mede.
 */
function Gabarito({ medidas, svg, rotulo, ativo, onClick, selecionavel }) {
  const { larguraPx, alturaPx, margemPx } = medidas;
  const cor = ativo ? NEON.magenta : 'rgba(255,255,255,0.16)';

  return (
    <figure className="m-0 flex flex-col items-center gap-2">
      <button type="button" onClick={selecionavel ? onClick : undefined}
        aria-pressed={selecionavel ? !!ativo : undefined}
        className={`relative block rounded-sm ${selecionavel ? 'cursor-pointer' : 'cursor-default'}`}
        style={{
          width: larguraPx, height: alturaPx,
          background: '#ffffff',
          outline: selecionavel ? `2px solid ${cor}` : 'none',
          outlineOffset: 6,
          boxShadow: '0 0 30px rgba(0,0,0,0.5)',
        }}>
        {/* limite do gabarito */}
        <span className="absolute inset-0 pointer-events-none"
          style={{ border: '1.5px solid #ef4444' }} />
        {/* área segura */}
        <span className="absolute pointer-events-none"
          style={{
            inset: margemPx,
            border: '1px dashed #38bdf8',
          }} />
        {/* a arte, encaixada na área segura */}
        <span className="absolute block" style={{ inset: margemPx, color: '#111318' }}>
          {svg
            ? <span className="w-full h-full block" dangerouslySetInnerHTML={{ __html: svg }} />
            : (
              <span className="w-full h-full flex flex-col items-center justify-center gap-1.5"
                style={{ color: '#94a3b8' }}>
                <PenTool size={22} />
                <span className="text-[10px] text-center px-2">Escolha um modelo de arte</span>
              </span>
            )}
        </span>
      </button>

      <figcaption className="text-[10.5px] tracking-[0.18em] uppercase"
        style={{ color: ativo ? NEON.magenta : NEON.fraco }}>
        {rotulo}
      </figcaption>
    </figure>
  );
}

// ── Controles ───────────────────────────────────────────────

function BotaoIcone({ titulo, icone: Icone, onClick, desativado }) {
  return (
    <button type="button" onClick={onClick} disabled={desativado} title={titulo} aria-label={titulo}
      className="w-9 h-9 rounded-lg flex items-center justify-center disabled:opacity-30 transition-colors"
      style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)' }}>
      <Icone size={15} style={{ color: NEON.suave }} />
    </button>
  );
}

/**
 * Mover e redimensionar (§21), com o limite embutido.
 *
 * A escala para em 1.0 para cima de propósito: aumentar além do quadro
 * seria empurrar a arte para fora da área segura, e "não permitir
 * deformar a arte de maneira que ultrapasse o gabarito" é regra da
 * especificação, não preferência de tela.
 */
function Posicionador({ estilo, onMudar }) {
  const mexer = patch => onMudar({ ...estilo, ...patch });
  const limitar = (v, min, max) => Math.min(max, Math.max(min, Number(v) || 0));

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <div>
        <Rotulo>Horizontal</Rotulo>
        <input type="range" min={-20} max={20} step={1} value={estilo.x}
          onChange={e => mexer({ x: limitar(e.target.value, -20, 20) })}
          className="w-full accent-cyan-400" aria-label="Posição horizontal" />
      </div>
      <div>
        <Rotulo>Vertical</Rotulo>
        <input type="range" min={-20} max={20} step={1} value={estilo.y}
          onChange={e => mexer({ y: limitar(e.target.value, -20, 20) })}
          className="w-full accent-cyan-400" aria-label="Posição vertical" />
      </div>
      <div>
        <Rotulo>Tamanho</Rotulo>
        <div className="flex items-center gap-1.5">
          <BotaoIcone titulo="Diminuir" icone={ZoomOut}
            onClick={() => mexer({ escala: limitar((estilo.escala - 0.05).toFixed(2), 0.5, 1) })}
            desativado={estilo.escala <= 0.5} />
          <span className="text-[11.5px] tabular-nums flex-1 text-center" style={{ color: NEON.suave }}>
            {Math.round(estilo.escala * 100)}%
          </span>
          <BotaoIcone titulo="Aumentar" icone={ZoomIn}
            onClick={() => mexer({ escala: limitar((estilo.escala + 0.05).toFixed(2), 0.5, 1) })}
            desativado={estilo.escala >= 1} />
        </div>
      </div>

      {(estilo.x !== 0 || estilo.y !== 0 || estilo.escala !== 1) && (
        <button type="button" onClick={() => mexer({ x: 0, y: 0, escala: 1 })}
          className="text-[11px] text-left inline-flex items-center gap-1.5 sm:col-span-3"
          style={{ color: NEON.ciano }}>
          <Move size={12} /> Voltar ao enquadramento original
        </button>
      )}
    </div>
  );
}

/**
 * O ASSISTENTE DE IA (§22).
 *
 * "Alterar o nome Bruna para Maria." A IA lê os campos que a arte abriu
 * e devolve os valores novos — ela não desenha, não cria elemento e não
 * inventa campo. É tradutor de frase para formulário, e é o que permite
 * quem nunca abriu um CorelDRAW montar a própria personalização.
 *
 * Se a IA não estiver configurada no servidor, o bloco simplesmente
 * some: os campos ao lado continuam resolvendo tudo à mão.
 */
function AssistenteIA({ arte, valores, onAplicar }) {
  const [comando, setComando] = useState('');
  const [pensando, setPensando] = useState(false);
  const [resposta, setResposta] = useState(null);
  const [indisponivel, setIndisponivel] = useState(false);

  if (!arte || indisponivel) return null;

  async function enviar(e) {
    e?.preventDefault?.();
    const texto = comando.trim();
    if (!texto) return;
    setPensando(true);
    setResposta(null);
    try {
      const r = await api.post('/arte-ia', {
        comando: texto,
        campos: (arte.elementos || []).map(c => ({ key: c.key, label: c.label, tipo: c.tipo, max: c.max })),
        valores,
      });
      if (r.valores && Object.keys(r.valores).length) {
        onAplicar(r.valores);
        setResposta(r.resposta || 'Pronto, alterei para você.');
        setComando('');
      } else {
        setResposta(r.resposta || 'Não entendi o que mudar. Tente algo como "trocar o nome Bruna para Maria".');
      }
    } catch (err) {
      // IA desligada não é erro do cliente: o bloco sai da tela e o
      // formulário ao lado segue fazendo o trabalho inteiro.
      if (/não configurada|not configured/i.test(err.message)) setIndisponivel(true);
      else setResposta(err.message);
    } finally {
      setPensando(false);
    }
  }

  return (
    <Painel titulo="Assistente de IA" cor={NEON.ciano} icone={Wand2}>
      <form onSubmit={enviar} className="flex gap-2">
        <Campo value={comando} onChange={e => setComando(e.target.value)}
          placeholder='Ex.: "alterar o nome Bruna para Maria"' aria-label="Comando para o assistente" />
        <button type="submit" disabled={pensando || !comando.trim()}
          className="shrink-0 w-11 rounded-lg flex items-center justify-center disabled:opacity-40"
          style={{ background: corComAlfa(NEON.ciano, 0.14), border: `1px solid ${corComAlfa(NEON.ciano, 0.5)}` }}
          aria-label="Enviar comando">
          {pensando
            ? <Loader2 size={16} className="animate-spin" style={{ color: NEON.ciano }} />
            : <Send size={16} style={{ color: NEON.ciano }} />}
        </button>
      </form>

      {resposta && (
        <p className="text-[11.5px] mt-2.5 leading-relaxed" style={{ color: NEON.suave }}>{resposta}</p>
      )}

      <Nota icone={Info} cor={NEON.ciano}>
        Peça em português: trocar nomes, mudar a data ou ajustar a frase. Você confere o resultado
        no gabarito antes de confirmar.
      </Nota>
    </Painel>
  );
}
