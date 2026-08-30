// ============================================================
// A FICHA DO CLIENTE, dentro do pedido.
//
// O bloco "Cliente" da Tela 2 mostra seis linhas — nome, código,
// documento, telefone, e-mail e cidade. É o suficiente para saber de
// quem é o pedido, e não é o suficiente na hora de ligar: falta o
// endereço inteiro, o segundo telefone, o Instagram, a observação que
// alguém deixou no cadastro e — a mais importante — se o cliente está
// bloqueado.
//
// Este cartão é o resto. Abre pelo olho ao lado do nome e é SÓ LEITURA:
// quem edita cadastro é o Administrativo, na ficha do cliente. Um
// formulário aqui seria a segunda tela para o mesmo dado, e um dia as
// duas discordariam.
//
// Nada de custo, margem ou rateio — isso não é do cliente, e a rota do
// pedido nem consulta.
// ============================================================
import {
  User, Building2, IdCard, Hash, Cake, Phone, Smartphone, Mail, Instagram,
  MapPin, Wallet, Star, History, StickyNote, CalendarPlus, Ban, CircleSlash,
} from 'lucide-react';
import Modal from '@/components/UI/Modal';
import { fmtBRL, fmtUn, fmtDate } from './ui';

const id4 = n => (n == null ? '—' : String(n).padStart(4, '0'));

const dataHora = iso => (iso
  ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
  : '—');

/** Idade em anos completos — o "(38 anos)" ao lado do nascimento. */
function idadeAnos(iso) {
  if (!iso) return null;
  const nasc = new Date(iso);
  if (Number.isNaN(nasc.getTime())) return null;
  const hoje = new Date();
  let anos = hoje.getFullYear() - nasc.getFullYear();
  const m = hoje.getMonth() - nasc.getMonth();
  if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) anos--;
  return anos >= 0 && anos < 130 ? anos : null;
}

/**
 * @param {object|null} cliente  O CLIENTES do pedido (null fecha o cartão).
 * @param {string|null} codigo   O código do cliente já formatado no pedido.
 * @param {object|null} resumo   O `resumo_cliente` da rota, quando existe.
 */
