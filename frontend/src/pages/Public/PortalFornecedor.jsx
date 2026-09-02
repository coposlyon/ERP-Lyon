// ============================================================
// O PORTAL DO FORNECEDOR — a tela do link.
//
// Quem abre isto não tem conta no ERP e provavelmente está no celular,
// com o WhatsApp aberto do lado. A tela tem dois passos e nada mais:
//
//   1. quem é você      CNPJ e telefone do cadastro
//   2. o que você tem   um campo por item, a cotação em anexo
//
// TODO ITEM COMEÇA COM A QUANTIDADE PEDIDA JÁ PREENCHIDA. O caso comum
// é o fornecedor ter tudo, e obrigá-lo a redigitar dez números iguais
// aos da lista é o jeito mais rápido de ele desistir e responder por
// áudio no WhatsApp — que é exatamente o que esta tela existe para
// evitar. Quem não tem um item zera aquele campo.
//
// ZERO É RESPOSTA, e a tela diz isso em voz alta: "não tenho" é a
// informação mais importante daqui. Era ela que faltava quando o
// estoque dava baixa de caixas que nunca chegaram.
// ============================================================
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { Loader2, CheckCircle2, Package, Paperclip, ShieldCheck } from 'lucide-react';

// Sem o cliente do ERP de propósito: aquele injeta o token do usuário
// logado e redireciona para /login quando toma 401. Aqui não há usuário
// logado, e um 401 significa "CNPJ errado", não "sua sessão caiu".
const api = axios.create({ baseURL: '/api/fornecedor' });

const soDigitos = v => String(v || '').replace(/\D/g, '');

const mascaraCnpj = v => soDigitos(v).slice(0, 14)
  .replace(/^(\d{2})(\d)/, '$1.$2')
  .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
  .replace(/\.(\d{3})(\d)/, '.$1/$2')
  .replace(/(\d{4})(\d)/, '$1-$2');

const mascaraTel = v => soDigitos(v).slice(0, 11)
  .replace(/^(\d{2})(\d)/, '($1) $2')
  .replace(/(\d{5})(\d)/, '$1-$2');

