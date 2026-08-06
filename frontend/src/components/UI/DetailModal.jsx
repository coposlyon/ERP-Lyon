import { FileText, Edit2 } from 'lucide-react';
import Modal from './Modal';

// Ficha somente-leitura de um cadastro (o botão do olhinho nas listas).
// `fields` é uma lista de { label, value, wide } — valores vazios viram “—”.
// Os documentos vêm do próprio registro (documents.attachments), sem request extra.
export default function DetailModal({ target, onClose, title, fields = [], onEdit }) {
  const docs = target?.documents?.attachments || [];

  return (
    <Modal isOpen={!!target} onClose={onClose} title={title} size="lg">
      <div className="space-y-5">
        <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3">
          {fields.map(f => (
            <div key={f.label} className={f.wide ? 'col-span-2 sm:col-span-3' : ''}>
              <dt className="text-[11px] uppercase tracking-wide text-gray-400">{f.label}</dt>
              <dd className="text-sm text-gray-800 break-words">
                {f.value === 0 || f.value ? f.value : <span className="text-gray-300">—</span>}
              </dd>
            </div>
          ))}
        </dl>

        <div>
          <p className="text-[11px] uppercase tracking-wide text-gray-400 mb-2">Documentos</p>
          {docs.length === 0 ? (
            <p className="text-sm text-gray-400">Nenhum documento anexado.</p>
          ) : (
            <ul className="space-y-1.5">
              {docs.map(d => (
                <li key={d.id || d.url} className="flex items-center gap-2 text-sm">
                  <FileText size={15} className="text-indigo-500 shrink-0" />
                  <a href={d.url} target="_blank" rel="noreferrer" className="text-primary-600 hover:underline truncate">
                    {d.name}
                  </a>
                  <span className="text-xs text-gray-400 shrink-0">
                    {d.kind}
                    {d.uploaded_at && ` · ${new Date(d.uploaded_at).toLocaleDateString('pt-BR')}`}
                    {d.uploaded_by?.name && ` · ${d.uploaded_by.name}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
          <button onClick={onClose} className="btn-secondary">Fechar</button>
          {onEdit && (
            <button onClick={() => onEdit(target)} className="btn-primary">
              <Edit2 size={15} /> Editar
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
