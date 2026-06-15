import React, { useMemo, useState } from 'react';
import {
  BookOpen, Search, LayoutDashboard, Wine, ChefHat, Printer, Tag, Trophy,
  BarChart3, Users, Cloud, Download, Settings, Timer, Package, HelpCircle,
  Lightbulb, Wrench, Shield, CircleDot, Clock,
} from 'lucide-react';
import { useT } from '../i18n';
import { useStore } from '../store/useStore';
import { KB_ARTICLES, type KbArticle } from '../i18n/kb';
import { ru as ruDict } from '../i18n/locales/ru';

const ICONS: Record<string, React.FC<{ size?: number; className?: string }>> = {
  LayoutDashboard, Wine, ChefHat, Printer, Tag, Trophy, BarChart3, Users,
  Cloud, Download, Settings, Timer, Package, BookOpen, Lightbulb, Wrench,
  Shield, CircleDot, HelpCircle, Clock,
};
const iconFor = (name: string) => ICONS[name] || HelpCircle;

// Текст: абзацы через \n\n; строки, начинающиеся с "• " — пункты списка.
const renderBody = (body: string) => {
  const blocks = body.split('\n\n');
  return blocks.map((block, i) => {
    const lines = block.split('\n');
    const bullets = lines.filter((l) => l.trim().startsWith('• '));
    if (bullets.length > 0 && bullets.length === lines.filter((l) => l.trim()).length) {
      return (
        <ul key={i} className="kb-list">
          {bullets.map((b, j) => <li key={j}>{b.replace(/^\s*•\s*/, '')}</li>)}
        </ul>
      );
    }
    return <p key={i} className="kb-paragraph">{block}</p>;
  });
};

const KnowledgePage: React.FC = () => {
  const { t, lang } = useT();
  const setCurrentPage = useStore((s) => s.setCurrentPage);
  const [search, setSearch] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);

  // Статьи текущего языка с откатом на русский
  const articles: KbArticle[] = useMemo(() => {
    const byLang = KB_ARTICLES[lang];
    if (byLang && byLang.length > 0) return byLang;
    return KB_ARTICLES.ru;
  }, [lang]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return articles;
    return articles.filter((a) =>
      a.title.toLowerCase().includes(q) ||
      a.summary.toLowerCase().includes(q) ||
      a.sections.some((s) => s.heading.toLowerCase().includes(q) || s.body.toLowerCase().includes(q))
    );
  }, [articles, search]);

  const active = filtered.find((a) => a.id === activeId) || filtered[0] || null;

  return (
    <div className="page-content">
      <div className="page-header">
        <div className="page-header-left">
          <BookOpen size={28} className="text-emerald-400" />
          <div>
            <h2 className="page-title">{t('kb.title')}</h2>
            <p className="kb-subtitle">{t('kb.subtitle')}</p>
          </div>
        </div>
        <button className="btn btn-ghost" onClick={() => setCurrentPage('settings')}>
          ← {t('kb.back')}
        </button>
      </div>

      <div className="kb-search">
        <Search size={18} className="kb-search-icon" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('kb.search')}
          className="kb-search-input"
        />
      </div>

      {articles.length === 0 ? (
        <div className="kb-empty">{ruDict.common.loading}</div>
      ) : (
        <div className="kb-layout">
          <aside className="kb-sidebar">
            <div className="kb-sidebar-title">{t('kb.contents')}</div>
            {filtered.length === 0 ? (
              <p className="kb-empty">{t('kb.not_found')}</p>
            ) : (
              filtered.map((a) => {
                const Icon = iconFor(a.icon);
                return (
                  <button
                    key={a.id}
                    onClick={() => setActiveId(a.id)}
                    className={`kb-nav-item ${active?.id === a.id ? 'active' : ''}`}
                  >
                    <Icon size={18} />
                    <span>{a.title}</span>
                  </button>
                );
              })
            )}
          </aside>

          <article className="kb-article">
            {active && (
              <>
                <div className="kb-article-head">
                  {React.createElement(iconFor(active.icon), { size: 26, className: 'text-emerald-400' })}
                  <div>
                    <h3 className="kb-article-title">{active.title}</h3>
                    <p className="kb-article-summary">{active.summary}</p>
                  </div>
                </div>
                {active.sections.map((s, i) => (
                  <section key={i} className="kb-section">
                    <h4 className="kb-section-heading">{s.heading}</h4>
                    <div className="kb-section-body">{renderBody(s.body)}</div>
                  </section>
                ))}
              </>
            )}
          </article>
        </div>
      )}
    </div>
  );
};

export default KnowledgePage;
