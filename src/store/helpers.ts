// Чистые утилиты стора (без зависимостей от состояния) — вынесены из useStore.ts.

// Генерация короткого уникального id.
export const generateId = (): string =>
  Math.random().toString(36).substring(2, 9) + Date.now().toString(36);

// Локальная дата в формате YYYY-MM-DD (без UTC-сдвига).
export const localDateStr = (d: Date = new Date()): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

// Простое хеширование пароля (для локального хранения, не криптостойкое).
export const hashPassword = (password: string): string => {
  let hash = 0;
  for (let i = 0; i < password.length; i++) {
    const char = password.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return 'h_' + Math.abs(hash).toString(36) + '_' + password.length;
};
