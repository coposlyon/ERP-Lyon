import { useState, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { UploadCloud, Loader2, Package, CheckCircle2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import api from '@/lib/api';
import Modal from '@/components/UI/Modal';
import toast from 'react-hot-toast';

// Limpa o nome do produto
function cleanName(raw) {
  return String(raw || '')
    .replace(/\bRML\s*\d+\b/ig, '')
    .replace(/\bNORMAL\b/ig, '')
    .replace(/\s*-\s*/g, ' - ')
    .replace(/\s+/g, ' ')
    .trim().replace(/^[-\s]+|[-\s]+$/g, '')
    .toUpperCase();
}
const cleanCode = c => String(c || '').replace(/\s+/g, ' ').trim().toUpperCase();

const isHeaderRow = (row) => {
  const a = String(row?.[0] || '').toUpperCase();
  const b = String(row?.[1] || '').toUpperCase();
  return /COD|CÓD/.test(a) || /DESCRI|NOME|PRODUTO/.test(b);
};

// Planilha (Excel) → [{code, name}] (col 0 = código, col 1 = nome)
function rowsToItems(rows) {
  const out = [];
  rows.forEach((row, i) => {
    if (!Array.isArray(row)) return;
    if (i === 0 && isHeaderRow(row)) return;
    const cells = row.map(c => (c == null ? '' : String(c)).trim());
    if (cells.length >= 2 && cells[1]) out.push({ code: cells[0] || null, name: cells[1] });
    else if (cells[0]) out.push({ code: null, name: cells[0] });
  });
  return out;
}

// Texto colado → [{code, name}] (aceita "Código | Nome", "Código;Nome", "Código<TAB>Nome" ou só o nome)
function textToItems(text) {
  const out = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    const l = line.trim();
    if (!l) continue;
    let parts;
    if (l.includes('\t')) parts = l.split('\t');
    else if (l.includes(' | ')) parts = l.split(' | ');
    else if (l.includes(';')) parts = l.split(';');
    else parts = [l];
    parts = parts.map(p => p.trim()).filter(Boolean);
    if (parts.length >= 2) out.push({ code: parts[0], name: parts.slice(1).join(' ') });
    else if (parts[0]) out.push({ code: null, name: parts[0] });
  }
  return out;
}

export default function ImportProductsModal({ isOpen, onClose }) {
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const [fileItems, setFileItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  // junta planilha + texto, limpa e remove nomes repetidos
  const items = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const it of [...fileItems, ...textToItems(text)]) {
      const name = cleanName(it.name);
      if (name.length < 3 || name === 'PREENCHER' || seen.has(name)) continue;
      seen.add(name);
      out.push({ code: cleanCode(it.code) || null, name });
    }
    return out;
  }, [fileItems, text]);

  async function onFiles(e) {
    const files = [...(e.target.files || [])];
    e.target.value = '';
    if (!files.length) return;
    setResult(null);
    try {
      const novos = [];
      let textos = '';
      for (const f of files) {
        if (/\.(xlsx|xls)$/i.test(f.name)) {
          const buf = await f.arrayBuffer();
          const wb = XLSX.read(buf, { type: 'array' });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false });
          novos.push(...rowsToItems(rows));
        } else {
          textos += (textos ? '\n' : '') + await f.text(); // csv/txt → vai pro campo de texto
        }
      }
      if (novos.length) setFileItems(prev => [...prev, ...novos]);
      if (textos) setText(t => (t ? t + '\n' : '') + textos);
      toast.success(`${files.length} arquivo(s) lido(s)`);
    } catch (err) {
      toast.error('Não consegui ler o arquivo. Confira se é um Excel/CSV válido.');
    }
  }

  function limpar() { setText(''); setFileItems([]); setResult(null); }

  async function importar() {
    if (!items.length) { toast.error('Nada para importar — envie o Excel/CSV ou cole a lista'); return; }
    setLoading(true); setResult(null);
    try {
      const res = await api.post('/products/import-flat', { products: items });
      setResult(res);
      qc.invalidateQueries(['products']);
      qc.invalidateQueries(['stock-report']);
      toast.success(`${res.created} produtos criados · ${res.skipped} já existiam`);
    } catch (err) {
      toast.error(err.error || 'Erro ao importar');
    } finally { setLoading(false); }
  }

  const withCode = items.filter(i => i.code).length;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Importar produtos (Excel ou lista)" size="lg">
      <div className="space-y-4">
        <p className="text-sm text-gray-500">
          Envie um <b>Excel (.xlsx)</b> com as colunas <b>Código | Nome do produto</b>, ou um <b>.csv</b>,
          ou cole a lista abaixo. <b>Uma linha = um produto.</b> Os códigos da planilha são mantidos.
        </p>

        <div className="flex flex-wrap gap-2">
          <label className="btn-secondary cursor-pointer">
            <UploadCloud size={16} /> Enviar Excel / CSV
            <input type="file" accept=".xlsx,.xls,.csv,.txt" multiple className="hidden" onChange={onFiles} />
          </label>
          {(text || fileItems.length > 0) && (
            <button onClick={limpar} className="btn-ghost text-sm text-gray-500">Limpar</button>
          )}
        </div>

        <textarea
          className="input w-full h-24 resize-none font-mono text-xs"
          placeholder={'Cole aqui (opcional):\nLDT - 01 | LONG DRINK TRADICIONAL - BRANCO 350 ML\nLDT - 02 | LONG DRINK TRADICIONAL - PRETO 350 ML'}
          value={text}
          onChange={e => { setText(e.target.value); setResult(null); }}
        />

        {/* Prévia */}
        {items.length > 0 && (
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <div className="bg-gray-50 px-4 py-2.5 flex items-center gap-2 text-sm">
              <Package size={15} className="text-indigo-500" />
              <span className="font-semibold text-gray-800">{items.length} produto{items.length !== 1 ? 's' : ''}</span>
              <span className="text-gray-400">a importar{withCode ? ` · ${withCode} com código próprio` : ''}</span>
            </div>
            <div className="max-h-72 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-white sticky top-0 shadow-sm">
                  <tr className="text-xs text-gray-400 uppercase text-left">
                    <th className="px-4 py-2 font-semibold w-28">Código</th>
                    <th className="px-3 py-2 font-semibold">Produto</th>
                  </tr>
                </thead>
                <tbody>
                  {items.slice(0, 600).map((it, i) => (
                    <tr key={i} className="border-t border-gray-50">
                      <td className="px-4 py-1.5 font-mono text-xs text-gray-500">{it.code || <span className="text-gray-300">auto</span>}</td>
                      <td className="px-3 py-1.5 text-gray-700">{it.name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {items.length > 600 && <p className="px-4 py-2 text-xs text-gray-400">…e mais {items.length - 600}.</p>}
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
          <button onClick={importar} disabled={loading || items.length === 0} className="btn-primary disabled:opacity-50">
            {loading ? <><Loader2 size={15} className="animate-spin" /> Importando {items.length}…</> : <><UploadCloud size={15} /> Importar {items.length} produtos</>}
          </button>
        </div>
      </div>
    </Modal>
  );
}
