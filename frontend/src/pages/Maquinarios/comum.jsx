// Peças comuns da tela de Maquinários: formatação, campos e selos.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreVertical } from 'lucide-react';
import CampoData from '@/components/UI/CampoData';

// ── Números ────────────────────────────────────────────────
export const fmtBRL = v => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const fmtNum = (v, casas = 0) => (v == null || v === '' ? '—'
  : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas }));
export const fmtPct = v => (v == null ? '—' : `${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`);
export const fmtData = iso => (iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '—');
export const hoje = () => new Date().toISOString().slice(0, 10);

/** "98.000,00" / "98000" / 98000 → 98000 */
export const lerNum = v => {
  if (v === '' || v == null) return null;
  if (typeof v === 'number') return v;
  const s = String(v).trim();
  const x = Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/\.(?=\d{3}(\D|$))/g, ''));
  return Number.isFinite(x) ? x : null;
};
export const paraBR = (v, casas = 2) => (v == null || v === '' ? ''
  : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas }));

// ── Constantes ─────────────────────────────────────────────
export const GRUPOS = {
  maquinario: {
    titulo: 'Maquinários de Produção',
    subtitulo: 'Gerencie os maquinários da produção, controle de depreciação, manutenções, componentes e alocação de custos nos produtos.',
    lista: 'Lista de Maquinários', novo: 'Novo Maquinário', unidade: 'máquinas', singular: 'maquinário',
    kpiTotal: 'Total de máquinas', kpiTotalSub: 'maquinários cadastrados',
    tipos: ['Impressora', 'Pintura', 'Acabamento', 'Gravação', 'Limpeza', 'Revelação', 'Secagem', 'Embalagem', 'Utilidades', 'Outro'],
    setores: ['Produção', 'Acabamento', 'Serigrafia', 'Expedição', 'Utilidades', 'Administrativo'],
    temProducao: true,
  },
  ti: {
    titulo: 'Computadores e TI',
    subtitulo: 'Computadores, notebooks, impressoras, servidores e rede: depreciação, manutenção, peças e o custo mensal que entra no rateio.',
    lista: 'Lista de Equipamentos', novo: 'Novo Equipamento', unidade: 'equipamentos', singular: 'equipamento',
    kpiTotal: 'Total de equipamentos', kpiTotalSub: 'equipamentos cadastrados',
    tipos: ['Computador', 'Notebook', 'Monitor', 'Impressora', 'Servidor', 'Rede / Roteador', 'Celular / Tablet', 'Nobreak', 'Licença de software', 'Outro'],
    setores: ['Administrativo', 'Comercial', 'Designer', 'Produção', 'Financeiro', 'Logística', 'RH', 'Tecnologia'],
    temProducao: false,
  },
};

export const STATUS_MAQ = {
  operacao:   { label: 'Em operação',   cls: 'bg-green-600 text-white' },
  manutencao: { label: 'Em manutenção', cls: 'bg-amber-500 text-white' },
  inativa:    { label: 'Inativa',       cls: 'bg-gray-500 text-white' },
};
export const SITUACAO = {
  em_dia:        { label: 'Em dia',        cls: 'bg-green-600 text-white' },
  concluido:     { label: 'Concluído',     cls: 'bg-green-600 text-white' },
  proximo:       { label: 'Próximo',       cls: 'bg-amber-500 text-white' },
  agendado:      { label: 'Agendado',      cls: 'bg-blue-600 text-white' },
  pendente:      { label: 'Pendente',      cls: 'bg-gray-500 text-white' },
  vencido:       { label: 'Vencido',       cls: 'bg-red-600 text-white' },
  cancelado:     { label: 'Cancelado',     cls: 'bg-gray-400 text-white' },
  sem_data:      { label: 'Sem data',      cls: 'bg-gray-400 text-white' },
  sem_plano:     { label: 'Sem plano',     cls: 'bg-gray-400 text-white' },
  inativo:       { label: 'Inativo',       cls: 'bg-gray-400 text-white' },
  em_estoque:    { label: 'Em estoque',    cls: 'bg-green-600 text-white' },
  estoque_baixo: { label: 'Estoque baixo', cls: 'bg-amber-500 text-white' },
  sem_estoque:   { label: 'Sem estoque',   cls: 'bg-red-600 text-white' },
  troca_vencida: { label: 'Troca vencida', cls: 'bg-red-600 text-white' },
};
export const PERIODICIDADES = [
  ['diaria', 'Diária'], ['semanal', 'Semanal'], ['quinzenal', 'Quinzenal'], ['mensal', 'Mensal'],
  ['bimestral', 'Bimestral'], ['trimestral', 'Trimestral'], ['semestral', 'Semestral'], ['anual', 'Anual'],
];
export const rotuloPeriodicidade = k => (PERIODICIDADES.find(p => p[0] === k)?.[1] || k || '—');
export const TIPOS_EVENTO = {
  cadastro: 'Cadastro', revisao: 'Revisão', manutencao: 'Manutenção', troca_peca: 'Troca de peça',
  parada: 'Parada', retomada: 'Retomada', marco: 'Marco de produção', status: 'Status',
  reserva: 'Reserva', alteracao: 'Alteração',
};

