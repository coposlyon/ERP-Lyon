// ============================================================
// ENGENHARIA DE CUSTOS › MAQUINÁRIOS (e COMPUTADORES E TI)
//
// Uma tela para os dois grupos. Em cima, os indicadores; no meio, a
// lista; embaixo, o equipamento selecionado em seis abas — Cadastro,
// Produção e Desgaste (só maquinário), Manutenção, Peças e Componentes,
// Depreciação e Reposição, Histórico.
//
// O custo mensal (depreciação + manutenção) de cada equipamento entra
// sozinho no rateio das Despesas Fixas — é o que leva a máquina para o
// preço do copo.
// ============================================================
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Plus, ChevronDown, ChevronUp, Search, Filter, Download, Eye, Factory, Monitor, Settings2, Wrench,
  MinusCircle, Coins, Loader2, Printer, Pencil, Trash2, PauseCircle, PlayCircle, Power, AlertTriangle,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, PieChart, MoreHorizontal,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import {
  GRUPOS, STATUS_MAQ, Pill, Menu, fmtBRL, fmtNum, fmtData, fmtPct, baixarCSV, erroMsg,
} from './comum';
import AbaCadastro from './AbaCadastro';
import AbaProducao from './AbaProducao';
import AbaManutencao from './AbaManutencao';
import AbaPecas from './AbaPecas';
import AbaDepreciacao from './AbaDepreciacao';
import AbaHistorico from './AbaHistorico';

const POR_PAGINA = 12;

