// ============================================================
// O PEDIDO EM PAPEL — a folha A4 que vira PDF.
//
// Abre pelo "Pedido em PDF" do card Documentos, tanto no ERP quanto na
// carteira do vendedor, e lê o MESMO pedido da tela de detalhes: um
// documento que discorda da tela que o gerou é pior que documento
// nenhum, porque ele é o que sai da empresa.
//
// POR QUE IMPRESSÃO E NÃO UMA BIBLIOTECA DE PDF. O navegador já sabe
// paginar, quebrar tabela entre páginas, respeitar margem e gerar PDF
// com texto selecionável e pesquisável. Gerador de PDF por imagem
// (html2canvas) entrega uma foto: não dá para copiar o número do pedido,
// borra na impressão e engorda o arquivo. `window.print()` com CSS de
// impressão é mais simples E o resultado é melhor.
//
// FUNDO BRANCO, DE PROPÓSITO. O ERP é escuro; papel não é. Imprimir a
// tela escura gastaria meio cartucho e sairia ilegível no fax do
// contador.
// ============================================================
import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Printer, Loader2 } from 'lucide-react';
import api from '@/lib/api';
import { fmtBRL, fmtUn, fmtDate } from './ui';

const PAGAMENTO = {
  cash: 'Dinheiro', pix: 'Pix', card_debit: 'Cartão de débito',
  card_credit: 'Cartão de crédito', transfer: 'Transferência',
  check: 'Cheque', a_prazo: 'A prazo', boleto: 'Boleto',
};

const dataHora = iso => iso
  ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
  : '—';

