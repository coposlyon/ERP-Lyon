// ============================================================
// O PEDIDO DE VENDA — DOCUMENTO.
//
// Uma tela, dois documentos: o que se VÊ e o que se IMPRIME.
//
// Na tela ele segue o visual do sistema — escuro, com os blocos
// destacados —, porque é ali que o vendedor confere antes de mandar.
// No papel ele vira preto e branco: o ERP é escuro, papel não é, e
// imprimir a tela escura gasta meio cartucho para sair ilegível no fax
// do contador. É a mesma marcação, com um `@media print` que troca o
// mundo inteiro para branco.
//
// POR QUE IMPRESSÃO E NÃO UMA BIBLIOTECA DE PDF. O navegador já sabe
// paginar, quebrar tabela entre páginas, respeitar margem e gerar PDF
// com texto selecionável. Gerador por imagem (html2canvas) entrega uma
// foto: não dá para copiar o número do pedido, borra na impressão e
// engorda o arquivo.
//
// COM ARTE / SEM ARTE é uma PRÉVIA, não um interruptor de impressão. Ao
// escolher "Sem arte" a arte sai da lateral e do documento na hora, e é
// assim que ela vai sair no papel — a tela mostra o que vai acontecer,
// em vez de prometer uma coisa e imprimir outra. Para ver a arte sem
// mudar a escolha existe o botão "Visualizar arte", que abre o arquivo
// à parte.
//
// OS DADOS DA EMPRESA VÊM COM O PEDIDO (rota /area-vendedor/pedidos/:id),
// e não do login guardado no navegador: este documento circula fora do
// ERP, e o CNPJ nele precisa ser o de agora.
// ============================================================
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, Printer, Loader2, Download, Eye, Image as ImageIcon, Frame,
  Building2, FileText, MapPin, Phone, Globe, User, CalendarDays, ShoppingCart,
  DollarSign, Truck, ShieldCheck, CircleCheck, Paperclip, Palette, X,
} from 'lucide-react';
import api from '@/lib/api';
import { fmtBRL, fmtUn, fmtDate } from './ui';

const PAGAMENTO = {
  cash: 'Dinheiro', pix: 'Pix', card_debit: 'Cartão de débito',
  card_credit: 'Cartão de crédito', transfer: 'Transferência',
  check: 'Cheque', a_prazo: 'A prazo', boleto: 'Boleto',
};

const CIANO = '#22d3ee';
const ROSA = '#e8187a';

const dataHora = iso => iso
  ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
  : '—';

/** 57860708000130 → 57.860.708/0001-30 · 02005463922 → 020.054.639-22 */
function documento(v) {
  const d = String(v || '').replace(/\D/g, '');
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  return v || '—';
}

const cep = v => {
  const d = String(v || '').replace(/\D/g, '');
  return d.length === 8 ? d.replace(/(\d{5})(\d{3})/, '$1-$2') : (v || '');
};

