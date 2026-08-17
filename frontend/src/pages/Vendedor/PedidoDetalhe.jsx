// ============================================================
// TELA 2 — Detalhes do Pedido
//
// A tela que responde "em que pé está este pedido" sem ninguém precisar
// ligar para a produção. Três blocos de leitura no topo (cliente, dados,
// valores), os itens com o que foi contratado em cada um, e a linha do
// tempo com o caminho inteiro — o que já passou, onde está agora e o
// que falta.
//
// O que NÃO aparece: custo, margem, rateio e taxa administrativa. Não é
// só a tela que esconde — a rota /area-vendedor/pedidos/:id nem
// consulta esses campos.
// ============================================================
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Share2, User, FileText, DollarSign, CalendarDays, Package, Clock,
  Truck, Info, Plus, Eye, Download, UploadCloud, PenLine, CircleCheck, Star,
  Circle, Wallet, Hourglass, PenTool, FileImage, FileCheck, FlaskConical, Brush,
  CircleDashed, GlassWater, Settings, PackageOpen, ShieldQuestion, ShieldCheck,
  Camera, ImageUp, PackageSearch, PackageCheck,
} from 'lucide-react';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { useVend, fmtBRL, fmtUn, fmtDate } from './ui';
import { corStatus, iconeOrigem } from '@/lib/pedidoUi';

/**
 * Os ícones da linha do tempo, um a um.
 *
 * Nomeados de propósito, e não com `import * as Icons`: aquilo derruba o
 * tree-shaking e arrasta a biblioteca inteira do lucide para dentro do
 * chunk desta tela (715 kB contra 40). Ícone novo no fluxo entra aqui e
 * no catálogo do backend (lib/atencao.js).
 */
const ICONES = {
  CircleCheck, Wallet, Hourglass, Package, PenTool, FileImage, FileCheck,
  FlaskConical, Brush, CircleDashed, GlassWater, Settings, PackageOpen,
  ShieldQuestion, ShieldCheck, Camera, ImageUp, Truck, PackageSearch, PackageCheck,
};

const dataHora = iso => iso
  ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
  : '—';
const horaCurta = iso => iso
  ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  : '';

