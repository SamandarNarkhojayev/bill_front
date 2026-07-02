/**
 * Единое модальное подтверждение вместо нативного window.confirm().
 *
 * Хост <ConfirmDialogHost /> монтируется один раз в App и рисует модалку в теме
 * приложения. Императивный API showConfirm() живёт в ./confirmController.
 * Клавиатура: Enter — подтвердить, Escape / клик по фону — отмена, автофокус на
 * кнопке действия. Так подтверждения выглядят одинаково и работают с клавиатуры
 * (в отличие от нативного confirm, который блокирует поток и не стилизуется).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, HelpCircle } from 'lucide-react';
import { registerConfirm, type PendingConfirm } from './confirmController';

export const ConfirmDialogHost: React.FC = () => {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    registerConfirm(setPending);
    return () => registerConfirm(null);
  }, []);

  // Закрыть с результатом; функциональный апдейт гарантирует резолв текущего запроса.
  const close = useCallback((value: boolean) => {
    setPending((cur) => { cur?.resolve(value); return null; });
  }, []);

  // Автофокус на кнопке подтверждения при открытии.
  useEffect(() => {
    if (pending) confirmBtnRef.current?.focus();
  }, [pending]);

  // Enter — подтвердить, Escape — отмена.
  useEffect(() => {
    if (!pending) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); close(false); }
      else if (e.key === 'Enter') { e.preventDefault(); close(true); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [pending, close]);

  if (!pending) return null;

  return (
    <div className="modal-overlay" onClick={() => close(false)}>
      <div
        className="modal confirm-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <h2 className="modal-title">
          {pending.danger
            ? <AlertTriangle size={20} className="text-red-400" />
            : <HelpCircle size={20} className="text-emerald-400" />}
          {pending.title || 'Подтверждение'}
        </h2>
        <p className="confirm-modal-message">{pending.message}</p>
        <div className="confirm-modal-actions">
          <button className="btn btn-ghost" onClick={() => close(false)}>
            {pending.cancelText || 'Отмена'}
          </button>
          <button
            ref={confirmBtnRef}
            className={`btn ${pending.danger ? 'btn-danger' : 'btn-primary'}`}
            onClick={() => close(true)}
          >
            {pending.confirmText || 'Подтвердить'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialogHost;
