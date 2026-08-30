// ============================================================
// A FICHA DE ADMISSÃO PELO LINK — a tela de quem está sendo contratado.
//
// Sem login, do celular, uma vez só. Quem chega aqui não conhece o
// sistema e não vai voltar nele: a tela tem que se explicar sozinha.
//
// REAPROVEITA O PASSO `DadosPessoais` DO CADASTRO DO RH, e isso não é
// economia de código — é garantia de que os dois lados perguntam a
// MESMA coisa. Um formulário paralelo divergiria no primeiro campo que
// o RH acrescentasse, e a ficha começaria a chegar incompleta sem
// ninguém notar.
//
// O QUE ESTA TELA NÃO PERGUNTA: salário, cargo, departamento, escala,
// benefícios, data de admissão, acesso ao sistema. Isso é da empresa,
// não do candidato — e o servidor descarta esses campos mesmo que
// alguém os mande na mão (lib/conviteAdmissao.js, lista branca).
// ============================================================
import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import toast, { Toaster } from 'react-hot-toast';
import { Loader2, CheckCircle2, AlertTriangle, Send, Clock, Briefcase } from 'lucide-react';
import { DadosPessoais } from '@/pages/Employees/passos';
import { soDigitos, cpfValido } from '@/pages/Employees/campos';

const VAZIO = {
  name: '', nome_social: '', cpf_cnpj: '', birth_date: '', rg_ie: '', rg_emissao: '',
  nacionalidade: 'Brasileira', estado_civil: '', genero: '', mother_name: '', father_name: '',
  conjuge_nome: '', conjuge_cpf: '', conjuge_nascimento: '', conjuge_telefone: '',
  filhos: [],
  email: '', phone: '', mobile: '',
  address: { street: '', number: '', complement: '', neighborhood: '', city: '', state: '', zip: '' },
  banco: '', agencia: '', conta: '', tipo_conta: '', pix: '', titular_conta: '',
  pis: '', ctps_numero: '', ctps_serie: '', ctps_uf: '', titulo_eleitor: '', reservista: '',
  cnh: '', cnh_categoria: '',
};

