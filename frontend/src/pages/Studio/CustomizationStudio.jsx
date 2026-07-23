import { useState, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Box, Download, Save, FilePlus, FileText } from 'lucide-react';
import jsPDF from 'jspdf';
import api from '@/lib/api';
import Modal from '@/components/UI/Modal';
import toast from 'react-hot-toast';
import Studio3D from '@/studio3d/Studio3D';
import { MODELS } from '@/pages/Studio/scene';

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

  // PDF pronto para produção: rótulo desenrolado + sangria 3mm + marcas de corte
  function exportProductionPDF() {
    const a = apiRef.current; if (!a) return;
    try {
      const design = a.getDesign();
      const canvas = a.getPrintCanvas(3);
      const def = MODELS.find(m => m.key === design.model);
      const trimW = def?.printW || 230, trimH = def?.printH || 95;
      const bleed = 3, mark = 6, gap = 1.5, margin = 16, footer = 18;
      const bleedW = trimW + bleed * 2, bleedH = trimH + bleed * 2;
      const pw = bleedW + margin * 2, ph = bleedH + margin * 2 + footer;

      const doc = new jsPDF({ unit: 'mm', format: [pw, ph], orientation: pw >= ph ? 'l' : 'p' });
      const pageW = doc.internal.pageSize.getWidth(), pageH = doc.internal.pageSize.getHeight();
      const titleH = 12;
      const bx = (pageW - bleedW) / 2;
      const by = titleH + (pageH - titleH - footer - bleedH) / 2;
      const tx = bx + bleed, ty = by + bleed; // trim box

      // arte (preenche a sangria — fundo "vaza" até a borda)
      doc.addImage(canvas, 'PNG', bx, by, bleedW, bleedH);

      // linha de corte (tracejada)
      doc.setDrawColor(120); doc.setLineWidth(0.2);
      doc.setLineDashPattern([1.2, 1.2], 0);
      doc.rect(tx, ty, trimW, trimH);
      doc.setLineDashPattern([], 0);

      // marcas de corte nos 4 cantos
      doc.setDrawColor(0); doc.setLineWidth(0.25);
      const corner = (cx, cy, sx, sy) => {
        doc.line(cx + sx * gap, cy, cx + sx * (gap + mark), cy);
        doc.line(cx, cy + sy * gap, cx, cy + sy * (gap + mark));
      };
      corner(tx, ty, -1, -1); corner(tx + trimW, ty, 1, -1);
      corner(tx, ty + trimH, -1, 1); corner(tx + trimW, ty + trimH, 1, 1);

      // título
      doc.setTextColor(20); doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
      doc.text(`Arte para produção — ${def?.label || design.model}`, pageW / 2, 8, { align: 'center' });

      // rodapé técnico
      const finishLabel = { opaco: 'Opaco', brilhante: 'Brilhante', metalico: 'Metálico', translucido: 'Translúcido' }[design.finish] || design.finish;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(110);
      const fy = pageH - footer + 6;
      doc.text(`Área de impressão: ${trimW} × ${trimH} mm  ·  Sangria: ${bleed} mm  ·  Acabamento: ${finishLabel}`, pageW / 2, fy, { align: 'center' });
      doc.text(`Linha tracejada = corte  ·  Resolução da arte: ${canvas.width} × ${canvas.height} px  ·  Gerado em ${new Date().toLocaleDateString('pt-BR')} — Lyon Copos`, pageW / 2, fy + 5, { align: 'center' });

      doc.save(`producao-${design.model}.pdf`);
      toast.success('PDF de produção gerado!');
    } catch (e) { toast.error('Erro ao gerar PDF'); }
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button onClick={downloadPNG} className="btn-secondary"><Download size={14} /> Baixar PNG</button>
              <button onClick={() => setSaveOpen(true)} className="btn-primary"><Save size={15} /> {currentId ? 'Atualizar' : 'Salvar'}</button>
              <button onClick={exportProductionPDF} className="btn-secondary col-span-2"><FileText size={14} /> PDF para produção (com sangria)</button>
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
