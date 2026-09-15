import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Save, Loader2 } from 'lucide-react';
import api from '@/lib/api';
import { Campo, Dinheiro, Numero, Data, STATUS_MAQ } from './comum';

const VAZIO = {
  codigo: '', nome: '', tipo: '', fabricante: '', numero_serie: '', modelo: '', setor: '',
  data_aquisicao: null, valor_aquisicao: null, vida_util_anos: 10, vida_util_unidades: null, valor_residual: null,
  supplier_id: '', fornecedor_nome: '', fornecedor_telefone: '', fornecedor_email: '',
  observacoes: '', status: 'operacao', localizacao: '', responsavel: '', nota_fiscal: '', garantia_ate: null,
  entra_no_rateio: true,
};

/**
 * ABA CADASTRO — os dados do equipamento.
 *
 * Serve para criar (maquina = null) e para editar. O fornecedor pode vir
 * da lista de Fornecedores (preenche telefone e e-mail) ou ser digitado.
 */
export default function AbaCadastro({ maquina, grupo, cfg, codigoSugerido, salvando, onSalvar, onCancelar }) {
  const [f, setF] = useState(VAZIO);
  const set = patch => setF(p => ({ ...p, ...patch }));

  useEffect(() => {
    if (maquina) {
      const base = {};
      for (const k of Object.keys(VAZIO)) base[k] = maquina[k] ?? VAZIO[k];
      setF(base);
    } else {
      setF({ ...VAZIO, codigo: codigoSugerido || '', tipo: cfg.tipos[0], setor: cfg.setores[0] });
    }
  }, [maquina, codigoSugerido, cfg]);

  const { data: fornecedores = [] } = useQuery({
    queryKey: ['maquinas-fornecedores'],
    queryFn: () => api.get('/suppliers?limit=500').then(d => (Array.isArray(d) ? d : d.data || [])),
    retry: false, staleTime: 5 * 60 * 1000,
  });

  const tipos = useMemo(() => (f.tipo && !cfg.tipos.includes(f.tipo) ? [f.tipo, ...cfg.tipos] : cfg.tipos), [f.tipo, cfg]);
  const setores = useMemo(() => (f.setor && !cfg.setores.includes(f.setor) ? [f.setor, ...cfg.setores] : cfg.setores), [f.setor, cfg]);

  function escolherFornecedor(id) {
    const s = fornecedores.find(x => x.id === id);
    if (!s) { set({ supplier_id: '' }); return; }
    set({
      supplier_id: s.id, fornecedor_nome: s.name,
      fornecedor_telefone: s.phone || f.fornecedor_telefone, fornecedor_email: s.email || f.fornecedor_email,
    });
  }

  const podeSalvar = f.nome?.trim() && f.tipo && f.setor && f.data_aquisicao && f.valor_aquisicao != null && f.vida_util_anos;

  return (
    <form className="p-4 space-y-3" onSubmit={e => { e.preventDefault(); if (podeSalvar) onSalvar({ ...f, grupo, supplier_id: f.supplier_id || null }); }}>
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <Campo label="Código interno" obrigatorio>
          <input className="input uppercase" value={f.codigo} placeholder={codigoSugerido} onChange={e => set({ codigo: e.target.value.toUpperCase() })} />
        </Campo>
        <Campo label="Nome do item" obrigatorio className="col-span-2 md:col-span-1">
          <input className="input" value={f.nome} onChange={e => set({ nome: e.target.value })} required />
        </Campo>
        <Campo label={grupo === 'ti' ? 'Tipo de equipamento' : 'Tipo de maquinário'} obrigatorio>
          <select className="input" value={f.tipo} onChange={e => set({ tipo: e.target.value })}>
            {tipos.map(t => <option key={t}>{t}</option>)}
          </select>
        </Campo>
        <Campo label="Marca">
          <input className="input" value={f.fabricante || ''} onChange={e => set({ fabricante: e.target.value })} />
        </Campo>
        <Campo label="Nº de série">
          <input className="input" value={f.numero_serie || ''} onChange={e => set({ numero_serie: e.target.value })} />
        </Campo>
        <Campo label="Modelo">
          <input className="input" value={f.modelo || ''} onChange={e => set({ modelo: e.target.value })} />
        </Campo>

        <Campo label="Setor" obrigatorio>
          <select className="input" value={f.setor} onChange={e => set({ setor: e.target.value })}>
            {setores.map(t => <option key={t}>{t}</option>)}
          </select>
        </Campo>
        <Campo label="Data de aquisição" obrigatorio>
          <Data value={f.data_aquisicao} onChange={v => set({ data_aquisicao: v })} />
        </Campo>
        <Campo label="Valor de aquisição (R$)" obrigatorio>
          <Dinheiro value={f.valor_aquisicao} onChange={v => set({ valor_aquisicao: v })} />
        </Campo>
        <Campo label="Vida útil em anos" obrigatorio>
          <Numero value={f.vida_util_anos} casas={0} onChange={v => set({ vida_util_anos: v })} />
        </Campo>
        <Campo label={grupo === 'ti' ? 'Vida útil em horas de uso' : 'Vida útil em unidades produzidas'}
          dica={grupo === 'ti' ? 'Opcional' : 'Mede o desgaste pela produção'}>
          <Numero value={f.vida_util_unidades} onChange={v => set({ vida_util_unidades: v })} />
        </Campo>
        <Campo label="Valor residual (R$)" dica="Quanto vale ao fim da vida útil">
          <Dinheiro value={f.valor_residual} onChange={v => set({ valor_residual: v })} />
        </Campo>

        <Campo label="Fornecedor" className="col-span-2 md:col-span-1">
          {fornecedores.length > 0 && (
            <select className="input mb-1" value={f.supplier_id || ''} onChange={e => escolherFornecedor(e.target.value)}>
              <option value="">— digitar abaixo —</option>
              {fornecedores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
          <input className="input" value={f.fornecedor_nome || ''} placeholder="Nome do fornecedor"
            onChange={e => set({ fornecedor_nome: e.target.value, supplier_id: '' })} />
        </Campo>
        <Campo label="Telefone do fornecedor">
          <input className="input" value={f.fornecedor_telefone || ''} placeholder="(11) 0000-0000" onChange={e => set({ fornecedor_telefone: e.target.value })} />
        </Campo>
        <Campo label="E-mail do fornecedor">
          <input className="input" type="email" value={f.fornecedor_email || ''} onChange={e => set({ fornecedor_email: e.target.value })} />
        </Campo>
        <Campo label="Status">
          <select className="input" value={f.status} onChange={e => set({ status: e.target.value })}>
            {Object.entries(STATUS_MAQ).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </Campo>
        <Campo label="Localização">
          <input className="input" value={f.localizacao || ''} placeholder="Galpão 1, sala…" onChange={e => set({ localizacao: e.target.value })} />
        </Campo>
        <Campo label="Responsável">
          <input className="input" value={f.responsavel || ''} onChange={e => set({ responsavel: e.target.value })} />
        </Campo>

        <Campo label="Nota fiscal">
          <input className="input" value={f.nota_fiscal || ''} onChange={e => set({ nota_fiscal: e.target.value })} />
        </Campo>
        <Campo label="Garantia até">
          <Data value={f.garantia_ate} onChange={v => set({ garantia_ate: v })} />
        </Campo>
        <Campo label="Observações" className="col-span-2 md:col-span-3">
          <input className="input" value={f.observacoes || ''} onChange={e => set({ observacoes: e.target.value })} />
        </Campo>
        <Campo label="Rateio">
          <label className="flex items-center gap-2 h-[38px] text-[13px] text-gray-700">
            <input type="checkbox" checked={f.entra_no_rateio !== false} onChange={e => set({ entra_no_rateio: e.target.checked })} />
            Entra no custo mensal
          </label>
        </Campo>
      </div>

      <div className="flex items-center justify-between gap-2 flex-wrap pt-1">
        <p className="text-[11.5px] text-gray-500">
          {!podeSalvar ? 'Preencha os campos com * para salvar.' : 'A depreciação mensal é recalculada ao salvar.'}
        </p>
        <div className="flex gap-2">
          <button type="button" className="btn-secondary" onClick={onCancelar}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={!podeSalvar || salvando}>
            {salvando ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Salvar
          </button>
        </div>
      </div>
    </form>
  );
}
