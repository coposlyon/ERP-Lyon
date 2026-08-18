// ============================================================
// A porta de entrada dos links públicos de cadastro.
//
// Cliente, fornecedor e transportadora chegam por links diferentes e
// caíam numa tela preta com a logo solta e um botão roxo — sem dizer
// onde a pessoa estava nem o que ia acontecer. Agora é o mesmo cartão
// neon do acompanhamento do pedido: quem recebe os dois links reconhece
// a casa.
//
// O texto muda por tipo de cadastro porque a promessa é outra: o
// cliente cadastra para andar com o pedido dele, a transportadora para
// receber cotação. Prometer "continuidade ao seu pedido" para uma
// transportadora seria texto de enfeite, e texto de enfeite é o que
// ninguém lê.
// ============================================================
import { UserPlus, ShieldCheck } from 'lucide-react';
import PortalPublico from './PortalPublico';

const TEXTOS = {
  cliente: {
    subtitulo: 'Preencha seus dados para iniciar seu atendimento e dar continuidade ao pedido.',
    promessa: 'Após o cadastro, você poderá dar continuidade ao seu pedido com mais agilidade.',
    ajuda: 'Precisa de ajuda? Fale com o vendedor',
  },
  fornecedor: {
    subtitulo: 'Preencha os dados da sua empresa para iniciarmos o cadastro de fornecedor.',
    promessa: 'Após o cadastro, sua empresa poderá receber pedidos de compra da Lyon Copos.',
    // Fornecedor não tem vendedor da Lyon designado — mandá-lo "falar
    // com o vendedor" seria mandá-lo procurar alguém que não existe.
    ajuda: 'Precisa de ajuda? Fale com a Lyon Copos',
  },
  transportadora: {
    subtitulo: 'Preencha os dados da sua empresa para iniciarmos o cadastro de transportadora.',
    promessa: 'Após o cadastro, sua empresa poderá receber solicitações de cotação e coleta.',
    ajuda: 'Precisa de ajuda? Fale com a Lyon Copos',
  },
};

export default function AberturaCadastro({ tipo = 'cliente', onIniciar }) {
  const t = TEXTOS[tipo] || TEXTOS.cliente;

  return (
    <PortalPublico
      ajudaTexto={t.ajuda}
      rodape={
        <p className="text-xs text-center leading-relaxed flex items-start justify-center gap-2"
          style={{ color: 'rgba(255,255,255,0.55)' }}>
          <ShieldCheck size={15} className="shrink-0 mt-0.5" style={{ color: '#60a5fa' }} />
          <span>{t.promessa}</span>
        </p>
      }>

      <h1 className="text-3xl sm:text-4xl font-bold text-center text-white">Realizar Cadastro</h1>
      <p className="text-sm text-center mt-3 leading-relaxed" style={{ color: 'rgba(255,255,255,0.6)' }}>
        {t.subtitulo}
      </p>

      <button type="button" onClick={onIniciar}
        className="w-full mt-7 rounded-xl py-4 font-bold text-lg text-white flex items-center justify-center gap-2.5 transition-transform active:scale-[0.99]"
        style={{ background: 'linear-gradient(90deg,#2563eb,#3b82f6)',
                 boxShadow: '0 0 26px rgba(59,130,246,0.45)' }}>
        <UserPlus size={20} /> INICIAR CADASTRO
      </button>
    </PortalPublico>
  );
}