// ── Componentes ────────────────────────────────────────────
export function Pill({ mapa = SITUACAO, valor, children }) {
  const s = mapa[valor] || { label: valor || '—', cls: 'bg-gray-400 text-white' };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold whitespace-nowrap ${s.cls}`}>
      {children || s.label}
    </span>
  );
}

export function Campo({ label, obrigatorio, children, className = '', dica }) {
  return (
    <div className={className}>
      <label className="block text-[12px] font-medium text-gray-600 mb-1">
        {label}{obrigatorio && <span className="text-red-500"> *</span>}
      </label>
      {children}
      {dica && <p className="text-[11px] text-gray-400 mt-0.5">{dica}</p>}
    </div>
  );
}

/** Dinheiro: digita livre, formata ao sair do campo. */
export function Dinheiro({ value, onChange, disabled, placeholder = '0,00', prefixo = 'R$' }) {
  const [texto, setTexto] = useState(paraBR(value));
  const foco = useRef(false);
  useEffect(() => { if (!foco.current) setTexto(paraBR(value)); }, [value]);
  return (
    <div className="relative">
      {prefixo && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-gray-400 pointer-events-none">{prefixo}</span>}
      <input className={`input ${prefixo ? 'pl-9' : ''}`} inputMode="decimal" disabled={disabled} placeholder={placeholder}
        value={texto}
        onFocus={() => { foco.current = true; }}
        onChange={e => { setTexto(e.target.value.replace(/[^\d.,]/g, '')); onChange(lerNum(e.target.value.replace(/[^\d.,]/g, ''))); }}
        onBlur={() => { foco.current = false; setTexto(paraBR(lerNum(texto))); }} />
    </div>
  );
}

/** Número inteiro com milhar. */
export function Numero({ value, onChange, disabled, placeholder, casas = 0, sufixo }) {
  const [texto, setTexto] = useState(value == null ? '' : paraBR(value, casas));
  const foco = useRef(false);
  useEffect(() => { if (!foco.current) setTexto(value == null ? '' : paraBR(value, casas)); }, [value, casas]);
  return (
    <div className="relative">
      <input className={`input ${sufixo ? 'pr-12' : ''}`} inputMode="decimal" disabled={disabled} placeholder={placeholder}
        value={texto}
        onFocus={() => { foco.current = true; }}
        onChange={e => { const t = e.target.value.replace(/[^\d.,]/g, ''); setTexto(t); onChange(lerNum(t)); }}
        onBlur={() => { foco.current = false; const v = lerNum(texto); setTexto(v == null ? '' : paraBR(v, casas)); }} />
      {sufixo && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-gray-400 pointer-events-none">{sufixo}</span>}
    </div>
  );
}

export function Data({ value, onChange, disabled }) {
  return <CampoData value={value || ''} onChange={v => onChange(v || null)} disabled={disabled} />;
}

/** Leitura (valor calculado) com a mesma altura de um campo. */
export function Leitura({ children, tom = '' }) {
  return (
    <div className={`input bg-gray-50 cursor-default select-text font-medium ${tom}`}>{children}</div>
  );
}

/**
 * Menu ⋮ com itens.
 *
 * O PAINEL VAI PARA FORA DA TABELA. Na Lista de Maquinários o menu de
 * cada linha abria dentro da área com rolagem horizontal, que corta o
 * que passa da borda: quem clicava nos três pontinhos não via nada
 * acontecer, embora "Editar cadastro" e "Excluir" estivessem ali. Agora
 * o painel é desenhado no corpo da página (portal), preso ao botão pela
 * posição que ele ocupa na tela, e a rolagem ou o redimensionamento o
 * fecham — senão ele ficaria flutuando longe do botão.
 */
export function Menu({ itens, icone: Icone = MoreVertical, rotulo, className = 'btn-ghost p-1.5' }) {
  const [aberto, setAberto] = useState(false);
  const [pos, setPos] = useState(null);
  const botaoRef = useRef(null);
  const painelRef = useRef(null);

  const medir = () => {
    const r = botaoRef.current?.getBoundingClientRect();
    if (!r) return;
    const LARGURA = 220;
    const esquerda = Math.max(8, Math.min(r.right - LARGURA, window.innerWidth - LARGURA - 8));
    const abaixo = window.innerHeight - r.bottom;
    setPos({
      left: esquerda,
      largura: LARGURA,
      ...(abaixo < 200 ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }),
    });
  };

  useLayoutEffect(() => { if (aberto) medir(); }, [aberto]);

  useEffect(() => {
    if (!aberto) return undefined;
    const fechar = e => {
      if (botaoRef.current?.contains(e.target) || painelRef.current?.contains(e.target)) return;
      setAberto(false);
    };
    const sair = () => setAberto(false);
    document.addEventListener('mousedown', fechar);
    window.addEventListener('scroll', sair, true);
    window.addEventListener('resize', sair);
    return () => {
      document.removeEventListener('mousedown', fechar);
      window.removeEventListener('scroll', sair, true);
      window.removeEventListener('resize', sair);
    };
  }, [aberto]);

  return (
    <div className="relative inline-block">
      <button ref={botaoRef} type="button" className={className}
        onClick={e => { e.stopPropagation(); setAberto(a => !a); }}
        title={typeof rotulo === 'string' ? rotulo : 'Mais ações'}>
        {Icone && <Icone size={15} />}{rotulo && <span>{rotulo}</span>}
      </button>
      {aberto && pos && createPortal(
        <div ref={painelRef} className="fixed z-[70] bg-white border border-gray-200 rounded-lg shadow-lg py-1 text-left"
          style={{ left: pos.left, width: pos.largura, top: pos.top, bottom: pos.bottom }}>
          {itens.filter(Boolean).map((it, i) => (
            <button key={i} type="button" disabled={it.disabled}
              className={`w-full flex items-center gap-2 px-3 py-2 text-[13px] hover:bg-gray-100 disabled:opacity-40 ${it.perigo ? 'text-red-600' : 'text-gray-700'}`}
              onClick={e => { e.stopPropagation(); setAberto(false); it.onClick(); }}>
              {it.icone && <it.icone size={14} />} {it.label}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}

/** Barra de progresso colorida pelo nível. */
export function Barra({ pct, limiteAviso = 75, limiteErro = 90 }) {
  const v = Math.max(0, Math.min(100, Number(pct) || 0));
  const cor = v >= limiteErro ? 'bg-red-500' : v >= limiteAviso ? 'bg-amber-400' : 'bg-green-500';
  return (
    <div className="h-1.5 w-full rounded-full bg-gray-200 overflow-hidden mt-1.5">
      <div className={`h-full ${cor}`} style={{ width: `${v}%` }} />
    </div>
  );
}

/** Tile de indicador das abas. */
export function Tile({ titulo, valor, sub, children, tom = '' }) {
  return (
    <div className="rounded-lg border border-gray-200 px-3 py-2.5 min-w-0">
      <p className="text-[11.5px] text-gray-500 leading-tight">{titulo}</p>
      <p className={`text-lg font-bold text-gray-900 leading-tight mt-1 truncate ${tom}`}>{valor}</p>
      {sub && <p className="text-[11px] text-gray-500">{sub}</p>}
      {children}
    </div>
  );
}

/** CSV no padrão Excel-BR (;) e com BOM para acentos. */
export function baixarCSV(nome, cabecalho, linhas) {
  const esc = v => {
    const s = v == null ? '' : String(v);
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [cabecalho, ...linhas].map(l => l.map(esc).join(';')).join('\n');
  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nome;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const erroMsg = err => err?.error || err?.message || 'Não foi possível concluir.';
