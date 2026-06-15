import { useState, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import * as XLSX from 'xlsx';
import { Upload, FileSpreadsheet, Loader2, Check } from 'lucide-react';
import api from '@/lib/api';
import Modal from '@/components/UI/Modal';
import toast from 'react-hot-toast';

// Lê todas as abas e extrai linhas { code, name, unit, saldo } pelo cabeçalho.
function parseWorkbook(buf) {
  const wb = XLSX.read(buf, { type: 'array' });
  const out = [];
  for (const name of wb.SheetNames) {
    const aoa = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, blankrows: false, defval: '' });
    let hi = -1, c = {};
    for (let i = 0; i < Math.min(aoa.length, 8); i++) {
      const row = (aoa[i] || []).map(x => String(x).trim().toUpperCase());
      const ci = row.findIndex(x => x.startsWith('CODIGO') || x.startsWith('CÓDIGO'));
      if (ci >= 0) {
        hi = i; c.code = ci;
        c.desc = row.findIndex(x => x.startsWith('DESCRI'));
        c.unit = row.findIndex(x => x.startsWith('UNIDADE') || x === 'UN');
        c.saldo = row.findIndex(x => x.startsWith('SALDO'));
        break;
      }
    }
    if (hi < 0 || c.saldo < 0) continue;
    for (let i = hi + 1; i < aoa.length; i++) {
      const row = aoa[i] || [];
      const code = String(row[c.code] ?? '').trim();
      if (!code || /^c[óo]digo/i.test(code) || !/^[A-Za-z]/.test(code)) continue;
      const nm = c.desc >= 0 ? String(row[c.desc] ?? '').trim() : '';
      if (!nm || nm.length < 3) continue;
      const unit = c.unit >= 0 ? String(row[c.unit] ?? 'UN').trim() : 'UN';
      const saldo = Number(String(row[c.saldo] ?? '0').replace(',', '.')) || 0;
      out.push({ code, name: nm, unit, saldo });
    }
  }
  // agrega por código (soma saldo)
  const map = new Map();
  for (const r of out) {
    if (map.has(r.code)) map.get(r.code).saldo += r.saldo;
    else map.set(r.code, { ...r });
  }
  return [...map.values()];
}

export default function ImportStockModal({ isOpen, onClose }) {
  const qc = useQueryClient();
  const fileRef = useRef(null);
  const [rows, setRows] = useState(null);
  const [fileName, setFileName] = useState('');
  const [onlyStock, setOnlyStock] = useState(false);
  const [create, setCreate] = useState(true);
  const [updateStock, setUpdateStock] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  async function pick(e) {
    const f = e.target.files?.[0]; if (!f) return; e.target.value = '';
    setFileName(f.name); setResult(null);
    try {
      const buf = await f.arrayBuffer();
      const parsed = parseWorkbook(buf);
      setRows(parsed);
      if (!parsed.length) toast.error('Não encontrei produtos na planilha (cabeçalho CÓDIGO/DESCRIÇÃO/SALDO).');
    } catch { toast.error('Não consegui ler a planilha.'); }
  }

  const filtered = (rows || []).filter(r => !onlyStock || r.saldo > 0);
  const comSaldo = (rows || []).filter(r => r.saldo > 0).length;

  async function doImport() {
    if (!filtered.length) return;
    setBusy(true); setResult(null);
    const acc = { created: 0, updated: 0, skipped: 0 };
    try {
      for (let i = 0; i < filtered.length; i += 800) {
        const res = await api.post('/products/import', { rows: filtered.slice(i, i + 800), create, update_stock: updateStock });
        acc.created += res.created || 0; acc.updated += res.updated || 0; acc.skipped += res.skipped || 0;
      }
      setResult(acc);
      qc.invalidateQueries(['products']);
      toast.success(`Importado: ${acc.created} criados, ${acc.updated} atualizados`);
    } catch (e) { toast.error(e.error || 'Erro na importação'); }
    finally { setBusy(false); }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Importar estoque (planilha)" size="md">
      <div className="space-y-4">
        <p className="text-sm text-gray-500">
          Suba a planilha (.xlsx) — leio todas as abas e uso as colunas <b>CÓDIGO</b>, <b>DESCRIÇÃO</b>, <b>UNIDADE</b> e <b>SALDO</b>.
        </p>

        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={pick} />
        <button onClick={() => fileRef.current?.click()} className="w-full border-2 border-dashed border-gray-200 rounded-xl py-6 flex flex-col items-center gap-2 hover:border-violet-300 transition-colors">
          <Upload size={22} className="text-violet-500" />
          <span className="text-sm font-medium">{fileName || 'Escolher planilha'}</span>
        </button>

        {rows && (
          <div className="card p-3 bg-gray-50">
            <div className="flex items-center gap-2 text-sm">
              <FileSpreadsheet size={16} className="text-violet-600" />
              <span><b>{rows.length}</b> produtos encontrados · <b>{comSaldo}</b> com saldo</span>
            </div>
          </div>
        )}

        {rows && rows.length > 0 && (
          <div className="space-y-2 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" checked={create} onChange={e => setCreate(e.target.checked)} className="w-4 h-4 accent-violet-600" /> Criar produtos que não existem (por código)</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={updateStock} onChange={e => setUpdateStock(e.target.checked)} className="w-4 h-4 accent-violet-600" /> Atualizar o estoque (saldo) dos existentes</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={onlyStock} onChange={e => setOnlyStock(e.target.checked)} className="w-4 h-4 accent-violet-600" /> Importar só itens com saldo &gt; 0 ({comSaldo})</label>
          </div>
        )}

        {result && (
          <div className="card p-3 border-l-4 border-green-500 bg-green-50/40 text-sm flex items-center gap-2">
            <Check size={16} className="text-green-600" />
            <span><b>{result.created}</b> criados · <b>{result.updated}</b> atualizados · {result.skipped} ignorados</span>
          </div>
        )}

        <div className="flex gap-2 justify-end pt-2 border-t border-gray-100">
          <button onClick={onClose} className="btn-secondary">Fechar</button>
          <button onClick={doImport} disabled={busy || !filtered.length} className="btn-primary disabled:opacity-50">
            {busy ? <><Loader2 size={15} className="animate-spin" /> Importando...</> : `Importar ${filtered.length || ''} itens`}
          </button>
        </div>
      </div>
    </Modal>
  );
}
