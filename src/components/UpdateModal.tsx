import React from 'react';
import { AlertTriangle, Download, X } from 'lucide-react';

interface UpdateModalProps {
  version: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const UpdateModal: React.FC<UpdateModalProps> = ({ version, onConfirm, onCancel }) => {
  return (
    <div className="modal-overlay">
      <div className="update-modal">
        <button className="modal-close-btn" onClick={onCancel}>
          <X size={20} />
        </button>

        <div className="update-modal-icon">
          <AlertTriangle size={48} />
        </div>

        <h2 className="update-modal-title">Доступно обновление</h2>
        
        <div className="update-modal-version">
          Версия: <strong>v{version}</strong>
        </div>

        <div className="update-modal-warning">
          <div className="update-modal-warning-title">
            ⚠️ Внимание!
          </div>
          <ul className="update-modal-warning-list">
            <li>Приложение будет временно недоступно</li>
            <li>Все активные сессии будут сохранены</li>
            <li>Процесс обновления займёт 10-30 секунд</li>
            <li>После установки приложение автоматически перезапустится</li>
          </ul>
        </div>

        <p className="update-modal-description">
          Рекомендуем установить обновление в период низкой активности клиентов.
        </p>

        <div className="update-modal-actions">
          <button onClick={onCancel} className="btn btn-ghost">
            Отменить
          </button>
          <button onClick={onConfirm} className="btn btn-primary">
            <Download size={16} />
            Начать обновление
          </button>
        </div>
      </div>
    </div>
  );
};

export default UpdateModal;