export default function PedidoDetalhe() {
  const v = useVend();
  const { id } = useParams();
  const navigate = useNavigate();
  const [verHistorico, setVerHistorico] = useState(false);

  const { data: p, isLoading, error } = useQuery({
    queryKey: ['pedido-vendedor', id],
    queryFn: () => api.get(`/area-vendedor/pedidos/${id}`),
  });

  const emBreve = qual => toast(`${qual} será uma tela própria, ainda em definição.`, { icon: '🚧' });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ ...v.card, padding: '2rem' }} className="text-center">
        <p style={{ color: v.textPrimary }}>{error.error || 'Não foi possível abrir este pedido'}</p>
        <button onClick={() => navigate(-1)} className="btn-secondary mt-4 mx-auto">
          <ArrowLeft size={14} /> Voltar
        </button>
      </div>
    );
  }

  const cli = p.CLIENTES || {};
  const itens = p.itens || [];
  const aguardandoArte = p.status === 'aguardando_arte';

  return (
    <div className="space-y-4">

      {/* ── Cabeçalho ─────────────────────────────────────────── */}
      <div className="flex items-center gap-2 text-sm" style={{ color: v.textSubtle }}>
        <button onClick={() => navigate('/vendedor/pedidos')} className="hover:underline">Pedido de Venda</button>
        <span>›</span>
        <span style={{ color: v.textPrimary }}>Detalhes do Pedido</span>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold" style={{ color: v.textPrimary }}>Pedido de Venda</h1>
          <span className="text-2xl font-bold" style={{ color: '#22d3ee' }}>{p.codigo}</span>
          <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium"
            style={{ border: `1px solid ${corStatus(p.status_cor)}66`, color: corStatus(p.status_cor) }}>
            <CircleCheck size={15} /> {p.status_label}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => navigate('/vendedor/pedidos')} className="btn-secondary">
            <ArrowLeft size={15} /> Voltar
          </button>
          <button onClick={() => emBreve('O compartilhamento com o cliente')}
            className="btn" style={{ background: '#16a34a', color: 'white' }}>
            <Share2 size={15} /> Compartilhar com o Cliente
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,3fr)_minmax(0,1fr)] gap-4 items-start">

        {/* ── Coluna principal ────────────────────────────────── */}
        <div className="space-y-4">

          {/* Cliente / Dados / Valores */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Bloco v={v} Icon={User} titulo="Cliente">
              <Campo v={v} rotulo="Nome" valor={
                <span className="flex items-center gap-1.5 flex-wrap justify-end">
                  {cli.name || 'Consumidor final'}
                  {cli.rating >= 4 && (
                    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full"
                      style={{ background: 'rgba(59,130,246,0.2)', color: '#93c5fd' }}>
                      <Star size={9} /> Cliente Verificado
                    </span>
                  )}
                </span>
              } />
              <Campo v={v} rotulo="Código"   valor={p.codigo_cliente || '—'} mono />
              <Campo v={v} rotulo="CNPJ"     valor={cli.cpf_cnpj || '—'} />
              <Campo v={v} rotulo="Telefone" valor={cli.mobile || cli.phone || '—'} />
              <Campo v={v} rotulo="E-mail"   valor={cli.email || '—'} />
              <Campo v={v} rotulo="Cidade"   valor={cli.address?.city ? `${cli.address.city}/${cli.address.state || ''}` : '—'} />
            </Bloco>

            <Bloco v={v} Icon={FileText} titulo="Dados do Pedido">
              <Campo v={v} rotulo="Número"         valor={p.codigo} />
              <Campo v={v} rotulo="Data do Pedido" valor={dataHora(p.operation_date ? `${p.operation_date}T12:00:00` : p.created_at)} />
              <Campo v={v} rotulo="Data do Evento" valor={p.event_date ? fmtDate(p.event_date) : '—'} />
              <Campo v={v} rotulo="Vendedor"       valor={p.vendedor || '—'} />
              <Campo v={v} rotulo="Origem" valor={
                p.origin
                  ? <span>{iconeOrigem(p.origin)} {p.origin}</span>
                  : <span style={{ color: v.textSubtle }}>não informada</span>
              } />
              <Campo v={v} rotulo="Transportadora" valor={p.transportadora || '—'} />
              <Campo v={v} rotulo="Cotação"        valor={p.freight_quote || '—'} mono />
            </Bloco>

            <Bloco v={v} Icon={DollarSign} titulo="Valores">
              <Campo v={v} rotulo="Valor dos Produtos" valor={fmtBRL(p.subtotal)} />
              <Campo v={v} rotulo="Frete"              valor={fmtBRL(p.freight)} />
              {Number(p.discount) > 0 && <Campo v={v} rotulo="Desconto" valor={`− ${fmtBRL(p.discount)}`} />}
              <div className="mt-3 pt-3 text-center" style={{ borderTop: `1px solid ${v.divider}` }}>
                <p className="text-xs" style={{ color: '#22d3ee' }}>Valor Total</p>
                <p className="text-3xl font-bold" style={{ color: '#22d3ee' }}>{fmtBRL(p.total)}</p>
              </div>
            </Bloco>
          </div>

          {/* Itens */}
          <div style={v.card}>
            <div className="flex items-center justify-between gap-2 px-4 py-3"
              style={{ borderBottom: `1px solid ${v.divider}` }}>
              <h2 className="text-sm font-semibold flex items-center gap-2" style={{ color: v.textPrimary }}>
                <Package size={16} style={{ color: '#60a5fa' }} /> Itens do Pedido
              </h2>
              <span className="text-xs" style={{ color: v.textMuted }}>Total de Itens: {itens.length}</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm" style={{ minWidth: 900 }}>
                <thead>
                  <tr style={{ color: v.textMuted }}>
                    {['Cód. Produto','Produto','Linha','Cor do Produto','Categoria','Acessório','Cor da Personalização','Qtd','Valor Unit.','Valor Total']
                      .map((h, i) => (
                        <th key={h} className={`px-3 py-2.5 text-[11px] font-semibold whitespace-nowrap ${i >= 7 ? 'text-right' : 'text-left'}`}
                          style={{ borderBottom: `1px solid ${v.divider}` }}>{h}</th>
                      ))}
                  </tr>
                </thead>
                <tbody>
                  {itens.length === 0 ? (
                    <tr><td colSpan={10} className="text-center py-8" style={{ color: v.empty }}>Sem itens</td></tr>
                  ) : itens.map(i => (
                    <tr key={i.id} style={{ borderBottom: `1px solid ${v.divider}` }}>
                      <td className="px-3 py-2.5 font-mono" style={{ color: v.textPrimary }}>{i.codigo_produto || '—'}</td>
                      <td className="px-3 py-2.5" style={{ color: v.textPrimary }}>{i.produto}</td>
                      <td className="px-3 py-2.5" style={{ color: v.textMuted }}>{i.linha || '—'}</td>
                      <td className="px-3 py-2.5" style={{ color: v.textMuted }}>{i.cor_produto || '—'}</td>
                      <td className="px-3 py-2.5" style={{ color: v.textMuted }}>
                        {i.categorias?.length > 1
                          ? <span title={i.categorias.join(' · ')}>{i.categoria} +{i.categorias.length - 1}</span>
                          : (i.categoria || '—')}
                      </td>
                      <td className="px-3 py-2.5" style={{ color: v.textMuted }}>{i.acessorio || '—'}</td>
                      <td className="px-3 py-2.5" style={{ color: v.textMuted }}>{i.cor_personalizacao || '—'}</td>
                      <td className="px-3 py-2.5 text-right" style={{ color: v.textPrimary }}>{fmtUn(i.quantity)}</td>
                      <td className="px-3 py-2.5 text-right" style={{ color: v.textMuted }}>{fmtBRL(i.unit_price)}</td>
                      <td className="px-3 py-2.5 text-right font-semibold" style={{ color: v.textPrimary }}>{fmtBRL(i.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Linha do tempo */}
          <div style={v.card}>
            <h2 className="text-sm font-semibold flex items-center gap-2 px-4 py-3"
              style={{ color: v.textPrimary, borderBottom: `1px solid ${v.divider}` }}>
              <Clock size={16} style={{ color: '#60a5fa' }} /> Linha do Tempo do Pedido
            </h2>
            <div className="p-4 flex flex-wrap gap-x-2 gap-y-5">
              {(p.linha_do_tempo || []).map(passo => <Balao key={passo.key} v={v} passo={passo} />)}
            </div>
            <p className="text-[11px] px-4 pb-3" style={{ color: v.textSubtle }}>
              Nem todo pedido percorre todas as etapas — o caminho depende do produto e dos processos
              contratados. Etapas sem data ainda não aconteceram.
            </p>
          </div>

          {/* Entrega + histórico */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Bloco v={v} Icon={Truck} titulo="Informações da Entrega">
              <p className="text-sm leading-relaxed" style={{ color: v.textMuted }}>
                {cli.address?.street
                  ? `${cli.address.street}, ${cli.address.number || 's/n'} — ${cli.address.city || ''}/${cli.address.state || ''}`
                  : 'A entrega será realizada no endereço do cadastro'}, em horário comercial,
                das 8 às 18 horas em dias úteis.
              </p>
              {p.tracking_code && (
                <p className="text-sm mt-2 font-mono" style={{ color: '#60a5fa' }}>
                  Rastreio: {p.tracking_code}
                </p>
              )}
            </Bloco>

            <div style={v.card}>
              <h2 className="text-sm font-semibold flex items-center gap-2 px-4 py-3"
                style={{ color: v.textPrimary, borderBottom: `1px solid ${v.divider}` }}>
                <Clock size={16} style={{ color: '#60a5fa' }} /> Histórico da Linha do Tempo
              </h2>
              <div className="p-4 space-y-1.5">
                {(p.historico || []).length === 0 ? (
                  <p className="text-sm" style={{ color: v.empty }}>
                    Ainda sem movimentações registradas.
                  </p>
                ) : (verHistorico ? p.historico : p.historico.slice(-5)).map((h, i) => (
                  <div key={i} className="flex items-center gap-2 text-[13px]">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: corStatus(h.cor) }} />
                    <span className="shrink-0" style={{ color: v.textSubtle }}>{dataHora(h.at)}</span>
                    <span className="truncate" style={{ color: v.textPrimary }}>{h.label}</span>
                    {h.user && <span className="text-[11px] shrink-0" style={{ color: v.textSubtle }}>· {h.user}</span>}
                  </div>
                ))}
              </div>
              {(p.historico || []).length > 5 && (
                <div className="px-4 pb-3">
                  <button onClick={() => setVerHistorico(x => !x)} className="btn-secondary btn-sm">
                    <Eye size={13} /> {verHistorico ? 'Mostrar menos' : 'Visualizar por completo'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Coluna lateral ──────────────────────────────────── */}
        <div className="space-y-4">

          <Bloco v={v} Icon={CalendarDays} titulo="Prazos e Entrega">
            <div className="grid grid-cols-2 gap-2">
              <Prazo v={v} rotulo="Previsão de Saída"   valor={p.ship_date ? fmtDate(p.ship_date) : '—'} />
              <Prazo v={v} rotulo="Data de Coleta"      valor={p.collect_date ? fmtDate(p.collect_date) : '—'} />
              <Prazo v={v} rotulo="Previsão de Entrega" valor={p.delivery_date ? fmtDate(p.delivery_date) : '—'} />
              <Prazo v={v} rotulo="Dias Úteis de Transporte" Icon={Truck}
                valor={p.transport_days ? `${p.transport_days} dias` : '—'} />
            </div>
          </Bloco>

          {/* Arte */}
          <Bloco v={v} Icon={PenLine} titulo="Arte">
            <div className="text-center py-1 px-2 rounded-lg text-sm font-medium mb-2"
              style={aguardandoArte
                ? { border: '1px solid rgba(250,204,21,0.5)', color: '#facc15' }
                : { border: `1px solid ${v.divider}`, color: p.artwork_url ? '#4ade80' : v.textMuted }}>
              {aguardandoArte ? 'Aguardando Anexo da Arte' : p.artwork_url ? 'Arte anexada' : 'Sem arte neste pedido'}
            </div>
            {aguardandoArte && (
              <p className="text-[11px] text-center mb-3" style={{ color: v.textSubtle }}>
                Anexe o arquivo da arte para darmos continuidade.
              </p>
            )}
            <button onClick={() => emBreve('O anexo da arte')} className="btn-secondary w-full mb-2">
              <UploadCloud size={15} /> Anexar Arte
            </button>
            {p.artwork_url ? (
              <a href={p.artwork_url} target="_blank" rel="noreferrer" className="btn-secondary w-full">
                <Eye size={15} /> Visualizar Arte
              </a>
            ) : (
              <button disabled className="btn-secondary w-full opacity-40 cursor-not-allowed">
                <Eye size={15} /> Visualizar Arte
              </button>
            )}
            {p.artwork_notes && (
              <p className="text-[11px] mt-2" style={{ color: v.textMuted }}>{p.artwork_notes}</p>
            )}
          </Bloco>

          {/* Documentos */}
          <Bloco v={v} Icon={FileText} titulo="Documentos">
            <div className="space-y-2">
              {(p.documentos || []).map(doc => (
                <button key={doc.key} disabled={!doc.disponivel}
                  onClick={() => emBreve(`O download de "${doc.label}"`)}
                  className="w-full flex items-center gap-2 text-left text-sm disabled:opacity-45 disabled:cursor-not-allowed">
                  <span className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
                    style={{ background: 'rgba(59,130,246,0.2)' }}>
                    <FileText size={11} style={{ color: '#60a5fa' }} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate" style={{ color: v.textPrimary }}>{doc.label}</span>
                    {doc.nota && <span className="block text-[10px]" style={{ color: v.textSubtle }}>{doc.nota}</span>}
                  </span>
                  <Download size={14} style={{ color: v.textMuted }} className="shrink-0" />
                </button>
              ))}
            </div>
          </Bloco>

          {/* Informações importantes */}
          <Bloco v={v} Icon={Info} titulo="Informações Importantes"
            direita={
              <button onClick={() => emBreve('A edição dos avisos')} title="Acrescentar aviso"
                className="w-6 h-6 rounded-lg flex items-center justify-center"
                style={{ background: 'rgba(59,130,246,0.2)', color: '#60a5fa' }}>
                <Plus size={13} />
              </button>
            }>
            {(p.avisos || []).length === 0 ? (
              <p className="text-[12px]" style={{ color: v.textSubtle }}>
                Nenhum aviso cadastrado. O Administrativo define os avisos padrão em
                Configurações, e eles passam a aparecer em todos os pedidos.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {p.avisos.map((a, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-[12px]" style={{ color: v.textMuted }}>
                    <Info size={12} className="shrink-0 mt-0.5" style={{ color: '#facc15' }} />
                    <span>{a}</span>
                  </li>
                ))}
              </ul>
            )}
          </Bloco>

          <p className="text-[11px] px-1" style={{ color: v.textSubtle }}>
            Alterar produto, quantidade, preço ou frete depende de autorização administrativa —
            toda mudança fica registrada com usuário, data, motivo e valor anterior.
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Um balão da linha do tempo.
 *
 * Três estados com leituras diferentes: concluído mostra a data (é o
 * registro de quando aconteceu), atual fica aceso e sublinhado, pendente
 * fica apagado sem data — porque não existe data para o que não
 * aconteceu, e inventar uma seria pior que deixar em branco.
 */
function Balao({ v, passo }) {
  const Icon = ICONES[passo.icone] || Circle;
  const cor = corStatus(passo.cor);

  const estilo = {
    concluido: { anel: cor,                   fundo: `${cor}22`,  icone: cor,        texto: cor },
    atual:     { anel: cor,                   fundo: `${cor}33`,  icone: cor,        texto: cor },
    pendente:  { anel: 'rgba(148,163,184,.3)', fundo: 'transparent', icone: '#94a3b8', texto: v.textSubtle },
  }[passo.estado];

  return (
    <div className="flex flex-col items-center gap-1 text-center" style={{ width: 96 }}
      title={`${passo.passo}. ${passo.label}${passo.at ? ` — ${dataHora(passo.at)}` : ''}`}>
      <div className="relative">
        <div className="w-11 h-11 rounded-full flex items-center justify-center"
          style={{ border: `2px solid ${estilo.anel}`, background: estilo.fundo,
                   boxShadow: passo.estado === 'atual' ? `0 0 12px ${cor}66` : 'none' }}>
          <Icon size={18} style={{ color: estilo.icone }} />
        </div>
        <span className="absolute -top-1 -left-1 w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold"
          style={{ background: estilo.anel, color: passo.estado === 'pendente' ? '#0b1020' : '#0b1020' }}>
          {passo.passo}
        </span>
      </div>
      <span className="text-[10px] leading-tight" style={{ color: estilo.texto }}>{passo.label}</span>
      {passo.at && (
        <span className="text-[9px]" style={{ color: v.textSubtle }}>{horaCurta(passo.at)}</span>
      )}
      {passo.estado === 'atual' && (
        <span className="w-6 h-0.5 rounded-full" style={{ background: cor }} />
      )}
    </div>
  );
}

// ── Peças pequenas ───────────────────────────────────────────
function Bloco({ v, Icon, titulo, direita, children }) {
  return (
    <div style={v.card}>
      <div className="flex items-center justify-between gap-2 px-4 py-3"
        style={{ borderBottom: `1px solid ${v.divider}` }}>
        <h2 className="text-sm font-semibold flex items-center gap-2" style={{ color: v.textPrimary }}>
          <Icon size={16} style={{ color: '#60a5fa' }} /> {titulo}
        </h2>
        {direita}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function Campo({ v, rotulo, valor, mono }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1 text-sm">
      <span className="shrink-0" style={{ color: v.textMuted }}>{rotulo}:</span>
      <span className={`text-right min-w-0 truncate ${mono ? 'font-mono' : ''}`} style={{ color: v.textPrimary }}>
        {valor}
      </span>
    </div>
  );
}

function Prazo({ v, rotulo, valor, Icon = CalendarDays }) {
  return (
    <div className="rounded-lg px-2.5 py-2" style={{ background: v.surface }}>
      <p className="text-[10px] flex items-center gap-1" style={{ color: v.textSubtle }}>
        <Icon size={10} /> {rotulo}
      </p>
      <p className="text-sm font-semibold mt-0.5" style={{ color: v.textPrimary }}>{valor}</p>
    </div>
  );
}
