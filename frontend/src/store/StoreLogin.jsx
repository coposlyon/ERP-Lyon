import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { User, ArrowRight, Loader2 } from 'lucide-react';
import storeApi from './storeApi';
import { useStoreAuth } from './StoreAuthContext';

function maskCPF(v) {
  return String(v || '').replace(/\D/g, '').slice(0, 11)
    .replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}

export default function StoreLogin() {
  const { login } = useStoreAuth();
  const navigate = useNavigate();
  const [cpf, setCpf] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  async function submit(e) {
    e.preventDefault();
    setErr('');
    const digits = cpf.replace(/\D/g, '');
    if (digits.length !== 11) { setErr('Digite seu CPF completo (11 dígitos).'); return; }
    setLoading(true);
    try {
      const res = await storeApi.post('/login', { cpf: digits });
      login(res.customer);
      navigate('/loja');
    } catch (e) {
      setErr(e?.response?.data?.error || 'CPF não encontrado. Faça seu cadastro primeiro.');
    } finally { setLoading(false); }
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl ring-1 ring-gray-100 p-8 st-rise">
        <div className="w-14 h-14 rounded-2xl bg-orange-500 flex items-center justify-center mx-auto mb-5 st-pulse">
          <User size={26} className="text-white" />
        </div>
        <h1 className="text-2xl font-black text-center text-gray-900">Entrar na loja</h1>
        <p className="text-center text-gray-500 text-sm mt-2 mb-7">
          Use o seu CPF para acessar seus pedidos e finalizar suas compras.
        </p>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wide">CPF</label>
            <input
              value={cpf}
              onChange={e => setCpf(maskCPF(e.target.value))}
              inputMode="numeric"
              autoFocus
              placeholder="000.000.000-00"
              className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:border-orange-500 focus:ring-2 focus:ring-orange-200 outline-none text-lg font-semibold tracking-wide"
            />
          </div>
          {err && <p className="text-sm text-red-600 font-medium">{err}</p>}
          <button type="submit" disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-bold py-3 rounded-xl transition-all hover:scale-[1.02] shadow-lg shadow-orange-500/25">
            {loading ? <Loader2 size={18} className="animate-spin" /> : <>Entrar <ArrowRight size={18} /></>}
          </button>
        </form>
        <p className="text-center text-sm text-gray-500 mt-6">
          Ainda não tem cadastro?{' '}
          <Link to="/cadastro" className="text-orange-600 font-bold hover:underline">Cadastre-se aqui</Link>
        </p>
      </div>
    </div>
  );
}
