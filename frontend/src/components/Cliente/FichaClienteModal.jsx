// ============================================================
// A FICHA DO CLIENTE, SEM SAIR DE ONDE VOCÊ ESTÁ.
//
// Para ver o telefone de um cliente enquanto se olha um pedido, o
// caminho era abrir a tela dele — perdendo a lista, os filtros e a
// posição da rolagem —, olhar uma linha e voltar. Quem confere dez
// pedidos fazia isso dez vezes.
//
// Este é o olho ao lado do nome. Abre por cima, mostra o cadastro
// inteiro e fecha. A tela completa (/customers/:id) continua existindo
// e é para onde se vai para EDITAR; aqui é só consulta, e tem o botão
// que leva até lá.
//
// UM COMPONENTE, DOIS LUGARES. Ele é usado na lista de Clientes e na de
// Pedidos de Venda, porque a pergunta é a mesma nas duas ("quem é esse
// cliente?"). Duas cópias divergiriam na primeira vez que um campo
// novo entrasse no cadastro.
// ============================================================
import { useQuery } from '@tanstack/react-query';
import { createPortal } from 'react-dom';
import {
  X, User, Building2, Phone, Mail, MapPin, CreditCard, Instagram,
  AlertTriangle, Ban, Star, ExternalLink, Loader2, Cake, ShieldCheck,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '@/lib/api';

const fmtDoc = v => {
  const d = String(v || '').replace(/\D/g, '');
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  return v || '—';
};

const fmtData = v => {
  if (!v) return '—';
  const d = String(v).slice(0, 10).split('-');
  return d.length === 3 ? `${d[2]}/${d[1]}/${d[0]}` : v;
};

const brl = v => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0);

/** Endereço vira uma linha legível. `address` é jsonb e pode vir vazio. */
function enderecoEmLinha(a) {
  if (!a || typeof a !== 'object') return null;
  const rua = [a.street || a.logradouro, a.number || a.numero].filter(Boolean).join(', ');
  const comp = a.complement || a.complemento;
  const bairro = a.district || a.neighborhood || a.bairro;
  const cidade = [a.city || a.cidade, a.state || a.uf].filter(Boolean).join('/');
  const cep = a.zip || a.cep;
  const partes = [rua, comp, bairro, cidade, cep && `CEP ${cep}`].filter(Boolean);
  return partes.length ? partes.join(' · ') : null;
}