export default function DocumentoPedido() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { pathname } = useLocation();

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
  const itens = p.itens || [];

  // As colunas do meio saem dos itens DESTE pedido, como na tela: um
  // tradicional não abre "Cor da boca" vazia no documento do cliente.
  const colunas = [];
  for (const item of itens) {
    for (const campo of item.campos || []) {
      if (!colunas.includes(campo.rotulo)) colunas.push(campo.rotulo);
    }
  }
  const valorDe = (item, rotulo) =>
    (item.campos || []).find(c => c.rotulo === rotulo)?.valor || '—';

  const endereco = [
    cli.address?.street && `${cli.address.street}, ${cli.address.number || 's/n'}`,
    cli.address?.complement,
    cli.address?.neighborhood,
    [cli.address?.city, cli.address?.state].filter(Boolean).join('/'),
    cli.address?.zip && `CEP ${cli.address.zip}`,
  ].filter(Boolean).join(' — ');

  return (
    <>
      {/* A barra some na impressão: ela é da tela, não do documento. */}
      <style>{`
        @media print {
          .doc-barra { display: none !important; }
          .doc-folha { box-shadow: none !important; margin: 0 !important; width: auto !important; }
          @page { size: A4; margin: 14mm 12mm; }
          /* Linha de item não pode ser partida ao meio pela quebra de
             página: metade da quantidade numa folha e metade na outra é
             como nasce divergência de conferência. */
          tr, .doc-bloco { break-inside: avoid; }
          thead { display: table-header-group; }
        }
      `}</style>

      <div className="doc-barra flex flex-wrap items-center justify-between gap-3 mb-4">
        <button onClick={voltar} className="btn-secondary">
          <ArrowLeft size={15} /> Voltar ao pedido
        </button>
        <div className="flex items-center gap-3">
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.55)' }}>
            Em “Destino”, escolha <b>Salvar como PDF</b>.
          </p>
          <button onClick={() => window.print()} className="btn-primary">
            <Printer size={15} /> Imprimir / Salvar em PDF
          </button>
        </div>
      </div>

      {/* ── A folha ──────────────────────────────────────────── */}
      <div className="doc-folha mx-auto bg-white text-gray-900 rounded-lg"
        style={{ width: '210mm', maxWidth: '100%', padding: '12mm', boxShadow: '0 10px 40px rgba(0,0,0,0.45)' }}>

        {/* Cabeçalho */}
        <div className="flex items-start justify-between gap-6 pb-4 mb-5" style={{ borderBottom: '2px solid #111827' }}>
          <div>
            <img src="/lyon-logo-dark.png" alt="" className="h-12 mb-2"
              onError={e => { e.target.style.display = 'none'; }} />
            <p className="text-lg font-bold leading-tight">Lyon Copos Acrílicos</p>
            <p className="text-[11px] text-gray-600">Copos personalizados · lyoncopos.com.br</p>
          </div>
          <div className="text-right">
            <p className="text-[11px] uppercase tracking-widest text-gray-500">Pedido de Venda</p>
            <p className="text-3xl font-bold leading-none">{p.codigo}</p>
            <p className="text-[11px] text-gray-600 mt-1">
              Emitido em {dataHora(p.operation_date ? `${p.operation_date}T12:00:00` : p.created_at)}
            </p>
            <p className="text-[11px] font-semibold mt-1">{p.status_label}</p>
          </div>
        </div>

        {/* Cliente e dados */}
        <div className="grid grid-cols-2 gap-6 mb-5 doc-bloco">
          <Quadro titulo="Cliente">
            <Linha r="Nome" v={cli.name || 'Consumidor final'} forte />
            <Linha r="Código" v={p.codigo_cliente || '—'} />
            <Linha r={cli.cpf_cnpj?.replace(/\D/g, '').length > 11 ? 'CNPJ' : 'CPF'} v={cli.cpf_cnpj || '—'} />
            <Linha r="Telefone" v={cli.mobile || cli.phone || '—'} />
            <Linha r="E-mail" v={cli.email || '—'} />
            {endereco && <Linha r="Endereço" v={endereco} />}
          </Quadro>

          <Quadro titulo="Dados do Pedido">
            <Linha r="Data do pedido" v={dataHora(p.operation_date ? `${p.operation_date}T12:00:00` : p.created_at)} />
            <Linha r="Data do evento" v={p.event_date ? fmtDate(p.event_date) : '—'} />
            <Linha r="Vendedor" v={p.vendedor || '—'} />
            <Linha r="Origem" v={p.origin || '—'} />
            <Linha r="Pagamento" v={PAGAMENTO[p.payment_method] || p.payment_method || '—'} />
            <Linha r="Transportadora" v={p.transportadora || '—'} />
            {p.freight_quote && <Linha r="Cotação" v={p.freight_quote} />}
          </Quadro>
        </div>

        {/* Itens */}
        <p className="text-[11px] uppercase tracking-widest text-gray-500 mb-1.5">Itens do pedido</p>
        <table className="w-full text-[11px] mb-5" style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f3f4f6' }}>
              {['Código', 'Produto', 'Linha', 'Categoria', ...colunas, 'Qtd', 'Valor unit.', 'Total'].map((h, i, t) => (
                <th key={h} className="px-2 py-1.5 font-semibold whitespace-nowrap"
                  style={{ border: '1px solid #d1d5db', textAlign: i >= t.length - 3 ? 'right' : 'left' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {itens.map(i => (
              <tr key={i.id}>
                <td className="px-2 py-1.5 font-mono" style={{ border: '1px solid #e5e7eb' }}>{i.codigo || '—'}</td>
                <td className="px-2 py-1.5" style={{ border: '1px solid #e5e7eb' }}>{i.produto}</td>
                <td className="px-2 py-1.5" style={{ border: '1px solid #e5e7eb' }}>{i.linha || '—'}</td>
                <td className="px-2 py-1.5" style={{ border: '1px solid #e5e7eb' }}>{i.categoria}</td>
                {colunas.map(c => (
                  <td key={c} className="px-2 py-1.5" style={{ border: '1px solid #e5e7eb' }}>{valorDe(i, c)}</td>
                ))}
                <td className="px-2 py-1.5 text-right" style={{ border: '1px solid #e5e7eb' }}>{fmtUn(i.quantidade)}</td>
                <td className="px-2 py-1.5 text-right" style={{ border: '1px solid #e5e7eb' }}>{fmtBRL(i.valor_unitario)}</td>
                <td className="px-2 py-1.5 text-right font-semibold" style={{ border: '1px solid #e5e7eb' }}>{fmtBRL(i.valor_total)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Valores e prazos */}
        <div className="grid grid-cols-2 gap-6 mb-5 doc-bloco">
          <Quadro titulo="Prazos e entrega">
            <Linha r="Previsão de saída" v={p.ship_date ? fmtDate(p.ship_date) : '—'} />
            <Linha r="Data de coleta" v={p.collect_date ? fmtDate(p.collect_date) : '—'} />
            <Linha r="Previsão de entrega" v={p.delivery_date ? fmtDate(p.delivery_date) : '—'} />
            <Linha r="Dias úteis de transporte" v={p.transport_days ? `${p.transport_days} dias` : '—'} />
          </Quadro>

          <div>
            <div className="px-3 py-2" style={{ border: '1px solid #d1d5db' }}>
              <Linha r="Valor dos produtos" v={fmtBRL(p.subtotal)} />
              <Linha r="Frete" v={fmtBRL(p.freight)} />
              {Number(p.discount) > 0 && <Linha r="Desconto" v={`− ${fmtBRL(p.discount)}`} />}
              <div className="flex items-baseline justify-between gap-3 mt-2 pt-2" style={{ borderTop: '2px solid #111827' }}>
                <span className="text-sm font-bold">Valor total</span>
                <span className="text-2xl font-bold">{fmtBRL(p.total)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Avisos */}
        {(p.avisos || []).length > 0 && (
          <div className="doc-bloco mb-5">
            <p className="text-[11px] uppercase tracking-widest text-gray-500 mb-1.5">Informações importantes</p>
            <ul className="text-[11px] space-y-1">
              {p.avisos.map((a, i) => <li key={i}>• {a}</li>)}
            </ul>
          </div>
        )}

        <p className="text-[10px] text-gray-500 leading-relaxed doc-bloco" style={{ borderTop: '1px solid #e5e7eb', paddingTop: 8 }}>
          A entrega será realizada no endereço informado no cadastro, em horário comercial, das 8h às 18h,
          em dias úteis. É necessário que haja alguém disponível no local para receber a mercadoria.
          {/* A data de emissão fica no papel porque o documento circula
              solto: sem ela, ninguém sabe se está lendo a versão de hoje
              ou a de três semanas atrás. */}
          <br />Documento gerado em {new Date().toLocaleString('pt-BR')} — {p.codigo}.
        </p>
      </div>
    </>
  );
}

function Quadro({ titulo, children }) {
  return (
    <div className="doc-bloco">
      <p className="text-[11px] uppercase tracking-widest text-gray-500 mb-1.5">{titulo}</p>
      <div className="px-3 py-2" style={{ border: '1px solid #d1d5db' }}>{children}</div>
    </div>
  );
}

function Linha({ r, v, forte }) {
  return (
    <div className="flex items-start justify-between gap-3 py-0.5 text-[11px]">
      <span className="text-gray-600 shrink-0">{r}:</span>
      <span className={`text-right ${forte ? 'font-bold text-[12px]' : ''}`}>{v}</span>
    </div>
  );
}