export default function AdmissaoConvite() {
  const { token } = useParams();
  const [estado, setEstado] = useState('carregando'); // carregando | aberto | enviado | erro
  const [erro, setErro] = useState('');
  const [motivoRecusa, setMotivoRecusa] = useState(null);
  const [expiraEm, setExpiraEm] = useState(null);
  const [f, setF] = useState(VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [buscandoCep, setBuscandoCep] = useState(false);

  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const setEndereco = (k, v) => setF(p => ({ ...p, address: { ...p.address, [k]: v } }));

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`/api/admissao/${token}`);
        const d = await r.json();
        if (!r.ok) { setErro(d.error || 'Link inválido.'); setEstado('erro'); return; }
        setExpiraEm(d.expires_at);
        setMotivoRecusa(d.motivo_recusa || null);
        // Quando o RH pediu correção, a ficha volta preenchida: obrigar
        // a pessoa a digitar tudo de novo por um dígito de CPF seria
        // punir quem já colaborou.
        if (d.dados) setF(p => ({ ...p, ...d.dados, address: { ...p.address, ...(d.dados.address || {}) } }));
        setEstado('aberto');
      } catch {
        setErro('Não foi possível abrir este link. Verifique a sua conexão.');
        setEstado('erro');
      }
    })();
  }, [token]);

  // A mesma busca de CEP do cadastro do RH. `/api/cep` é público.
  async function buscarCep(cep) {
    const limpo = soDigitos(cep);
    if (limpo.length !== 8) return;
    setBuscandoCep(true);
    try {
      const r = await fetch(`/api/cep/${limpo}`);
      const d = await r.json();
      if (!r.ok) { toast.error(d.error || 'CEP não encontrado'); return; }
      setF(p => ({ ...p, address: { ...p.address,
        street: (d.street || p.address.street || '').toUpperCase(),
        neighborhood: (d.neighborhood || p.address.neighborhood || '').toUpperCase(),
        city: (d.city || p.address.city || '').toUpperCase(),
        state: d.state || p.address.state || '',
      } }));
    } catch { toast.error('Não foi possível buscar o CEP'); }
    finally { setBuscandoCep(false); }
  }

  async function enviar() {
    if (!f.name.trim())  return toast.error('Informe o seu nome completo.');
    if (!f.cpf_cnpj)     return toast.error('Informe o seu CPF.');
    if (!cpfValido(f.cpf_cnpj)) return toast.error('Esse CPF não confere. Verifique os números.');
    if (!f.birth_date)   return toast.error('Informe a sua data de nascimento.');

    setSalvando(true);
    try {
      const r = await fetch(`/api/admissao/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dados: f }),
      });
      const d = await r.json();
      if (!r.ok) { toast.error(d.error || 'Não foi possível enviar.'); return; }
      setEstado('enviado');
    } catch { toast.error('Não foi possível enviar. Verifique a sua conexão.'); }
    finally { setSalvando(false); }
  }

  const prazo = expiraEm
    ? new Date(expiraEm).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div className="min-h-screen bg-gray-50">
      <Toaster position="top-center" />

      <div className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center shrink-0">
            <Briefcase size={19} className="text-indigo-600" />
          </div>
          <div className="min-w-0">
            <h1 className="font-bold text-gray-900">Ficha de admissão · Lyon Copos</h1>
            <p className="text-xs text-gray-500">
              {estado === 'aberto' && prazo ? <>Preencha com calma. Este link vale até {prazo}.</> : 'Lyon Copos Acrílicos'}
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6">

        {estado === 'carregando' && (
          <div className="flex items-center justify-center gap-2 py-20 text-gray-400">
            <Loader2 size={18} className="animate-spin" /> Abrindo a sua ficha…
          </div>
        )}

        {estado === 'erro' && (
          <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
            <AlertTriangle size={32} className="mx-auto mb-3 text-amber-500" />
            <p className="font-semibold text-gray-900 mb-1">Não foi possível abrir</p>
            <p className="text-sm text-gray-600">{erro}</p>
          </div>
        )}

        {estado === 'enviado' && (
          <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
            <CheckCircle2 size={36} className="mx-auto mb-3 text-green-500" />
            <p className="font-bold text-gray-900 text-lg mb-1">Ficha enviada!</p>
            <p className="text-sm text-gray-600 max-w-md mx-auto">
              O RH da Lyon vai conferir os seus dados. Se faltar alguma coisa, eles entram em
              contato pelo telefone ou e-mail que você informou. Pode fechar esta página.
            </p>
          </div>
        )}

        {estado === 'aberto' && (
          <>
            {/* Recusa vem primeiro: é o motivo de a pessoa estar aqui de novo. */}
            {motivoRecusa && (
              <div className="mb-4 flex items-start gap-2.5 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200">
                <AlertTriangle size={17} className="text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-amber-800">O RH pediu uma correção</p>
                  <p className="text-sm text-amber-700 whitespace-pre-wrap">{motivoRecusa}</p>
                </div>
              </div>
            )}

            <div className="mb-4 flex items-start gap-2.5 px-4 py-3 rounded-xl bg-blue-50 border border-blue-200">
              <Clock size={17} className="text-blue-600 shrink-0 mt-0.5" />
              <p className="text-sm text-blue-800">
                Preencha os seus dados pessoais. <b>Salário, cargo e data de admissão são
                preenchidos pela empresa</b> — aqui é só a sua parte. Você envia uma vez;
                depois disso, quem ajusta é o RH.
              </p>
            </div>

            <div className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-6">
              <DadosPessoais f={f} set={set} setEndereco={setEndereco}
                buscandoCep={buscandoCep} buscarCep={buscarCep} />
            </div>

            <div className="mt-4 flex flex-col sm:flex-row items-center justify-end gap-3">
              <p className="text-xs text-gray-500 sm:mr-auto">
                Confira o CPF e a data de nascimento antes de enviar.
              </p>
              <button onClick={enviar} disabled={salvando}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 text-white font-semibold disabled:opacity-50">
                {salvando ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                Enviar a minha ficha
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
