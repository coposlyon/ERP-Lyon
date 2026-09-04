// ============================================================
// COMO ESTE ITEM ENTRA NO COPO.
//
// POR QUE ISTO DEIXOU DE SER UMA CAIXINHA. Era um checkbox chamado "já
// vem no preço", e a dona da fábrica não entendeu — o que é motivo
// suficiente: quem cadastra é ela. O problema do checkbox é que ele só
// descreve UM dos dois estados. Desmarcado não diz nada, e o estado
// desmarcado é justamente o normal (borda, canudo, tampa). A pessoa
// lia a explicação do caso raro e tinha que deduzir o comum.
//
// Duas opções com nome cada uma resolvem isso: as duas aparecem
// escritas, e escolher é ler, não deduzir.
//
// E O TEXTO SAIU DA CONTABILIDADE. "Entra no custo da peça" é verdade e
// não ajuda ninguém a decidir. A pergunta que decide é outra: a cliente
// escolhe, ou não? Se escolhe, ela vê e paga à parte. Se não escolhe, é
// gasto nosso e já está embutido no preço.
// ============================================================
import { ShoppingCart, Factory } from 'lucide-react';

const OPCOES = [
  {
    padrao: false,
    titulo: 'A cliente escolhe',
    icone: ShoppingCart,
    texto: 'Aparece no catálogo como opção. Quando ela marca, o preço sobe e você recebe por isso. É o caso de borda, canudo e tampa.',
    cor: 'violet',
  },
  {
    padrao: true,
    titulo: 'Já está no preço do copo',
    icone: Factory,
    texto: 'Não aparece para a cliente e não é cobrado à parte: é gasto seu em todo copo e entra só no custo, para a margem sair certa. É o caso da tinta.',
    cor: 'gray',
  },
];

const CORES = {
  violet: { on: 'border-violet-400 bg-violet-50', icone: 'text-violet-600' },
  gray:   { on: 'border-gray-400 bg-gray-50',     icone: 'text-gray-600' },
};

export default function ComoEntraNoCopo({ padrao, onMudar }) {
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
        Como este item entra no copo
      </p>
      {OPCOES.map(o => {
        const ativo = !!padrao === o.padrao;
        const c = CORES[o.cor];
        return (
          <label key={String(o.padrao)}
            className={`flex items-start gap-2.5 rounded-xl border p-2.5 cursor-pointer text-sm ${
              ativo ? c.on : 'border-gray-200 hover:bg-gray-50'}`}>
            <input type="radio" className="mt-1 shrink-0" checked={ativo}
              onChange={() => onMudar(o.padrao)} />
            <o.icone size={15} className={`mt-0.5 shrink-0 ${ativo ? c.icone : 'text-gray-400'}`} />
            <span className="min-w-0">
              <span className="font-medium text-gray-800">{o.titulo}</span>
              <span className="block text-xs text-gray-500 mt-0.5 leading-relaxed">{o.texto}</span>
            </span>
          </label>
        );
      })}

      {/* AS DUAS PERGUNTAS QUE DECIDEM.
          Ler o que cada opção FAZ ainda deixa a decisão por conta de
          quem lê. Estas duas perguntas devolvem a resposta pronta — e
          são as mesmas que a dona da fábrica formulou depois de não
          entender a versão anterior, o que é a melhor prova de que são
          as certas. */}
      <div className="rounded-xl bg-gray-50 border border-gray-200 p-2.5 text-xs">
        <p className="font-semibold text-gray-600 mb-1.5">Na dúvida</p>
        <div className="space-y-1">
          <p className="flex items-start gap-1.5">
            <span className="text-gray-500 flex-1">A cliente escolhe se quer?</span>
            <span className="font-medium text-violet-700 shrink-0">→ A cliente escolhe</span>
          </p>
          <p className="flex items-start gap-1.5">
            <span className="text-gray-500 flex-1">Todo copo gasta e ela nem sabe que existe?</span>
            <span className="font-medium text-gray-700 shrink-0">→ Já está no preço</span>
          </p>
        </div>
      </div>
    </div>
  );
}
