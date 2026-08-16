// ============================================================
// A janelinha da coluna Atenção.
//
// Responde três coisas de uma vez: qual é o problema, quem está com ele
// e quanto tempo resta. E oferece exatamente uma ação — comunicar o
// gerente. O vendedor não intervém no módulo do outro: ele avisa, e
// quem resolve é quem tem a caneta.
// ============================================================
import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { AlertTriangle, Siren, CheckCircle2, X, Send, Loader2, Clock } from 'lucide-react';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { useVend, fmtDate } from './ui';

const NIVEL = {
  normal:  { titulo: 'Situação normal',   cor: '#22c55e', Icon: CheckCircle2 },
  atencao: { titulo: 'Atenção',           cor: '#facc15', Icon: AlertTriangle },
  critico: { titulo: 'Atenção crítica',   cor: '#ef4444', Icon: Siren },
};

// "Tempo restante: 18 horas" — em dia, hora ou o atraso já acumulado.
function tempoRestante(horas) {
  if (horas == null) return 'sem prazo cadastrado';
  if (horas < 0) return `atrasado há ${Math.abs(Math.round(horas / 24)) || 1} dia(s)`;
  if (horas < 48) return `${horas} horas`;
  return `${Math.round(horas / 24)} dias`;
}

export default function AtencaoModal({ pedido, onClose, onComunicado }) {
  const v = useVend();
  const [motivo, setMotivo] = useState('');
  const [enviado, setEnviado] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['atencao', pedido?.id],
    queryFn: () => api.get(`/area-vendedor/pedidos/${pedido.id}/atencao`),
    enabled: !!pedido,
  });

  const comunicar = useMutation({
    mutationFn: () => api.post(`/area-vendedor/pedidos/${pedido.id}/comunicar`, { reason: motivo }),
    onSuccess: r => {
      setEnviado(true);
      toast.success(r.gerentes
        ? `Gerente avisado — o alerta também abriu para ${data?.atencao?.areaLabel || 'a área responsável'}`
        : 'Alerta registrado, mas não há gerente cadastrado para receber a mensagem');
      onComunicado?.();
    },
    onError: e => toast.error(e.error || 'Não foi possível comunicar o gerente'),
  });

  if (!pedido) return null;

  const at = data?.atencao;
  const n = NIVEL[at?.level] || NIVEL.normal;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-md" style={v.card}>
        <div className="flex items-start justify-between gap-3 px-5 py-4"
          style={{ borderBottom: `1px solid ${v.divider}` }}>
          <div className="flex items-center gap-3">
            <n.Icon size={22} style={{ color: n.cor }} />
            <div>
              <h2 className="text-lg font-bold" style={{ color: v.textPrimary }}>
                PV-{String(pedido.number).padStart(4, '0')}
              </h2>
              <p className="text-sm font-semibold" style={{ color: n.cor }}>{n.titulo}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:opacity-70" style={{ color: v.textMuted }}>
            <X size={18} />
          </button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-primary-600" />
          </div>
        ) : (
          <div className="px-5 py-4 space-y-2 text-sm">
            <Linha v={v} rotulo="Cliente"        valor={data?.pedido?.cliente || '—'} />
            <Linha v={v} rotulo="Problema atual" valor={at?.areaLabel || '—'} cor={n.cor} />
            <Linha v={v} rotulo="Etapa atual"    valor={at?.stage || '—'} />
            <Linha v={v} rotulo="Prazo previsto de saída"
              valor={at?.due_date ? fmtDate(at.due_date) : 'não cadastrado'} />
            <Linha v={v} rotulo="Tempo restante" valor={tempoRestante(at?.hours_left)}
              cor={at?.level === 'critico' ? '#f87171' : undefined} />
            <Linha v={v} rotulo="Última atualização"
              valor={data?.atualizado_em
                ? new Date(data.atualizado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
                : '—'} />

            {at?.reason && (
              <p className="rounded-lg px-3 py-2 text-[13px] mt-1"
                style={{ background: v.surface, color: v.textMuted }}>
                {at.reason}
              </p>
            )}

            {data?.alerta && (
              <p className="text-[11px] flex items-start gap-1.5" style={{ color: '#fbbf24' }}>
                <Clock size={12} className="shrink-0 mt-0.5" />
                Já existe um alerta aberto, levantado por {data.alerta.raised_name} em{' '}
                {new Date(data.alerta.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}.
              </p>
            )}

            {at?.level === 'normal' && (
              <p className="text-[12px] pt-1" style={{ color: v.textSubtle }}>
                Nada a fazer neste pedido agora. Se mesmo assim houver algo estranho, avise o gerente.
              </p>
            )}

            {/* Comunicar Gerente */}
            {enviado ? (
              <p className="rounded-lg px-3 py-2 text-[13px] mt-2"
                style={{ background: 'rgba(34,197,94,0.12)', color: '#4ade80' }}>
                Gerente avisado. O mesmo alerta aparece agora na tela de {at?.areaLabel}.
              </p>
            ) : (
              <div className="pt-2 space-y-2">
                <textarea rows={2} value={motivo} onChange={e => setMotivo(e.target.value)}
                  placeholder="O que está acontecendo? (opcional)"
                  style={{ ...v.control, width: '100%', resize: 'none' }} />
                <button onClick={() => comunicar.mutate()} disabled={comunicar.isPending}
                  className="btn-primary w-full">
                  {comunicar.isPending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                  Comunicar Gerente
                </button>
                <p className="text-[10px] text-center" style={{ color: v.textSubtle }}>
                  O gerente recebe a mensagem e o alerta abre para {at?.areaLabel || 'a área responsável'}.
                  Você não altera o pedido por aqui.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Linha({ v, rotulo, valor, cor }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span style={{ color: v.textMuted }}>{rotulo}:</span>
      <span className="font-semibold text-right" style={{ color: cor || v.textPrimary }}>{valor}</span>
    </div>
  );
}
