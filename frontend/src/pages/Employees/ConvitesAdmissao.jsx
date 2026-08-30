// ============================================================
// CONVITES DE ADMISSÃO — o lado do RH.
//
// Duas peças, e as duas moram aqui porque falam do mesmo objeto:
//
//   GerarConviteModal   escolhe o prazo e devolve o endereço para copiar
//   ListaPendentes      a aba Pendentes: quem já preencheu, para conferir
//
// A CONFERÊNCIA É O PRODUTO. O ganho do convite não é a pessoa digitar
// no lugar do RH — é o RH parar de digitar e passar a LER. Por isso a
// ficha aparece inteira, campo a campo, antes de qualquer botão de
// aprovar: aprovar sem ver seria trocar erro de digitação por erro de
// conferência, e o segundo é pior porque ninguém procura por ele.
// ============================================================
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  X, Link2, Copy, Check, Loader2, Clock, UserCheck, UserX, Send,
  AlertTriangle, ChevronDown, ChevronUp, Ban,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/api';

const HORAS = [
  { h: 6,   l: '6 horas'  },
  { h: 24,  l: '1 dia'    },
  { h: 48,  l: '2 dias'   },
  { h: 168, l: '7 dias'   },
];

const dataHora = v => v
  ? new Date(v).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  : '—';

