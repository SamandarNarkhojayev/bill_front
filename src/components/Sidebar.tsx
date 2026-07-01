import React, { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  LayoutDashboard,
  Wine,
  BarChart3,
  Settings,
  CircleDot,
  Sun,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Users,
  LogOut,
  Trophy,
  Tag,
  ChefHat,
  MoreHorizontal,
  ChevronDown,
} from 'lucide-react';
import { useStore } from '../store/useStore';
import { useT, LANGUAGES } from '../i18n';
import type { PageType } from '../types';

// «База знаний» (knowledge) намеренно не в этом списке — она открывается из Настроек.
const menuItems: { id: PageType; labelKey: string; icon: React.ReactNode }[] = [
  { id: 'dashboard', labelKey: 'nav.dashboard', icon: <LayoutDashboard size={20} /> },
  { id: 'bar', labelKey: 'nav.bar', icon: <Wine size={20} /> },
  { id: 'tournaments', labelKey: 'nav.tournaments', icon: <Trophy size={20} /> },
  { id: 'tariffs', labelKey: 'nav.tariffs', icon: <Tag size={20} /> },
  { id: 'reports', labelKey: 'nav.reports', icon: <BarChart3 size={20} /> },
  { id: 'users', labelKey: 'nav.users', icon: <Users size={20} /> },
  { id: 'settings', labelKey: 'nav.settings', icon: <Settings size={20} /> },
];

