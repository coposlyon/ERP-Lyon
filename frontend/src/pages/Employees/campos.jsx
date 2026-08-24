// ============================================================
// As peças pequenas do cadastro de colaborador.
//
// Máscara, campo com rótulo, bloco de seção. Ficam fora da tela grande
// para que ela conte a HISTÓRIA do cadastro (o que se pergunta, em que
// ordem, por quê) sem afogar isso em quinhentas linhas de <input>.
// ============================================================
import { useState } from 'react';

import { TOM } from '@/components/RH/kit';
// ── Máscaras ────────────────────────────────────────────────
export const soDigitos = v => String(v ?? '').replace(/\D/g, '');

export const mCPF = v => soDigitos(v).slice(0, 11)
  .replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');

export const mTelefone = v => {
  const d = soDigitos(v).slice(0, 11);
  return d.length <= 10
    ? d.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d{1,4})$/, '$1-$2')
    : d.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d{1,4})$/, '$1-$2');
};

export const mCEP = v => soDigitos(v).slice(0, 8).replace(/(\d{5})(\d)/, '$1-$2');

export const mPIS = v => soDigitos(v).slice(0, 11)
  .replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{5})(\d)/, '$1.$2').replace(/(\d{2})(\d{1,1})$/, '$1-$2');

/** Dinheiro: os dígitos são reais e ganham ponto de milhar sozinhos. */
export const mDinheiro = v => {
  let s = String(v ?? '').replace(/[^\d,]/g, '');
  const i = s.indexOf(',');
  if (i !== -1) s = s.slice(0, i + 1) + s.slice(i + 1).replace(/,/g, '');
  let [int, dec] = s.split(',');
  int = (int || '').replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return dec != null ? `${int},${dec.slice(0, 2)}` : int;
};

export const dinheiroParaNumero = s => {
  const n = parseFloat(String(s ?? '').replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

export const numeroParaDinheiro = v => (v == null || v === '')
  ? '' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 });

export const fmtMoeda = v => (v == null || v === '')
  ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** CPF válido de verdade (dígitos verificadores), não só 11 números. */
export function cpfValido(v) {
  const c = soDigitos(v);
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  let s = 0; for (let i = 0; i < 9; i++) s += +c[i] * (10 - i);
  let d = (s * 10) % 11; if (d === 10) d = 0; if (d !== +c[9]) return false;
  s = 0; for (let i = 0; i < 10; i++) s += +c[i] * (11 - i);
  d = (s * 10) % 11; if (d === 10) d = 0;
  return d === +c[10];
}

// ── Peças de tela ───────────────────────────────────────────

/** Um campo com rótulo. `col` é quantas colunas ele ocupa na grade. */
export function Campo({ label, obrigatorio, dica, erro, col = 1, children }) {
  const span = { 1: '', 2: 'sm:col-span-2', 3: 'sm:col-span-3', 4: 'sm:col-span-4' }[col] || '';
  return (
    <div className={span}>
      <label className="label">
        {label} {obrigatorio && <span className="text-red-400">*</span>}
      </label>
      {children}
      {erro ? <p className="text-[11px] text-red-500 mt-1">{erro}</p>
        : dica ? <p className="text-[11px] text-gray-400 mt-1">{dica}</p> : null}
    </div>
  );
}

/** Um bloco do formulário: ícone, título e a grade de campos. */
export function Secao({ icone: Icone, titulo, descricao, acao, children, colunas = 4 }) {
  const grade = { 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-3', 4: 'sm:grid-cols-4' }[colunas];
  return (
    <section className="rounded-xl mb-4"
      style={{ background: TOM.cartao, border: `1px solid ${TOM.borda}` }}>
      <div className="flex items-start justify-between gap-3 px-4 pt-3.5 pb-2">
        <div className="flex items-start gap-2.5">
          {Icone && (
            <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: 'rgba(77,141,246,.12)', color: TOM.azul }}>
              <Icone size={16} />
            </span>
          )}
          <div>
            <h2 className="font-medium text-[15px]" style={{ color: TOM.azul }}>{titulo}</h2>
            {descricao && <p className="text-[11.5px] mt-0.5" style={{ color: TOM.texto3 }}>{descricao}</p>}
          </div>
        </div>
        {acao}
      </div>
      <div className={`px-4 pb-4 grid grid-cols-1 ${grade} gap-4`}>{children}</div>
    </section>
  );
}

/** Chave liga/desliga com texto ao lado. */
export function Chave({ ligado, aoMudar, titulo, descricao, disabled }) {
  return (
    <label className={`flex items-start gap-3 p-3 rounded-xl border transition-colors ${
      disabled ? 'opacity-60' : 'cursor-pointer'} ${ligado ? 'border-primary-300 bg-primary-50' : 'border-gray-200 hover:border-gray-300'}`}>
      <input type="checkbox" className="mt-0.5 rounded" checked={!!ligado} disabled={disabled}
        onChange={e => aoMudar(e.target.checked)} />
      <span>
        <span className="block text-sm font-semibold text-gray-800">{titulo}</span>
        {descricao && <span className="block text-xs text-gray-500 mt-0.5">{descricao}</span>}
      </span>
    </label>
  );
}

/** Senha com o olhinho. */
export function CampoSenha({ valor, aoMudar, placeholder }) {
  const [ver, setVer] = useState(false);
  return (
    <div className="relative">
      <input type={ver ? 'text' : 'password'} className="input pr-9" value={valor || ''}
        onChange={e => aoMudar(e.target.value)} placeholder={placeholder} autoComplete="new-password" />
      <button type="button" onClick={() => setVer(v => !v)}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs">
        {ver ? 'ocultar' : 'ver'}
      </button>
    </div>
  );
}

export const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

export const DEPARTAMENTOS = ['PRODUÇÃO','COMERCIAL','FINANCEIRO','ADMINISTRATIVO','MARKETING','LOGÍSTICA',
  'COMPRAS','GRAVAÇÃO','DESIGNER','VENDAS','ALMOXARIFADO','QUALIDADE'];

export const TIPOS_CONTRATO = ['CLT', 'PJ', 'Estágio', 'Aprendiz', 'Temporário', 'Autônomo', 'Sócio'];

export const ESTADOS_CIVIS = ['Solteiro(a)', 'Casado(a)', 'União estável', 'Divorciado(a)', 'Viúvo(a)'];

export const GENEROS = ['Masculino', 'Feminino', 'Outro', 'Prefiro não informar'];

export const METODOS_PONTO = [
  { key: 'facial', label: 'Reconhecimento facial' },
  { key: 'pin', label: 'Senha / PIN' },
  { key: 'manual', label: 'Registro manual (gestor)' },
  { key: 'nenhum', label: 'Não bate ponto' },
];
