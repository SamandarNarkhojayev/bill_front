/**
 * Императивный контроллер подтверждений: `const ok = await showConfirm({...})`.
 * Вынесен из ConfirmDialog.tsx, чтобы тот экспортировал только компонент
 * (иначе ломается react-refresh). Хост регистрирует себя через registerConfirm.
 */
export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean; // красная кнопка действия (удаление и т.п.)
}

export type PendingConfirm = ConfirmOptions & { resolve: (value: boolean) => void };

// Единственный подписчик — смонтированный <ConfirmDialogHost />. Нет хоста → confirm = false.
let notify: ((pending: PendingConfirm | null) => void) | null = null;

export function registerConfirm(fn: ((pending: PendingConfirm | null) => void) | null): void {
  notify = fn;
}

export function showConfirm(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    if (!notify) { resolve(false); return; }
    notify({ ...options, resolve });
  });
}
