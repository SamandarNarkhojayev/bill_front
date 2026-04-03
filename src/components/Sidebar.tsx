import React from 'react';
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
} from 'lucide-react';
import { useStore } from '../store/useStore';
import type { PageType } from '../types';

const menuItems: { id: PageType; label: string; icon: React.ReactNode }[] = [
  { id: 'dashboard', label: 'Столы', icon: <LayoutDashboard size={20} /> },
  { id: 'bar', label: 'Бар', icon: <Wine size={20} /> },
  { id: 'tournaments', label: 'Турниры', icon: <Trophy size={20} /> },
  { id: 'tariffs', label: 'Тарифы', icon: <Tag size={20} /> },
  { id: 'reports', label: 'Отчёты', icon: <BarChart3 size={20} /> },
  { id: 'users', label: 'Пользователи', icon: <Users size={20} /> },
  { id: 'settings', label: 'Настройки', icon: <Settings size={20} /> },
];

const Sidebar: React.FC = () => {
  const { currentPage, setCurrentPage, settings, updateSettings, tables, sidebarCollapsed, toggleSidebar, logout, currentUser } = useStore();

  const occupiedTables = tables.filter((t) => t.status === 'occupied').length;
  const totalTables = tables.length;

  const toggleTheme = () => {
    updateSettings({ theme: settings.theme === 'dark' ? 'light' : 'dark' });
  };

  const canManageUsers = currentUser?.role === 'admin' || currentUser?.role === 'developer';
  const visibleMenuItems = menuItems.filter((item) => item.id !== 'users' || canManageUsers);

  return (
    <aside className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
      {/* Лого */}
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <CircleDot size={32} className="text-emerald-400" />
          <div className="sidebar-logo-text">
            <h1 className="sidebar-title">{settings.clubName}</h1>
            <p className="sidebar-subtitle">Система управления</p>
          </div>
        </div>
      </div>

      {/* Навигация */}
      <nav className="sidebar-nav">
        {visibleMenuItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setCurrentPage(item.id)}
            className={`sidebar-nav-item ${
              currentPage === item.id ? 'active' : ''
            }`}
          >
            <span className="sidebar-nav-icon">{item.icon}</span>
            <span className="sidebar-nav-label">{item.label}</span>
            {item.id === 'dashboard' && occupiedTables > 0 && (
              <span className="sidebar-badge">
                {occupiedTables}/{totalTables}
              </span>
            )}
          </button>
        ))}
      </nav>

      {/* Нижняя секция */}
      <div className="sidebar-footer">
        {/* Переключатель темы */}


        <button className="theme-toggle-btn " onClick={toggleTheme} title="Переключить тему">
          {settings.theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          <span>{settings.theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}</span>
        </button>

        <button className="sidebar-collapse-btn" onClick={toggleSidebar} title={sidebarCollapsed ? 'Развернуть' : 'Свернуть'}>
          {sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          <span className="sidebar-collapse-label">{sidebarCollapsed ? 'Развернуть' : 'Свернуть'}</span>
        </button>

        <button className="sidebar-logout-btn" onClick={logout} title="Выйти">
          <LogOut size={18} />
          <span>Выйти</span>
        </button>


        {/* <div className="sidebar-stats">
          <div className="sidebar-stat">
            <span className="sidebar-stat-label">Занято столов</span>
            <span className="sidebar-stat-value text-emerald-400">
              {occupiedTables} / {totalTables}
            </span>
          </div>
          <div className="sidebar-stat">
            <span className="sidebar-stat-label">Свободных</span>
            <span className="sidebar-stat-value text-sky-400">
              {totalTables - occupiedTables}
            </span>
          </div>
        </div> */}
        <div className="sidebar-version">v{__APP_VERSION__}</div>
      </div>
    </aside>
  );
};

export default Sidebar;
