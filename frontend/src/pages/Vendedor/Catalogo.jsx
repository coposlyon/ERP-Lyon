// ============================================================
// Site / Catálogo — o link oficial na mão do vendedor.
//
// O QUE ESTA TELA NÃO É. Não é onde o vendedor monta o catálogo. O
// catálogo é montado no Administrativo (famílias, produtos, acabamentos,
// gabaritos) e o vendedor não decide nada aqui — ele COMPARTILHA.
//
// A CONVERSA QUE ESTA TELA RESOLVE. O cliente escreve no WhatsApp
// "gostaria de ver o catálogo". O vendedor abre aqui, copia e manda. Em
// dois cliques, sem procurar link em conversa antiga e sem mandar o
// endereço errado.
//
// SÃO DOIS LINKS, E A DIFERENÇA IMPORTA:
//
//   Catálogo Personalizado (/catalogo) — copo com arte, nome, data,
//   acabamento. É o link principal, e é o que o cliente pede quando diz
//   "catálogo".
//
//   Loja de copos lisos (/loja) — copo sem impressão, compra direta.
//
// Mandar o link errado faz o cliente procurar personalização numa loja
// que não tem — por isso cada um aparece com o nome do que ele é.
//
// O CLIENTE NUNCA VÊ TELA DO ERP. Os dois endereços são públicos e ficam
// fora do sistema.
// ============================================================
import { useState } from 'react';
import {
  Copy, Check, MessageCircle, ExternalLink, QrCode, Share2, PenTool, Box,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useVend } from './ui';

/** O catálogo de produtos personalizados. Mesma origem do ERP. */
export function linkDoCatalogo() {
  return `${window.location.origin}/catalogo`;
}

/** A loja de copos lisos. */
export function linkDaLoja() {
  return `${window.location.origin}/loja`;
}

export default function Catalogo() {
  const v = useVend();
  const [copiado, setCopiado] = useState(null);
  const [qual, setQual] = useState('catalogo');

  const catalogo = linkDoCatalogo();
  const loja = linkDaLoja();
  const link = qual === 'catalogo' ? catalogo : loja;

  // As mensagens prontas cobrem as três conversas que mais acontecem.
  // O vendedor edita antes de mandar; isto é ponto de partida, não script.
  const modelos = qual === 'catalogo' ? [
    { key: 'novo', titulo: 'Cliente pediu o catálogo',
      texto: `Olá! Aqui é da Lyon Copos. Segue nosso catálogo de produtos personalizados — você escolhe o modelo, o acabamento, as cores e monta a sua arte direto por aqui, já vendo o valor e o prazo: ${catalogo}` },
    { key: 'arte', titulo: 'Cliente quer arte personalizada',
      texto: `Olá! Você mesmo pode montar a arte do seu copo no nosso site: escolhe a ocasião (casamento, formatura, aniversário), edita nomes e data e vê como fica antes de fechar: ${catalogo}` },
    { key: 'recompra', titulo: 'Recompra',
      texto: `Olá! Aqui é da Lyon Copos, que bom falar com você de novo. Para repetir o pedido é só entrar aqui e escolher: ${catalogo}` },
  ] : [
    { key: 'liso', titulo: 'Cliente quer copo liso',
      texto: `Olá! Aqui é da Lyon Copos. Nossos copos lisos você compra direto por aqui, escolhendo cor e quantidade, e já vê o frete do seu CEP: ${loja}` },
    { key: 'orcamento', titulo: 'Quem pediu orçamento',
      texto: `Olá! Segue o link para você simular o pedido com a quantidade e o frete do seu CEP: ${loja}` },
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
          Enviar link para clientes — o cliente monta o próprio pedido
        </p>
      </div>

      {/* Qual link mandar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <EscolhaDeLink
          v={v} ativo={qual === 'catalogo'} onClick={() => setQual('catalogo')}
          icone={PenTool} titulo="Catálogo de Produtos Personalizados"
          descricao="Copo com arte, nome, data e acabamento. É o link que o cliente pede quando diz “catálogo”." />
        <EscolhaDeLink
          v={v} ativo={qual === 'loja'} onClick={() => setQual('loja')}
          icone={Box} titulo="Loja de copos lisos"
          descricao="Copo sem impressão, compra direta por cor e quantidade." />
      </div>

      {/* Link oficial */}
      <div style={{ ...v.card, padding: '1.25rem' }}>
        <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: v.textSubtle }}>
          {qual === 'catalogo' ? 'Link do catálogo personalizado' : 'Link da loja de copos lisos'}
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
            <QrCode size={13} /> QR Code
          </p>
          <img src={qr} alt="QR Code do link selecionado" key={link}
            className="mx-auto rounded-lg bg-white p-2" width={220} height={220} />
          <p className="text-[11px] mt-3" style={{ color: v.textMuted }}>
            No balcão, o cliente aponta a câmera e já entra pelo próprio celular.
          </p>
        </div>
      </div>
    </div>
  );
}

/** O cartão de escolher qual dos dois links o vendedor vai mandar. */
function EscolhaDeLink({ v, ativo, onClick, icone: Icone, titulo, descricao }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={ativo}
      className="text-left p-4 rounded-xl transition-all"
      style={{
        ...v.card,
        borderColor: ativo ? '#8b5cf6' : undefined,
        boxShadow: ativo ? '0 0 0 1px #8b5cf6' : undefined,
      }}>
      <span className="flex items-center gap-2 mb-1.5">
        <Icone size={16} style={{ color: ativo ? '#8b5cf6' : v.textSubtle }} />
        <span className="font-semibold text-sm" style={{ color: v.textPrimary }}>{titulo}</span>
      </span>
      <span className="block text-[12px] leading-relaxed" style={{ color: v.textMuted }}>
        {descricao}
      </span>
    </button>
  );
}
