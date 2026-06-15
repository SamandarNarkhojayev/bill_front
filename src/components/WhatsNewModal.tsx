import React from 'react';
import { Sparkles, X, Check } from 'lucide-react';
import { useT } from '../i18n';
import { CHANGELOG, type ChangelogEntry } from '../i18n/changelog';
import type { AppLanguage } from '../types';

// Сравнение semver: >0 если a новее b
const cmpVersion = (a: string, b: string): number => {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d;
  }
  return 0;
};

// Записи новее, чем lastSeenVersion (и не новее текущей версии приложения)
export const getUnseenEntries = (lastSeen: string, current: string): ChangelogEntry[] =>
  CHANGELOG.filter(
    (e) => cmpVersion(e.version, lastSeen) > 0 && cmpVersion(e.version, current) <= 0
  );

const highlightsFor = (entry: ChangelogEntry, lang: AppLanguage): string[] => {
  const arr = entry.highlights[lang];
  if (arr && arr.length > 0) return arr;
  return entry.highlights.ru || [];
};

const WhatsNewModal: React.FC<{ entries: ChangelogEntry[]; onClose: () => void }> = ({ entries, onClose }) => {
  const { t, lang } = useT();
  if (entries.length === 0) return null;
  const latest = entries[0];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal whatsnew-modal" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="modal-close whatsnew-close"><X size={20} /></button>
        <div className="whatsnew-hero">
          <div className="whatsnew-badge"><Sparkles size={26} /></div>
          <h2 className="whatsnew-title">{t('whatsNew.title')}</h2>
          <p className="whatsnew-version">{t('whatsNew.subtitle', { version: latest.version })}</p>
        </div>

        <div className="whatsnew-body">
          {entries.map((entry) => (
            <div key={entry.version} className="whatsnew-entry">
              {entries.length > 1 && <div className="whatsnew-entry-ver">v{entry.version}</div>}
              <ul className="whatsnew-list">
                {highlightsFor(entry, lang).map((h, i) => (
                  <li key={i}>
                    <Check size={16} className="whatsnew-check" />
                    <span>{h}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="whatsnew-actions">
          <button onClick={onClose} className="btn btn-primary btn-full">{t('whatsNew.got_it')}</button>
        </div>
      </div>
    </div>
  );
};

export default WhatsNewModal;
