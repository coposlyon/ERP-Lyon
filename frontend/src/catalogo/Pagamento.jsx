// ============================================================
// TELA 6 — O PAGAMENTO.
//
// O PEDIDO AINDA NÃO É VENDA (§32). Enquanto o dinheiro não estiver
// conferido no banco, o que existe é um pedido esperando na fila. Quem
// confirma é a Lyon, no ERP, olhando o extrato — o botão "já paguei"
// desta tela apenas avisa que tem comprovante para conferir. É decisão
// do cliente da Lyon: PIX sem gateway, taxa zero, conferência humana.
//
// A TELA PERGUNTA SOZINHA. A cada poucos segundos ela consulta o pedido;
// no instante em que o ERP confirma, o número do Pedido de Venda aparece
// aqui e o caminho para o acompanhamento (§33) abre. Ninguém precisa
// atualizar a página nem esperar telefonema.
//
// É A MESMA FILA DA LOJA. `/api/public/pedido/:id` já existe e já é
// consultada pelo /loja. Um pedido do catálogo e um pedido da loja
// esperam no mesmo lugar, e é por isso que o pessoal do financeiro
// confere um lugar só.
// ============================================================
import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  QrCode, Copy, Check, Loader2, Clock, PackageCheck, Headphones,
  AlertTriangle, ArrowLeft, Info, Paperclip, MessageCircle, FileCheck2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { lojaApi } from './api';
import { CatalogoShell, Painel, NEON, bordaNeon, corComAlfa, Botao, Nota, brl } from './ui';

// De quanto em quanto tempo perguntamos se o pagamento caiu. Seis
// segundos é rápido o bastante para parecer instantâneo e devagar o
// bastante para não martelar o servidor com a aba aberta a tarde toda.
const INTERVALO = 6000;

/** O arquivo do celular vira data URL — é o formato que a rota aceita. */
const comoDataUrl = arquivo => new Promise((resolve, reject) => {
  const leitor = new FileReader();
  leitor.onload = () => resolve(leitor.result);
  leitor.onerror = () => reject(new Error('Não consegui ler o arquivo escolhido.'));
  leitor.readAsDataURL(arquivo);
});

