import { X } from 'lucide-react';
import { useEffect } from 'react';

export default function Modal({ isOpen, onClose, title, children, size = 'md', footer }) {
  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  if (!isOpen) return null;

  const sizes = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
    full: 'max-w-6xl',
  };

  // size="screen" → ocupa a tela inteira (sem card grande centralizado)
  if (size === 'screen') {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-white">
        {title && (
          <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-gray-100 shrink-0">
            <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
            <button onClick={onClose} className="btn-ghost p-1.5"><X size={20} /></button>
          </div>
        )}
        <div className="modal-body flex-1 overflow-y-auto p-4 sm:p-6">
          {children}
        </div>
        {footer && (
          <div className="px-4 sm:px-6 py-3 sm:py-4 border-t border-gray-100 flex flex-wrap items-center justify-end gap-2 sm:gap-3 shrink-0">
            {footer}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* No celular vira uma folha que sobe de baixo (mais fácil de alcançar) */}
      <div className={`relative bg-white rounded-t-2xl sm:rounded-xl shadow-2xl w-full ${sizes[size]} max-h-[92vh] sm:max-h-[90vh] flex flex-col`}>
        {title && (
          <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-100">
            <h2 className="text-base sm:text-lg font-semibold text-gray-900 pr-2">{title}</h2>
            <button onClick={onClose} className="btn-ghost p-1 shrink-0">
              <X size={18} />
            </button>
          </div>
        )}
        <div className="modal-body flex-1 overflow-y-auto px-4 sm:px-6 py-4">
          {children}
        </div>
        {footer && (
          <div className="px-4 sm:px-6 py-3 sm:py-4 border-t border-gray-100 flex flex-wrap items-center justify-end gap-2 sm:gap-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