export default function ClienteFichaModal({ cliente, codigo, resumo, onClose }) {
  if (!cliente) return null;

  const pj = cliente.type === 'PJ';
  const colaborador = cliente.type === 'CO';
  const end = cliente.address || {};
  const temEndereco = end.street || end.zip || end.city;
  const idade = idadeAnos(cliente.birth_date);

  return (
    <Modal isOpen onClose={onClose} title="Ficha do Cliente" size="md">
      <div className="space-y-4">

        {/* ── Quem é ──────────────────────────────────────────── */}
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
            {pj ? <Building2 size={20} className="text-blue-600" /> : <User size={20} className="text-blue-600" />}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-gray-900 leading-tight break-words">
              {cliente.name || 'Consumidor final'}
            </p>
            {cliente.nome_fantasia && (
              <p className="text-xs text-gray-500 break-words">{cliente.nome_fantasia}</p>
            )}
            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
              <Selo cor="gray">
                <Hash size={10} /> {codigo || id4(cliente.display_id)}
              </Selo>
              <Selo cor="gray">
                {colaborador ? 'Colaborador' : pj ? 'Pessoa Jurídica' : 'Pessoa Física'}
              </Selo>
              {cliente.rating >= 4 && (
                <Selo cor="blue"><Star size={10} /> Cliente Verificado</Selo>
              )}
              {/* Bloqueado e inativo são o que muda a conversa: quem abre
                  a ficha antes de ligar precisa ver isso primeiro. */}
              {cliente.blocked && <Selo cor="red"><Ban size={10} /> Bloqueado</Selo>}
              {cliente.is_active === false && <Selo cor="amber"><CircleSlash size={10} /> Inativo</Selo>}
            </div>
          </div>
        </div>

        {cliente.blocked && cliente.block_reason && (
          <p className="text-xs bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-gray-700">
            <b>Motivo do bloqueio:</b> {cliente.block_reason}
          </p>
        )}

        {/* ── Documentos ──────────────────────────────────────── */}
        <Secao titulo="Identificação">
          <Linha Icon={IdCard} rotulo={pj ? 'CNPJ' : 'CPF'} valor={cliente.cpf_cnpj || '—'} />
          {cliente.rg_ie && <Linha Icon={IdCard} rotulo={pj ? 'Inscrição estadual' : 'RG'} valor={cliente.rg_ie} />}
          {cliente.birth_date && (
            <Linha Icon={Cake} rotulo="Nascimento"
              valor={`${fmtDate(cliente.birth_date)}${idade != null ? ` (${idade} anos)` : ''}`} />
          )}
          {cliente.created_at && (
            <Linha Icon={CalendarPlus} rotulo="Cadastro" valor={dataHora(cliente.created_at)} />
          )}
        </Secao>

        {/* ── Contato ─────────────────────────────────────────── */}
        <Secao titulo="Contato">
          <Linha Icon={Phone}      rotulo="Telefone"  valor={cliente.phone || '—'} />
          <Linha Icon={Smartphone} rotulo="Celular"   valor={cliente.mobile || '—'} />
          <Linha Icon={Mail}       rotulo="E-mail"    valor={cliente.email || '—'} quebra />
          {cliente.instagram && (
            <Linha Icon={Instagram} rotulo="Instagram"
              valor={`@${String(cliente.instagram).replace(/^@/, '')}`} />
          )}
        </Secao>

        {/* ── Endereço ────────────────────────────────────────── */}
        {temEndereco && (
          <Secao titulo="Endereço">
            <div className="flex gap-2 text-sm text-gray-700 leading-relaxed">
              <MapPin size={14} className="text-gray-400 mt-0.5 shrink-0" />
              <div className="min-w-0">
                {end.street && <p>{end.street}{end.number ? `, ${end.number}` : ''}</p>}
                {end.complement && <p>Complemento: {end.complement}</p>}
                {end.neighborhood && <p>Bairro: {end.neighborhood}</p>}
                {(end.city || end.state) && <p>{end.city}{end.state ? `/${end.state}` : ''}</p>}
                {end.zip && <p className="text-xs text-gray-400">CEP {end.zip}</p>}
              </div>
            </div>
          </Secao>
        )}

        {/* ── Comercial ───────────────────────────────────────── */}
        <Secao titulo="Comercial">
          <Linha Icon={User}   rotulo="Vendedor responsável" valor={cliente.vendedor || '—'} />
          <Linha Icon={Wallet} rotulo="Limite de crédito"
            valor={cliente.credit_limit != null ? fmtBRL(cliente.credit_limit) : '—'} />
          <Linha Icon={Star}   rotulo="Classificação"
            valor={cliente.rating ? `${cliente.rating} de 5` : '—'} />
        </Secao>

        {/* ── O histórico, os mesmos números do bloco lateral ──
            Repetido aqui de propósito e SÓ AQUI em forma de leitura:
            quem abre a ficha para ligar não devia ter que fechar o
            cartão para saber se é a primeira compra ou a décima. */}
        {resumo && (
          <Secao titulo="Histórico de compras" Icon={History}>
            <Linha rotulo="Total de compras"     valor={fmtUn(resumo.total_compras)} />
            <Linha rotulo="Pedidos entregues"    valor={fmtUn(resumo.entregues)} />
            <Linha rotulo="Pedidos em andamento" valor={fmtUn(resumo.em_andamento)} />
            <Linha rotulo="Última compra"        valor={resumo.ultima_compra ? fmtDate(resumo.ultima_compra) : '—'} />
            <Linha rotulo="Ticket médio"         valor={fmtBRL(resumo.ticket_medio)} />
          </Secao>
        )}

        {/* ── Observações do cadastro ─────────────────────────── */}
        {cliente.notes && (
          <Secao titulo="Observações" Icon={StickyNote}>
            <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">{cliente.notes}</p>
          </Secao>
        )}
      </div>
    </Modal>
  );
}

// ── Peças pequenas ───────────────────────────────────────────
function Secao({ titulo, Icon, children }) {
  return (
    <div className="border-t border-gray-100 pt-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2 flex items-center gap-1.5">
        {Icon && <Icon size={12} />} {titulo}
      </p>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Linha({ Icon, rotulo, valor, quebra }) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <span className="flex items-center gap-1.5 shrink-0 text-gray-500">
        {Icon && <Icon size={13} className="text-gray-400" />} {rotulo}:
      </span>
      <span className={`text-right text-gray-800 min-w-0 ${quebra ? 'break-all' : 'break-words'}`}>{valor}</span>
    </div>
  );
}

const CORES = {
  gray:  'bg-gray-100 text-gray-600',
  blue:  'bg-blue-100 text-blue-700',
  red:   'bg-red-100 text-red-700',
  amber: 'bg-yellow-100 text-yellow-700',
};

function Selo({ cor = 'gray', children }) {
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full ${CORES[cor]}`}>
      {children}
    </span>
  );
}
