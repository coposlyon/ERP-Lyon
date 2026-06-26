import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { UploadCloud, Loader2, Package, CheckCircle2 } from 'lucide-react';
import api from '@/lib/api';
import Modal from '@/components/UI/Modal';
import toast from 'react-hot-toast';

// Limpa o nome do produto (uma linha = um produto)
function cleanName(raw) {
  return String(raw || '')
    .replace(/\bRML\s*\d+\b/ig, '')
    .replace(/\bNORMAL\b/ig, '')
    .replace(/\s*-\s*/g, ' - ')
    .replace(/\s+/g, ' ')
    .trim().replace(/^[-\s]+|[-\s]+$/g, '')
    .toUpperCase();
}

function parseNames(text) {
  const seen = new Set();
  const out = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    const n = cleanName(line);
    if (n.length < 3 || n === 'PREENCHER' || /^PRODUTO MODELO$/.test(n)) continue;
    if (seen.has(n)) continue;
    seen.add(n); out.push(n);
  }
  return out;
}

export default function ImportProductsModal({ isOpen, onClose }) {
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const [names, setNames] = useState([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  function reparse(t) { setText(t); setNames(parseNames(t)); setResult(null); }

  async function onFiles(e) {
    const files = [...(e.target.files || [])];
    e.target.value = '';
    if (!files.length) return;
    const texts = await Promise.all(files.map(f => f.text()));
    reparse((text ? text + '\n' : '') + texts.join('\n'));
    toast.success(`${files.length} arquivo(s) lido(s)`);
  }

  async function importar() {
    if (!names.length) { toast.error('Nada para importar — cole ou envie o CSV'); return; }
    setLoading(true); setResult(null);
    try {
      const res = await api.post('/products/import-flat', { names });
      setResult(res);
      qc.invalidateQueries(['products']);
      qc.invalidateQueries(['stock-report']);
      toast.success(`${res.created} produtos criados · ${res.skipped} já existiam`);
    } catch (err) {
      toast.error(err.error || 'Erro ao importar');
    } finally { setLoading(false); }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Importar produtos (lista)" size="lg">
      <div className="space-y-4">
        <p className="text-sm text-gray-500">
          Envie os arquivos <b>.csv</b> ou cole a lista abaixo — <b>uma linha = um produto</b>.
          Cada linha vira um produto individual no estoque (sem agrupar por cor/borda).
        </p>

        <div className="flex flex-wrap gap-2">
          <label className="btn-secondary cursor-pointer">
            <UploadCloud size={16} /> Enviar CSV(s)
            <input type="file" accept=".csv,.txt" multiple className="hidden" onChange={onFiles} />
          </label>
          {(text || names.length > 0) && (
            <button onClick={() => reparse('')} className="btn-ghost text-sm text-gray-500">Limpar</button>
          )}
        </div>

        <textarea
          className="input w-full h-28 resize-none font-mono text-xs"
          placeholder={'Cole aqui, uma linha por produto:\nLONG DRINK TRADICIONAL - BRANCO 350 ML\nLONG DRINK TRADICIONAL - PRETO 350 ML'}
          value={text}
          onChange={e => reparse(e.target.value)}
        />

        {/* Prévia */}
        {names.length > 0 && (
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <div className="bg-gray-50 px-4 py-2.5 flex items-center gap-2 text-sm">
              <Package size={15} className="text-indigo-500" />
              <span className="font-semibold text-gray-800">{names.length} produto{names.length !== 1 ? 's' : ''}</span>
              <span className="text-gray-400">serão criados (um por linha)</span>
            </div>
            <div className="max-h-72 overflow-y-auto divide-y divide-gray-50">
              {names.slice(0, 600).map((n, i) => (
                <div key={i} className="px-4 py-1.5 text-sm text-gray-700 flex gap-3">
                  <span className="text-gray-300 font-mono w-10 text-right shrink-0">{i + 1}</span>
                  <span>{n}</span>
                </div>
              ))}
              {names.length > 600 && <p className="px-4 py-2 text-xs text-gray-400">…e mais {names.length - 600}.</p>}
            </div>
          </div>
        )}

        {/* Resultado */}
        {result && (
          <div className="border rounded-xl p-4 text-sm bg-green-50 border-green-200">
            <p className="font-semibold flex items-center gap-2 text-green-800"><CheckCircle2 size={16} /> Importação concluída!</p>
            <p className="mt-1 text-green-700">{result.created} criados · {result.skipped} já existiam</p>
            {result.errors?.length > 0 && (
              <details className="mt-2"><summary className="text-xs text-red-600 cursor-pointer">{result.errors.length} avisos</summary>
                <ul className="text-xs text-red-500 mt-1 list-disc pl-4">{result.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
              </details>
            )}
          </div>
        )}

        <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
          <button onClick={onClose} className="btn-secondary">Fechar</button>
          <button onClick={importar} disabled={loading || names.length === 0} className="btn-primary disabled:opacity-50">
            {loading ? <><Loader2 size={15} className="animate-spin" /> Importando...</> : <><UploadCloud size={15} /> Importar {names.length} produtos</>}
          </button>
        </div>
      </div>
    </Modal>
  );
}