export default function PortalFornecedor() {
  const { token } = useParams();

  const [cnpj, setCnpj] = useState('');
  const [telefone, setTelefone] = useState('');
  const [ficha, setFicha] = useState(null);      // o pedido, depois de entrar
  const [quantidades, setQuantidades] = useState({});
  const [cotacao, setCotacao] = useState(null);
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [pronto, setPronto] = useState(false);

  async function entrar(e) {
    e.preventDefault();
    setErro(''); setOcupado(true);
    try {
      const { data } = await api.post(`/${token}/entrar`, { cnpj, telefone });
      setFicha(data);
      // Cada item já vem com o que foi pedido — ver o comentário do topo.
      const inicial = {};
      for (const it of data.itens) inicial[it.linha] = String(it.pedido);
      setQuantidades(inicial);
    } catch (e2) {
      setErro(e2.response?.data?.error || 'Não consegui abrir. Confira os dados.');
    } finally {
      setOcupado(false);
    }
  }

  async function responder(e) {
    e.preventDefault();
    setErro(''); setOcupado(true);
    try {
      // FormData porque a cotação é arquivo. Sem arquivo ele também
      // funciona — anexo é opcional de propósito.
      const fd = new FormData();
      fd.append('cnpj', cnpj);
      fd.append('telefone', telefone);
      fd.append('itens', JSON.stringify(
        ficha.itens.map(it => ({ linha: it.linha, tem: Number(quantidades[it.linha]) || 0 })),
      ));
      if (cotacao) fd.append('cotacao', cotacao);

      await api.post(`/${token}/responder`, fd);
      setPronto(true);
    } catch (e2) {
      setErro(e2.response?.data?.error || 'Não consegui enviar. Tente de novo.');
    } finally {
      setOcupado(false);
    }
  }

  const caixa = 'w-full rounded-xl border border-gray-300 px-3 py-2.5 text-base focus:border-blue-500 focus:outline-none';

  return (
    <div className="min-h-screen bg-gray-50 flex justify-center px-4 py-8">
      <div className="w-full max-w-lg">

        <div className="text-center mb-6">
          <h1 className="text-xl font-bold text-gray-900">Lyon Copos Acrílicos</h1>
          <p className="text-sm text-gray-500 mt-1">Solicitação de reposição</p>
        </div>

        {/* ── FIM: respondeu e acabou ───────────────────────── */}
        {pronto ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-6 text-center">
            <CheckCircle2 size={40} className="mx-auto text-green-500 mb-3" />
            <p className="font-semibold text-gray-900">Resposta enviada!</p>
            <p className="text-sm text-gray-500 mt-2">
              A Lyon já está vendo o que você confirmou. Não precisa fazer mais nada —
              pode fechar esta página.
            </p>
          </div>

        /* ── PASSO 1: quem é você ────────────────────────── */
        ) : !ficha ? (
          <form onSubmit={entrar} className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <ShieldCheck size={18} className="text-blue-500 shrink-0" />
              <span>Confirme seus dados para ver a solicitação.</span>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">CNPJ</label>
              <input className={caixa} inputMode="numeric" placeholder="00.000.000/0000-00"
                value={cnpj} onChange={e => setCnpj(mascaraCnpj(e.target.value))} required />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Telefone cadastrado
              </label>
              <input className={caixa} inputMode="numeric" placeholder="(00) 00000-0000"
                value={telefone} onChange={e => setTelefone(mascaraTel(e.target.value))} required />
            </div>

            {erro && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{erro}</p>}

            <button type="submit" disabled={ocupado}
              className="w-full rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 disabled:opacity-50 flex items-center justify-center gap-2">
              {ocupado ? <Loader2 size={18} className="animate-spin" /> : <Package size={18} />}
              Ver a solicitação
            </button>
          </form>

        /* ── PASSO 2: o que você tem ─────────────────────── */
        ) : (
          <form onSubmit={responder} className="space-y-4">
            <div className="bg-white rounded-2xl border border-gray-200 p-5">
              <p className="font-semibold text-gray-900">{ficha.fornecedor}</p>
              {ficha.protocolo && (
                <p className="text-xs text-gray-400 mt-0.5">Controle {ficha.protocolo}</p>
              )}
              {ficha.ja_respondido && (
                <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mt-3">
                  Você já respondeu esta solicitação. Enviar de novo substitui a resposta anterior.
                </p>
              )}
            </div>

            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-2.5 border-b border-gray-100">
                <p className="text-sm font-semibold text-gray-700">O que você tem disponível?</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Já preenchemos com o que pedimos. <b>Se não tiver algum item, deixe zero</b> —
                  é assim que sabemos o que não vem.
                </p>
              </div>

              {ficha.itens.map(it => (
                <div key={it.linha} className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-0">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-800 break-words">{it.nome}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {it.codigo ? `${it.codigo} · ` : ''}pedimos {it.pedido}
                    </p>
                  </div>
                  <input type="number" min="0" max={it.pedido} inputMode="numeric"
                    className="w-24 rounded-lg border border-gray-300 px-2 py-2 text-center text-base focus:border-blue-500 focus:outline-none"
                    value={quantidades[it.linha] ?? ''}
                    onChange={e => setQuantidades(q => ({ ...q, [it.linha]: e.target.value }))} />
                </div>
              ))}
            </div>

            <div className="bg-white rounded-2xl border border-gray-200 p-4">
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                <Paperclip size={16} className="text-gray-400" /> Cotação (opcional)
              </label>
              <input type="file" accept=".pdf,image/*"
                onChange={e => setCotacao(e.target.files?.[0] || null)}
                className="block w-full text-sm text-gray-500 file:mr-3 file:rounded-lg file:border-0 file:bg-gray-100 file:px-3 file:py-2 file:text-sm file:font-medium" />
              <p className="text-xs text-gray-400 mt-1.5">
                PDF ou foto, até 8 MB. Pode enviar depois se preferir.
              </p>
            </div>

            {erro && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{erro}</p>}

            <button type="submit" disabled={ocupado}
              className="w-full rounded-xl bg-green-600 hover:bg-green-700 text-white font-semibold py-3 disabled:opacity-50 flex items-center justify-center gap-2">
              {ocupado ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
              Confirmar e enviar
            </button>
          </form>
        )}

        <p className="text-center text-xs text-gray-400 mt-6">
          Este link é pessoal da sua empresa. Não encaminhe.
        </p>
      </div>
    </div>
  );
}
