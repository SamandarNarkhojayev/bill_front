// Чистый переводчик БЕЗ импорта стора — его можно безопасно использовать
// и в сторе (useStore), и где угодно, не создавая циклических зависимостей.
import type { AppLanguage } from '../types';
import { ru } from './locales/ru';
import { kk } from './locales/kk';
import { uz } from './locales/uz';
import { en } from './locales/en';
import { tournaments } from './pages/tournaments';
import { tariffs } from './pages/tariffs';
import { reports } from './pages/reports';
import { users } from './pages/users';

export type DictNode = { [k: string]: string | DictNode };

// Доп. неймспейсы по страницам (переводятся отдельными файлами в ./pages)
const pageNamespaces = (lang: AppLanguage): DictNode => ({
  tournaments: tournaments[lang] as DictNode,
  tariffs: tariffs[lang] as DictNode,
  reports: reports[lang] as DictNode,
  users: users[lang] as DictNode,
});

export const LANGUAGES: { code: AppLanguage; label: string; flag: string }[] = [
  { code: 'ru', label: 'Русский', flag: '🇷🇺' },
  { code: 'kk', label: 'Қазақша', flag: '🇰🇿' },
  { code: 'uz', label: "O'zbekcha", flag: '🇺🇿' },
  { code: 'en', label: 'English', flag: '🇬🇧' },
];

const DICTS: Record<AppLanguage, DictNode> = {
  ru: { ...(ru as DictNode), ...pageNamespaces('ru') },
  kk: { ...(kk as DictNode), ...pageNamespaces('kk') },
  uz: { ...(uz as DictNode), ...pageNamespaces('uz') },
  en: { ...(en as DictNode), ...pageNamespaces('en') },
};

const resolve = (dict: DictNode, path: string): string | undefined => {
  const value = path.split('.').reduce<string | DictNode | undefined>((acc, key) => {
    if (acc && typeof acc === 'object') return acc[key];
    return undefined;
  }, dict);
  return typeof value === 'string' ? value : undefined;
};

/** Перевод по коду языка. Откат: выбранный язык → ru → сам ключ. */
export const translate = (
  lang: AppLanguage,
  key: string,
  params?: Record<string, string | number>
): string => {
  let str = resolve(DICTS[lang] || ru, key) ?? resolve(ru as DictNode, key) ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }
  return str;
};