function Linha({ icone: Icone, rotulo, valor, destaque }) {
  if (valor === null || valor === undefined || valor === '' || valor === '—') return null;
  return (
    <div className="flex items-start gap-2.5 py-1.5">
      {Icone && <Icone size={14} className="text-gray-400 shrink-0 mt-0.5" />}
      <span className="text-xs text-gray-500 w-32 shrink-0">{rotulo}</span>
      <span className={`text-sm break-words ${destaque ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>{valor}</span>
    </div>
  );
}

export default function FichaClienteModal({ clienteId, onClose }) {
  const navigate = useNavigate();

  const { data: c, isLoading, error } = useQuery({
    queryKey: ['cliente-ficha', clienteId],
    queryFn: () => api.get(`/customers/${clienteId}`),
    enabled: !!clienteId,
  });

  if (!clienteId) return null;

  const endereco = enderecoEmLinha(c?.address);
  const ehPJ = c?.type === 'PJ';

  // Portal: a ficha abre de dentro de uma <tr>, e um modal preso ali
  // herdaria o overflow da tabela e apareceria cortado.
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-start sm:items-center justify-center p-3 sm:p-6 overflow-y-auto"
      onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      <div className="relative w-full max-w-2xl my-auto bg-white rounded-2xl shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}>

        {/* Cabeçalho */}
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
              {ehPJ ? <Building2 size={18} className="text-indigo-600" /> : <User size={18} className="text-indigo-600" />}
            </div>
            <div className="min-w-0">
              <h2 className="font-bold text-gray-900 truncate">{c?.name || 'Carregando…'}</h2>
              <p className="text-xs text-gray-500">
                {c?.display_id ? `Código ${String(c.display_id).padStart(4, '0')}` : ''}
                {c?.type ? ` · ${ehPJ ? 'Pessoa jurídica' : 'Pessoa física'}` : ''}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 shrink-0">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4 max-h-[65vh] overflow-y-auto">
          {isLoading && (
            <div className="flex items-center justify-center gap-2 py-10 text-gray-400">
              <Loader2 size={16} className="animate-spin" /> Carregando o cadastro…
            </div>
          )}

          {error && (
            <p className="py-8 text-center text-sm text-red-600">
              {error?.error || 'Não foi possível carregar este cliente.'}
            </p>
          )}

          {c && !isLoading && (
            <>
              {/* Os avisos vêm primeiro: quem abre a ficha antes de
                  vender precisa ver o bloqueio antes do telefone. */}
              {c.blocked && (
                <div className="flex items-start gap-2 mb-3 px-3 py-2 rounded-lg bg-red-50 border border-red-200">
                  <Ban size={15} className="text-red-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-red-700">Cliente bloqueado</p>
                    {c.block_reason && <p className="text-xs text-red-600">{c.block_reason}</p>}
                  </div>
                </div>
              )}
              {c.notes && String(c.notes).trim() && (
                <div className="flex items-start gap-2 mb-3 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200">
                  <AlertTriangle size={15} className="text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-800 whitespace-pre-wrap">{c.notes}</p>
                </div>
              )}

              <div className="divide-y divide-gray-50">
                <div className="pb-2">
                  <Linha icone={CreditCard} rotulo={ehPJ ? 'CNPJ' : 'CPF'} valor={fmtDoc(c.cpf_cnpj)} destaque />
                  <Linha rotulo={ehPJ ? 'Inscrição estadual' : 'RG'} valor={c.rg_ie} />
                  <Linha rotulo="Nome fantasia" valor={c.nome_fantasia} />
                  <Linha icone={Cake} rotulo="Nascimento" valor={fmtData(c.birth_date)} />
                </div>

                <div className="py-2">
                  <Linha icone={Phone} rotulo="Telefone" valor={c.phone} />
                  <Linha icone={Phone} rotulo="Celular" valor={c.mobile} />
                  <Linha icone={Mail} rotulo="E-mail" valor={c.email} />
                  <Linha icone={Instagram} rotulo="Instagram" valor={c.instagram} />
                </div>

                <div className="py-2">
                  <Linha icone={MapPin} rotulo="Endereço" valor={endereco} />
                </div>

                <div className="py-2">
                  <Linha rotulo="Vendedor" valor={c.vendedor} />
                  <Linha rotulo="Limite de crédito" valor={c.credit_limit ? brl(c.credit_limit) : null} />
                  <Linha rotulo="Prazo do boleto" valor={c.boleto_days ? `${c.boleto_days} dias` : null} />
                  <Linha icone={Star} rotulo="Avaliação"
                    valor={c.rating ? '★'.repeat(c.rating) + '☆'.repeat(Math.max(0, 5 - c.rating)) : null} />
                  <Linha icone={ShieldCheck} rotulo="Selo de confiança" valor={c.selo_confianca ? 'Sim' : null} />
                  <Linha rotulo="Situação" valor={c.is_active ? 'Ativo' : 'Inativo'} />
                  <Linha rotulo="Cadastrado em" valor={fmtData(c.created_at)} />
                </div>
              </div>
            </>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-gray-100 bg-gray-50">
          <span className="text-xs text-gray-400">Somente consulta — para alterar, abra o cadastro.</span>
          <div className="flex gap-2">
            <button onClick={onClose} className="btn-secondary text-sm">Fechar</button>
            <button onClick={() => { onClose(); navigate(`/customers/${clienteId}`); }}
              className="btn-primary text-sm">
              Abrir cadastro <ExternalLink size={13} />
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
