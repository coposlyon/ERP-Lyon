// ============================================================
// EXPEDIÇÃO — a fila de quem faz o pedido sair.
//
// A tela de Logística era o CADASTRO de transportadoras: nome, CNPJ,
// contrato, tabela. Útil, e nada a ver com o trabalho de quem senta ali
// de manhã, que é outro: quais pedidos estão prontos na prateleira,
// quais já foram avisados, qual precisa de nota, qual espera coleta.
//
// Esse trabalho acontecia por WhatsApp e memória. Aqui ele tem uma
// fila, e cada linha diz o que já foi feito e o que falta.
// ============================================================
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Truck, PackageCheck, Search, RefreshCw, Loader2, FileText, Tag, MessageCircle,
  FileCheck2, Clock, PersonStanding, ExternalLink, CircleCheck, AlertTriangle, Printer,
} from 'lucide-react';
import api from '@/lib/api';
import Modal from '@/components/UI/Modal';
import toast from 'react-hot-toast';

const brl = v => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0);
const dataBR = d => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—');
const dataHora = s => (s ? new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');

const FAIXAS = [
  { key: 'a_expedir', label: 'A expedir', Icone: PackageCheck },
  { key: 'transito', label: 'Em trânsito', Icone: Truck },
  { key: 'concluido', label: 'Concluídos', Icone: CircleCheck },
];

/**
 * IMPRIMIR SEM BAIXAR ARQUIVO.
 *
 * A declaração e a etiqueta chegam como HTML pela API — que já carrega
 * o token da sessão. Abrir a rota direto numa aba nova perderia esse
 * token e devolveria "não autorizado"; salvar um arquivo para o usuário
 * abrir depois é um passo a mais e um arquivo solto na pasta Downloads.
 *
 * Então a janela é aberta em branco e o conteúdo é escrito nela. Sai
 * direto na impressora, ou em PDF pelo próprio navegador.
 */
function imprimir(html, titulo) {
  const w = window.open('', '_blank');
  if (!w) {
    toast.error('O navegador bloqueou a janela. Libere os pop-ups para imprimir.');
    return;
  }
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${titulo}</title></head><body>${html}</body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 350);
}

/**
 * O QUE ACONTECE DEPOIS DE AVISAR — dito por inteiro.
 *
 * O envio automático pelo WhatsApp exige a API oficial da Meta, que
 * ainda não está ligada. Enquanto isso, o sistema escreve a mensagem e
 * abre a conversa: dois cliques, em vez de dez minutos escrevendo e
 * conferindo o número do pedido.
 *
 * Isto é dito com todas as letras, e não escondido atrás de um aviso de
 * erro — porque não é erro, é o caminho normal de hoje.
 */
function ResultadoDoAviso({ r, onFechar }) {
  if (!r) return null;
  const auto = r.envio?.modo === 'automatico';
  return (
    <div className="space-y-3">
      {auto ? (
        <p className="text-[13px] rounded-xl px-3 py-2 bg-green-50 border border-green-200 text-green-800">
          Mensagem enviada para <b>{r.cliente}</b>.
        </p>
      ) : (
        <p className="text-[13px] rounded-xl px-3 py-2 bg-blue-50 border border-blue-200 text-blue-900">
          A mensagem está pronta. Clique abaixo para abrir a conversa
          {r.telefone ? <> de <b>{r.cliente}</b></> : null} e enviar.
        </p>
      )}

      <pre className="text-[12.5px] whitespace-pre-wrap rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 font-sans text-gray-700">
        {r.mensagem}
      </pre>

      {r.envio?.modo === 'sem_telefone' && (
        <p className="text-[12.5px] rounded-xl px-3 py-2 bg-amber-50 border border-amber-200 text-amber-900 flex items-start gap-2">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          {r.envio.motivo}. Copie o texto acima e mande pelo canal que vocês usam com este cliente.
        </p>
      )}

      <div className="flex flex-wrap justify-end gap-2 pt-1">
        <button className="btn-secondary" onClick={() => {
          navigator.clipboard?.writeText(r.mensagem);
          toast.success('Mensagem copiada');
        }}>Copiar texto</button>
        {r.wa_link && (
          <a href={r.wa_link} target="_blank" rel="noopener noreferrer" className="btn-primary">
            <MessageCircle size={14} /> Abrir o WhatsApp
          </a>
        )}
        {r.mailto && (
          <a href={r.mailto} className="btn-secondary"><ExternalLink size={14} /> Enviar por e-mail</a>
        )}
        <button className="btn-secondary" onClick={onFechar}>Fechar</button>
      </div>
    </div>
  );
}

