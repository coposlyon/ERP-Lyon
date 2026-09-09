// ============================================================
// O COMPROVANTE DE CADA PARCELA.
//
// "Liberar pagamento" era um botão que dizia "confia em mim". Servia
// enquanto o pagamento era um só — e não serve para entrada + saldo nem
// para boleto 30/60/90, onde há três comprovantes em datas diferentes.
//
// Aqui cada parcela é uma linha com o seu próprio anexo. Quem anexa
// CONFIRMA o valor pago; a leitura da imagem só pré-preenche esse campo.
// Se o confirmado for menor que a parcela, o servidor abre sozinho a
// linha do saldo — e é assim que a entrada de 50% vira duas parcelas sem
// ninguém cadastrar nada.
//
// O QUE A LEITURA NÃO DIZ é se o comprovante é verdadeiro: ela lê pixels.
// Por isso o que ela achou aparece SEPARADO do valor confirmado, lado a
// lado — é essa comparação que a conferência de sexta vai usar.
// ============================================================
import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Paperclip, Eye, Loader2, CheckCircle2, TriangleAlert, ScanLine, Wallet, CalendarClock,
} from 'lucide-react';
import api from '@/lib/api';
import toast from 'react-hot-toast';

const brl = v => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0);
const dataBR = d => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : null);
const hojeISO = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

/**
 * PARCELA QUE AINDA NAO VENCEU NAO TEM COMPROVANTE PARA ANEXAR.
 *
 * Vender em 2x para 30 e 60 dias e pedir o comprovante na hora e pedir
 * o impossivel: o dinheiro ainda nao saiu da conta do cliente. O botao
 * verde ali embaixo fazia parecer que faltava alguma coisa ao vendedor,
 * e o pedido ficava com cara de incompleto no dia em que foi fechado.
 *
 * O que o pedido a prazo faz e GERAR AS CONTAS. Elas ja estao no
 * Financeiro, com data; quem cobra, recebe o comprovante e confirma e o
 * financeiro, no vencimento. Aqui isso vira uma frase em vez de um
 * botao — e no dia do vencimento o botao volta sozinho.
 */
const aPrazo = p => !!p.due_date && !p.quitada && String(p.due_date).slice(0, 10) > hojeISO();

