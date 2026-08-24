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
  AlertTriangle, ArrowLeft, Info,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { lojaApi } from './api';
import { CatalogoShell, Painel, NEON, bordaNeon, corComAlfa, Botao, Nota, brl } from './ui';

// De quanto em quanto tempo perguntamos se o pagamento caiu. Seis
// segundos é rápido o bastante para parecer instantâneo e devagar o
// bastante para não martelar o servidor com a aba aberta a tarde toda.
const INTERVALO = 6000;

export default function Pagamento() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [pedido, setPedido] = useState(null);
  const [erro, setErro] = useState('');
  const [copiado, setCopiado] = useState(false);
  const [avisando, setAvisando] = useState(false);
  const [avisado, setAvisado] = useState(false);
  const timer = useRef(null);

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

  async function jaPaguei() {
    setAvisando(true);
    try {
      await lojaApi.post(`/pedido/${id}/paguei`, {});
      setAvisado(true);
      toast.success('Avisamos a equipe. Assim que confirmarmos, seu pedido é liberado.');
    } catch (e) {
      toast.error(e.message);
    } finally {
      setAvisando(false);
    }
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
                  {pedido.number ? `Pedido PV-${String(pedido.number).padStart(6, '0')}` : 'Pedido liberado'}
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

        <div className="mt-3 space-y-2.5">
          <Botao cor={NEON.roxo} icone={avisado ? Check : Info}
            onClick={jaPaguei} disabled={avisando || avisado}>
            {avisando ? 'Avisando…' : avisado ? 'Equipe avisada' : 'Já paguei'}
          </Botao>

          <a href="https://wa.me/?text=Ol%C3%A1%2C%20fiz%20um%20pedido%20no%20cat%C3%A1logo%20e%20preciso%20de%20ajuda%20com%20o%20pagamento"
            target="_blank" rel="noreferrer"
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
