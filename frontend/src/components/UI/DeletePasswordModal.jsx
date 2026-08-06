import { useState, useEffect } from 'react';
import { Trash2, Loader2 } from 'lucide-react';
import api from '@/lib/api';
import Modal from './Modal';
import toast from 'react-hot-toast';

// Exclusão definitiva confirmada com a senha de login (só admin).
// `path` é a base da rota (ex.: '/suppliers') — chama POST {path}/{id}/delete.
export default function DeletePasswordModal({ target, onClose, onDeleted, path, title, noun }) {
  const [password, setPassword] = useState('');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => { setPassword(''); }, [target?.id]);

  async function handleDelete() {
    if (!target || !password) return;
    setDeleting(true);
    try {
      await api.post(`${path}/${target.id}/delete`, { password });
      toast.success(`${noun} excluído com sucesso`);
      onClose();
      onDeleted?.();
    } catch (e) { toast.error(e.error || 'Erro ao excluir'); }
    finally { setDeleting(false); }
  }

  return (
    <Modal isOpen={!!target} onClose={onClose} title={title} size="sm">
      <div className="space-y-4">
        <div className="flex items-start gap-3 bg-red-50 border border-red-100 rounded-xl p-3">
          <Trash2 size={18} className="text-red-500 mt-0.5 shrink-0" />
          <p className="text-sm text-gray-700">
            Você vai <b>excluir permanentemente</b> <b>{target?.name}</b>. Esta ação não pode ser desfeita.
          </p>
        </div>
        <div>
          <label className="label">Confirme com sua senha de login</label>
          <input type="password" className="input" autoFocus value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleDelete()} placeholder="Sua senha" />
        </div>
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="btn-secondary">Cancelar</button>
          <button onClick={handleDelete} disabled={deleting || !password}
            className="bg-red-600 hover:bg-red-700 text-white font-medium px-4 py-2 rounded-xl flex items-center gap-2 disabled:opacity-50">
            {deleting ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />} Excluir
          </button>
        </div>
      </div>
    </Modal>
  );
}
