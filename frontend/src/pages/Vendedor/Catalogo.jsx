// ============================================================
// Site / Catálogo — o link oficial na mão do vendedor.
//
// A tela existe por um motivo só: fazer o cliente comprar pelo site em
// vez de ditar os dados para o vendedor digitar. Quem chegou pelo
// WhatsApp, por telefone, no balcão ou voltou para recomprar recebe o
// link e faz sozinho — o cadastro sai do jeito que ele escreveu, e o
// CEP é o CEP dele.
// ============================================================
import { useState } from 'react';
import { Copy, Check, MessageCircle, ExternalLink, QrCode, Share2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useVend } from './ui';

/** O endereço público da loja. Mesma origem do ERP — a loja mora em /loja. */
export function linkDaLoja() {
  return `${window.location.origin}/loja`;
}

export default function Catalogo() {
  const v = useVend();
  const [copiado, setCopiado] = useState(null);
  const link = linkDaLoja();

  // As mensagens prontas cobrem as três conversas que mais acontecem.
  // O vendedor edita antes de mandar; isto é ponto de partida, não script.
  const modelos = [
    { key: 'novo', titulo: 'Cliente novo',
      texto: `Olá! Aqui é da Lyon Copos. Você pode montar seu pedido direto no nosso site, escolher o modelo, a cor e a quantidade, e já ver o frete: ${link}` },
    { key: 'recompra', titulo: 'Recompra',
      texto: `Olá! Aqui é da Lyon Copos. Que bom falar com você de novo. Para repetir o pedido é só entrar aqui e escolher: ${link}` },
    { key: 'orcamento', titulo: 'Quem pediu orçamento',
      texto: `Olá! Segue o link para você simular o pedido com a quantidade e o frete do seu CEP: ${link}` },
  ];

  async function copiar(texto, key) {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(key);
      toast.success('Copiado');
      setTimeout(() => setCopiado(null), 2000);
    } catch { toast.error('Não foi possível copiar — selecione o texto e copie à mão'); }
  }

  const zap = texto => `https://wa.me/?text=${encodeURIComponent(texto)}`;

  // QR gerado pelo próprio navegador seria mais uma dependência; a API
  // pública resolve o caso de balcão (cliente aponta a câmera e vai).
  const qr = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(link)}`;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: v.textPrimary }}>Site / Catálogo</h1>
        <p className="text-sm mt-0.5" style={{ color: v.textSubtle }}>
          Envie o link oficial e deixe o cliente montar o próprio pedido
        </p>
      </div>

      {/* Link oficial */}
      <div style={{ ...v.card, padding: '1.25rem' }}>
        <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: v.textSubtle }}>
          Link oficial da Lyon Copos
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex-1 min-w-[220px] font-mono text-sm px-3 py-2.5 rounded-lg truncate"
            style={{ background: v.control.background, border: v.control.border, color: v.textPrimary }}>
            {link}
          </span>
          <button onClick={() => copiar(link, 'link')} className="btn-secondary">
            {copiado === 'link' ? <Check size={15} /> : <Copy size={15} />} Copiar
          </button>
          <a href={link} target="_blank" rel="noreferrer" className="btn-secondary">
            <ExternalLink size={15} /> Abrir
          </a>
          {navigator.share && (
            <button onClick={() => navigator.share({ title: 'Lyon Copos', url: link }).catch(() => {})}
              className="btn-secondary">
              <Share2 size={15} /> Compartilhar
            </button>
          )}
        </div>
        <p className="text-[11px] mt-2" style={{ color: v.textSubtle }}>
          Quanto menos você digitar os dados do cliente, menor a chance de erro no cadastro e na entrega.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Mensagens prontas */}
        <div className="lg:col-span-2 space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: v.textSubtle }}>
            Mensagens prontas
          </p>
          {modelos.map(m => (
            <div key={m.key} style={{ ...v.card, padding: '1rem' }}>
              <p className="font-semibold text-sm mb-1.5" style={{ color: v.textPrimary }}>{m.titulo}</p>
              <p className="text-[13px] leading-relaxed" style={{ color: v.textMuted }}>{m.texto}</p>
              <div className="flex flex-wrap gap-2 mt-3">
                <button onClick={() => copiar(m.texto, m.key)} className="btn-secondary btn-sm">
                  {copiado === m.key ? <Check size={13} /> : <Copy size={13} />} Copiar mensagem
                </button>
                <a href={zap(m.texto)} target="_blank" rel="noreferrer"
                  className="btn btn-sm" style={{ background: '#16a34a', color: 'white' }}>
                  <MessageCircle size={13} /> Abrir no WhatsApp
                </a>
              </div>
            </div>
          ))}
        </div>

        {/* QR para o atendimento presencial */}
        <div style={{ ...v.card, padding: '1.25rem' }} className="text-center">
          <p className="text-[11px] font-semibold uppercase tracking-wider mb-3 flex items-center justify-center gap-1.5"
            style={{ color: v.textSubtle }}>
            <QrCode size={13} /> QR Code do catálogo
          </p>
          <img src={qr} alt="QR Code do catálogo da Lyon Copos"
            className="mx-auto rounded-lg bg-white p-2" width={220} height={220} />
          <p className="text-[11px] mt-3" style={{ color: v.textMuted }}>
            No balcão, o cliente aponta a câmera e já entra no catálogo pelo próprio celular.
          </p>
        </div>
      </div>
    </div>
  );
}
