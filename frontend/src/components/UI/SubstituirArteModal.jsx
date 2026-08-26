// ============================================================
// Trocar uma arte que já está anexada.
//
// Anexar a PRIMEIRA arte é trabalho normal — o pedido está parado
// esperando exatamente isso, e não pede senha de ninguém.
//
// Substituir é outra coisa. A arte antiga pode já ter virado vegetal,
// tela e copo impresso; trocar o arquivo em silêncio é o caminho para
// mil peças saírem com o desenho errado sem ninguém saber quem mandou
// trocar. Por isso aqui entra o e-mail e a senha de um GERENTE,
// conferidos na hora pelo servidor: a tela destravada de alguém não
// autoriza nada sozinha.
//
// O nome de quem autorizou fica no histórico do pedido.
// ============================================================
import { useState, useEffect, useRef } from 'react';
import { UploadCloud, Loader2, AlertTriangle, ShieldCheck, FileCheck2 } from 'lucide-react';
import Modal from '@/components/UI/Modal';

export default function SubstituirArteModal({ pedido, onClose, onConfirmar, enviando }) {
  const [arquivo, setArquivo] = useState(null);
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const input = useRef(null);

  useEffect(() => {
    if (!pedido) { setArquivo(null); setEmail(''); setSenha(''); }
  }, [pedido]);

  if (!pedido) return null;

  const codigo = pedido.codigo || `PV-${String(pedido.number ?? '').padStart(4, '0')}`;
  const pode = arquivo && email.trim() && senha.trim() && !enviando;

  return (
    <Modal isOpen onClose={() => !enviando && onClose?.()}
      title={`Substituir a arte do pedido ${codigo}`} size="sm" closeOnBackdrop={false}>
      <div className="space-y-4">

        <div className="flex gap-2.5 bg-amber-50 border border-amber-200 rounded-xl p-3">
          <AlertTriangle size={18} className="text-amber-500 mt-0.5 shrink-0" />
          <p className="text-sm text-gray-700">
            Este pedido <b>já tem arte anexada</b>. A produção pode ter começado a partir dela —
            vegetal, tela e impressão. Trocar agora exige a autorização de um gerente, e fica
            registrada no histórico do pedido.
          </p>
        </div>

        <div>
          <label className="label">Novo arquivo da arte</label>
          <input ref={input} type="file" className="hidden"
            accept="image/*,application/pdf,.ai,.cdr,.eps,.psd"
            onChange={e => setArquivo(e.target.files?.[0] || null)} />
          <button type="button" onClick={() => input.current?.click()}
            className="btn-secondary w-full justify-center">
            {arquivo
              ? <><FileCheck2 size={15} className="text-emerald-600" /> {arquivo.name}</>
              : <><UploadCloud size={15} /> Escolher arquivo</>}
          </button>
          {arquivo && (
            <p className="text-[11px] text-gray-400 mt-1">
              {(arquivo.size / 1024 / 1024).toFixed(1)} MB — o limite é 8 MB.
            </p>
          )}
        </div>

        <div className="rounded-xl border border-gray-200 p-3 space-y-3">
          <p className="text-xs font-medium text-gray-700 flex items-center gap-1.5">
            <ShieldCheck size={14} className="text-primary-600" /> Autorização do gerente
          </p>
          <div>
            <label className="label">E-mail do gerente</label>
            <input type="email" className="input" autoComplete="off" value={email}
              placeholder="gerente@empresa.com.br"
              onChange={e => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="label">Senha</label>
            <input type="password" className="input" autoComplete="off" value={senha}
              onChange={e => setSenha(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && pode && onConfirmar({ arquivo, email, senha })} />
          </div>
        </div>

        <div className="flex gap-2 justify-end">
          <button onClick={onClose} disabled={enviando} className="btn-secondary">Cancelar</button>
          <button onClick={() => onConfirmar({ arquivo, email, senha })} disabled={!pode}
            className="btn-primary disabled:opacity-50">
            {enviando ? <Loader2 size={15} className="animate-spin" /> : <UploadCloud size={15} />}
            Substituir arte
          </button>
        </div>
      </div>
    </Modal>
  );
}
