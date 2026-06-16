import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { UploadCloud, Loader2, Package, CheckCircle2, Palette } from 'lucide-react';
import api from '@/lib/api';
import Modal from '@/components/UI/Modal';
import toast from 'react-hot-toast';

// ── Parser do catálogo (mesma lógica usada na análise) ──────────────
// Linha: "BASE - COR [RML 000] - [BORDA ...] - 000 ML"
const VOL_RE  = /(\d+(?:[.,]\d+)?)\s*ML/i;
const CODE_RE = /\bRML\s*\d+\b/ig;

function clean(s) {
  return String(s || '').replace(/\s+/g, ' ').replace(/\bNORMAL\b/ig, '')
    .replace(/\s+/g, ' ').trim().replace(/^[-/\s]+|[-/\s]+$/g, '');
}
function fixBase(b) {
  return b
    .replace(/\bWHISKYTRADICIONAL\b/i, 'WHISKY TRADICIONAL')
    .replace(/\bTWISTERTRADICIONAL\b/i, 'TWISTER TRADICIONAL')
    .replace(/\s+/g, ' ').trim();
}
const JUNK = [/^PRODUTO MODELO$/i, /^PREENCHER$/i];

function parseCatalog(text) {
  const lines = String(text || '').split(/\r?\n/).map(s => s.trim())
    .filter(s => s && s.toUpperCase() !== 'PREENCHER');
  const map = new Map();
  for (const raw of lines) {
    let s = raw.replace(/\s+/g, ' ').trim();
    let vol = null;
    const m = s.match(VOL_RE);
    if (m) { vol = m[1].replace(',', '.') + ' ML'; s = s.replace(VOL_RE, '').replace(/\s+/g, ' ').trim().replace(/[-\s]+$/, ''); }
    const parts = s.split(' - ').map(p => p.trim()).filter(Boolean);
    let base = fixBase(clean(parts[0] || s)).toUpperCase();
    if (base.length < 3 || JUNK.some(re => re.test(base))) continue;
    let color = null, border = null;
    for (let p of parts.slice(1)) {
      p = p.replace(CODE_RE, '').trim();
      if (/^BORDA/i.test(p)) border = clean(p).toUpperCase();
      else if (p) color = color ? `${color} / ${clean(p).toUpperCase()}` : clean(p).toUpperCase();
    }
    if (!map.has(base)) map.set(base, { name: base, colors: new Set(), borders: new Set(), volumes: new Set() });
    const g = map.get(base);
    if (color) g.colors.add(color);
    if (border) g.borders.add(border);
    if (vol) g.volumes.add(vol);
  }
  return [...map.values()].map(g => ({
    name: g.name,
    colors: [...g.colors].sort(),
    borders: [...g.borders].sort(),
    volumes: [...g.volumes].sort(),
  })).sort((a, b) => a.name.localeCompare(b.name));
}

export default function ImportProductsModal({ isOpen, onClose }) {
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  function reparse(t) { setText(t); setGroups(parseCatalog(t)); setResult(null); }

  async function onFiles(e) {
    const files = [...(e.target.files || [])];
    e.target.value = '';
    if (!files.length) return;
    const texts = await Promise.all(files.map(f => f.text()));
    reparse((text ? text + '\n' : '') + texts.join('\n'));
    toast.success(`${files.length} arquivo(s) lido(s)`);
  }

  async function importar() {
    if (!groups.length) { toast.error('Nada para importar — cole ou envie o CSV'); return; }
    setLoading(true); setResult(null);
    try {
      const res = await api.post('/products/import-grouped', { groups });
      setResult(res);
      qc.invalidateQueries(['products']);
      toast.success(`${res.created} criados · ${res.updated} atualizados`);
    } catch (err) {
      toast.error(err.error || 'Erro ao importar');
    } finally { setLoading(false); }
  }

  const totColors = groups.reduce((s, g) => s + g.colors.length, 0);
  const totBorders = groups.reduce((s, g) => s + g.borders.length, 0);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Importar catálogo (cores e bordas)" size="lg">
      <div className="space-y-4">
        <p className="text-sm text-gray-500">
          Envie os arquivos <b>.csv</b> (uma linha por produto) ou cole a lista abaixo. O sistema agrupa em
          <b> um produto por modelo</b>, com as <b>cores</b> e <b>bordas</b> como variações selecionáveis.
        </p>

        <div className="flex flex-wrap gap-2">
          <label className="btn-secondary cursor-pointer">
            <UploadCloud size={16} /> Enviar CSV(s)
            <input type="file" accept=".csv,.txt" multiple className="hidden" onChange={onFiles} />
          </label>
          {(text || groups.length > 0) && (
            <button onClick={() => reparse('')} className="btn-ghost text-sm text-gray-500">Limpar</button>
          )}
        </div>

        <textarea
          className="input w-full h-28 resize-none font-mono text-xs"
          placeholder={'Cole aqui, ex.:\nTAÇA GIN JATEADO - AZUL TIFANNY - BORDA METALIZADA AZUL - 600 ML\nLONG DRINK TRADICIONAL - BRANCO 350 ML'}
          value={text}
          onChange={e => reparse(e.target.value)}
        />

        {/* Prévia */}
        {groups.length > 0 && (
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <div className="bg-gray-50 px-4 py-2.5 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
              <span className="flex items-center gap-1.5 font-semibold text-gray-800"><Package size={15} className="text-indigo-500" /> {groups.length} produtos</span>
              <span className="flex items-center gap-1.5 text-gray-500"><Palette size={14} className="text-pink-500" /> {totColors} cores</span>
              <span className="text-gray-500">{totBorders} bordas no total</span>
            </div>
            <div className="max-h-72 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-white sticky top-0 shadow-sm">
                  <tr className="text-xs text-gray-400 uppercase text-left">
                    <th className="px-4 py-2 font-semibold">Produto</th>
                    <th className="px-3 py-2 font-semibold text-center w-20">Cores</th>
                    <th className="px-3 py-2 font-semibold text-center w-20">Bordas</th>
                    <th className="px-3 py-2 font-semibold w-40">Volume(s)</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map(g => (
                    <tr key={g.name} className="border-t border-gray-50">
                      <td className="px-4 py-1.5 font-medium text-gray-800">{g.name}</td>
                      <td className="px-3 py-1.5 text-center">{g.colors.length || '—'}</td>
                      <td className="px-3 py-1.5 text-center">{g.borders.length || '—'}</td>
                      <td className="px-3 py-1.5 text-gray-500 text-xs">{g.volumes.join(', ') || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Resultado */}
        {result && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-sm">
            <p className="font-semibold text-green-800 flex items-center gap-2"><CheckCircle2 size={16} /> Importação concluída!</p>
            <p className="text-green-700 mt-1">{result.created} criados · {result.updated} atualizados (variações mescladas) · {result.skipped} ignorados</p>
            {result.errors?.length > 0 && (
              <details className="mt-2"><summary className="text-xs text-red-600 cursor-pointer">{result.errors.length} avisos</summary>
                <ul className="text-xs text-red-500 mt-1 list-disc pl-4">{result.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
              </details>
            )}
          </div>
        )}

        <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
          <button onClick={onClose} className="btn-secondary">Fechar</button>
          <button onClick={importar} disabled={loading || groups.length === 0} className="btn-primary disabled:opacity-50">
            {loading ? <><Loader2 size={15} className="animate-spin" /> Importando...</> : <><UploadCloud size={15} /> Importar {groups.length} produtos</>}
          </button>
        </div>
      </div>
    </Modal>
  );
}