export default function Maquinarios({ grupo = 'maquinario' }) {
  const cfg = GRUPOS[grupo];
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [busca, setBusca] = useState('');
  const [filtros, setFiltros] = useState({ status: '', tipo: '', setor: '', alerta: false });
  const [verFiltros, setVerFiltros] = useState(false);
  const [pagina, setPagina] = useState(1);
  const [selId, setSelId] = useState(params.get('id') || null);
  const [criando, setCriando] = useState(false);
  const [aba, setAba] = useState('cadastro');
  const [recolhido, setRecolhido] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const painel = useRef(null);

  useEffect(() => { setSelId(params.get('id') || null); setCriando(false); setPagina(1); /* troca de grupo */ }, [grupo]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data, isLoading, error } = useQuery({
    queryKey: ['maquinas', grupo],
    queryFn: () => api.get(`/maquinas?grupo=${grupo}`),
  });
  const itens = useMemo(() => data?.itens || [], [data]);
  const resumo = data?.resumo || {};

  const { data: detalhe, isFetching: carregandoDetalhe } = useQuery({
    queryKey: ['maquina', selId],
    queryFn: () => api.get(`/maquinas/${selId}`),
    enabled: !!selId && !criando,
  });
  const { data: codigo } = useQuery({
    queryKey: ['maquinas-codigo', grupo, itens.length],
    queryFn: () => api.get(`/maquinas/proximo-codigo?grupo=${grupo}`),
    enabled: criando,
  });

  // Seleciona a primeira da lista quando nada está selecionado.
  useEffect(() => {
    if (!criando && !selId && itens.length) setSelId(itens[0].id);
  }, [itens, selId, criando]);

  const filtrados = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return itens.filter(m =>
      (!t || [m.codigo, m.nome, m.tipo, m.setor, m.fornecedor_nome, m.fabricante, m.modelo, m.numero_serie]
        .some(v => String(v || '').toLowerCase().includes(t)))
      && (!filtros.status || m.status === filtros.status)
      && (!filtros.tipo || m.tipo === filtros.tipo)
      && (!filtros.setor || m.setor === filtros.setor)
      && (!filtros.alerta || m.calc.alertas.length > 0));
  }, [itens, busca, filtros]);
  const paginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA));
  const pag = Math.min(pagina, paginas);
  const visiveis = filtrados.slice((pag - 1) * POR_PAGINA, pag * POR_PAGINA);
  const tiposUsados = [...new Set(itens.map(m => m.tipo).filter(Boolean))].sort();
  const setoresUsados = [...new Set(itens.map(m => m.setor).filter(Boolean))].sort();
  const nFiltros = [filtros.status, filtros.tipo, filtros.setor, filtros.alerta].filter(Boolean).length;

  function atualizar() {
    qc.invalidateQueries({ queryKey: ['maquinas', grupo] });
    qc.invalidateQueries({ queryKey: ['maquina', selId] });
    qc.invalidateQueries({ queryKey: ['rateio'] });
  }

  function selecionar(m, abaInicial) {
    setCriando(false); setSelId(m.id); setRecolhido(false);
    if (abaInicial) setAba(abaInicial);
    setParams(p => { p.set('id', m.id); return p; }, { replace: true });
    setTimeout(() => painel.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }

  function novo() {
    setCriando(true); setAba('cadastro'); setRecolhido(false);
    setTimeout(() => painel.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }

  async function salvarCadastro(corpo) {
    setSalvando(true);
    try {
      if (criando) {
        const r = await api.post('/maquinas', corpo);
        toast.success(`${r.codigo} cadastrado`);
        setCriando(false); setSelId(r.id);
        setParams(p => { p.set('id', r.id); return p; }, { replace: true });
      } else {
        await api.put(`/maquinas/${selId}`, corpo);
        toast.success('Cadastro salvo');
      }
      atualizar();
    } catch (err) { toast.error(erroMsg(err)); } finally { setSalvando(false); }
  }

  async function mudarStatus(m, status, evento) {
    try {
      if (evento) await api.post(`/maquinas/${m.id}/eventos`, { tipo: evento, descricao: evento === 'parada' ? 'Parada registrada pela lista' : 'Retomada registrada pela lista' });
      else await api.put(`/maquinas/${m.id}`, { status });
      toast.success(`${m.codigo}: ${STATUS_MAQ[status]?.label || status}`);
      qc.invalidateQueries({ queryKey: ['maquinas', grupo] }); qc.invalidateQueries({ queryKey: ['maquina', m.id] });
    } catch (err) { toast.error(erroMsg(err)); }
  }

  async function excluir(m) {
    if (!confirm(`Excluir ${m.codigo} ${m.nome}?\n\nApaga também a produção, o checklist e o histórico dele. Para só tirar de uso, prefira "Inativar".`)) return;
    try {
      await api.delete(`/maquinas/${m.id}`);
      toast.success('Excluído');
      if (selId === m.id) { setSelId(null); setParams(p => { p.delete('id'); return p; }, { replace: true }); }
      qc.invalidateQueries({ queryKey: ['maquinas', grupo] });
    } catch (err) { toast.error(erroMsg(err)); }
  }

  function exportar(lista = filtrados) {
    baixarCSV(`${grupo === 'ti' ? 'computadores_ti' : 'maquinarios'}_${new Date().toISOString().slice(0, 10)}.csv`,
      ['Código', 'Nome', 'Tipo', 'Setor', 'Status', 'Marca', 'Modelo', 'Nº série', 'Fornecedor', 'Data de aquisição', 'Valor de aquisição',
        'Valor residual', 'Vida útil (anos)', 'Depreciação mensal', 'Depreciação acumulada', 'Valor contábil', 'Manutenção mensal',
        'Custo mensal', 'Produção acumulada', 'Desgaste %', 'Próxima revisão', 'Situação da revisão'],
      lista.map(m => [m.codigo, m.nome, m.tipo, m.setor, STATUS_MAQ[m.status]?.label, m.fabricante, m.modelo, m.numero_serie, m.fornecedor_nome,
        fmtData(m.data_aquisicao), br(m.valor_aquisicao), br(m.valor_residual), m.vida_util_anos, br(m.calc.depreciacao_mensal),
        br(m.calc.depreciacao_acumulada), br(m.calc.valor_contabil), br(m.calc.manutencao_mensal), br(m.calc.custo_mensal),
        m.calc.producao_acumulada, String(m.calc.desgaste_pct).replace('.', ','), fmtData(m.proxima_revisao), m.calc.revisao]));
  }

  function imprimir() {
    const w = window.open('', '_blank');
    if (!w) { toast.error('Libere pop-ups para imprimir'); return; }
    const linhas = filtrados.map(m => `<tr><td>${m.codigo}</td><td>${esc(m.nome)}</td><td>${esc(m.tipo || '')}</td><td>${esc(m.setor || '')}</td>
      <td>${STATUS_MAQ[m.status]?.label}</td><td>${fmtData(m.data_aquisicao)}</td><td class="r">${fmtBRL(m.valor_aquisicao)}</td>
      <td class="r">${fmtBRL(m.calc.depreciacao_mensal)}</td><td class="r">${fmtBRL(m.calc.manutencao_mensal)}</td><td class="r">${fmtBRL(m.calc.custo_mensal)}</td>
      <td class="r">${fmtBRL(m.calc.valor_contabil)}</td><td>${fmtData(m.proxima_revisao)}</td></tr>`).join('');
    w.document.write(`<html><head><title>${cfg.titulo}</title><style>
      body{font-family:Arial,sans-serif;font-size:11px;margin:20px}h1{font-size:16px;margin:0}p{color:#555;margin:2px 0 12px}
      table{width:100%;border-collapse:collapse}th,td{border:1px solid #ccc;padding:4px 6px;text-align:left}th{background:#eee}.r{text-align:right}
      </style></head><body><h1>${cfg.titulo}</h1><p>Emitido em ${new Date().toLocaleString('pt-BR')} · ${filtrados.length} ${cfg.unidade} ·
      custo mensal para rateio ${fmtBRL(resumo.custo_mensal)}</p><table><thead><tr><th>Código</th><th>Nome</th><th>Tipo</th><th>Setor</th><th>Status</th>
      <th>Aquisição</th><th>Valor</th><th>Depreciação/mês</th><th>Manutenção/mês</th><th>Custo/mês</th><th>Valor contábil</th><th>Próx. revisão</th></tr></thead>
      <tbody>${linhas}</tbody></table><script>window.onload=()=>window.print()</script></body></html>`);
    w.document.close();
  }

  const acoesDaMaquina = m => [
    { label: 'Abrir', icone: Eye, onClick: () => selecionar(m) },
    { label: 'Editar cadastro', icone: Pencil, onClick: () => selecionar(m, 'cadastro') },
    m.status === 'operacao' && { label: 'Registrar parada', icone: PauseCircle, onClick: () => mudarStatus(m, 'manutencao', 'parada') },
    m.status === 'manutencao' && { label: 'Registrar retomada', icone: PlayCircle, onClick: () => mudarStatus(m, 'operacao', 'retomada') },
    m.status !== 'inativa'
      ? { label: 'Inativar', icone: Power, onClick: () => mudarStatus(m, 'inativa') }
      : { label: 'Reativar', icone: Power, onClick: () => mudarStatus(m, 'operacao') },
    { label: 'Excluir', icone: Trash2, perigo: true, onClick: () => excluir(m) },
  ];

  const sel = criando ? null : (detalhe && detalhe.id === selId ? detalhe : null);
  const selResumo = itens.find(m => m.id === selId);
  const pct = v => (resumo.total ? `${fmtPct((v / resumo.total) * 100)} do total` : '0,0% do total');
  const ABAS = [
    ['cadastro', 'Cadastro'],
    cfg.temProducao && ['producao', 'Produção e Desgaste'],
    ['manutencao', 'Manutenção'],
    ['pecas', 'Peças e Componentes'],
    ['depreciacao', 'Depreciação e Reposição'],
    ['historico', 'Histórico'],
  ].filter(Boolean);
  const abaAtual = ABAS.some(a => a[0] === aba) ? aba : 'cadastro';

  return (
    <div className="space-y-4">
      {/* ── Cabeçalho ── */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="page-title">{cfg.titulo}</h1>
          <p className="text-sm text-gray-500 mt-0.5 max-w-3xl">{cfg.subtitulo}</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-primary" onClick={novo}><Plus size={16} /> {cfg.novo}</button>
          <Menu className="btn-secondary" icone={null} rotulo={<span className="flex items-center gap-1.5">Mais Ações <ChevronDown size={14} /></span>} itens={[
            { label: 'Exportar lista (CSV)', icone: Download, onClick: () => exportar() },
            { label: 'Imprimir lista', icone: Printer, onClick: imprimir },
            { label: 'Ver no rateio (Despesas Fixas)', icone: PieChart, onClick: () => { window.location.href = '/rateio/despesas-fixas'; } },
            { label: grupo === 'ti' ? 'Ir para Maquinários' : 'Ir para Computadores e TI', icone: grupo === 'ti' ? Factory : Monitor,
              onClick: () => { window.location.href = grupo === 'ti' ? '/engenharia/maquinarios' : '/engenharia/computadores'; } },
          ]} />
        </div>
      </div>

      {/* ── Indicadores ── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Kpi icone={grupo === 'ti' ? Monitor : Factory} cor="bg-blue-600" titulo={cfg.kpiTotal} valor={fmtNum(resumo.total || 0)} sub={cfg.kpiTotalSub} onClick={() => setFiltros(f => ({ ...f, status: '' }))} />
        <Kpi icone={Settings2} cor="bg-green-600" titulo="Em operação" valor={fmtNum(resumo.operacao || 0)} sub={pct(resumo.operacao || 0)} onClick={() => setFiltros(f => ({ ...f, status: 'operacao' }))} />
        <Kpi icone={Wrench} cor="bg-orange-500" titulo="Em manutenção" valor={fmtNum(resumo.manutencao || 0)} sub={pct(resumo.manutencao || 0)} onClick={() => setFiltros(f => ({ ...f, status: 'manutencao' }))} />
        <Kpi icone={MinusCircle} cor="bg-red-600" titulo="Inativas" valor={fmtNum(resumo.inativas || 0)} sub={pct(resumo.inativas || 0)} onClick={() => setFiltros(f => ({ ...f, status: 'inativa' }))} />
        <Kpi icone={Coins} cor="bg-emerald-600" titulo="Custo mensal para rateio" valor={fmtBRL(resumo.custo_mensal)} sub="Depreciação + manutenção"
          title={`Depreciação ${fmtBRL(resumo.depreciacao_mensal)} + manutenção ${fmtBRL(resumo.manutencao_mensal)} · valor contábil ${fmtBRL(resumo.valor_contabil)}`} />
      </div>

      {resumo.com_alerta > 0 && (
        <button className="w-full text-left card px-4 py-2 text-[13px] text-red-600 flex items-center gap-2" onClick={() => setFiltros(f => ({ ...f, alerta: true }))}>
          <AlertTriangle size={15} /> {resumo.com_alerta} {resumo.com_alerta === 1 ? cfg.singular : cfg.unidade} com revisão ou checklist vencido — clique para filtrar.
        </button>
      )}

      {/* ── Lista ── */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between gap-2 flex-wrap px-4 py-3 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">{cfg.lista}</h2>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input className="input pl-8 py-1.5 w-56" placeholder={`Buscar ${cfg.singular}...`} value={busca}
                onChange={e => { setBusca(e.target.value); setPagina(1); }} />
            </div>
            <div className="relative">
              <button className="btn-secondary py-1.5" onClick={() => setVerFiltros(v => !v)}>
                <Filter size={14} /> Filtros{nFiltros ? ` (${nFiltros})` : ''} <ChevronDown size={13} />
              </button>
              {verFiltros && (
                <div className="absolute right-0 z-30 mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg p-3 space-y-2">
                  <select className="input py-1.5" value={filtros.status} onChange={e => { setFiltros(f => ({ ...f, status: e.target.value })); setPagina(1); }}>
                    <option value="">Todos os status</option>
                    {Object.entries(STATUS_MAQ).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                  <select className="input py-1.5" value={filtros.tipo} onChange={e => { setFiltros(f => ({ ...f, tipo: e.target.value })); setPagina(1); }}>
                    <option value="">Todos os tipos</option>
                    {tiposUsados.map(t => <option key={t}>{t}</option>)}
                  </select>
                  <select className="input py-1.5" value={filtros.setor} onChange={e => { setFiltros(f => ({ ...f, setor: e.target.value })); setPagina(1); }}>
                    <option value="">Todos os setores</option>
                    {setoresUsados.map(t => <option key={t}>{t}</option>)}
                  </select>
                  <label className="flex items-center gap-2 text-[12.5px] text-gray-700">
                    <input type="checkbox" checked={filtros.alerta} onChange={e => setFiltros(f => ({ ...f, alerta: e.target.checked }))} /> Só com alerta
                  </label>
                  <div className="flex justify-between">
                    <button className="text-[12px] text-gray-500" onClick={() => setFiltros({ status: '', tipo: '', setor: '', alerta: false })}>Limpar</button>
                    <button className="text-[12px] text-primary-600 font-medium" onClick={() => setVerFiltros(false)}>Fechar</button>
                  </div>
                </div>
              )}
            </div>
            <Menu className="btn-secondary py-1.5" icone={Download} rotulo={<span className="flex items-center gap-1">Exportar <ChevronDown size={13} /></span>} itens={[
              { label: `CSV — lista filtrada (${filtrados.length})`, onClick: () => exportar(filtrados) },
              { label: `CSV — todos (${itens.length})`, onClick: () => exportar(itens) },
              { label: 'Imprimir / PDF', icone: Printer, onClick: imprimir },
            ]} />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-gray-500 border-b border-gray-100">
                {['Código', '', grupo === 'ti' ? 'Equipamento' : 'Máquina / Item', 'Tipo', 'Setor', 'Status', 'Fornecedor', 'Data de aquisição', 'Vida útil',
                  cfg.temProducao ? 'Produção acumulada' : 'Valor contábil', 'Próxima revisão', 'Depreciação mensal', 'Ações'].map((h, i) =>
                  <th key={i} className={`px-3 py-2 font-medium whitespace-nowrap ${[9, 11].includes(i) ? 'text-right' : ''} ${i === 12 ? 'text-center' : ''}`}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={13} className="py-10 text-center"><Loader2 className="animate-spin inline" size={18} /></td></tr>}
              {error && <tr><td colSpan={13} className="py-10 text-center text-red-500">{erroMsg(error)}</td></tr>}
              {!isLoading && !error && filtrados.length === 0 && (
                <tr><td colSpan={13} className="py-10 text-center text-gray-400">
                  {itens.length ? 'Nada encontrado com esse filtro.' : `Nenhum ${cfg.singular} cadastrado — clique em “${cfg.novo}”.`}
                </td></tr>
              )}
              {visiveis.map(m => {
                const ativo = m.id === selId && !criando;
                const revVencida = m.calc.revisao === 'vencido';
                return (
                  <tr key={m.id} onClick={() => selecionar(m)}
                    className={`cursor-pointer border-b border-gray-50 ${ativo ? 'bg-blue-600 text-white' : 'hover:bg-gray-50'}`}>
                    <td className="px-3 py-1.5 font-medium whitespace-nowrap">{m.codigo}</td>
                    <td className="px-1 py-1.5">{grupo === 'ti' ? <Monitor size={15} className={ativo ? '' : 'text-blue-500'} /> : <Factory size={15} className={ativo ? '' : 'text-blue-500'} />}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap">{m.nome}
                      {m.calc.alertas.some(a => a.nivel === 'erro') && <AlertTriangle size={12} className={`inline ml-1 ${ativo ? '' : 'text-red-500'}`} title={m.calc.alertas.map(a => a.texto).join(' · ')} />}
                    </td>
                    <td className="px-3 py-1.5 whitespace-nowrap">{m.tipo || '—'}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap">{m.setor || '—'}</td>
                    <td className="px-3 py-1.5"><Pill mapa={STATUS_MAQ} valor={m.status} /></td>
                    <td className="px-3 py-1.5 whitespace-nowrap">{m.fornecedor_nome || '—'}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap">{fmtData(m.data_aquisicao)}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap">{fmtNum(m.vida_util_anos)} anos</td>
                    <td className="px-3 py-1.5 text-right whitespace-nowrap">
                      {cfg.temProducao ? (m.calc.producao_acumulada ? fmtNum(m.calc.producao_acumulada) : '—') : fmtBRL(m.calc.valor_contabil)}
                    </td>
                    <td className={`px-3 py-1.5 whitespace-nowrap ${revVencida && !ativo ? 'text-red-500 font-medium' : ''}`}>{fmtData(m.proxima_revisao)}</td>
                    <td className="px-3 py-1.5 text-right whitespace-nowrap font-medium">{fmtBRL(m.calc.depreciacao_mensal)}</td>
                    <td className="px-3 py-1.5 text-center whitespace-nowrap" onClick={e => e.stopPropagation()}>
                      <button className={`btn-ghost p-1.5 ${ativo ? 'text-white hover:bg-blue-500' : ''}`} title="Abrir" onClick={() => selecionar(m)}><Eye size={15} /></button>
                      <Menu className={`btn-ghost p-1.5 ${ativo ? 'text-white hover:bg-blue-500' : ''}`} itens={acoesDaMaquina(m)} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filtrados.length > 0 && (
          <div className="flex items-center justify-end gap-3 px-4 py-2 text-[12.5px] text-gray-500 border-t border-gray-100">
            <span>Mostrando {(pag - 1) * POR_PAGINA + 1} a {Math.min(pag * POR_PAGINA, filtrados.length)} de {filtrados.length} registros</span>
            <div className="flex items-center gap-1">
              <PagBtn disabled={pag === 1} onClick={() => setPagina(1)}><ChevronsLeft size={14} /></PagBtn>
              <PagBtn disabled={pag === 1} onClick={() => setPagina(pag - 1)}><ChevronLeft size={14} /></PagBtn>
              {Array.from({ length: paginas }, (_, i) => i + 1).filter(p => Math.abs(p - pag) <= 2 || p === 1 || p === paginas).map(p =>
                <PagBtn key={p} ativo={p === pag} onClick={() => setPagina(p)}>{p}</PagBtn>)}
              <PagBtn disabled={pag === paginas} onClick={() => setPagina(pag + 1)}><ChevronRight size={14} /></PagBtn>
              <PagBtn disabled={pag === paginas} onClick={() => setPagina(paginas)}><ChevronsRight size={14} /></PagBtn>
            </div>
          </div>
        )}
      </div>

      {/* ── Detalhe ── */}
      {(criando || selId) && (
        <div className="card overflow-visible scroll-mt-4" ref={painel}>
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="flex items-center gap-4 min-w-0">
              <div className="w-11 h-11 rounded-lg bg-blue-600 flex items-center justify-center shrink-0">
                {grupo === 'ti' ? <Monitor size={20} className="text-white" /> : <Factory size={20} className="text-white" />}
              </div>
              {criando ? (
                <div><p className="font-semibold text-gray-900 text-lg">{cfg.novo}</p><p className="text-[12.5px] text-gray-500">Preencha o cadastro e salve para liberar as outras abas.</p></div>
              ) : (
                <>
                  <span className="text-[13px] text-gray-500 font-medium">{selResumo?.codigo || sel?.codigo}</span>
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 text-lg flex items-center gap-2 flex-wrap">
                      {selResumo?.nome || sel?.nome || '…'}
                      {(selResumo || sel) && <Pill mapa={STATUS_MAQ} valor={(sel || selResumo).status} />}
                      {carregandoDetalhe && <Loader2 size={14} className="animate-spin text-gray-400" />}
                    </p>
                    <p className="text-[12.5px] text-gray-500">{[(sel || selResumo)?.tipo, (sel || selResumo)?.setor].filter(Boolean).join(' • ')}</p>
                  </div>
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              {!criando && (sel || selResumo) && (
                <>
                  {(sel || selResumo).calc?.alertas?.slice(0, 2).map((a, i) => (
                    <span key={i} className={`hidden md:inline text-[11.5px] px-2 py-0.5 rounded-md ${a.nivel === 'erro' ? 'bg-red-50 text-red-600' : 'bg-yellow-50 text-yellow-700'}`}>{a.texto}</span>
                  ))}
                  <Menu className="btn-secondary p-2" icone={MoreHorizontal} itens={acoesDaMaquina(sel || selResumo)} />
                </>
              )}
              <button className="btn-secondary p-2" title={recolhido ? 'Expandir' : 'Recolher'} onClick={() => setRecolhido(r => !r)}>
                {recolhido ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
              </button>
            </div>
          </div>

          {!recolhido && (
            <>
              <div className="flex overflow-x-auto border-y border-gray-100">
                {ABAS.map(([k, l]) => (
                  <button key={k} disabled={criando && k !== 'cadastro'} onClick={() => setAba(k)}
                    className={`flex-1 min-w-[140px] px-3 py-2 text-[13px] whitespace-nowrap border-r border-gray-100 last:border-r-0 disabled:opacity-40
                      ${abaAtual === k ? 'bg-blue-600 text-white font-medium' : 'text-gray-600 hover:bg-gray-50'}`}>
                    {l}
                  </button>
                ))}
              </div>

              {criando ? (
                <AbaCadastro maquina={null} grupo={grupo} cfg={cfg} codigoSugerido={codigo?.codigo} salvando={salvando}
                  onSalvar={salvarCadastro} onCancelar={() => setCriando(false)} />
              ) : !sel ? (
                <div className="py-10 text-center"><Loader2 className="animate-spin inline" size={18} /></div>
              ) : (
                <>
                  {abaAtual === 'cadastro' && <AbaCadastro maquina={sel} grupo={grupo} cfg={cfg} salvando={salvando} onSalvar={salvarCadastro} onCancelar={() => qc.invalidateQueries({ queryKey: ['maquina', selId] })} />}
                  {abaAtual === 'producao' && <AbaProducao maquina={sel} onMudou={atualizar} />}
                  {abaAtual === 'manutencao' && <AbaManutencao maquina={sel} onMudou={atualizar} />}
                  {abaAtual === 'pecas' && <AbaPecas maquina={sel} maquinas={itens} onMudou={atualizar} />}
                  {abaAtual === 'depreciacao' && <AbaDepreciacao maquina={sel} onMudou={atualizar} />}
                  {abaAtual === 'historico' && <AbaHistorico maquina={sel} onMudou={atualizar} />}
                </>
              )}
            </>
          )}
        </div>
      )}

      <p className="text-[11.5px] text-gray-400">
        O custo mensal de cada {cfg.singular} (depreciação + manutenção) entra sozinho no rateio de{' '}
        <Link to="/rateio/despesas-fixas" className="text-primary-600 hover:underline">Despesas Fixas</Link> e, por ele, no custo de cada produto na{' '}
        <Link to="/pricing/formacao" className="text-primary-600 hover:underline">Formação de Preço</Link>.
      </p>
    </div>
  );
}

function Kpi({ icone: I, cor, titulo, valor, sub, onClick, title }) {
  return (
    <button type="button" onClick={onClick} title={title} className="card p-3 flex items-center gap-3 text-left hover:shadow-md transition-shadow min-w-0">
      <div className={`w-12 h-12 rounded-lg ${cor} flex items-center justify-center shrink-0`}><I size={24} className="text-white" /></div>
      <div className="min-w-0">
        <p className="text-[12.5px] text-gray-600 truncate">{titulo}</p>
        <p className="text-xl font-bold text-gray-900 leading-tight truncate">{valor}</p>
        <p className="text-[11.5px] text-gray-500 truncate">{sub}</p>
      </div>
    </button>
  );
}

function PagBtn({ children, ativo, ...props }) {
  return (
    <button type="button" {...props}
      className={`min-w-[26px] h-[26px] px-1.5 rounded-md text-[12px] flex items-center justify-center disabled:opacity-30
        ${ativo ? 'bg-blue-600 text-white' : 'hover:bg-gray-100 text-gray-600'}`}>
      {children}
    </button>
  );
}

const br = v => String(Math.round((Number(v) || 0) * 100) / 100).replace('.', ',');
const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