export default function DocumentoPedido() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  const [comArte, setComArte] = useState(true);
  // 'pb' = preto e branco (papel) · 'cor' = como está na tela
  const [modo, setModo] = useState('pb');
  const [perguntando, setPerguntando] = useState(false);

  const { data: p, isLoading, error } = useQuery({
    queryKey: ['pedido-vendedor', id],
    queryFn: () => api.get(`/area-vendedor/pedidos/${id}`),
  });

  // O título da janela vira o nome sugerido do arquivo no "Salvar como
  // PDF" do navegador. Sem isto o cliente recebe "localhost.pdf".
  useEffect(() => {
    if (!p) return;
    const antes = document.title;
    document.title = `${p.codigo} - Lyon Copos`;
    return () => { document.title = antes; };
  }, [p]);

  /**
   * Imprimir num modo escolhido.
   *
   * O `setTimeout` não é superstição: a classe do modo precisa estar
   * pintada no DOM antes de o navegador tirar a foto da página. Chamar
   * print() no mesmo quadro imprime o modo anterior.
   */
  function imprimir(qual) {
    setModo(qual);
    setPerguntando(false);
    setTimeout(() => window.print(), 120);
  }

  /**
   * "Imprimir em preto e branco" chega aqui com ?imprimir=1.
   *
   * O diálogo só abre DEPOIS de a folha existir — chamar print() com o
   * documento ainda carregando imprime uma página em branco. Por isso
   * ele espera `p` chegar, e um quadro a mais para o navegador ter
   * pintado o que acabou de montar.
   */
  useEffect(() => {
    if (!p || params.get('imprimir') !== '1') return;
    const t = setTimeout(() => imprimir('pb'), 400);
    return () => clearTimeout(t);
  }, [p, params]);

  const voltar = () => navigate(pathname.startsWith('/sales')
    ? `/sales/${id}/detalhe`
    : `/vendedor/pedidos/${id}`);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={28} className="animate-spin text-primary-600" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="text-center py-16">
        <p className="text-red-400">{error.error || 'Não foi possível abrir este pedido'}</p>
        <button onClick={voltar} className="btn-secondary mt-4 mx-auto"><ArrowLeft size={14} /> Voltar</button>
      </div>
    );
  }

  const cli = p.CLIENTES || {};
  const emp = p.empresa || {};
  const itens = p.itens || [];

  // As colunas do meio saem dos itens DESTE pedido, como na tela de
  // detalhes: um copo tradicional não abre "Cor da boca" vazia no
  // documento que vai para o cliente.
  const colunas = [];
  for (const item of itens) {
    for (const campo of item.campos || []) {
      if (!colunas.includes(campo.rotulo)) colunas.push(campo.rotulo);
    }
  }
  const valorDe = (item, rotulo) =>
    (item.campos || []).find(c => c.rotulo === rotulo)?.valor || '—';

  const enderecoCli = [
    cli.address?.street && `${cli.address.street}, ${cli.address.number || 's/n'}`,
    cli.address?.complement,
    cli.address?.neighborhood,
  ].filter(Boolean).join(', ');
  const cidadeCli = [
    [cli.address?.city, cli.address?.state].filter(Boolean).join('/'),
    cli.address?.zip && `CEP ${cep(cli.address.zip)}`,
  ].filter(Boolean).join(' — ');

  const enderecoEmp = [
    emp.address?.street && `${emp.address.street}, ${emp.address.number || 's/n'}`,
    emp.address?.neighborhood || emp.address?.district,
  ].filter(Boolean).join(', ');
  const cidadeEmp = [
    [emp.address?.city, emp.address?.state].filter(Boolean).join(' - '),
    emp.address?.zip && `CEP ${cep(emp.address.zip)}`,
  ].filter(Boolean).join(', ');

  const temArte = !!p.artwork_url;
  const ehImagem = temArte && /\.(png|jpe?g|webp|gif|svg)(\?|$)/i.test(p.artwork_url);

  return (
    <>
      <style>{`
        /* ═══ O QUE VAI PARA O PAPEL ═══════════════════════════
           O ERP INTEIRO SAI DO CAMINHO.

           A impressão saía com o menu lateral, o cabeçalho e o sininho
           dentro da folha, e o documento espremido numa coluna estreita
           no meio — porque o navegador imprime a PÁGINA, e a página é o
           ERP com o documento dentro dele.

           Três coisas fazem isso acontecer, e as três precisam cair:
             · o menu e o cabeçalho, que não são o documento;
             · o "overflow: hidden"/"auto" do shell, que corta tudo o que
               passa da altura da tela — era isso que deixava a folha com
               uma página só;
             · a altura fixa de 100vh, que não existe no papel.
        */
        @media print {
          html, body { background: #ffffff !important; }

          .erp-shell { display: block !important; height: auto !important; overflow: visible !important; }
          .erp-shell > aside,
          .erp-shell header,
          .erp-shell footer,
          .erp-shell button.fixed { display: none !important; }
          .erp-shell > div { display: block !important; height: auto !important; overflow: visible !important; }
          .erp-shell main { height: auto !important; overflow: visible !important; padding: 0 !important; }

          /* A barra de ações e a lateral são da tela, não do documento. */
          .doc-chrome, .doc-aside { display: none !important; }
          .doc-sem-arte .doc-arte { display: none !important; }

          /* Linha de item não pode ser partida ao meio pela quebra de
             página: metade da quantidade numa folha e metade na outra é
             como nasce divergência de conferência. */
          tr, .doc-bloco { break-inside: avoid; }
          thead { display: table-header-group; }
          @page { size: A4; margin: 10mm; }

          /* ── PRETO E BRANCO ──────────────────────────────────
             O ERP é escuro, papel não é: imprimir a tela escura gasta
             meio cartucho para sair ilegível no fax do contador. */
          .doc-modo-pb .doc-folha,
          .doc-modo-pb .doc-folha * {
            background: #ffffff !important;
            color: #000000 !important;
            border-color: #9ca3af !important;
            box-shadow: none !important;
            text-shadow: none !important;
          }
          .doc-modo-pb .doc-folha { border: 1px solid #374151 !important; border-radius: 0 !important; }
          .doc-modo-pb .doc-forte { font-weight: 700 !important; }

          /* ── COLORIDO ────────────────────────────────────────
             Sai igual à tela. "print-color-adjust: exact" é o que manda
             o navegador imprimir os fundos: sem ele, ele "economiza
             tinta" e devolve o texto claro sobre papel branco — ou
             seja, ilegível. */
          .doc-modo-cor .doc-folha {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}</style>

      {/* ── Barra de ações (só da tela) ──────────────────────── */}
      <div className="doc-chrome flex flex-wrap items-start justify-between gap-4 mb-4">
        <div className="flex items-start gap-3">
          <button onClick={voltar} className="btn-secondary mt-0.5">
            <ArrowLeft size={15} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-white leading-tight">Pedido de Venda — Documento</h1>
            <p className="text-sm" style={{ color: 'rgba(255,255,255,0.55)' }}>
              Visualização do pedido em formato A4
            </p>
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <BotaoNeon cor={CIANO} onClick={() => setPerguntando(true)} Icon={Download}>Baixar PDF</BotaoNeon>
            <BotaoNeon cor="#60a5fa" onClick={() => imprimir('pb')} Icon={Printer}>Imprimir em preto e branco</BotaoNeon>
            <BotaoNeon cor={ROSA} Icon={Eye} desabilitado={!temArte}
              onClick={() => temArte && window.open(p.artwork_url, '_blank', 'noopener')}>
              Visualizar arte
            </BotaoNeon>
          </div>

          <div className="flex items-center gap-2 rounded-xl px-3 py-1.5"
            style={{ border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.03)' }}>
            <span className="text-xs" style={{ color: 'rgba(255,255,255,0.55)' }}>Opção de impressão:</span>
            <Opcao ativa={comArte} onClick={() => setComArte(true)} Icon={ImageIcon}>Com arte</Opcao>
            <Opcao ativa={!comArte} onClick={() => setComArte(false)} Icon={Frame}>Sem arte</Opcao>
          </div>
        </div>
      </div>

      <div className={`doc-modo-${modo} flex flex-col xl:flex-row gap-4 items-start ${comArte ? '' : 'doc-sem-arte'}`}>

        {/* ══ A FOLHA ══════════════════════════════════════════ */}
        <div className="doc-folha flex-1 min-w-0 rounded-2xl p-5 sm:p-7"
          style={{
            background: 'linear-gradient(180deg, #0b1024 0%, #080d1e 100%)',
            border: `1px solid ${CIANO}55`,
            boxShadow: `0 0 24px ${CIANO}22, 0 0 60px ${ROSA}11`,
            width: '100%',
          }}>

          {/* Cabeçalho: empresa × pedido */}
          <div className="flex flex-wrap items-start justify-between gap-6 pb-5 mb-5 doc-bloco"
            style={{ borderBottom: `1px solid ${CIANO}44` }}>
            <div className="flex items-start gap-4 min-w-0">
              <img src="/lyon-logo.png" alt="" style={{ height: 56, width: 'auto', objectFit: 'contain' }}
                onError={e => { e.target.style.display = 'none'; }} />
              <div className="text-[12px] space-y-1 min-w-0" style={{ color: 'rgba(255,255,255,0.82)' }}>
                <DadoEmpresa Icon={Building2} v={emp.name || 'Lyon Copos Acrílicos'} forte />
                <DadoEmpresa Icon={FileText} v={`CNPJ ${documento(emp.cnpj)}`} />
                {enderecoEmp && <DadoEmpresa Icon={MapPin} v={enderecoEmp} />}
                {cidadeEmp && <DadoEmpresa Icon={MapPin} v={cidadeEmp} invisivel />}
                {emp.phone && <DadoEmpresa Icon={Phone} v={emp.phone} />}
                <DadoEmpresa Icon={Globe} v="LyonCopos.com.br" />
              </div>
            </div>

            <div className="text-right shrink-0">
              <p className="text-[11px] uppercase tracking-[0.2em] doc-forte"
                style={{ color: 'rgba(255,255,255,0.75)' }}>Pedido de Venda</p>
              <p className="text-3xl font-extrabold leading-tight doc-forte" style={{ color: CIANO }}>
                {p.codigo}
              </p>
              <span className="inline-flex items-center gap-1.5 mt-2 px-3 py-1.5 rounded-lg text-[12px] font-semibold"
                style={{ border: `1px solid ${CIANO}77`, color: CIANO, background: `${CIANO}12` }}>
                <CircleCheck size={14} /> {p.status_label}
              </span>
              <p className="text-[10px] mt-2" style={{ color: 'rgba(255,255,255,0.45)' }}>
                Emitido em {dataHora(p.operation_date ? `${p.operation_date}T12:00:00` : p.created_at)}
              </p>
            </div>
          </div>

          {/* Cliente × Pedido */}
          <div className="grid md:grid-cols-2 gap-4 mb-4">
            <Quadro titulo="Dados do Cliente" Icon={User} cor={CIANO}>
              <Linha r="Cliente" v={cli.name || 'Consumidor final'} forte />
              <Linha r="Código" v={p.codigo_cliente || '—'} />
              <Linha r={String(cli.cpf_cnpj || '').replace(/\D/g, '').length > 11 ? 'CNPJ' : 'CPF'}
                v={documento(cli.cpf_cnpj)} />
              <Linha r="Telefone" v={cli.mobile || cli.phone || '—'} />
              <Linha r="E-mail" v={cli.email || '—'} />
              {enderecoCli && <Linha r="Endereço" v={enderecoCli} />}
              {cidadeCli && <Linha r="" v={cidadeCli} />}
            </Quadro>

            <Quadro titulo="Dados do Pedido" Icon={CalendarDays} cor={ROSA}>
              <Linha r="Número do Pedido" v={p.codigo} forte />
              <Linha r="Data do Pedido" v={dataHora(p.operation_date ? `${p.operation_date}T12:00:00` : p.created_at)} />
              <Linha r="Data do Evento" v={p.event_date ? fmtDate(p.event_date) : '—'} />
              <Linha r="Origem" v={p.origin || '—'} />
              <Linha r="Vendedor" v={p.vendedor || '—'} />
              <Linha r="Pagamento" v={PAGAMENTO[p.payment_method] || p.payment_method || '—'} />
              <Linha r="Transportadora" v={p.transportadora || '—'} />
              {p.freight_quote && <Linha r="Cotação" v={p.freight_quote} />}
            </Quadro>
          </div>

          {/* Itens */}
          <Quadro titulo="Itens do Pedido" Icon={ShoppingCart} cor={CIANO} className="mb-4">
            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-[11px]" style={{ borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['Código', 'Produto', 'Linha', 'Categoria', ...colunas, 'Quantidade', 'Valor Unit.', 'Valor Total']
                      .map((h, i, t) => (
                        <th key={h} className="px-2 py-2 font-semibold whitespace-nowrap doc-forte"
                          style={{
                            color: CIANO, borderBottom: `1px solid ${CIANO}44`,
                            textAlign: i >= t.length - 3 ? 'right' : 'left',
                          }}>{h}</th>
                      ))}
                  </tr>
                </thead>
                <tbody>
                  {itens.map(i => (
                    <tr key={i.id} style={{ color: 'rgba(255,255,255,0.88)' }}>
                      <Celula>{i.codigo || '—'}</Celula>
                      <Celula>{i.produto}</Celula>
                      <Celula>{i.linha || '—'}</Celula>
                      <Celula>{i.categoria}</Celula>
                      {colunas.map(c => <Celula key={c}>{valorDe(i, c)}</Celula>)}
                      <Celula alinha="right">{fmtUn(i.quantidade)}</Celula>
                      <Celula alinha="right">{fmtBRL(i.valor_unitario)}</Celula>
                      <Celula alinha="right" forte>{fmtBRL(i.valor_total)}</Celula>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Quadro>

          {/* Resumo × Entrega */}
          <div className="grid md:grid-cols-2 gap-4 mb-4">
            <Quadro titulo="Resumo Financeiro" Icon={DollarSign} cor={CIANO}>
              <Linha r="Valor dos Produtos" v={fmtBRL(p.subtotal)} />
              <Linha r="Frete" v={fmtBRL(p.freight)} />
              {Number(p.discount) > 0 && <Linha r="Desconto" v={`− ${fmtBRL(p.discount)}`} />}
              <div className="flex items-baseline justify-between gap-3 mt-2 pt-2"
                style={{ borderTop: `1px solid ${CIANO}44` }}>
                <span className="text-sm font-bold doc-forte" style={{ color: CIANO }}>VALOR TOTAL:</span>
                <span className="text-2xl font-extrabold doc-forte" style={{ color: CIANO }}>{fmtBRL(p.total)}</span>
              </div>
            </Quadro>

            <Quadro titulo="Observação da Entrega" Icon={Truck} cor={ROSA}>
              <p className="text-[11px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.78)' }}>
                A entrega será realizada no endereço cadastrado do cliente, em dias úteis,
                no horário comercial. É necessário que haja alguém no local para receber a mercadoria.
              </p>
              {(p.avisos || []).length > 0 && (
                <ul className="text-[11px] mt-2 space-y-1" style={{ color: 'rgba(255,255,255,0.68)' }}>
                  {p.avisos.map((a, i) => <li key={i}>• {a}</li>)}
                </ul>
              )}
              <div className="grid grid-cols-2 gap-x-3 mt-3 pt-2" style={{ borderTop: `1px solid ${ROSA}33` }}>
                <Linha r="Previsão de saída" v={p.ship_date ? fmtDate(p.ship_date) : '—'} />
                <Linha r="Coleta" v={p.collect_date ? fmtDate(p.collect_date) : '—'} />
                <Linha r="Previsão de entrega" v={p.delivery_date ? fmtDate(p.delivery_date) : '—'} />
                <Linha r="Transporte" v={p.transport_days ? `${p.transport_days} dias úteis` : '—'} />
              </div>
            </Quadro>
          </div>

          {/* A arte no papel — some quando a impressão é "Sem arte". */}
          {comArte && temArte && ehImagem && (
            <div className="doc-arte doc-bloco mb-4">
              <Quadro titulo="Arte do Pedido" Icon={Paperclip} cor={ROSA}>
                <img src={p.artwork_url} alt="Arte do pedido"
                  style={{ maxHeight: 300, maxWidth: '100%', objectFit: 'contain', margin: '0 auto', display: 'block' }} />
                {p.artwork_notes && (
                  <p className="text-[11px] text-center mt-2" style={{ color: 'rgba(255,255,255,0.6)' }}>
                    {p.artwork_notes}
                  </p>
                )}
              </Quadro>
            </div>
          )}

          {/* Rodapé assinado */}
          <div className="flex flex-wrap items-center justify-between gap-4 pt-4 doc-bloco"
            style={{ borderTop: `1px solid ${CIANO}44` }}>
            <div className="flex items-start gap-2.5">
              <ShieldCheck size={20} style={{ color: CIANO }} className="shrink-0 mt-0.5" />
              <p className="text-[11px] leading-snug" style={{ color: 'rgba(255,255,255,0.7)' }}>
                Documento gerado eletronicamente pelo sistema Lyon Copos<br />
                Assinado digitalmente por {emp.name || 'Lyon Copos'}
              </p>
            </div>

            <div className="text-center">
              <p style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontStyle: 'italic', fontSize: 20, color: ROSA }}>
                Lyon Copos
              </p>
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.35)', width: 180, margin: '2px auto 4px' }} />
              <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.65)' }}>
                {emp.name || 'Lyon Copos Acrílicos'}<br />{documento(emp.cnpj)}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <ShieldCheck size={18} style={{ color: CIANO }} />
              <p className="text-[9px] uppercase tracking-wider leading-tight doc-forte"
                style={{ color: CIANO }}>
                Documento<br />assinado<br />digitalmente
              </p>
            </div>
          </div>

          {/* A data de geração fica no papel porque o documento circula
              solto: sem ela, ninguém sabe se está lendo a versão de hoje
              ou a de três semanas atrás. */}
          <p className="text-[9px] mt-3 text-center" style={{ color: 'rgba(255,255,255,0.35)' }}>
            Gerado em {new Date().toLocaleString('pt-BR')} — {p.codigo}
          </p>
        </div>

        {/* ══ LATERAL: a arte anexada ══════════════════════════ */}
        {/* "Sem arte" tira a arte daqui também, e não só do papel: o
            botão é uma PRÉVIA do que vai sair. Enquanto a miniatura
            continuava na lateral, a tela dizia que a arte estava no
            documento e o papel saía sem ela. */}
        {comArte && (
        <aside className="doc-aside w-full xl:w-64 shrink-0">
          <div className="rounded-2xl p-4"
            style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${temArte ? `${CIANO}44` : 'rgba(255,255,255,0.10)'}` }}>
            <div className="flex items-center justify-between gap-2 mb-3">
              <p className="text-sm font-semibold text-white">
                {temArte ? 'Arte anexada' : 'Sem arte'}
              </p>
              <span className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ background: temArte ? '#4ade80' : 'rgba(255,255,255,0.25)' }} />
            </div>

            {temArte ? (
              <>
                <button onClick={() => window.open(p.artwork_url, '_blank', 'noopener')}
                  className="w-full rounded-xl overflow-hidden mb-3 flex items-center justify-center"
                  style={{ background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.10)', minHeight: 140 }}>
                  {ehImagem
                    ? <img src={p.artwork_url} alt="Arte anexada"
                        style={{ maxHeight: 180, maxWidth: '100%', objectFit: 'contain' }} />
                    : <span className="text-xs px-3 py-6" style={{ color: 'rgba(255,255,255,0.6)' }}>
                        Arquivo anexado — clique para abrir
                      </span>}
                </button>
                <p className="text-[11px] flex items-center gap-1.5" style={{ color: 'rgba(255,255,255,0.6)' }}>
                  <Paperclip size={12} /> 1 arte anexada
                </p>
              </>
            ) : (
              <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.5)' }}>
                Este pedido ainda não tem arte anexada. Anexe pela tela do pedido para ela
                aparecer aqui e na impressão.
              </p>
            )}
          </div>
        </aside>
        )}
      </div>

      {/* ── Como você quer o PDF? ──────────────────────────── */}
      {perguntando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(3,6,18,0.78)' }} onClick={() => setPerguntando(false)}>
          <div className="w-full max-w-lg rounded-2xl p-5 sm:p-6" onClick={e => e.stopPropagation()}
            style={{
              background: 'linear-gradient(180deg, #0b1024 0%, #080d1e 100%)',
              border: `1px solid ${CIANO}55`,
              boxShadow: `0 0 30px ${CIANO}22, 0 0 80px ${ROSA}14`,
            }}>
            <div className="flex items-center justify-between gap-3 mb-1">
              <p className="text-base font-semibold text-white">Como você quer o PDF?</p>
              <button onClick={() => setPerguntando(false)} className="p-1 rounded-lg"
                style={{ color: 'rgba(255,255,255,0.6)' }} aria-label="Fechar">
                <X size={18} />
              </button>
            </div>
            <p className="text-xs mb-4" style={{ color: 'rgba(255,255,255,0.5)' }}>
              Em “Destino”, escolha <b>Salvar como PDF</b>.
            </p>

            <div className="grid sm:grid-cols-2 gap-3">
              <EscolhaPdf Icon={Printer} cor="#60a5fa" onClick={() => imprimir('pb')}
                titulo="Preto e branco" nota="Para imprimir em papel — economiza tinta e sai legível." />
              <EscolhaPdf Icon={Palette} cor={ROSA} onClick={() => imprimir('cor')}
                titulo="Colorido" nota="Igual a esta tela — para mandar ao cliente." />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function EscolhaPdf({ Icon, cor, titulo, nota, onClick }) {
  return (
    <button onClick={onClick}
      className="flex flex-col items-center gap-2 rounded-xl px-4 py-5 text-center transition-transform hover:-translate-y-0.5"
      style={{ border: `1px solid ${cor}66`, background: `${cor}0f`, color: cor }}>
      <Icon size={24} />
      <span className="text-sm font-semibold">{titulo}</span>
      <span className="text-[11px] font-normal leading-snug" style={{ color: 'rgba(255,255,255,0.5)' }}>{nota}</span>
    </button>
  );
}

// ── Peças ────────────────────────────────────────────────────

function BotaoNeon({ cor, Icon, children, onClick, desabilitado }) {
  return (
    <button onClick={onClick} disabled={desabilitado}
      className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      style={{ border: `1px solid ${cor}77`, color: cor, background: `${cor}12` }}>
      <Icon size={16} /> {children}
    </button>
  );
}

function Opcao({ ativa, onClick, Icon, children }) {
  return (
    <button onClick={onClick}
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors"
      style={ativa
        ? { background: `${CIANO}1f`, color: CIANO, border: `1px solid ${CIANO}66` }
        : { color: 'rgba(255,255,255,0.55)', border: '1px solid transparent' }}>
      <Icon size={13} /> {children}
    </button>
  );
}

function DadoEmpresa({ Icon, v, forte, invisivel }) {
  return (
    <p className={`flex items-start gap-1.5 ${forte ? 'font-bold text-[13px] doc-forte' : ''}`}>
      <Icon size={12} className="shrink-0 mt-0.5" style={{ color: invisivel ? 'transparent' : CIANO }} />
      <span>{v}</span>
    </p>
  );
}

function Quadro({ titulo, Icon, cor, children, className = '' }) {
  return (
    <section className={`doc-bloco rounded-xl p-3.5 ${className}`}
      style={{ border: `1px solid ${cor}44`, background: 'rgba(255,255,255,0.02)' }}>
      <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider mb-2.5 doc-forte"
        style={{ color: cor }}>
        <Icon size={14} /> {titulo}
      </p>
      {children}
    </section>
  );
}

function Linha({ r, v, forte }) {
  return (
    <div className="flex items-start justify-between gap-3 py-0.5 text-[11px]">
      <span className="shrink-0" style={{ color: 'rgba(255,255,255,0.55)' }}>{r ? `${r}:` : ''}</span>
      <span className={`text-right ${forte ? 'font-bold text-[12px] doc-forte' : ''}`}
        style={{ color: 'rgba(255,255,255,0.9)' }}>{v}</span>
    </div>
  );
}

function Celula({ children, alinha = 'left', forte }) {
  return (
    <td className={`px-2 py-1.5 ${forte ? 'font-semibold doc-forte' : ''}`}
      style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', textAlign: alinha }}>
      {children}
    </td>
  );
}
