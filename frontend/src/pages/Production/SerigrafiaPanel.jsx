// ============================================================
// SERIGRAFIA — a vida das telas, e o que elas custaram.
//
// ESTE PAINEL NÃO REGISTRA MAIS NADA. Havia aqui um botão "Registrar
// perda" com formulário próprio: quadro, motivo, emulsão, sensibilizante,
// removedor. Um botão solto no rodapé da tela, para um fato que acontece
// DENTRO da revelação — e que por isso dependia de alguém lembrar de
// voltar aqui depois de gravar a tela.
//
// O que acontecia de verdade era o previsível: emulsão saindo do estoque
// sem registro, tela recuperada sem ninguém contar. Os dois números que
// essa perda existe justamente para guardar.
//
// Agora a pergunta é feita no fecho da REVELAÇÃO, a quem está com a
// peça na mão, junto com o número da matriz. Aqui ficou só a leitura:
// quantas gravações cada tela aguentou, quais precisam de troca, e
// quanto as perdas custaram.
// ============================================================
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Layers, Droplets } from 'lucide-react';
import api from '@/lib/api';

const fmtMoney = v => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
const fmtNum = (v, d = 1) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });

export default function SerigrafiaPanel() {
  const { data: quadros } = useQuery({ queryKey: ['seri-quadros'], queryFn: () => api.get('/production/serigrafia/quadros') });
  const { data: perdas } = useQuery({ queryKey: ['seri-perdas'], queryFn: () => api.get('/production/serigrafia/perdas') });

  const qlist = quadros?.data || [];
  const plist = perdas?.data || [];
  const totalPerda = plist.reduce((s, p) => s + Number(p.custo || 0), 0);

  return (
    <div className="card p-4 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-semibold text-gray-800 flex items-center gap-1.5">
            <Droplets size={16} className="text-pink-500" /> Serigrafia — Telas / Matrizes
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Durabilidade das telas e custo das perdas (emulsão · sensibilizante · removedor).
          </p>
        </div>
        {/* Onde a perda é informada agora — dito, e não deixado em branco:
            um painel que antes tinha botão e hoje não tem parece quebrado. */}
        <span className="text-[11px] text-gray-400 max-w-[260px] sm:text-right">
          A perda de matriz é informada ao <b>finalizar a revelação</b> do pedido,
          junto com o número da tela.
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Durabilidade dos quadros */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase mb-1.5 flex items-center gap-1">
            <Layers size={13} /> Telas (durabilidade)
          </p>
          <div className="border border-gray-100 rounded-lg max-h-56 overflow-y-auto divide-y divide-gray-50">
            {qlist.length === 0 ? <p className="text-xs text-gray-400 text-center py-4">Nenhuma tela registrada ainda.</p> :
              qlist.map(q => (
                <div key={q.id} className="flex items-center justify-between px-3 py-2 text-sm">
                  <span className="font-mono font-semibold text-gray-700">Quadro {q.numero}</span>
                  <span className="flex items-center gap-3 text-xs text-gray-500">
                    <span>{q.gravacoes} gravações</span>
                    <span>{q.recuperacoes} recup.</span>
                    {q.precisa_troca && (
                      <span className="inline-flex items-center gap-1 text-red-600 font-semibold bg-red-50 rounded px-1.5 py-0.5">
                        <AlertTriangle size={11} /> Trocar
                      </span>
                    )}
                  </span>
                </div>
              ))}
          </div>
        </div>

        {/* Perdas recentes */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase mb-1.5">
            Perdas recentes — total {fmtMoney(totalPerda)}
          </p>
          <div className="border border-gray-100 rounded-lg max-h-56 overflow-y-auto divide-y divide-gray-50">
            {plist.length === 0 ? <p className="text-xs text-gray-400 text-center py-4">Nenhuma perda registrada.</p> :
              plist.map(p => (
                <div key={p.id} className="px-3 py-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-semibold text-gray-700">Quadro {p.quadro}</span>
                    <span className="font-semibold text-red-600">{fmtMoney(p.custo)}</span>
                  </div>
                  <p className="text-xs text-gray-400">
                    {p.motivo} · {fmtNum(p.emulsao_g)}g emul · {fmtNum(p.removedor_ml)}ml remov
                    {' · '}{new Date(p.created_at).toLocaleDateString('pt-BR')}
                  </p>
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}
