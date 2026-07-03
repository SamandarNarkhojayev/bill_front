/**
 * Императивный контроллер подтверждения отмены позиции:
 *   const auth = await requestCancelAuth({ itemLabel: 'Кофе × 2' });
 *   if (auth) store.cancelOpenTableItem(tableId, itemId, auth);
 *
 * Модалка <CancelAuthDialogHost /> просит ввести пароль (сверяется с любым
 * активным пользователем — как при входе) и обязательную причину. Резолвится
 * либо данными подтверждения (CancelAuthResult), либо null (отменили/нет хоста).
 *
 * Вынесен из CancelAuthDialog.tsx, чтобы тот экспортировал только компонент
 * (иначе ломается react-refresh) — по образцу confirmController.ts.
 */
import type { CancelAuthMeta } from '../types';

export type CancelAuthResult = CancelAuthMeta;

export interface CancelAuthOptions {
  title?: string;
  message?: string;
  itemLabel?: string; // что именно отменяем — показывается в диалоге
}

export type PendingCancelAuth = CancelAuthOptions & {
  resolve: (value: CancelAuthResult | null) => void;
};

// Единственный подписчик — смонтированный <CancelAuthDialogHost />.
let notify: ((pending: PendingCancelAuth | null) => void) | null = null;

export function registerCancelAuth(fn: ((pending: PendingCancelAuth | null) => void) | null): void {
  notify = fn;
}

export function requestCancelAuth(options: CancelAuthOptions = {}): Promise<CancelAuthResult | null> {
  return new Promise((resolve) => {
    if (!notify) { resolve(null); return; }
    notify({ ...options, resolve });
  });
}
