/**
 * Модалка подтверждения отмены позиции. Защита без ролей: чтобы отменить,
 * нужно ввести пароль любого активного пользователя (тот же, что при входе) и
 * обязательную причину. Оба поля уходят в журнал отмён (см. cancelSlice).
 *
 * Хост монтируется один раз в App. Императивный API — в ./cancelAuthController.
 * Клавиатура: Enter в поле пароля — подтвердить, Escape / клик по фону — отмена.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ShieldAlert, Lock } from 'lucide-react';
import { registerCancelAuth, type PendingCancelAuth, type CancelAuthResult } from './cancelAuthController';
import { useStore } from '../store/useStore';
import { hashPassword } from '../store/helpers';
import { useT } from '../i18n';
import ModalCloseX from './ModalCloseX';

export const CancelAuthDialogHost: React.FC = () => {
  const [pending, setPending] = useState<PendingCancelAuth | null>(null);
  const [password, setPassword] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const pwdRef = useRef<HTMLInputElement>(null);
  const users = useStore((s) => s.users);
  const { t } = useT();

  useEffect(() => {
    registerCancelAuth(setPending);
    return () => registerCancelAuth(null);
  }, []);

  // Сбрасываем поля при каждом открытии и фокусируемся на пароле.
  useEffect(() => {
    if (pending) {
      setPassword('');
      setReason('');
      setError(null);
      const id = setTimeout(() => pwdRef.current?.focus(), 0);
      return () => clearTimeout(id);
    }
  }, [pending]);

  const resolveWith = useCallback((value: CancelAuthResult | null) => {
    setPending((cur) => { cur?.resolve(value); return null; });
  }, []);

  const submit = useCallback(() => {
    if (!pending) return;
    const trimmedReason = reason.trim();
    if (!trimmedReason) { setError(t('cancel.reason_required')); return; }
    const hashed = hashPassword(password);
    const user = users.find((u) => u.password === hashed && u.isActive);
    if (!user) { setError(t('cancel.wrong_password')); return; }
    pending.resolve({ authorizedById: user.id, authorizedByName: user.displayName, reason: trimmedReason });
    setPending(null);
  }, [pending, reason, password, users, t]);

  // Escape закрывает диалог.
  useEffect(() => {
    if (!pending) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); resolveWith(null); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [pending, resolveWith]);

  if (!pending) return null;

  const presetReasons = [
    t('cancel.reason_mistake'),
    t('cancel.reason_guest_refused'),
    t('cancel.reason_duplicate'),
    t('cancel.reason_wrong_item'),
  ];

  return (
    <div className="modal-overlay" onClick={() => resolveWith(null)}>
      <div className="modal confirm-modal cancel-auth-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <ModalCloseX onClose={() => resolveWith(null)} />
        <h2 className="modal-title">
          <ShieldAlert size={20} className="text-red-400" />
          {pending.title || t('cancel.dialog_title')}
        </h2>
        <p className="confirm-modal-message">
          {pending.message || t('cancel.dialog_message')}
          {pending.itemLabel ? <><br /><strong>{pending.itemLabel}</strong></> : null}
        </p>

        <div className="cancel-auth-field">
          <label className="cancel-auth-label">{t('cancel.reason_label')}</label>
          <div className="cancel-auth-reasons">
            {presetReasons.map((r) => (
              <button
                key={r}
                type="button"
                className={`cancel-reason-chip ${reason === r ? 'active' : ''}`}
                onClick={() => { setReason(r); setError(null); }}
              >
                {r}
              </button>
            ))}
          </div>
          <input
            type="text"
            className="cancel-auth-input"
            value={reason}
            onChange={(e) => { setReason(e.target.value); setError(null); }}
            placeholder={t('cancel.reason_placeholder')}
          />
        </div>

        <div className="cancel-auth-field">
          <label className="cancel-auth-label"><Lock size={13} /> {t('cancel.password_label')}</label>
          <input
            ref={pwdRef}
            type="password"
            className="cancel-auth-input"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError(null); }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }}
            placeholder={t('cancel.password_placeholder')}
          />
        </div>

        {error && <p className="cancel-auth-error">{error}</p>}

        <div className="confirm-modal-actions">
          <button className="btn btn-ghost" onClick={() => resolveWith(null)}>{t('common.cancel')}</button>
          <button className="btn btn-danger" onClick={submit}>{t('cancel.confirm_btn')}</button>
        </div>
      </div>
    </div>
  );
};

export default CancelAuthDialogHost;
