import { useState, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Box, Download, Save, FilePlus } from 'lucide-react';
import api from '@/lib/api';
import Modal from '@/components/UI/Modal';
import toast from 'react-hot-toast';
import Studio3D from '@/studio3d/Studio3D';

export default function CustomizationStudio() {
  const qc = useQueryClient();
  const apiRef = useRef(null);
  const [loaded, setLoaded] = useState(null);   // design para reabrir
  const [currentId, setCurrentId] = useState(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);

  const { data: savedRes } = useQuery({
    queryKey: ['studio-saved'],
    queryFn: () => api.get('/customizations?limit=60'),
  });
  const saved = (savedRes?.data || []).filter(c => c.design_3d);

  function pickSaved(item) {
    setLoaded({ ...item.design_3d, _k: Date.now() });
    setCurrentId(item.id);
    setTitle(item.title || '');
    toast.success(`Design "${item.title}" carregado`);
  }
  function novo() {
    setLoaded({ model: 'shaker', _k: Date.now() });
    setCurrentId(null); setTitle('');
  }

  async function doSave() {
    if (!title.trim()) { toast.error('Dê um nome ao design'); return; }
    const a = apiRef.current; if (!a) return;
    setSaving(true);
    try {
      const payload = { title: title.trim(), design_3d: a.getDesign(), preview_url: a.getThumb() };
      if (currentId) {
        const r = await api.put(`/customizations/${currentId}`, payload);
        toast.success('Design atualizado!');
      } else {
        const r = await api.post('/customizations', payload);
        setCurrentId(r.id);
        toast.success('Design salvo!');
      }
      qc.invalidateQueries(['studio-saved']);
      setSaveOpen(false);
    } catch (e) { toast.error(e.error || 'Erro ao salvar'); }
    finally { setSaving(false); }
  }

  function downloadPNG() {
    const url = apiRef.current?.getPNG(); if (!url) return;
    Object.assign(document.createElement('a'), { href: url, download: 'personalizacao.png' }).click();
  }

  return (
    <div className="space-y-4">
      <div className="page-header flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-violet-100 rounded-lg flex items-center justify-center"><Box size={18} className="text-violet-600" /></div>
          <div>
            <h1 className="page-title">Estúdio 3D de Personalização</h1>
            <p className="text-sm text-gray-500 mt-0.5">{currentId ? 'Editando design salvo' : 'Novo design'} · pinte, estampe e gire em 3D</p>
          </div>
        </div>
        <button onClick={novo} className="btn-secondary"><FilePlus size={15} /> Novo</button>
      </div>

      <Studio3D
        initialDesign={loaded}
        saved={saved}
        onPickSaved={pickSaved}
        aiSuggest={(brief) => api.post('/ai/design', { brief })}
        actions={(a) => {
          apiRef.current = a;
          return (
            <div className="grid grid-cols-2 gap-2">
              <button onClick={downloadPNG} className="btn-secondary"><Download size={14} /> Baixar PNG</button>
              <button onClick={() => setSaveOpen(true)} className="btn-primary"><Save size={15} /> {currentId ? 'Atualizar' : 'Salvar'}</button>
            </div>
          );
        }}
      />

      <Modal isOpen={saveOpen} onClose={() => setSaveOpen(false)} title={currentId ? 'Atualizar design' : 'Salvar design'} size="sm">
        <div className="space-y-4">
          <div>
            <label className="label">Nome do design *</label>
            <input className="input" value={title} onChange={e => setTitle(e.target.value)} placeholder="Ex.: Shaker Academia X" autoFocus />
          </div>
          {currentId && (
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <input type="checkbox" onChange={e => { if (e.target.checked) setCurrentId(null); }} className="w-4 h-4 accent-violet-600" />
              Salvar como novo (não sobrescrever)
            </label>
          )}
          <div className="flex gap-2">
            <button onClick={() => setSaveOpen(false)} className="btn-secondary flex-1">Cancelar</button>
            <button onClick={doSave} disabled={saving} className="btn-primary flex-1">{saving ? 'Salvando...' : 'Salvar'}</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
