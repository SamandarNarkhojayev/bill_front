import { useEffect } from 'react';

/**
 * Клавиатура для модалок: Escape — закрыть, Enter — подтвердить.
 *
 * Вызывать безусловно (правило хуков); открытость модалки передавать через `active`.
 * Enter игнорируется в <textarea>/<select> и на кнопках/ссылках (у них своё поведение),
 * чтобы не мешать вводу и не дублировать клики.
 */
export function useModalKeyboard(opts: {
  onEscape?: () => void;
  onEnter?: () => void;
  active?: boolean;
}): void {
  const { onEscape, onEnter, active = true } = opts;
  useEffect(() => {
    if (!active) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (onEscape) { e.preventDefault(); onEscape(); }
        return;
      }
      if (e.key === 'Enter' && onEnter) {
        const tag = (e.target as HTMLElement | null)?.tagName;
        if (tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON' || tag === 'A') return;
        e.preventDefault();
        onEnter();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onEscape, onEnter, active]);
}