export default function ParcelasDoPedido({ id, v, foraDaFase = false }) {
  const qc = useQueryClient();
  const [alvo, setAlvo] = useState(null);      // parcela em que se está anexando
  const [valor, setValor] = useState('');
  const entrada = useRef(null);

  const { data, isLoading } = useQuery({
    queryKey: ['parcelas', id],
    queryFn: () => api.get(`/sales/${id}/parcelas`),
  });

  const anexar = useMutation({
    mutationFn: ({ parcela_id, arquivo, valorPago }) =>
      api.post(`/sales/${id}/parcelas/comprovante`, { parcela_id, arquivo, valor: valorPago }),
    onSuccess: r => {
      toast.success(r.saldo
        ? `Comprovante anexado — abri a parcela do saldo de ${brl(r.saldo.amount)}`
        : 'Comprovante anexado');
      if (r.divergente) {
        toast(`A leitura achou ${brl(r.leitura.valor)} e você confirmou ${brl(r.parcela.paid_amount)} — marquei para conferir.`,
          { icon: '⚠️', duration: 7000 });
      }
      setAlvo(null); setValor('');
      qc.invalidateQueries({ queryKey: ['parcelas', id] });
      qc.invalidateQueries({ queryKey: ['pedido-vendedor', id] });
    },
    onError: e => toast.error(e.error || 'Não foi possível anexar'),
  });

  async function escolheu(arquivo) {
    if (!arquivo || !alvo) return;
    if (arquivo.size > 8 * 1024 * 1024) return toast.error('Arquivo muito grande. O limite é 8 MB.');
    const dados = await new Promise((ok, erro) => {
      const r = new FileReader();
      r.onload = () => ok(r.result);
      r.onerror = () => erro(new Error('Não consegui ler o arquivo'));
      r.readAsDataURL(arquivo);
    });
    anexar.mutate({ parcela_id: alvo.id, arquivo: dados, valorPago: valor === '' ? null : valor });
  }

  async function verComprovante(parcelaId) {
    try {
      const r = await api.get(`/sales/${id}/parcelas/${parcelaId}/comprovante`);
      window.open(r.url, '_blank', 'noopener');
    } catch (e) { toast.error(e.error || 'Não foi possível abrir'); }
  }

  if (isLoading) {
    return <p className="text-xs flex items-center gap-1.5" style={{ color: v.textSubtle }}>
      <Loader2 size={12} className="animate-spin" /> Carregando as parcelas…
    </p>;
  }

  const parcelas = data?.parcelas || [];

  /**
   * FORA DA FASE DE PAGAMENTO, SÓ APARECE SE FALTA DINHEIRO.
   *
   * A lista morava só na fase do pagamento, e fazia sentido: nas outras
   * doze telas o dinheiro não é a pergunta.
   *
   * Só que EDITAR O PEDIDO cria uma parcela nova depois dessa fase —
   * acrescentou 20 copos, entra a diferença a cobrar. O pedido já
   * estava na produção, a lista não aparecia, e não havia onde anexar o
   * comprovante do que o cliente acabou de pagar. O saldo ficava aberto
   * sem tela para fechá-lo.
   *
   * Agora, passada a fase, ela volta sozinha quando há saldo — e some
   * de novo assim que o comprovante entra.
   */
  if (foraDaFase && !(Number(data?.em_aberto) > 0)) return null;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
        <span className="font-semibold" style={{ color: v.textPrimary }}>Comprovantes</span>
        <span style={{ color: v.textSubtle }}>Total {brl(data?.total)}</span>
        {data?.quitado
          ? <span className="flex items-center gap-1" style={{ color: '#4ade80' }}><CheckCircle2 size={12} /> quitado</span>
          : <span style={{ color: '#fbbf24' }}>em aberto {brl(data?.em_aberto)}</span>}
      </div>

      {/* Nada vence hoje: nao ha o que este pedido espere do vendedor. */}
      {!data?.quitado && parcelas.length > 0 && parcelas.every(p => p.quitada || aPrazo(p)) && (
        <p className="text-[11px] flex items-start gap-1.5" style={{ color: v.textSubtle }}>
          <CalendarClock size={12} className="shrink-0 mt-0.5" />
          Pedido a prazo: as contas ja foram geradas e estao no Financeiro. Nao ha
          comprovante a anexar hoje — o financeiro cobra e confirma no vencimento.
        </p>
      )}

      <input ref={entrada} type="file" className="hidden" accept="image/*,application/pdf"
        onChange={e => { escolheu(e.target.files?.[0]); e.target.value = ''; }} />

      {parcelas.map((p, i) => {
        const lido = p.receipt_read && p.receipt_read.ok !== false ? p.receipt_read : null;
        const anexando = alvo && (alvo.id === p.id || (alvo.virtual && p.virtual));
        return (
          <div key={p.id || `virtual-${i}`} className="rounded-lg px-2.5 py-2"
            style={{ background: v.surface, border: `1px solid ${v.divider}` }}>

            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]">
              <span className="font-semibold" style={{ color: v.textPrimary }}>{p.rotulo}</span>
              <span style={{ color: v.textMuted }}>{brl(p.amount)}</span>
              {p.due_date && <span style={{ color: v.textSubtle }}>vence {dataBR(p.due_date)}</span>}
              {p.quitada
                ? <span className="text-[10px] px-1.5 py-0.5 rounded-full"
                    style={{ background: 'rgba(74,222,128,0.15)', color: '#4ade80' }}>pago</span>
                : <span className="text-[10px] px-1.5 py-0.5 rounded-full"
                    style={{ background: 'rgba(251,191,36,0.15)', color: '#fbbf24' }}>falta {brl(p.falta)}</span>}
              {p.receipt_status === 'divergente' && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full flex items-center gap-1"
                  style={{ background: 'rgba(248,113,113,0.15)', color: '#f87171' }}>
                  <TriangleAlert size={10} /> conferir
                </span>
              )}
              {p.receipt_status === 'conferido' && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full"
                  style={{ background: 'rgba(74,222,128,0.15)', color: '#4ade80' }}>conferido</span>
              )}
            </div>

            {/* O QUE A MÁQUINA LEU, separado do que foi confirmado. É esta
                comparação que a conferência de sexta vai usar. */}
            {lido && (
              <p className="text-[11px] mt-1 flex items-center gap-1.5" style={{ color: v.textSubtle }}>
                <ScanLine size={11} />
                Leitura: {lido.valor != null ? brl(lido.valor) : 'valor ilegível'}
                {lido.data ? ` · ${dataBR(lido.data)}` : ''}{lido.hora ? ` ${lido.hora}` : ''}
                {lido.banco ? ` · ${lido.banco}` : ''}
              </p>
            )}
            {p.receipt_read?.ok === false && p.receipt_url && (
              <p className="text-[11px] mt-1" style={{ color: v.textSubtle }}>
                Comprovante anexado, sem leitura automática ({p.receipt_read.motivo || p.receipt_read.erro}).
              </p>
            )}

            <div className="flex flex-wrap items-center gap-2 mt-1.5">
              {p.receipt_url && (
                <button onClick={() => verComprovante(p.id)} className="btn btn-sm"
                  style={{ background: 'transparent', color: v.textMuted, border: `1px solid ${v.divider}` }}>
                  <Eye size={13} /> Ver comprovante
                </button>
              )}

              {!p.quitada && !anexando && !aPrazo(p) && (
                <button onClick={() => { setAlvo(p); setValor(String(p.falta)); }}
                  disabled={anexar.isPending}
                  className="btn btn-sm disabled:opacity-50"
                  style={{ background: '#16a34a', color: 'white' }}>
                  <Paperclip size={13} /> Anexar comprovante
                </button>
              )}

              {/* Ver aPrazo(), la em cima: a conta ja esta no Financeiro. */}
              {aPrazo(p) && (
                <span className="text-[11px] flex items-center gap-1.5" style={{ color: v.textSubtle }}>
                  <CalendarClock size={12} />
                  No Financeiro, para cobrar em {dataBR(p.due_date)}.
                </span>
              )}

              {anexando && (
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px]" style={{ color: v.textSubtle }}>Valor pago</span>
                  <input type="number" step="0.01" min="0" value={valor} autoFocus
                    onChange={e => setValor(e.target.value)}
                    style={{ ...v.control, width: 110, padding: '0.3rem 0.5rem', fontSize: '0.78rem' }} />
                  <button onClick={() => entrada.current?.click()} disabled={anexar.isPending}
                    className="btn btn-sm disabled:opacity-50"
                    style={{ background: '#16a34a', color: 'white' }}>
                    {anexar.isPending
                      ? <Loader2 size={13} className="animate-spin" />
                      : <Paperclip size={13} />} Escolher arquivo
                  </button>
                  <button onClick={() => { setAlvo(null); setValor(''); }} className="btn btn-sm"
                    style={{ background: 'transparent', color: v.textMuted, border: `1px solid ${v.divider}` }}>
                    Cancelar
                  </button>
                </span>
              )}
            </div>

            {/* Pagou menos que a parcela? O servidor abre a linha do saldo
                sozinho — dito ANTES de clicar, para não parecer que o
                sistema inventou uma cobrança. */}
            {anexando && Number(valor) > 0 && Number(valor) < p.falta - 0.005 && (
              <p className="text-[11px] mt-1.5 flex items-start gap-1.5" style={{ color: '#fbbf24' }}>
                <Wallet size={11} className="shrink-0 mt-0.5" />
                Pagamento parcial: vou abrir uma segunda parcela de {brl(p.falta - Number(valor))} para o saldo.
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
