import { useStore } from '../store/useStore';
import type { AppLanguage } from '../types';
import { translate } from './translate';

export { LANGUAGES, translate } from './translate';
export type { DictNode } from './translate';

/** Хук перевода для компонентов. Подписан только на settings.language. */
export const useT = () => {
  const lang = (useStore((s) => s.settings.language) || 'ru') as AppLanguage;
  const t = (key: string, params?: Record<string, string | number>) => translate(lang, key, params);
  return { t, lang };
};
