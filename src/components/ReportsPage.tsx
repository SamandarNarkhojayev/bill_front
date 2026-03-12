import React, { useState, useMemo } from 'react';
import {
  BarChart3,
  Calendar,
  DollarSign,
  Clock,
  TrendingUp,
  Users,
  ShoppingBag,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useStore } from '../store/useStore';

const ReportsPage: React.FC = () => {
  const { sessionHistory, settings } = useStore();
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [viewMode, setViewMode] = useState<'day' | 'week' | 'all'>('day');

  // Фильтрация по дате
  const filteredSessions = useMemo(() => {
    if (viewMode === 'all') return sessionHistory;
    if (viewMode === 'day') {
      return sessionHistory.filter((s) => s.date === selectedDate);
    }
    // week
    const selected = new Date(selectedDate);
    const weekStart = new Date(selected);
    weekStart.setDate(selected.getDate() - selected.getDay() + 1);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    return sessionHistory.filter((s) => {
      const d = new Date(s.date);
      return d >= weekStart && d <= weekEnd;
    });
  }, [sessionHistory, selectedDate, viewMode]);

  // Статистика
  const stats = useMemo(() => {
    const tableRev = filteredSessions.reduce((sum, s) => sum + s.tableCost, 0);
    const barRev = filteredSessions.reduce((sum, s) => sum + s.barCost, 0);
    const totalRev = tableRev + barRev;
    const totalHours = filteredSessions.reduce((sum, s) => sum + s.duration, 0) / 60;
    const avgSession = filteredSessions.length > 0
      ? Math.round(filteredSessions.reduce((sum, s) => sum + s.duration, 0) / filteredSessions.length)
      : 0;
    const avgCheck = filteredSessions.length > 0
      ? Math.round(totalRev / filteredSessions.length)
      : 0;

    // По столам
    const byTable: Record<string, { sessions: number; revenue: number; hours: number }> = {};
    filteredSessions.forEach((s) => {
      if (!byTable[s.tableName]) byTable[s.tableName] = { sessions: 0, revenue: 0, hours: 0 };
      byTable[s.tableName].sessions++;
      byTable[s.tableName].revenue += s.totalCost;
      byTable[s.tableName].hours += s.duration / 60;
    });

    // По часам дня
    const byHour: number[] = new Array(24).fill(0);
    filteredSessions.forEach((s) => {
      const hour = new Date(s.startTime).getHours();
      byHour[hour]++;
    });

    return { tableRev, barRev, totalRev, totalHours, avgSession, avgCheck, byTable, byHour, count: filteredSessions.length };
  }, [filteredSessions]);

  const maxByHour = Math.max(...stats.byHour, 1);

  const changeDate = (delta: number) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + delta);
    setSelectedDate(d.toISOString().split('T')[0]);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('ru-RU', {
      weekday: 'short',
      day: 'numeric',
      month: 'long',
    });
  };

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="page-content">
      <div className="page-header">
        <div className="page-header-left">
          <BarChart3 size={28} className="text-violet-400" />
          <h2 className="page-title">Отчёты</h2>
        </div>
        <div className="page-tabs">
          <button
            onClick={() => setViewMode('day')}
            className={`page-tab ${viewMode === 'day' ? 'active' : ''}`}
          >
            День
          </button>
          <button
            onClick={() => setViewMode('week')}
            className={`page-tab ${viewMode === 'week' ? 'active' : ''}`}
          >
            Неделя
          </button>
          <button
            onClick={() => setViewMode('all')}
            className={`page-tab ${viewMode === 'all' ? 'active' : ''}`}
          >
            Всё время
          </button>
        </div>
      </div>

      {/* Переключение даты */}
      {viewMode !== 'all' && (
        <div className="date-nav">
          <button onClick={() => changeDate(-1)} className="date-nav-btn">
            <ChevronLeft size={20} />
          </button>
          <div className="date-nav-current">
            <Calendar size={16} />
            <span>{formatDate(selectedDate)}</span>
          </div>
          <button onClick={() => changeDate(1)} className="date-nav-btn">
            <ChevronRight size={20} />
          </button>
          <button
            onClick={() => setSelectedDate(new Date().toISOString().split('T')[0])}
            className="btn btn-ghost btn-sm"
          >
            Сегодня
          </button>
        </div>
      )}

      {/* Карточки статистики */}
      <div className="report-stats">
        <div className="report-stat-card green">
          <div className="report-stat-icon">
            <DollarSign size={24} />
          </div>
          <div>
            <p className="report-stat-label">Общая выручка</p>
            <p className="report-stat-value">
              {stats.totalRev.toLocaleString()} {settings.currency}
            </p>
          </div>
        </div>
        <div className="report-stat-card emerald">
          <div className="report-stat-icon">
            <Clock size={24} />
          </div>
          <div>
            <p className="report-stat-label">Столы</p>
            <p className="report-stat-value">
              {stats.tableRev.toLocaleString()} {settings.currency}
            </p>
          </div>
        </div>
        <div className="report-stat-card amber">
          <div className="report-stat-icon">
            <ShoppingBag size={24} />
          </div>
          <div>
            <p className="report-stat-label">Бар</p>
            <p className="report-stat-value">
              {stats.barRev.toLocaleString()} {settings.currency}
            </p>
          </div>
        </div>
        <div className="report-stat-card blue">
          <div className="report-stat-icon">
            <Users size={24} />
          </div>
          <div>
            <p className="report-stat-label">Игр</p>
            <p className="report-stat-value">{stats.count}</p>
          </div>
        </div>
        <div className="report-stat-card violet">
          <div className="report-stat-icon">
            <TrendingUp size={24} />
          </div>
          <div>
            <p className="report-stat-label">Средний чек</p>
            <p className="report-stat-value">
              {stats.avgCheck.toLocaleString()} {settings.currency}
            </p>
          </div>
        </div>
        <div className="report-stat-card sky">
          <div className="report-stat-icon">
            <Clock size={24} />
          </div>
          <div>
            <p className="report-stat-label">Среднее время</p>
            <p className="report-stat-value">{stats.avgSession} мин</p>
          </div>
        </div>
      </div>

      {/* Графики */}
      <div className="report-charts">
        {/* По столам */}
        <div className="report-chart-card">
          <h3 className="report-chart-title">Выручка по столам</h3>
          <div className="report-bar-chart">
            {Object.entries(stats.byTable).map(([name, data]) => (
              <div key={name} className="report-bar-row">
                <span className="report-bar-label">{name}</span>
                <div className="report-bar-track">
                  <div
                    className="report-bar-fill green"
                    style={{
                      width: `${stats.totalRev > 0 ? (data.revenue / stats.totalRev) * 100 : 0}%`,
                    }}
                  />
                </div>
                <span className="report-bar-value">
                  {data.revenue.toLocaleString()} {settings.currency}
                </span>
              </div>
            ))}
            {Object.keys(stats.byTable).length === 0 && (
              <p className="text-slate-500 text-sm text-center py-4">Нет данных</p>
            )}
          </div>
        </div>

        {/* По часам */}
        <div className="report-chart-card">
          <h3 className="report-chart-title">Загрузка по часам</h3>
          <div className="report-hours-chart">
            {stats.byHour.map((count, hour) => (
              <div key={hour} className="report-hour-bar">
                <div
                  className="report-hour-fill"
                  style={{ height: `${(count / maxByHour) * 100}%` }}
                />
                <span className="report-hour-label">
                  {hour % 3 === 0 ? `${hour}` : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Таблица сессий */}
      <div className="report-table-card">
        <h3 className="report-chart-title">История игр</h3>
        {filteredSessions.length === 0 ? (
          <div className="report-empty">
            <BarChart3 size={48} className="text-slate-600" />
            <p>Нет записей за выбранный период</p>
          </div>
        ) : (
          <div className="report-table-wrapper">
            <table className="report-table">
              <thead>
                <tr>
                  <th>Стол</th>
                  <th>Режим</th>
                  <th>Начало</th>
                  <th>Конец</th>
                  <th>Время</th>
                  <th>Стол</th>
                  <th>Бар</th>
                  <th>Итого</th>
                </tr>
              </thead>
              <tbody>
                {filteredSessions
                  .slice()
                  .reverse()
                  .map((session) => (
                    <tr key={session.id}>
                      <td>{session.tableName}</td>
                      <td>{session.mode === 'time' ? 'По времени' : session.mode === 'amount' ? 'На сумму' : 'Бессрочно'}</td>
                      <td>{formatTime(session.startTime)}</td>
                      <td>{formatTime(session.endTime)}</td>
                      <td>{session.duration} мин</td>
                      <td className="text-emerald-400">
                        {session.tableCost.toLocaleString()} {settings.currency}
                      </td>
                      <td className="text-amber-400">
                        {session.barCost.toLocaleString()} {settings.currency}
                      </td>
                      <td className="font-bold">
                        {session.totalCost.toLocaleString()} {settings.currency}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default ReportsPage;