/** O que já aconteceu com este pedido do lado de cá. */
function HistoricoDaExpedicao({ pedidoId }) {
  const { data, isLoading } = useQuery({
    queryKey: ['expedicao-historico', pedidoId],
    queryFn: () => api.get(`/expedicao/${pedidoId}/historico`),
  });
  if (isLoading) {
    return <p className="text-sm text-gray-500 flex items-center gap-2 py-5 justify-center">
      <Loader2 size={14} className="animate-spin" /> Levantando o histórico…
    </p>;
  }
  const eventos = data?.eventos || [];
  return (
    <div className="space-y-3">
      <p className="text-[13px] text-gray-600">
        Pedido <b>{data?.codigo}</b> · {data?.status_label}
      </p>
      {eventos.length === 0 ? (
        <p className="text-sm text-gray-400">Nada registrado na logística ainda.</p>
      ) : (
        <ol className="space-y-3">
          {eventos.map((e, i) => (
            <li key={i} className="flex gap-3">
              <div className="flex flex-col items-center pt-1">
                <span className="w-2 h-2 rounded-full bg-green-500" />
                {i < eventos.length - 1 && <span className="flex-1 w-px bg-gray-200 mt-1" />}
              </div>
              <div className="pb-1">
                <p className="text-[13px] font-medium text-gray-800">{e.titulo}</p>
                {e.detalhe && <p className="text-[12.5px] text-gray-600">{e.detalhe}</p>}
                <p className="text-[11.5px] text-gray-400">
                  {dataHora(e.at)}{e.quem ? ` · ${e.quem}` : ''}
                  {e.envio === 'manual' ? ' · mensagem aberta para envio' : ''}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** Quantos volumes vão nesta carga — a etiqueta sai uma por volume. */
function PerguntaVolumes({ acao, onConfirmar, onCancelar, enviando }) {
  const [volumes, setVolumes] = useState(1);
  const [peso, setPeso] = useState('');
  return (
    <div className="space-y-3">
      <p className="text-[13px] text-gray-600">
        {acao === 'coleta'
          ? 'A transportadora precisa saber quantos volumes vai buscar.'
          : 'Sai uma etiqueta por volume, numeradas “1 de 3”, “2 de 3” — é assim que se descobre que faltou uma caixa no caminhão.'}
      </p>
      <div className="flex gap-3">
        <div className="flex-1">
          <label className="label">Volumes</label>
          <input type="number" min="1" max="50" className="input" value={volumes}
            onChange={e => setVolumes(Math.max(1, Number(e.target.value) || 1))} />
        </div>
        {acao === 'coleta' && (
          <div className="flex-1">
            <label className="label">Peso total (kg)</label>
            <input type="number" min="0" step="0.1" className="input" value={peso}
              onChange={e => setPeso(e.target.value)} placeholder="opcional" />
          </div>
        )}
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <button className="btn-secondary" onClick={onCancelar} disabled={enviando}>Cancelar</button>
        <button className="btn-primary" disabled={enviando}
          onClick={() => onConfirmar({ volumes, peso: peso ? Number(peso) : null })}>
          {enviando ? <Loader2 size={14} className="animate-spin" /> : null} Continuar
        </button>
      </div>
    </div>
  );
}

export default function Expedicao() {
  const qc = useQueryClient();
  const [faixa, setFaixa] = useState('a_expedir');
  const [busca, setBusca] = useState('');
  const [buscaAtiva, setBuscaAtiva] = useState('');
  const [aviso, setAviso] = useState(null);        // resultado do avisar/coleta
  const [historico, setHistorico] = useState(null);
  const [perguntando, setPerguntando] = useState(null); // { pedido, acao }

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['expedicao', faixa, buscaAtiva],
    queryFn: () => api.get(`/expedicao?faixa=${faixa}${buscaAtiva ? `&search=${encodeURIComponent(buscaAtiva)}` : ''}`),
  });

  const linhas = data?.data || [];
  const c = data?.contagem || {};

  const recarregar = () => {
    qc.invalidateQueries({ queryKey: ['expedicao'] });
    qc.invalidateQueries({ queryKey: ['expedicao-historico'] });
  };

  const avisar = useMutation({
    mutationFn: id => api.post(`/expedicao/${id}/avisar-cliente`),
    onSuccess: r => { setAviso(r); recarregar(); },
    onError: e => toast.error(e.error || 'Não foi possível avisar'),
  });

  const coleta = useMutation({
    mutationFn: ({ id, volumes, peso }) => api.post(`/expedicao/${id}/coleta`, { volumes, peso }),
    onSuccess: r => {
      setPerguntando(null);
      setAviso({ ...r, cliente: r.transportadora });
      recarregar();
    },
    onError: e => {
      setPerguntando(null);
      toast.error(e.dica ? `${e.error} ${e.dica}` : (e.error || 'Não foi possível solicitar a coleta'));
    },
  });

  const nota = useMutation({
    mutationFn: id => api.post(`/fiscal/emit/${id}`),
    onSuccess: () => { toast.success('Nota enviada para autorização. Acompanhe em Fiscal.'); recarregar(); },
    onError: e => toast.error(e.error || 'Não foi possível emitir a nota'),
  });

  async function papel(pedido, tipo, volumes) {
    try {
      const r = await api.get(`/expedicao/${pedido.id}/${tipo}${volumes ? `?volumes=${volumes}` : ''}`);
      imprimir(r.html, r.titulo);
      recarregar();
    } catch (e) {
      toast.error(e.error || 'Não foi possível gerar o documento');
    }
  }

  return (
    <div className="space-y-4">
      {/* AS TRÊS FAIXAS. Concluídos continua aqui de propósito: é sempre
          depois da entrega que o cliente liga pedindo a nota. */}
      <div className="card p-3 flex flex-wrap items-center gap-2">
        {FAIXAS.map(({ key, label, Icone }) => (
          <button key={key} onClick={() => setFaixa(key)}
            className={`text-sm font-medium px-3 py-2 rounded-lg inline-flex items-center gap-1.5 border ${
              faixa === key ? 'bg-primary-600 text-white border-primary-600'
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
            <Icone size={14} /> {label}
            {c[key] > 0 && (
              <span className={`text-[11px] px-1.5 rounded-full ${
                faixa === key ? 'bg-white/25' : 'bg-gray-100'}`}>{c[key]}</span>
            )}
          </button>
        ))}

        {c.a_avisar > 0 && faixa === 'a_expedir' && (
          <span className="text-[12px] ml-1 px-2.5 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800">
            {c.a_avisar} pedido(s) pronto(s) e o cliente ainda não sabe.
          </span>
        )}

        <form className="ml-auto flex gap-2" onSubmit={e => { e.preventDefault(); setBuscaAtiva(busca); }}>
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input className="input pl-9 max-w-[220px]" placeholder="Pedido ou cliente"
              value={busca} onChange={e => setBusca(e.target.value)} />
          </div>
          <button className="btn-secondary" type="button" onClick={() => refetch()}>
            <RefreshCw size={15} className={isFetching ? 'animate-spin' : ''} />
          </button>
        </form>
      </div>

      {isLoading ? (
        <p className="text-sm text-gray-500 flex items-center gap-2 py-10 justify-center">
          <Loader2 size={15} className="animate-spin" /> Carregando a fila…
        </p>
      ) : linhas.length === 0 ? (
        <div className="card p-10 text-center">
          <PackageCheck size={30} className="mx-auto text-gray-300" />
          <p className="text-sm text-gray-500 mt-2">
            {faixa === 'a_expedir' ? 'Nenhum pedido esperando para sair.'
              : faixa === 'transito' ? 'Nenhum pedido em trânsito.'
              : 'Nenhum pedido concluído neste recorte.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {linhas.map(l => (
            <div key={l.id} className="card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-[220px]">
                  <p className="font-semibold text-gray-900 flex items-center gap-2">
                    {l.codigo}
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium inline-flex items-center gap-1 ${
                      l.modo === 'retirada' ? 'bg-violet-100 text-violet-700' : 'bg-blue-100 text-blue-700'}`}>
                      {l.modo === 'retirada' ? <><PersonStanding size={10} /> Retirada</> : <><Truck size={10} /> Entrega</>}
                    </span>
                  </p>
                  <p className="text-sm text-gray-700">{l.cliente}</p>
                  <p className="text-xs text-gray-500">
                    {[l.cidade, l.uf].filter(Boolean).join(' / ') || 'sem cidade no cadastro'}
                    {' · '}{l.status_label}
                    {l.saida ? ` · saída ${dataBR(l.saida)}` : ''}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {brl(l.total)}{l.frete ? ` (frete ${brl(l.frete)})` : ''}
                    {l.transportadora ? ` · ${l.transportadora}` : ''}
                    {l.rastreio ? ` · rastreio ${l.rastreio}` : ''}
                  </p>
                  {l.quem_retira && (
                    <p className="text-xs text-violet-700 mt-0.5">Retirada autorizada: {l.quem_retira}</p>
                  )}
                </div>

                {/* O QUE JÁ FOI FEITO. Sem isto, a única forma de saber se
                    o cliente já foi avisado é perguntar a quem avisou. */}
                <div className="flex flex-col gap-1 text-[11.5px] min-w-[170px]">
                  <Marca ok={!!l.avisado} texto={l.avisado ? `Cliente avisado · ${dataHora(l.avisado.at)}` : 'Cliente ainda não avisado'} />
                  {l.modo === 'entrega' && (
                    <Marca ok={!!l.coleta_solicitada}
                      texto={l.coleta_solicitada ? `Coleta solicitada · ${dataHora(l.coleta_solicitada.at)}` : 'Coleta não solicitada'} />
                  )}
                  <Marca ok={!!l.nota}
                    texto={l.nota ? `NF ${l.nota.numero || ''} ${l.nota.status || ''}`.trim() : 'Sem nota emitida'} />
                </div>
              </div>

              {/* Os botões do dia. */}
              <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-gray-100">
                <button className="btn-primary btn-sm" disabled={avisar.isPending}
                  onClick={() => avisar.mutate(l.id)}>
                  <MessageCircle size={13} /> {l.avisado ? 'Avisar de novo' : 'Avisar o cliente'}
                </button>

                {l.modo === 'entrega' && (
                  <button className="btn-secondary btn-sm"
                    onClick={() => setPerguntando({ pedido: l, acao: 'coleta' })}>
                    <Truck size={13} /> Solicitar coleta
                  </button>
                )}

                {l.nota?.danfe_url ? (
                  <a className="btn-secondary btn-sm" href={l.nota.danfe_url} target="_blank" rel="noopener noreferrer">
                    <FileText size={13} /> Ver DANFE
                  </a>
                ) : (
                  <button className="btn-secondary btn-sm" disabled={nota.isPending}
                    onClick={() => nota.mutate(l.id)}>
                    {nota.isPending ? <Loader2 size={13} className="animate-spin" /> : <FileText size={13} />} Emitir NF
                  </button>
                )}

                <button className="btn-secondary btn-sm" onClick={() => papel(l, 'declaracao')}>
                  <FileCheck2 size={13} /> Declaração de conteúdo
                </button>

                <button className="btn-secondary btn-sm"
                  onClick={() => setPerguntando({ pedido: l, acao: 'etiqueta' })}>
                  <Tag size={13} /> Etiqueta de volume
                </button>

                <button className="btn-secondary btn-sm ml-auto" onClick={() => setHistorico(l)}>
                  <Clock size={13} /> Histórico
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={!!aviso} onClose={() => setAviso(null)} title="Mensagem pronta" size="sm">
        <ResultadoDoAviso r={aviso} onFechar={() => setAviso(null)} />
      </Modal>

      <Modal isOpen={!!perguntando} onClose={() => setPerguntando(null)}
        title={perguntando?.acao === 'coleta' ? 'Solicitar a coleta' : 'Imprimir etiquetas'} size="sm">
        {perguntando && (
          <PerguntaVolumes
            acao={perguntando.acao}
            enviando={coleta.isPending}
            onCancelar={() => setPerguntando(null)}
            onConfirmar={({ volumes, peso }) => {
              if (perguntando.acao === 'coleta') {
                coleta.mutate({ id: perguntando.pedido.id, volumes, peso });
              } else {
                papel(perguntando.pedido, 'etiqueta', volumes);
                setPerguntando(null);
              }
            }} />
        )}
      </Modal>

      <Modal isOpen={!!historico} onClose={() => setHistorico(null)} title="Histórico da logística" size="md">
        {historico && <HistoricoDaExpedicao pedidoId={historico.id} />}
      </Modal>
    </div>
  );
}

function Marca({ ok, texto }) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${ok ? 'text-green-700' : 'text-gray-400'}`}>
      {ok ? <CircleCheck size={12} className="shrink-0" /> : <Printer size={12} className="shrink-0 opacity-0" />}
      {texto}
    </span>
  );
}
