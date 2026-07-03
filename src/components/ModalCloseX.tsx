/**
 * Единый крестик закрытия для модалок без «шапки» (.modal-header-bar).
 * Держится в правом верхнем углу и остаётся на месте при прокрутке содержимого
 * (position: sticky внутри скролл-контейнера .modal). Ставится ПЕРВЫМ ребёнком
 * .modal — тогда float+sticky прижимают его к верхнему правому углу.
 */
import React from 'react';
import { X } from 'lucide-react';

export const ModalCloseX: React.FC<{ onClose: () => void; title?: string }> = ({ onClose, title }) => (
  <button type="button" className="modal-x" onClick={onClose} aria-label={title || 'Закрыть'} title={title}>
    <X size={18} />
  </button>
);

export default ModalCloseX;
