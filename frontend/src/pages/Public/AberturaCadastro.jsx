// ============================================================
// A porta de entrada dos links públicos de cadastro.
//
// Cliente, fornecedor e transportadora chegam por links diferentes e
// caíam numa tela preta com a logo solta e um botão roxo — sem dizer
// onde a pessoa estava nem o que ia acontecer. Agora é o mesmo cartão
// neon do acompanhamento do pedido: quem recebe os dois links reconhece
// a casa.
//
// O QUE ESTÁ ESCRITO AQUI VEM DE FORA. Os textos moram em
// cadastroTextos.js (padrão) e podem ser trocados em Sites → Cadastro.
// Esta tela só recebe pronto o que deve mostrar: quem decide é quem
// buscou a configuração, e assim as três telas de cadastro não pedem a
// mesma coisa ao servidor três vezes.
// ============================================================
import { UserPlus, ShieldCheck } from 'lucide-react';
import PortalPublico from './PortalPublico';
import { CADASTRO_PADRAO } from './cadastroTextos';

export default function AberturaCadastro({ tipo = 'cliente', textos, onIniciar }) {
  const t = textos || CADASTRO_PADRAO[tipo] || CADASTRO_PADRAO.cliente;

  return (
    <PortalPublico
      sobrepondo
      ajudaTexto={t.abertura_ajuda}
      rodape={
        <p className="text-xs text-center leading-relaxed flex items-start justify-center gap-2"
          style={{ color: 'rgba(255,255,255,0.55)' }}>
          <ShieldCheck size={15} className="shrink-0 mt-0.5" style={{ color: '#60a5fa' }} />
          <span>{t.abertura_promessa}</span>
        </p>
      }>

      <h1 className="text-3xl sm:text-4xl font-bold text-center text-white">{t.abertura_titulo}</h1>
      <p className="text-sm text-center mt-3 leading-relaxed" style={{ color: 'rgba(255,255,255,0.6)' }}>
        {t.abertura_subtitulo}
      </p>

      <button type="button" onClick={onIniciar}
        className="w-full mt-7 rounded-xl py-4 font-bold text-lg text-white flex items-center justify-center gap-2.5 transition-transform active:scale-[0.99]"
        style={{ background: 'linear-gradient(90deg,#2563eb,#3b82f6)',
                 boxShadow: '0 0 26px rgba(59,130,246,0.45)' }}>
        <UserPlus size={20} /> {t.abertura_botao}
      </button>
    </PortalPublico>
  );
}