export default function Pagamento() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [pedido, setPedido] = useState(null);
  const [erro, setErro] = useState('');
  const [copiado, setCopiado] = useState(false);
  const [avisando, setAvisando] = useState(false);
  const [avisado, setAvisado] = useState(false);
  const [comprovante, setComprovante] = useState(false);   // já anexou nesta sessão
  const [loja, setLoja] = useState(null);                  // telefone do atendimento
  const timer = useRef(null);
  const inputComprovante = useRef(null);

  useEffect(() => {
    let vivo = true;

    async function conferir() {
      try {
        const r = await lojaApi.get(`/pedido/${id}`);
        if (!vivo) return;
        setPedido(r);
        // Confirmado: para de perguntar. Continuar batendo depois de
        // pago é gastar servidor para ouvir a mesma resposta.
        if (r.status !== 'aguardando_pagamento') clearInterval(timer.current);
      } catch (e) {
        if (vivo) setErro(e.message);
      }
    }

    conferir();
    timer.current = setInterval(conferir, INTERVALO);
    return () => { vivo = false; clearInterval(timer.current); };
  }, [id]);

  // O WHATSAPP DA LOJA VEM DO CADASTRO, e não colado no código: os
  // links antigos apontavam para `wa.me/?text=…` sem número nenhum —
  // abriam o WhatsApp na lista de conversas e deixavam o cliente
  // procurando com quem falar.
  useEffect(() => {
    let vivo = true;
    lojaApi.get('/store').then(r => { if (vivo) setLoja(r); }).catch(() => {});
    return () => { vivo = false; };
  }, []);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(pedido.pix_copy_paste);
      setCopiado(true);
      toast.success('Código PIX copiado');
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      toast.error('Não consegui copiar — selecione o código e copie à mão');
    }
  }

  /**
   * Avisa que pagou — com o comprovante junto quando houver.
   *
   * NÃO CONFIRMA NADA, e a tela não finge que confirma: quem confere o
   * extrato é a Lyon. O que muda com o comprovante anexado é a fila —
   * o pedido sobe para o topo com o documento do lado, em vez de virar
   * um "ele disse que pagou" que alguém precisa caçar no WhatsApp.
   */
  async function jaPaguei(arquivo) {
    setAvisando(true);
    try {
      const receipt = arquivo ? await comoDataUrl(arquivo) : null;
      const r = await lojaApi.post(`/pedido/${id}/paguei`, receipt ? { receipt } : {});
      setAvisado(true);
      if (r?.comprovante) setComprovante(true);
      toast.success(r?.comprovante
        ? 'Comprovante recebido! Assim que conferirmos, seu pedido é liberado.'
        : 'Avisamos a equipe. Assim que confirmarmos, seu pedido é liberado.');
    } catch (e) {
      toast.error(e.message);
    } finally {
      setAvisando(false);
    }
  }

  /** O arquivo escolhido, já checado antes de subir. */
  function escolherComprovante(e) {
    const arquivo = e.target.files?.[0];
    e.target.value = '';
    if (!arquivo) return;
    if (arquivo.size > 8 * 1024 * 1024) {
      toast.error('O comprovante passa de 8 MB. Mande uma foto menor.');
      return;
    }
    jaPaguei(arquivo);
  }

  if (erro) {
    return (
      <CatalogoShell largura="max-w-lg" titulo="Pedido não encontrado"
        trilha={[{ nome: 'Catálogo', para: '/personalizados' }, { nome: 'Pagamento' }]}>
        <Painel cor={NEON.magenta}>
          <p className="text-[13px] text-center py-4" style={{ color: '#fca5a5' }}>{erro}</p>
          <Botao icone={ArrowLeft} onClick={() => navigate('/personalizados')}>Voltar ao catálogo</Botao>
        </Painel>
      </CatalogoShell>
    );
  }

  if (!pedido) {
    return (
      <CatalogoShell titulo="Abrindo seu pagamento…">
        <div className="flex justify-center py-24">
          <Loader2 size={30} className="animate-spin" style={{ color: NEON.ciano }} />
        </div>
      </CatalogoShell>
    );
  }

  const pendente = pedido.status === 'aguardando_pagamento';

  // O comprovante pode ter sido enviado nesta sessão ou numa anterior —
  // o cliente volta a esta tela pelo mesmo link, e ela não pode pedir de
  // novo o que ele já mandou ontem.
  const comprovanteEnviado = comprovante || !!pedido.comprovante;

  // A referência curta do pedido: o uuid inteiro numa mensagem de
  // WhatsApp não é referência, é ruído. Oito caracteres bastam para
  // achar a linha na fila.
  const referencia = String(id).slice(0, 8).toUpperCase();

  // 55 na frente quando o cadastro guardou só DDD + número, que é como
  // o Brasil escreve telefone. Sem número o link vira o WhatsApp sem
  // destinatário — melhor isso do que um botão que some.
  const foneLoja = String(loja?.cadastro?.whatsapp || loja?.phone || '').replace(/\D/g, '');
  const destino = foneLoja ? (foneLoja.length <= 11 ? `55${foneLoja}` : foneLoja) : '';
  const zap = texto => `https://wa.me/${destino}?text=${encodeURIComponent(texto)}`;

  const linkWhatsapp = zap(
    `Olá! Segue o comprovante do pedido ${referencia} — ${brl(pedido.total)}.`,
  );
  const linkAtendente = zap(
    `Olá, fiz o pedido ${referencia} no catálogo e preciso de ajuda com o pagamento.`,
  );

  /**
   * Mandar no WhatsApp também avisa a fila.
   *
   * Sem isto o pedido continuaria como "ninguém disse nada" enquanto o
   * comprovante estava chegando por outro canal — e quem confere não
   * saberia que tem algo para procurar. O link abre do mesmo jeito: o
   * aviso é um efeito, não uma etapa a mais.
   */
  function avisarPeloWhats() {
    if (!avisado && !avisando) jaPaguei(null);
  }

  // ── Pagamento confirmado (§33) ────────────────────────────
  if (!pendente) {
    const expirado = pedido.status === 'expirado' || pedido.status === 'cancelado';
    return (
      <CatalogoShell largura="max-w-lg"
        titulo={expirado ? 'Cobrança encerrada' : 'Pagamento confirmado'}
        trilha={[{ nome: 'Catálogo', para: '/personalizados' }, { nome: 'Pagamento' }]}>
        <Painel cor={expirado ? NEON.magenta : NEON.ciano}>
          <div className="text-center py-4">
            {expirado
              ? <AlertTriangle size={40} className="mx-auto mb-3" style={{ color: '#fbbf24' }} />
              : <Check size={40} className="mx-auto mb-3" style={{ color: NEON.ciano }} />}

            {expirado ? (
              <p className="text-[13px] leading-relaxed" style={{ color: NEON.suave }}>
                Essa cobrança não está mais válida. Monte o pedido de novo ou fale com um
                atendente que a gente recupera sua configuração.
              </p>
            ) : (
              <>
                <p className="text-[20px] font-bold" style={{ color: NEON.texto }}>
                  {pedido.number ? `Pedido PV-${String(pedido.number).padStart(4, '0')}` : 'Pedido liberado'}
                </p>
                <p className="text-[12.5px] mt-2 leading-relaxed" style={{ color: NEON.suave }}>
                  Recebemos {brl(pedido.total)}. Seu pedido entrou na produção e você acompanha
                  cada etapa com seu CPF e o número acima.
                </p>
              </>
            )}
          </div>

          <div className="space-y-2.5 mt-2">
            {!expirado && (
              <Link to="/acompanhar"
                className="w-full rounded-xl py-3 px-4 font-semibold text-[14px] flex items-center justify-center gap-2"
                style={{
                  color: '#fff',
                  background: `linear-gradient(90deg, ${NEON.magenta} 0%, ${NEON.roxo} 46%, ${NEON.azul} 100%)`,
                  boxShadow: `0 0 26px ${corComAlfa(NEON.roxo, 0.5)}`,
                }}>
                <PackageCheck size={17} /> Acompanhar meu pedido
              </Link>
            )}
            <Botao cor={NEON.azul} icone={ArrowLeft} onClick={() => navigate('/personalizados')}>
              Voltar ao catálogo
            </Botao>
          </div>
        </Painel>
      </CatalogoShell>
    );
  }

  // ── Aguardando o PIX ──────────────────────────────────────
  return (
    <CatalogoShell largura="max-w-lg" titulo="Pague com PIX"
      subtitulo="Assim que confirmarmos o pagamento, seu pedido entra na produção."
      trilha={[{ nome: 'Catálogo', para: '/personalizados' }, { nome: 'Pagamento' }]}>

      <Painel cor={NEON.ciano} icone={QrCode} titulo={`Total a pagar — ${brl(pedido.total)}`}>
        {pedido.pix_qr_base64 ? (
          <img src={`data:image/png;base64,${pedido.pix_qr_base64}`}
            alt="QR Code do PIX" width={220} height={220}
            className="mx-auto rounded-lg bg-white p-2" />
        ) : (
          <div className="mx-auto w-[220px] h-[220px] rounded-lg flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.05)' }}>
            <QrCode size={40} style={{ color: NEON.fraco }} />
          </div>
        )}

        {pedido.pix_copy_paste && (
          <div className="mt-4">
            <p className="text-[11.5px] mb-1.5" style={{ color: NEON.suave }}>PIX copia e cola</p>
            <div className="p-2.5 rounded-lg text-[10.5px] break-all font-mono"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: NEON.suave }}>
              {pedido.pix_copy_paste}
            </div>
            <div className="mt-2.5">
              <Botao cheio icone={copiado ? Check : Copy} onClick={copiar}>
                {copiado ? 'Copiado' : 'Copiar código PIX'}
              </Botao>
            </div>
          </div>
        )}

        <div className="mt-4 p-3 rounded-lg flex items-start gap-2 text-[11.5px] leading-relaxed"
          style={{ background: corComAlfa(NEON.ciano, 0.07), color: NEON.suave }}>
          <Clock size={14} className="shrink-0 mt-0.5" style={{ color: NEON.ciano }} />
          <span>
            Esta tela confirma sozinha — pode deixar aberta. Depois de pagar,
            a confirmação costuma sair em poucos minutos no horário comercial.
            {pedido.expires_at && (
              <> A cobrança vale até {new Date(pedido.expires_at).toLocaleString('pt-BR', {
                day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
              })}.</>
            )}
          </span>
        </div>

        {/* ── DEPOIS DE PAGAR, O COMPROVANTE ───────────────────
            O PIX cai direto na conta da Lyon e o banco não avisa o
            sistema: quem confere é uma pessoa, olhando o extrato. O
            comprovante é o que encurta essa conferência de "procurar um
            pagamento de R$ 340 no meio do dia" para "bater este
            documento com esta linha".
            Dois caminhos porque as duas coisas acontecem: quem já está
            com o print na mão anexa aqui; quem prefere conversar manda
            no WhatsApp. Os dois marcam o pedido como avisado — o que
            muda é onde o documento chega. */}
        <div className="mt-4 p-3 rounded-xl" style={bordaNeon(NEON.magenta, 0.5)}>
          <p className="text-[12.5px] font-semibold mb-1" style={{ color: NEON.texto }}>
            Já pagou? Mande o comprovante.
          </p>
          <p className="text-[11.5px] leading-relaxed mb-3" style={{ color: NEON.suave }}>
            Não é obrigatório, mas é o que faz seu pedido ser liberado mais rápido.
          </p>

          <input ref={inputComprovante} type="file" className="hidden"
            accept="image/*,application/pdf" onChange={escolherComprovante} />

          <div className="space-y-2.5">
            <Botao cheio icone={comprovanteEnviado ? FileCheck2 : Paperclip}
              onClick={() => inputComprovante.current?.click()}
              disabled={avisando}>
              {avisando ? <><Loader2 size={16} className="animate-spin" /> Enviando…</>
                : comprovanteEnviado ? 'Comprovante enviado — trocar' : 'Anexar comprovante aqui'}
            </Botao>

            <a href={linkWhatsapp} target="_blank" rel="noreferrer" onClick={avisarPeloWhats}
              className="w-full rounded-xl py-3 px-4 font-semibold text-[14px] flex items-center justify-center gap-2"
              style={{ ...bordaNeon('#25d366', 0.7), color: '#4ade80' }}>
              <MessageCircle size={17} /> Enviar no WhatsApp
            </a>
          </div>

          {comprovanteEnviado ? (
            <p className="text-[11.5px] leading-relaxed mt-3 flex items-start gap-1.5"
              style={{ color: '#4ade80' }}>
              <Check size={13} className="shrink-0 mt-0.5" />
              Recebemos seu comprovante. Ele está na fila de conferência — esta tela avisa
              sozinha quando o pedido for liberado.
            </p>
          ) : avisado && (
            <p className="text-[11.5px] leading-relaxed mt-3 flex items-start gap-1.5"
              style={{ color: NEON.suave }}>
              <Check size={13} className="shrink-0 mt-0.5" style={{ color: NEON.ciano }} />
              Equipe avisada. Se puder, anexe o comprovante — com ele a conferência é na hora.
            </p>
          )}
        </div>

        <div className="mt-3">
          <a href={linkAtendente} target="_blank" rel="noreferrer"
            className="w-full rounded-xl py-3 px-4 font-semibold text-[14px] flex items-center justify-center gap-2"
            style={{ ...bordaNeon(NEON.magenta), color: NEON.magenta }}>
            <Headphones size={17} /> Falar com atendente
          </a>
        </div>

        <Nota icone={Info} cor={NEON.ciano}>
          Guarde este endereço: você pode voltar a esta tela a qualquer momento pelo mesmo link.
        </Nota>
      </Painel>
    </CatalogoShell>
  );
}
