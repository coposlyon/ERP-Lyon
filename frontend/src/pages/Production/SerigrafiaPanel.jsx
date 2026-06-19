import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Plus, Loader2, Layers, Droplets } from 'lucide-react';
import api from '@/lib/api';
import Modal from '@/components/UI/Modal';
import toast from 'react-hot-toast';

const fmtMoney = v => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
const fmtNum = (v, d = 1) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
const MOTIVOS = ['Gravação errada', 'Tela rasgada', 'Queimou / superexposição', 'Borrou / escorreu', 'Subexposição', 'Outro'];

export default function SerigrafiaPanel({ saleId, defaultQuadro = '' }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ quadro: '', motivo: MOTIVOS[0], obs: '', area_cm2: '', emulsao_g: '', sensib_g: '', removedor_ml: '' });

  const { data: cfg } = useQuery({ queryKey: ['seri-config'], queryFn: () => api.get('/production/serigrafia/config') });
  const { data: quadros } = useQuery({ queryKey: ['seri-quadros'], queryFn: () => api.get('/production/serigrafia/quadros') });
  const { data: perdas } = useQuery({ queryKey: ['seri-perdas'], queryFn: () => api.get('/production/serigrafia/perdas') });

  // Cálculo automático (preview) a partir da área + configuração
  const calc = useMemo(() => {
    if (!cfg) return { emu: 0, sen: 0, rem: 0, custo: 0, area: 0 };
    const area = Number(form.area_cm2) > 0 ? Number(form.area_cm2) : (Number(cfg.screen_w) * Number(cfg.screen_h));
    const m2 = area / 10000;
    const emu = form.emulsao_g !== '' ? Number(form.emulsao_g) : m2 * Number(cfg.emulsao_g_m2 || 0);
    const sen = form.sensib_g !== '' ? Number(form.sensib_g) : m2 * Number(cfg.sensib_g_m2 || 0);
    const rem = form.removedor_ml !== '' ? Number(form.removedor_ml) : m2 * Number(cfg.removedor_ml_m2 || 0);
    const custo = (emu / 1000) * Number(cfg.emulsao_cost_kg || 0) + (sen / 1000) * Number(cfg.sensib_cost_kg || 0) + (rem / 1000) * Number(cfg.removedor_cost_l || 0);
    return { emu, sen, rem, custo, area };
  }, [cfg, form]);

  const perdaMut = useMutation({
    mutationFn: () => api.post('/production/serigrafia/perda', {
      sale_id: saleId || null, quadro: form.quadro.trim(), motivo: form.motivo, obs: form.obs,
      area_cm2: form.area_cm2 || null, emulsao_g: form.emulsao_g || null, sensib_g: form.sensib_g || null, removedor_ml: form.removedor_ml || null,
    }),
    onSuccess: (r) => {
      qc.invalidateQueries(['seri-quadros']); qc.invalidateQueries(['seri-perdas']); qc.invalidateQueries(['stock-report']);
      setOpen(false);
      toast.success(`Perda registrada — ${fmtMoney(r.custo)}`);
      if (r.precisa_troca) toast(`⚠️ Quadro ${r.quadro} já tem ${r.quadro_recuperacoes} recuperações — pode precisar trocar a tela.`, { duration: 6000, icon: '⚠️' });
    },
    onError: e => toast.error(e.error || 'Erro ao registrar perda'),
  });

  function abrir() {
    setForm({ quadro: defaultQuadro || '', motivo: MOTIVOS[0], obs: '', area_cm2: '', emulsao_g: '', sensib_g: '', removedor_ml: '' });
    setOpen(true);
  }

  const qlist = quadros?.data || [];
  const plist = perdas?.data || [];
  const totalPerda = plist.reduce((s, p) => s + Number(p.custo || 0), 0);

  return (
    <div className="card p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-gray-800 flex items-center gap-1.5"><Droplets size={16} className="text-pink-500" /> Serigrafia — Telas / Matrizes</h3>
          <p className="text-xs text-gray-500 mt-0.5">Perda de matriz (emulsão · sensibilizante · removedor) e durabilidade das telas.</p>
        </div>
        <button onClick={abrir} className="btn-primary btn-sm"><Plus size={14} /> Registrar perda</button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Durabilidade dos quadros */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase mb-1.5 flex items-center gap-1"><Layers size={13} /> Telas (durabilidade)</p>
          <div className="border border-gray-100 rounded-lg max-h-56 overflow-y-auto divide-y divide-gray-50">
            {qlist.length === 0 ? <p className="text-xs text-gray-400 text-center py-4">Nenhuma tela registrada ainda.</p> :
              qlist.map(q => (
                <div key={q.id} className="flex items-center justify-between px-3 py-2 text-sm">
                  <span className="font-mono font-semibold text-gray-700">Quadro {q.numero}</span>
                  <span className="flex items-center gap-3 text-xs text-gray-500">
                    <span>{q.gravacoes} gravações</span>
                    <span>{q.recuperacoes} recup.</span>
                    {q.precisa_troca && <span className="inline-flex items-center gap-1 text-red-600 font-semibold bg-red-50 rounded px-1.5 py-0.5"><AlertTriangle size={11} /> Trocar</span>}
                  </span>
                </div>
              ))}
          </div>
        </div>

        {/* Perdas recentes */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase mb-1.5">Perdas recentes — total {fmtMoney(totalPerda)}</p>
          <div className="border border-gray-100 rounded-lg max-h-56 overflow-y-auto divide-y divide-gray-50">
            {plist.length === 0 ? <p className="text-xs text-gray-400 text-center py-4">Nenhuma perda registrada.</p> :
              plist.map(p => (
                <div key={p.id} className="px-3 py-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-semibold text-gray-700">Quadro {p.quadro}</span>
                    <span className="font-semibold text-red-600">{fmtMoney(p.custo)}</span>
                  </div>
                  <p className="text-xs text-gray-400">{p.motivo} · {fmtNum(p.emulsao_g)}g emul · {fmtNum(p.removedor_ml)}ml remov · {new Date(p.created_at).toLocaleDateString('pt-BR')}</p>
                </div>
              ))}
          </div>
        </div>
      </div>

      {/* Modal de registro de perda */}
      <Modal isOpen={open} onClose={() => !perdaMut.isPending && setOpen(false)} title="Registrar perda de matriz" size="md">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Nº do quadro *</label>
              <input className="input font-mono" value={form.quadro} autoFocus
                onChange={e => setForm(s => ({ ...s, quadro: e.target.value }))} placeholder="Ex.: 04827" />
            </div>
            <div>
              <label className="label">Motivo *</label>
              <select className="input" value={form.motivo} onChange={e => setForm(s => ({ ...s, motivo: e.target.value }))}>
                {MOTIVOS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="label">Área da tela (cm²)</label>
            <input type="number" className="input" value={form.area_cm2}
              onChange={e => setForm(s => ({ ...s, area_cm2: e.target.value }))}
              placeholder={cfg ? `${cfg.screen_w} × ${cfg.screen_h} = ${cfg.screen_w * cfg.screen_h} cm²` : '875'} />
          </div>

          {/* Insumos calculados (editáveis) */}
          <div className="bg-gray-50 rounded-xl p-3 space-y-2">
            <p className="text-xs font-semibold text-gray-500">Insumo gasto (calculado pela área — pode ajustar)</p>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-[11px] text-gray-500">Emulsão (g)</label>
                <input type="number" className="input text-sm" value={form.emulsao_g}
                  onChange={e => setForm(s => ({ ...s, emulsao_g: e.target.value }))} placeholder={fmtNum(calc.emu)} />
              </div>
              <div>
                <label className="text-[11px] text-gray-500">Sensib. (g)</label>
                <input type="number" className="input text-sm" value={form.sensib_g}
                  onChange={e => setForm(s => ({ ...s, sensib_g: e.target.value }))} placeholder={fmtNum(calc.sen)} />
              </div>
              <div>
                <label className="text-[11px] text-gray-500">Removedor (ml)</label>
                <input type="number" className="input text-sm" value={form.removedor_ml}
                  onChange={e => setForm(s => ({ ...s, removedor_ml: e.target.value }))} placeholder={fmtNum(calc.rem)} />
              </div>
            </div>
            <div className="flex justify-between items-center pt-1 border-t border-gray-200">
              <span className="text-xs text-gray-500">Custo estimado da perda</span>
              <span className="font-bold text-red-600">{fmtMoney(calc.custo)}</span>
            </div>
          </div>

          <div>
            <label className="label">Observação</label>
            <input className="input" value={form.obs} onChange={e => setForm(s => ({ ...s, obs: e.target.value }))} placeholder="Opcional" />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
            <button onClick={() => setOpen(false)} disabled={perdaMut.isPending} className="btn-secondary">Cancelar</button>
            <button onClick={() => perdaMut.mutate()} disabled={perdaMut.isPending || !form.quadro.trim()} className="btn-primary disabled:opacity-50">
              {perdaMut.isPending ? <><Loader2 size={15} className="animate-spin" /> Salvando...</> : <><Plus size={15} /> Registrar perda</>}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
