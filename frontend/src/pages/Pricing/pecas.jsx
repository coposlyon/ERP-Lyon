// ============================================================
// AS PEÇAS DA FORMAÇÃO DE PREÇO.
//
// A tela antiga tinha sete cartões abertos ao mesmo tempo, e dentro
// deles trinta campos com a mesma aparência — os que mudam o preço e
// os que só descrevem o produto, lado a lado. Quem abria não sabia por
// onde começar nem o que estava faltando.
//
// Estas peças existem para impor três regras:
//
//   1. CAMPO VAZIO NÃO MOSTRA ZERO. "R$ 0,0000" parece um valor
//      calculado; "—" diz que ninguém preencheu. A tela antiga
//      mostrava zero em tudo e o dono do sistema achava que tinha
//      digitado.
//
//   2. PLACEHOLDER NÃO PARECE DADO. "1,59" cinza dentro do campo era
//      lido como preenchido. Agora todo exemplo vem escrito "ex.:".
//
//   3. CADA ENTRADA MOSTRA O QUE VIROU. A pergunta e a resposta na
//      mesma linha: "R$ 250,00 de frete ÷ 5.000 peças = R$ 0,05 por
//      peça". Sem isso, "rateio" é uma palavra que a pessoa aceita
//      sem entender.
// ============================================================
import { useState } from 'react';
import { ChevronDown, HelpCircle } from 'lucide-react';
import { fmtBRL4 } from '@/lib/pricingCalc';

/** Valor por unidade: '—' quando ninguém informou nada ainda. */
export const unitario = (v, informado) => (informado ? fmtBRL4(v) : '—');

/** Um passo numerado do fluxo. */
export function Passo({ n, titulo, descricao, direita, children }) {
  return (
    <section className="card">
      <div className="card-header flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="w-7 h-7 shrink-0 rounded-full bg-primary-600 text-white text-sm font-bold flex items-center justify-center">
            {n}
          </span>
          <div>
            <h2 className="font-semibold text-gray-900">{titulo}</h2>
            {descricao && <p className="text-xs text-gray-500 mt-0.5">{descricao}</p>}
          </div>
        </div>
        {direita}
      </div>
      <div className="card-body">{children}</div>
    </section>
  );
}

/**
 * Uma linha de custo: o que é, o que você informa, e quanto isso vira
 * por peça. A conta aparece por extenso — é ela que ensina a palavra
 * "rateio" sem precisar explicá-la.
 */
export function LinhaCusto({ titulo, ajuda, conta, valor, informado, children, fonte }) {
  return (
    <div className={`rounded-xl border p-3 ${informado ? 'border-gray-200' : 'border-dashed border-gray-200 bg-gray-50/50'}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900">{titulo}</p>
          {ajuda && <p className="text-xs text-gray-500 mt-0.5">{ajuda}</p>}
        </div>
        <div className="text-right shrink-0">
          <p className={`text-lg font-bold tabular-nums ${informado ? 'text-gray-900' : 'text-gray-300'}`}>
            {unitario(valor, informado)}
          </p>
          <p className="text-[11px] text-gray-400">por peça</p>
        </div>
      </div>
      {children && <div className="mt-2.5 flex flex-wrap items-end gap-3">{children}</div>}
      {(conta || fonte) && (
        <p className="text-[11px] text-gray-400 mt-2 pt-2 border-t border-dashed border-gray-200">
          {conta || fonte}
        </p>
      )}
    </div>
  );
}

/** Campo de dinheiro, com o R$ colado e o exemplo escrito como exemplo. */
export function Moeda({ label, exemplo, value, onChange, largura = 'w-32' }) {
  return (
    <div>
      {label && <label className="block text-[11px] text-gray-500 mb-0.5">{label}</label>}
      <div className="relative">
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">R$</span>
        <input className={`input text-sm pl-8 ${largura}`} inputMode="decimal"
          placeholder={exemplo ? `ex.: ${exemplo}` : ''}
          value={value ?? ''} onChange={e => onChange(e.target.value)} />
      </div>
    </div>
  );
}

/** Campo de quantidade. */
export function Quantidade({ label, exemplo, sufixo = 'peças', value, onChange, largura = 'w-32' }) {
  return (
    <div>
      {label && <label className="block text-[11px] text-gray-500 mb-0.5">{label}</label>}
      <div className="relative">
        <input type="number" min="0" className={`input text-sm pr-14 ${largura}`}
          placeholder={exemplo ? `ex.: ${exemplo}` : ''}
          value={value ?? ''} onChange={e => onChange(e.target.value)} />
        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-gray-400 pointer-events-none">
          {sufixo}
        </span>
      </div>
    </div>
  );
}

export function Texto({ label, exemplo, value, onChange, largura = 'w-44', lista }) {
  return (
    <div>
      {label && <label className="block text-[11px] text-gray-500 mb-0.5">{label}</label>}
      <input className={`input text-sm ${largura}`} list={lista}
        placeholder={exemplo ? `ex.: ${exemplo}` : ''}
        value={value ?? ''} onChange={e => onChange(e.target.value)} />
    </div>
  );
}

/** Percentual — usado em imposto e margem. */
export function Percentual({ label, value, onChange, largura = 'w-24' }) {
  return (
    <div>
      {label && <label className="block text-[11px] text-gray-500 mb-0.5">{label}</label>}
      <div className="relative">
        <input className={`input text-sm pr-7 text-right ${largura}`} inputMode="decimal"
          value={value ?? ''} onChange={e => onChange(e.target.value)} />
        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">%</span>
      </div>
    </div>
  );
}

/**
 * O que NÃO muda o preço fica fechado.
 *
 * Capacidade, cor, tipo de impressão e descrição não entram em conta
 * nenhuma — são a etiqueta da ficha. Abertos no meio dos campos que
 * mudam o preço, faziam a pessoa preencher trinta coisas achando que
 * todas contavam.
 */
export function Recolhivel({ titulo, descricao, children, aberto = false }) {
  const [open, setOpen] = useState(aberto);
  return (
    <div className="card">
      <button type="button" onClick={() => setOpen(o => !o)}
        className="w-full card-header flex items-center justify-between gap-3 text-left hover:bg-gray-50 transition-colors">
        <div>
          <p className="font-medium text-gray-800 text-sm">{titulo}</p>
          {descricao && <p className="text-xs text-gray-500 mt-0.5">{descricao}</p>}
        </div>
        <ChevronDown size={17} className={`text-gray-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="card-body border-t border-gray-100">{children}</div>}
    </div>
  );
}

/** Explicação curta que aparece ao passar o mouse. */
export function Dica({ children }) {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-gray-400" title={children}>
      <HelpCircle size={12} /> {children}
    </span>
  );
}