// ────────────────────────────────────────────────────────────
// Gerar o link
// ────────────────────────────────────────────────────────────
export function GerarConviteModal({ aberto, onClose }) {
  const [horas, setHoras] = useState(48);
  const [nome, setNome] = useState('');
  const [gerando, setGerando] = useState(false);
  const [url, setUrl] = useState(null);
  const [expira, setExpira] = useState(null);
  const [copiado, setCopiado] = useState(false);
  const qc = useQueryClient();

  if (!aberto) return null;

  async function gerar() {
    setGerando(true);
    try {
      const r = await api.post('/hr/convites', { horas, nome: nome.trim() || null });
      setUrl(r.url);
      setExpira(r.expires_at);
      qc.invalidateQueries(['convites']);
    } catch (e) { toast.error(e.error || 'Não foi possível gerar o link.'); }
    finally { setGerando(false); }
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Área de transferência bloqueada (http, permissão negada). O
      // link está na tela: dizer para copiar à mão é melhor do que um
      // "copiado!" que não copiou nada.
      toast('Selecione o endereço e copie manualmente.', { icon: '📋' });
    }
  }

  function fechar() { setUrl(null); setExpira(null); setNome(''); onClose(); }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" onClick={fechar}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}>

        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-indigo-100 flex items-center justify-center">
              <Link2 size={17} className="text-indigo-600" />
            </div>
            <div>
              <h2 className="font-bold text-gray-900">Link de admissão</h2>
              <p className="text-xs text-gray-500">O colaborador preenche a própria ficha, sem login.</p>
            </div>
          </div>
          <button onClick={fechar} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"><X size={18} /></button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {!url ? (
            <>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                  Para quem é o link <span className="font-normal text-gray-400">(opcional)</span>
                </label>
                <input value={nome} onChange={e => setNome(e.target.value)}
                  placeholder="Ex.: Renata Alves"
                  className="input w-full text-sm" />
                <p className="text-[11px] text-gray-400 mt-1">
                  Só para você saber de quem é o link antes de a pessoa preencher.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">O link vale por</label>
                <div className="grid grid-cols-4 gap-2">
                  {HORAS.map(o => (
                    <button key={o.h} onClick={() => setHoras(o.h)}
                      className={`py-2 rounded-lg text-sm font-medium border transition-colors ${
                        horas === o.h
                          ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}>
                      {o.l}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-gray-400 mt-1.5">
                  Depois do prazo o endereço para de abrir. Quem preencher no meio do caminho
                  e não enviar perde o que digitou — vale avisar.
                </p>
              </div>

              <button onClick={gerar} disabled={gerando}
                className="btn-primary w-full justify-center disabled:opacity-50">
                {gerando ? <Loader2 size={15} className="animate-spin" /> : <Link2 size={15} />}
                Gerar o link
              </button>
            </>
          ) : (
            <>
              <div className="px-3 py-2.5 rounded-lg bg-green-50 border border-green-200">
                <p className="text-sm font-semibold text-green-800 mb-0.5">Link criado</p>
                <p className="text-xs text-green-700">Vale até {dataHora(expira)}. Mande para a pessoa por WhatsApp ou e-mail.</p>
              </div>

              <div className="flex gap-2">
                <input readOnly value={url} onFocus={e => e.target.select()}
                  className="input flex-1 text-xs font-mono" />
                <button onClick={copiar} className="btn-secondary shrink-0">
                  {copiado ? <Check size={15} className="text-green-600" /> : <Copy size={15} />}
                </button>
              </div>

              <div className="flex gap-2">
                <button onClick={() => { setUrl(null); setNome(''); }} className="btn-secondary flex-1 justify-center text-sm">
                  Gerar outro
                </button>
                <button onClick={fechar} className="btn-primary flex-1 justify-center text-sm">Pronto</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// A aba Pendentes
// ────────────────────────────────────────────────────────────
const ROTULOS = {
  name: 'Nome', nome_social: 'Nome social', cpf_cnpj: 'CPF', birth_date: 'Nascimento',
  rg_ie: 'RG', rg_emissao: 'Emissão do RG', nacionalidade: 'Nacionalidade',
  estado_civil: 'Estado civil', genero: 'Gênero', mother_name: 'Nome da mãe',
  father_name: 'Nome do pai', pis: 'PIS', ctps_numero: 'CTPS', ctps_serie: 'Série da CTPS',
  ctps_uf: 'UF da CTPS', titulo_eleitor: 'Título de eleitor', reservista: 'Reservista',
  cnh: 'CNH', cnh_categoria: 'Categoria da CNH', email: 'E-mail', phone: 'Telefone',
  mobile: 'Celular', whatsapp_notificacoes: 'WhatsApp',
  conjuge_nome: 'Cônjuge', conjuge_cpf: 'CPF do cônjuge',
  conjuge_nascimento: 'Nascimento do cônjuge', conjuge_telefone: 'Telefone do cônjuge',
  banco: 'Banco', agencia: 'Agência', conta: 'Conta', tipo_conta: 'Tipo de conta',
  pix: 'PIX', titular_conta: 'Titular da conta',
};

function FichaRecebida({ id }) {
  const { data, isLoading } = useQuery({
    queryKey: ['convite-ficha', id],
    queryFn: () => api.get(`/hr/convites/${id}`),
  });

  if (isLoading) return <div className="px-4 py-4 text-sm text-gray-400 flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Carregando a ficha…</div>;

  const d = data?.dados || {};
  const end = d.address || {};
  const linhas = Object.entries(ROTULOS).filter(([k]) => d[k]);

  return (
    <div className="px-4 py-4 bg-gray-50 border-t border-gray-100">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-1.5">
        {linhas.map(([k, rotulo]) => (
          <div key={k} className="flex gap-2 text-sm">
            <span className="text-gray-500 shrink-0">{rotulo}:</span>
            <span className="text-gray-900 font-medium break-words">{String(d[k])}</span>
          </div>
        ))}
      </div>

      {(end.street || end.city) && (
        <p className="mt-3 text-sm">
          <span className="text-gray-500">Endereço: </span>
          <span className="text-gray-900 font-medium">
            {[[end.street, end.number].filter(Boolean).join(', '), end.complement, end.neighborhood,
              [end.city, end.state].filter(Boolean).join('/'), end.zip].filter(Boolean).join(' · ')}
          </span>
        </p>
      )}

      {Array.isArray(d.filhos) && d.filhos.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-semibold text-gray-600 mb-1">Filhos ({d.filhos.length})</p>
          {d.filhos.map((fi, i) => (
            <p key={i} className="text-sm text-gray-800">
              {fi.nome || 'Sem nome'}{fi.nascimento ? ` · ${fi.nascimento.split('-').reverse().join('/')}` : ''}
              {fi.cpf ? ` · CPF ${fi.cpf}` : ''}
            </p>
          ))}
        </div>
      )}

      {!linhas.length && <p className="text-sm text-gray-400">A ficha chegou vazia.</p>}
    </div>
  );
}

export function ListaPendentes() {
  const qc = useQueryClient();
  const [aberto, setAberto] = useState(null);
  const [ocupado, setOcupado] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['convites', 'enviado,aberto'],
    queryFn: () => api.get('/hr/convites?status=enviado,aberto'),
  });

  const linhas = data?.data || [];
  const enviados = linhas.filter(c => c.status === 'enviado');
  const abertos  = linhas.filter(c => c.status === 'aberto');

  async function aprovar(c) {
    setOcupado(c.id);
    try {
      await api.post(`/hr/convites/${c.id}/aprovar`);
      toast.success(`${c.nome} virou colaborador.`);
      qc.invalidateQueries(['convites']);
      qc.invalidateQueries(['employees']);
    } catch (e) { toast.error(e.error || 'Não foi possível aprovar.'); }
    finally { setOcupado(null); }
  }

  async function recusar(c) {
    const motivo = window.prompt(`O que ${c.nome} precisa corrigir?\n\nEla vai ler exatamente este texto ao reabrir o link.`);
    if (motivo === null) return;
    setOcupado(c.id);
    try {
      const r = await api.post(`/hr/convites/${c.id}/recusar`, { motivo });
      toast.success(r.prazo_renovado ? 'Devolvido, com mais 24 horas de prazo.' : 'Devolvido para correção.');
      qc.invalidateQueries(['convites']);
    } catch (e) { toast.error(e.error || 'Não foi possível recusar.'); }
    finally { setOcupado(null); }
  }

  async function cancelar(c) {
    if (!window.confirm('Cancelar este link? Quem tiver o endereço não vai mais conseguir abrir.')) return;
    setOcupado(c.id);
    try {
      await api.post(`/hr/convites/${c.id}/cancelar`);
      qc.invalidateQueries(['convites']);
    } catch (e) { toast.error(e.error || 'Não foi possível cancelar.'); }
    finally { setOcupado(null); }
  }

  if (isLoading) return <div className="py-12 text-center text-sm text-gray-400">Carregando…</div>;

  if (!linhas.length) return (
    <div className="py-14 text-center">
      <Send size={26} className="mx-auto mb-2 text-gray-300" />
      <p className="text-sm text-gray-500">Nenhuma ficha pendente.</p>
      <p className="text-xs text-gray-400 mt-1">Gere um link de admissão para o colaborador preencher a ficha dele.</p>
    </div>
  );

  return (
    <div className="divide-y divide-gray-100">

      {enviados.map(c => (
        <div key={c.id}>
          <div className="px-4 py-3 flex flex-wrap items-center gap-3">
            <button onClick={() => setAberto(a => a === c.id ? null : c.id)}
              className="flex items-center gap-2 min-w-0 flex-1 text-left">
              {aberto === c.id ? <ChevronUp size={15} className="text-gray-400 shrink-0" /> : <ChevronDown size={15} className="text-gray-400 shrink-0" />}
              <div className="min-w-0">
                <p className="font-medium text-gray-900 text-sm truncate">{c.nome}</p>
                <p className="text-xs text-gray-400">Enviada em {dataHora(c.submitted_at)}</p>
              </div>
            </button>

            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 shrink-0">
              Aguardando conferência
            </span>

            <div className="flex gap-2 shrink-0">
              <button onClick={() => recusar(c)} disabled={ocupado === c.id}
                className="btn-secondary text-xs disabled:opacity-50">
                <UserX size={13} /> Devolver
              </button>
              <button onClick={() => aprovar(c)} disabled={ocupado === c.id}
                className="btn-primary text-xs disabled:opacity-50">
                {ocupado === c.id ? <Loader2 size={13} className="animate-spin" /> : <UserCheck size={13} />}
                Aprovar
              </button>
            </div>
          </div>
          {aberto === c.id && <FichaRecebida id={c.id} />}
        </div>
      ))}

      {abertos.length > 0 && (
        <div className="px-4 py-2.5 bg-gray-50">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Links enviados, ainda sem resposta
          </p>
        </div>
      )}

      {abertos.map(c => (
        <div key={c.id} className="px-4 py-3 flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-medium text-gray-700 text-sm truncate">{c.nome}</p>
            <p className="text-xs text-gray-400 flex items-center gap-1">
              <Clock size={11} />
              {c.expirado ? 'Expirou em' : 'Vale até'} {dataHora(c.expires_at)}
              {c.motivo_recusa && ' · devolvido para correção'}
            </p>
          </div>

          {c.expirado
            ? <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 shrink-0">Expirado</span>
            : <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 shrink-0">Aguardando a pessoa</span>}

          <div className="flex gap-2 shrink-0">
            {!c.expirado && c.url && (
              <button onClick={() => { navigator.clipboard?.writeText(c.url); toast.success('Link copiado'); }}
                className="btn-secondary text-xs"><Copy size={13} /> Copiar</button>
            )}
            <button onClick={() => cancelar(c)} disabled={ocupado === c.id}
              className="btn-ghost text-xs text-red-600 disabled:opacity-50"><Ban size={13} /></button>
          </div>
        </div>
      ))}
    </div>
  );
}
