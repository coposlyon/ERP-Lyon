import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Fingerprint, MapPin, LogOut, Clock, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

function getGeo() {
  return new Promise(resolve => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  });
}

export default function MarcacaoPonto() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [now, setNow] = useState(new Date());
  const [punching, setPunching] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const { data, isLoading, error } = useQuery({
    queryKey: ['me-ponto'],
    queryFn: () => api.get('/me/ponto'),
    retry: false,
  });

  const punchMut = useMutation({
    mutationFn: geo => api.post('/me/ponto/punch', geo || {}),
    onSuccess: res => {
      toast.success(`Ponto registrado às ${res.time}!`);
      qc.setQueryData(['me-ponto'], old => old ? { ...old, marks: res.marks } : old);
    },
    onError: e => toast.error(e.error || 'Erro ao registrar ponto'),
    onSettled: () => setPunching(false),
  });

  async function punch() {
    setPunching(true);
    const geo = await getGeo();
    punchMut.mutate(geo);
  }

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  const marks = data?.marks || [];
  const nextType = marks.length % 2 === 0 ? 'Entrada' : 'Saída';
  const timeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const dateStr = now.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-700 to-violet-900 flex flex-col items-center justify-between p-6 text-white">
      {/* Topo */}
      <div className="w-full max-w-md flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Fingerprint size={22} />
          <span className="font-semibold">Ponto Eletrônico</span>
        </div>
        <button onClick={handleLogout} className="text-indigo-200 hover:text-white flex items-center gap-1 text-sm">
          <LogOut size={15} /> Sair
        </button>
      </div>

      {/* Centro */}
      <div className="w-full max-w-md flex flex-col items-center text-center">
        {isLoading ? (
          <Loader2 size={32} className="animate-spin text-indigo-200" />
        ) : error ? (
          <div className="bg-white/10 rounded-2xl p-6 backdrop-blur">
            <AlertCircle size={32} className="mx-auto mb-2 text-amber-300" />
            <p className="text-sm text-indigo-100">
              {error?.error || 'Seu acesso não está vinculado a um colaborador.'}
            </p>
            <p className="text-xs text-indigo-300 mt-2">
              Peça ao RH para cadastrar você como colaborador com este mesmo e-mail.
            </p>
          </div>
        ) : (
          <>
            <p className="text-indigo-200 text-sm">{data?.employee?.name}</p>
            {data?.employee?.sector && <p className="text-indigo-300 text-xs">{data.employee.sector}</p>}

            <div className="my-6">
              <p className="text-6xl font-bold tracking-tight tabular-nums">{timeStr}</p>
              <p className="text-indigo-200 text-sm capitalize mt-1">{dateStr}</p>
            </div>

            {/* Botão bater ponto */}
            <button
              onClick={punch}
              disabled={punching}
              className="w-44 h-44 rounded-full bg-white text-indigo-700 shadow-2xl flex flex-col items-center justify-center font-bold text-lg active:scale-95 transition-transform disabled:opacity-70">
              {punching ? (
                <Loader2 size={40} className="animate-spin" />
              ) : (
                <>
                  <Fingerprint size={48} className="mb-1" />
                  <span>Registrar</span>
                  <span className="text-sm font-medium text-indigo-400">{nextType}</span>
                </>
              )}
            </button>

            <div className="flex items-center gap-1 text-xs text-indigo-300 mt-3">
              <MapPin size={12} /> A localização é registrada com a marcação
            </div>
          </>
        )}
      </div>

      {/* Marcações de hoje */}
      <div className="w-full max-w-md">
        {marks.length > 0 ? (
          <div className="bg-white/10 rounded-2xl p-4 backdrop-blur">
            <p className="text-xs text-indigo-200 mb-2 flex items-center gap-1">
              <Clock size={13} /> Marcações de hoje
            </p>
            <div className="flex flex-wrap gap-2">
              {marks.map((m, i) => (
                <span key={m.id} className="bg-white/15 rounded-lg px-3 py-1.5 text-sm font-mono flex items-center gap-1.5">
                  <CheckCircle2 size={13} className="text-green-300" />
                  {m.time}
                  <span className="text-indigo-300 text-xs">{i % 2 === 0 ? 'ent' : 'saí'}</span>
                </span>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-center text-indigo-300 text-xs">Nenhuma marcação registrada hoje</p>
        )}
      </div>
    </div>
  );
}