const Sidebar: React.FC = () => {
  // Узкая подписка: сайдбар всегда смонтирован, раньше ре-рендерился на любое
  // изменение стора (тост/продажа/тик). Теперь — только на нужные срезы. Счётчик
  // занятых столов берём отдельными примитивными селекторами, чтобы сайдбар не
  // ре-рендерился на каждое изменение массива tables (свет/стоимость), а лишь когда
  // реально меняется число занятых/всего.
  const { currentPage, setCurrentPage, settings, updateSettings, sidebarCollapsed, toggleSidebar, logout, currentUser } = useStore(
    useShallow((s) => ({
      currentPage: s.currentPage,
      setCurrentPage: s.setCurrentPage,
      settings: s.settings,
      updateSettings: s.updateSettings,
      sidebarCollapsed: s.sidebarCollapsed,
      toggleSidebar: s.toggleSidebar,
      logout: s.logout,
      currentUser: s.currentUser,
    }))
  );
  const { t } = useT();
  const [moreOpen, setMoreOpen] = useState(false);

  const occupiedTables = useStore((s) => s.tables.filter((tbl) => tbl.status === 'occupied').length);
  const totalTables = useStore((s) => s.tables.length);

  const canManageUsers = currentUser?.role === 'admin' || currentUser?.role === 'developer';
  // Пункт «Кухня» показываем только когда включено разделение бара и кухни
  const navItems = settings.kitchenSeparate
    ? menuItems.flatMap((item) =>
        item.id === 'bar'
          ? [item, { id: 'kitchen' as PageType, labelKey: 'nav.kitchen', icon: <ChefHat size={20} /> }]
          : [item]
      )
    : menuItems;
  const visibleMenuItems = navItems.filter((item) => item.id !== 'users' || canManageUsers);

  // Для роли «user» админ ограничивает набор пунктов меню (dashboard виден всегда).
  const isUser = currentUser?.role === 'user';
  const userAllowed = settings.userVisiblePages ?? [];
  const roleVisibleItems = isUser
    ? visibleMenuItems.filter((item) => item.id === 'dashboard' || userAllowed.includes(item.id))
    : visibleMenuItems;

  // Закреплённые пункты — наверху; остальные — в «Ещё» (стиль Bitrix24, настраивается).
  // Для обычного пользователя «Ещё» не используем — показываем все доступные пункты сразу.
  const pinned = settings.sidebarPinned && settings.sidebarPinned.length > 0
    ? settings.sidebarPinned
    : ['dashboard', 'bar', 'reports', 'settings'];
  const pinnedItems = isUser ? roleVisibleItems : roleVisibleItems.filter((item) => pinned.includes(item.id));
  const moreItems = isUser ? [] : roleVisibleItems.filter((item) => !pinned.includes(item.id));
  // Если активная страница спрятана в «Ещё» — раскрываем список
  const activeInMore = moreItems.some((item) => item.id === currentPage);

  const renderNavButton = (item: { id: PageType; labelKey: string; icon: React.ReactNode }) => (
    <button
      key={item.id}
      onClick={() => setCurrentPage(item.id)}
      className={`sidebar-nav-item ${currentPage === item.id ? 'active' : ''}`}
    >
      <span className="sidebar-nav-icon">{item.icon}</span>
      <span className="sidebar-nav-label">{t(item.labelKey)}</span>
      {item.id === 'dashboard' && occupiedTables > 0 && (
        <span className="sidebar-badge">
          {occupiedTables}/{totalTables}
        </span>
      )}
    </button>
  );

  return (
    <aside className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
      {/* Лого */}
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <CircleDot size={32} className="text-emerald-400" />
          <div className="sidebar-logo-text">
            <h1 className="sidebar-title">{settings.clubName}</h1>
            <p className="sidebar-subtitle">{t('nav.subtitle')}</p>
          </div>
        </div>
      </div>

      {/* Навигация */}
      <nav className="sidebar-nav">
        {pinnedItems.map(renderNavButton)}
        {moreItems.length > 0 && (
          <>
            <button
              className={`sidebar-nav-item sidebar-more-toggle ${(moreOpen || activeInMore) ? 'open' : ''}`}
              onClick={() => setMoreOpen((v) => !v)}
            >
              <span className="sidebar-nav-icon"><MoreHorizontal size={20} /></span>
              <span className="sidebar-nav-label">{t('nav.more')}</span>
              <ChevronDown size={16} className={`sidebar-more-chevron ${(moreOpen || activeInMore) ? 'rot' : ''}`} />
            </button>
            {(moreOpen || activeInMore) && (
              <div className="sidebar-more-list">
                {moreItems.map(renderNavButton)}
              </div>
            )}
          </>
        )}
      </nav>

      {/* Нижняя секция */}
      <div className="sidebar-footer">
        {/* Переключатели темы и языка */}
        <div className="sidebar-prefs">
          <div className="seg-toggle theme-seg">
            <button
              className={`seg-option ${settings.theme === 'light' ? 'active' : ''}`}
              onClick={() => updateSettings({ theme: 'light' })}
              title={t('nav.theme_light')}
            >
              <Sun size={16} />
              <span className="seg-label">{t('nav.light')}</span>
            </button>
            <button
              className={`seg-option ${settings.theme === 'dark' ? 'active' : ''}`}
              onClick={() => updateSettings({ theme: 'dark' })}
              title={t('nav.theme_dark')}
            >
              <Moon size={16} />
              <span className="seg-label">{t('nav.dark')}</span>
            </button>
          </div>
          <div className="seg-toggle lang-seg">
            {LANGUAGES.map((l) => (
              <button
                key={l.code}
                className={`seg-option ${settings.language === l.code ? 'active' : ''}`}
                onClick={() => updateSettings({ language: l.code })}
                title={l.label}
              >
                {l.code.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <button className="sidebar-collapse-btn" onClick={toggleSidebar} title={sidebarCollapsed ? t('nav.expand') : t('nav.collapse')}>
          {sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          <span className="sidebar-collapse-label">{sidebarCollapsed ? t('nav.expand') : t('nav.collapse')}</span>
        </button>

        <button className="sidebar-logout-btn" onClick={logout} title={t('nav.logout')}>
          <LogOut size={18} />
          <span>{t('nav.logout')}</span>
        </button>

        <div className="sidebar-version">v{__APP_VERSION__}</div>
      </div>
    </aside>
  );
};

export default Sidebar;
