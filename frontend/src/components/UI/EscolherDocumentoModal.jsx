// ============================================================
// "Baixar Pedido de Venda" — escolha uma opção.
//
// O botão fazia uma coisa só: abrir a folha. Mas quem clica nele quer
// uma de três, e as três são visitas diferentes ao mesmo documento:
//
//   IMPRIMIR EM PRETO E BRANCO  o atendimento presencial, papel na mão
//   VISUALIZAR ARTE             conferir o desenho, não o pedido
//   BAIXAR EM PDF               o arquivo que vai para o cliente
//
// Sem a pergunta, quem queria só ver a arte abria o documento inteiro,
// e quem queria imprimir tinha que achar o botão dentro da outra tela.
//
// A mesma escolha serve o painel do vendedor e o portal do cliente: é o
// mesmo documento, e duas telas para ele discordariam um dia.
// ============================================================
import { Printer, Eye, FileText, X } from 'lucide-react';

const CIANO = '#22d3ee';
const ROSA = '#e8187a';

export default function EscolherDocumentoModal({ aberto, onClose, onImprimir, onVerArte, onBaixarPdf, temArte }) {
  if (!aberto) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(3,6,18,0.75)' }} onClick={onClose}>
      <div className="w-full max-w-2xl rounded-2xl p-5 sm:p-6" onClick={e => e.stopPropagation()}
        style={{
          background: 'linear-gradient(180deg, #0b1024 0%, #080d1e 100%)',
          border: `1px solid ${CIANO}55`,
          boxShadow: `0 0 30px ${CIANO}22, 0 0 80px ${ROSA}14`,
        }}>

        <div className="flex items-center justify-between gap-3 mb-5">
          <div className="flex-1 flex items-center gap-3">
            <span className="h-px flex-1" style={{ background: `linear-gradient(90deg, transparent, ${CIANO}66)` }} />
            <p className="text-base font-semibold text-white whitespace-nowrap">Escolha uma opção</p>
            <span className="h-px flex-1" style={{ background: `linear-gradient(90deg, ${ROSA}66, transparent)` }} />
          </div>
          <button onClick={onClose} className="p-1 rounded-lg shrink-0"
            style={{ color: 'rgba(255,255,255,0.6)' }} aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        <div className="grid sm:grid-cols-3 gap-3">
          <Opcao Icon={Printer} cor="#60a5fa" onClick={onImprimir}>
            Imprimir em<br />preto e branco
          </Opcao>
          <Opcao Icon={Eye} cor={ROSA} onClick={onVerArte} desabilitado={!temArte}
            nota={temArte ? null : 'nenhuma arte anexada'}>
            Visualizar arte
          </Opcao>
          <Opcao Icon={FileText} cor={CIANO} onClick={onBaixarPdf}>
            Baixar em PDF
          </Opcao>
        </div>
      </div>
    </div>
  );
}

function Opcao({ Icon, cor, children, onClick, desabilitado, nota }) {
  return (
    <button onClick={onClick} disabled={desabilitado}
      className="flex flex-col items-center justify-center gap-2 rounded-xl px-4 py-6 text-center transition-transform hover:-translate-y-0.5 disabled:opacity-35 disabled:cursor-not-allowed disabled:hover:translate-y-0"
      style={{ border: `1px solid ${cor}66`, background: `${cor}0f`, color: cor }}>
      <Icon size={26} />
      <span className="text-sm font-semibold leading-snug">{children}</span>
      {nota && <span className="text-[10px] font-normal" style={{ color: 'rgba(255,255,255,0.45)' }}>{nota}</span>}
    </button>
  );
}
