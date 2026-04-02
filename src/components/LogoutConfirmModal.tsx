import React from 'react';
import { Clock, LogOut, X } from 'lucide-react';
import type { Shift } from '../types';

interface LogoutConfirmModalProps {
  shift: Shift;
  onConfirm: () => void;
  onCancel: () => void;
}

const LogoutConfirmModal: React.FC<LogoutConfirmModalProps> = ({ shift, onConfirm, onCancel }) => {
  const startTime = new Date(shift.startTime).toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  });
  const endTime = new Date().toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal modal-md logout-confirm-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close-btn" onClick={onCancel}>
          <X size={20} />
        </button>

        <div className="logout-confirm-icon">
          <Clock size={56} />
        </div>

        <h2 className="logout-confirm-title">Завершение смены</h2>

        <div className="logout-confirm-details">
          <div className="logout-confirm-row">
            <span className="logout-confirm-label">Начало смены:</span>
            <span className="logout-confirm-value">{startTime}</span>
          </div>
          <div className="logout-confirm-row">
            <span className="logout-confirm-label">Конец смены:</span>
            <span className="logout-confirm-value">{endTime}</span>
          </div>
        </div>

        <p className="logout-confirm-description">
          При выходе из системы активная смена будет завершена. Все данные будут сохранены в истории отчетов.
        </p>

        <div className="logout-confirm-actions">
          <button onClick={onCancel} className="btn btn-ghost">
            Отмена
          </button>
          <button onClick={onConfirm} className="btn btn-primary logout-confirm-btn">
            <LogOut size={16} />
            Завершить смену
          </button>
        </div>
      </div>
    </div>
  );
};

export default LogoutConfirmModal;