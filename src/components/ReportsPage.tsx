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
  Filter,
  Download,
  Briefcase,
  Printer,
} from 'lucide-react';
import { useStore } from '../store/useStore';
import { printReceipt, printReportReceipt } from '../utils/receipt';

// Утилита: дата в строку YYYY-MM-DD (локальное время)
const dateToStr = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

// Утилита: строка → локальный Date
const strToDate = (s: string) => {
  if (!s || typeof s !== 'string' || !s.includes('-')) return new Date();
  const [y, m, d] = s.split('-').map(Number);
  const parsed = new Date(y, m - 1, d);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
};

const safeNumber = (value: unknown, fallback = 0): number => {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
};

const safeDate = (value: unknown): Date | null => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

const formatMoney = (value: unknown, currency: string): string => {
  return `${safeNumber(value).toLocaleString()} ${currency}`;
};

const ReportsPage: React.FC = () => {
  const { sessionHistory, settings, currentShift, shiftHistory, addToast } = useStore();
  const isSafeWebViewMode = useMemo(() => {
    if (typeof window === 'undefined') return false;
    try {
      const ua = navigator.userAgent.toLowerCase();
      const embedded = window.self !== window.top;
      return embedded || ua.includes('vscode') || ua.includes('webview');
    } catch {
      return true;
    }
  }, []);
  const [selectedDate, setSelectedDate] = useState(dateToStr(new Date()));
  const [viewMode, setViewMode] = useState<'day' | 'week' | 'range' | 'all' | 'shift'>('day');
  const [selectedShiftId, setSelectedShiftId] = useState<string | null>(null);
  const [rangeStart, setRangeStart] = useState(dateToStr(new Date()));
  const [rangeEnd, setRangeEnd] = useState(dateToStr(new Date()));
  const [showHistoryFilters, setShowHistoryFilters] = useState(false);
  const [historyTableFilter, setHistoryTableFilter] = useState<'all' | string>('all');
  const [historyModeFilter, setHistoryModeFilter] = useState<'all' | 'tariff' | 'time' | 'infinite'>('all');
  const [historyAmountSort, setHistoryAmountSort] = useState<'default' | 'max' | 'min'>('default');
  const [historyTimeSort, setHistoryTimeSort] = useState<'default' | 'max' | 'min'>('default');
  const [historyTableTimeSort, setHistoryTableTimeSort] = useState<'default' | 'max' | 'min'>('default');

  // Активная смена или выбранная из истории
  const activeShift = useMemo(() => {
    if (viewMode !== 'shift') return null;
    if (selectedShiftId) {
      return shiftHistory.find((s) => s.id === selectedShiftId) || currentShift;
    }
    return currentShift;
  }, [viewMode, selectedShiftId, currentShift, shiftHistory]);

  // Фильтрация по дате
  const filteredSessions = useMemo(() => {
    const normalized = sessionHistory.filter((s) => {
      if (!s || typeof s !== 'object') return false;
      const startOk = typeof s.startTime === 'number' && Number.isFinite(s.startTime);
      const dateOk = typeof s.date === 'string' && s.date.length >= 8;
      return startOk && dateOk;
    });

    if (viewMode === 'all') return normalized;
    if (viewMode === 'shift') {
      const shift = activeShift;
      if (!shift) return [];
      const start = shift.startTime;
      const end = shift.endTime || Date.now();
      return normalized.filter((s) => s.startTime >= start && s.startTime <= end);
    }
    if (viewMode === 'day') {
      return normalized.filter((s) => s.date === selectedDate);
    }
    if (viewMode === 'range') {
      return normalized.filter((s) => s.date >= rangeStart && s.date <= rangeEnd);
    }
    // week — понедельник–воскресенье
    const sel = strToDate(selectedDate);
    const day = sel.getDay(); // 0=вс, 1=пн, ...
    const mondayOffset = day === 0 ? -6 : 1 - day;
    const monday = new Date(sel);
    monday.setDate(sel.getDate() + mondayOffset);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const wStart = dateToStr(monday);
    const wEnd = dateToStr(sunday);
    return normalized.filter((s) => s.date >= wStart && s.date <= wEnd);
  }, [sessionHistory, selectedDate, viewMode, rangeStart, rangeEnd, activeShift]);

  // Статистика
  const stats = useMemo(() => {
    const tableRev = filteredSessions.reduce((sum, s) => sum + safeNumber(s.tableCost), 0);
    const barRev = filteredSessions.reduce((sum, s) => sum + safeNumber(s.barCost), 0);
    const totalRev = tableRev + barRev;
    const totalHours = filteredSessions.reduce((sum, s) => sum + safeNumber(s.duration), 0) / 60;
    const avgSession = filteredSessions.length > 0
      ? Math.round(filteredSessions.reduce((sum, s) => sum + safeNumber(s.duration), 0) / filteredSessions.length)
      : 0;
    const avgCheck = filteredSessions.length > 0
      ? Math.round(totalRev / filteredSessions.length)
      : 0;

    // По столам
    const byTable: Record<string, { sessions: number; revenue: number; hours: number }> = {};
    filteredSessions.forEach((s) => {
      if (!byTable[s.tableName]) byTable[s.tableName] = { sessions: 0, revenue: 0, hours: 0 };
      byTable[s.tableName].sessions++;
      byTable[s.tableName].revenue += safeNumber(s.totalCost, safeNumber(s.tableCost) + safeNumber(s.barCost));
      byTable[s.tableName].hours += safeNumber(s.duration) / 60;
    });

    // По часам дня
    const byHour: number[] = new Array(24).fill(0);
    filteredSessions.forEach((s) => {
      const start = safeDate(s.startTime);
      if (!start) return;
      const hour = start.getHours();
      if (hour >= 0 && hour < 24) byHour[hour]++;
    });

    return { tableRev, barRev, totalRev, totalHours, avgSession, avgCheck, byTable, byHour, count: filteredSessions.length };
  }, [filteredSessions]);

  const historyTableNames = useMemo(() => {
    return Array.from(new Set(filteredSessions.map((s) => s.tableName))).sort((a, b) => a.localeCompare(b, 'ru'));
  }, [filteredSessions]);

  const historySessions = useMemo(() => {
    let list = filteredSessions.slice();

    if (historyTableFilter !== 'all') {
      list = list.filter((s) => s.tableName === historyTableFilter);
    }

    if (historyModeFilter === 'tariff') {
      list = list.filter((s) => Boolean(s.tariffName && s.tariffName.trim()));
    }
    if (historyModeFilter === 'time') {
      list = list.filter((s) => s.mode === 'time' && !s.tariffName);
    }
    if (historyModeFilter === 'infinite') {
      list = list.filter((s) => s.mode === 'unlimited' && !s.tariffName);
    }

    if (historyAmountSort === 'max') {
      list.sort((a, b) => safeNumber(a.totalCost) - safeNumber(b.totalCost));
    }
    if (historyAmountSort === 'min') {
      list.sort((a, b) => safeNumber(b.totalCost) - safeNumber(a.totalCost));
    }

    if (historyTimeSort === 'max') {
      list.sort((a, b) => safeNumber(a.duration) - safeNumber(b.duration));
    }
    if (historyTimeSort === 'min') {
      list.sort((a, b) => safeNumber(b.duration) - safeNumber(a.duration));
    }

    // Фильтр для столов по времени - сначала группируем и находим totals по столам
    if (historyTableTimeSort !== 'default') {
      const tableTimeTotals: Record<string, number> = {};
      list.forEach((s) => {
        tableTimeTotals[s.tableName] = (tableTimeTotals[s.tableName] || 0) + safeNumber(s.duration);
      });
      if (historyTableTimeSort === 'max') {
        list.sort((a, b) => (tableTimeTotals[a.tableName] || 0) - (tableTimeTotals[b.tableName] || 0));
      }
      if (historyTableTimeSort === 'min') {
        list.sort((a, b) => (tableTimeTotals[b.tableName] || 0) - (tableTimeTotals[a.tableName] || 0));
      }
    }

    return list;
  }, [filteredSessions, historyTableFilter, historyModeFilter, historyAmountSort, historyTimeSort, historyTableTimeSort]);

  const resetHistoryFilters = () => {
    setHistoryTableFilter('all');
    setHistoryModeFilter('all');
    setHistoryAmountSort('default');
    setHistoryTimeSort('default');
    setHistoryTableTimeSort('default');
  };

  const maxByHour = Math.max(...stats.byHour, 1);

  // Экспорт отчёта в CSV
  const exportReport = () => {
    const modeLabel = (m: string, tariffName?: string | null) => {
      if (tariffName && tariffName.trim()) return `Тариф: ${tariffName}`;
      if (m === 'time') return 'По времени';
      if (m === 'amount') return 'На сумму';
      return 'Бессрочно';
    };
    const header = 'Стол;Режим;Начало;Конец;Время (мин);Стол (' + settings.currency + ');Бар (' + settings.currency + ');Итого (' + settings.currency + ')';
    const rows = filteredSessions
      .slice()
      .reverse()
      .map((s) => {
        const start = new Date(s.startTime).toLocaleString('ru-RU');
        const end = new Date(s.endTime).toLocaleString('ru-RU');
        return `${s.tableName};${modeLabel(s.mode, s.tariffName)};${start};${end};${s.duration};${s.tableCost};${s.barCost};${s.totalCost}`;
      });

    // Итоги
    rows.push('');
    rows.push(`Всего игр:;${stats.count}`);
    rows.push(`Выручка столы:;${stats.tableRev}`);
    rows.push(`Выручка бар:;${stats.barRev}`);
    rows.push(`Общая выручка:;${stats.totalRev}`);

    const csv = '\uFEFF' + header + '\n' + rows.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const now = new Date();
    const ts = dateToStr(now) + '_' + now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }).replace(':', '-');
    a.href = url;
    a.download = `отчёт_${viewMode}_${ts}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const changeDate = (delta: number) => {
    const d = strToDate(selectedDate);
    if (viewMode === 'week') {
      d.setDate(d.getDate() + delta * 7);
    } else {
      d.setDate(d.getDate() + delta);
    }
    setSelectedDate(dateToStr(d));
  };

  const formatDate = (dateStr: string) => {
    return strToDate(dateStr).toLocaleDateString('ru-RU', {
      weekday: 'short',
      day: 'numeric',
      month: 'long',
    });
  };

  const formatWeekRange = () => {
    const sel = strToDate(selectedDate);
    const day = sel.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    const monday = new Date(sel);
    monday.setDate(sel.getDate() + mondayOffset);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const fmt = (d: Date) => d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
    return `${fmt(monday)} — ${fmt(sunday)}`;
  };

  const formatTime = (timestamp: number) => {
    const d = safeDate(timestamp);
    if (!d) return '—';
    return d.toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getPeriodLabel = () => {
    if (viewMode === 'day') return formatDate(selectedDate);
    if (viewMode === 'week') return formatWeekRange();
    if (viewMode === 'range') return `${formatDate(rangeStart)} — ${formatDate(rangeEnd)}`;
    if (viewMode === 'all') return 'Всё время';
    if (viewMode === 'shift') {
      if (!activeShift) return 'Смена не выбрана';
      const start = new Date(activeShift.startTime).toLocaleString('ru-RU');
      const end = activeShift.endTime ? new Date(activeShift.endTime).toLocaleString('ru-RU') : 'по текущее время';
      return `Смена: ${activeShift.userName} (${start} — ${end})`;
    }
    return 'Период';
  };

  const handlePrintSession = async (session: (typeof filteredSessions)[number]) => {
    try {
      const detailedBarOrders = session.barOrders && session.barOrders.length > 0
        ? session.barOrders
        : session.barCost > 0
        ? [{
            id: `hist-${session.id}`,
            menuItemId: 'history-bar',
            menuItemName: 'Бар',
            quantity: 1,
            price: session.barCost,
            timestamp: session.endTime,
          }]
        : [];

      const ok = await printReceipt({
        clubName: settings.clubName,
        receiptCompanyName: settings.receiptCompanyName,
        receiptCity: settings.receiptCity,
        receiptPhone: settings.receiptPhone,
        receiptCashierName: settings.receiptCashierName,
        tableName: session.tableName,
        mode: session.mode,
        startTime: session.startTime,
        endTime: session.endTime,
        duration: session.duration,
        tableCost: session.tableCost,
        barOrders: detailedBarOrders,
        barCost: session.barCost,
        totalCost: session.totalCost,
        currency: settings.currency,
        receiptWidthMm: settings.receiptWidthMm,
        receiptFontSize: settings.receiptFontSize,
        receiptPaddingMm: settings.receiptPaddingMm,
        silentPrint: settings.silentPrint,
      });

      if (!ok) addToast('error', 'Не удалось распечатать пречек');
    } catch (error) {
      console.error('Print from history failed:', error);
      addToast('error', 'Ошибка печати пречека');
    }
  };

  const handlePrintReport = async () => {
    const ok = await printReportReceipt({
      clubName: settings.clubName,
      receiptCompanyName: settings.receiptCompanyName,
      receiptCity: settings.receiptCity,
      receiptPhone: settings.receiptPhone,
      receiptCashierName: settings.receiptCashierName,
      currency: settings.currency,
      periodLabel: getPeriodLabel(),
      sessions: filteredSessions,
      totalTable: stats.tableRev,
      totalBar: stats.barRev,
      totalRevenue: stats.totalRev,
      totalCount: stats.count,
      receiptWidthMm: settings.receiptWidthMm,
      receiptFontSize: settings.receiptFontSize,
      receiptPaddingMm: settings.receiptPaddingMm,
      silentPrint: settings.silentPrint,
    });

    if (!ok) addToast('error', 'Не удалось распечатать отчётный пречек');
  };

  return (
    <div className="page-content">
      <div className="page-header">
        <div className="page-header-left">
          <BarChart3 size={28} className="text-violet-400" />
          <h2 className="page-title">Отчёты</h2>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div className="page-tabs">
            <button
              onClick={() => setViewMode('day')}
              className={`page-tab ${viewMode === 'day' ? 'active' : ''}`}
            >
              День
            </button>
            <button
              onClick={() => { setViewMode('shift'); setSelectedShiftId(null); }}
              className={`page-tab ${viewMode === 'shift' ? 'active' : ''}`}
            >
              <Briefcase size={14} /> За смену
            </button>
            <button
              onClick={() => setViewMode('week')}
              className={`page-tab ${viewMode === 'week' ? 'active' : ''}`}
            >
              Неделя
            </button>
            <button
              onClick={() => setViewMode('range')}
              className={`page-tab ${viewMode === 'range' ? 'active' : ''}`}
            >
              <Filter size={14} /> Диапазон
            </button>
            <button
              onClick={() => setViewMode('all')}
              className={`page-tab ${viewMode === 'all' ? 'active' : ''}`}
            >
              Всё время
            </button>
          </div>
          {filteredSessions.length > 0 && !isSafeWebViewMode && (
            <>
              <button onClick={() => exportReport()} className="btn btn-ghost btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Download size={14} /> Экспорт
              </button>
              <button onClick={() => handlePrintReport()} className="btn btn-ghost btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Printer size={14} /> Печать отчёта
              </button>
            </>
          )}
        </div>
      </div>

      {isSafeWebViewMode && (
        <div className="date-nav" style={{ marginBottom: 12 }}>
          <span style={{ fontSize: 12, color: '#94a3b8' }}>
            Облегчённый режим отчётов для встроенного браузера VS Code
          </span>
        </div>
      )}

      {/* Выбор смены */}
      {viewMode === 'shift' && (
        <div className="shift-selector">
          <div
            onClick={() => setSelectedShiftId(null)}
            className={`shift-item ${!selectedShiftId && currentShift ? 'active' : ''}`}
          >
            <div className="shift-item-icon">
              <Briefcase size={16} />
            </div>
            <div className="shift-item-content">
              <div className="shift-item-title">
                {currentShift?.isActive ? 'Текущая смена' : 'Нет активной смены'}
              </div>
              {currentShift?.isActive && (
                <div className="shift-item-details">
                  Начало: {new Date(currentShift.startTime).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                </div>
              )}
            </div>
          </div>
          {shiftHistory.slice(0, 10).map((shift) => {
            const start = new Date(shift.startTime);
            const end = shift.endTime ? new Date(shift.endTime) : null;
            const duration = end ? Math.floor((end.getTime() - start.getTime()) / (1000 * 60)) : null; // в минутах
            return (
              <div
                key={shift.id}
                onClick={() => setSelectedShiftId(shift.id)}
                className={`shift-item ${selectedShiftId === shift.id ? 'active' : ''}`}
              >
                <div className="shift-item-icon">
                  <Briefcase size={16} />
                </div>
                <div className="shift-item-content">
                  <div className="shift-item-title">
                    {start.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                  </div>
                  <div className="shift-item-details">
                    {start.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                    {end ? ` — ${end.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}` : ' (активна)'}
                    {duration && ` (${duration} мин)`}
                  </div>
                  <div className="shift-item-user">{shift.userName}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Переключение даты */}
      {(viewMode === 'day' || viewMode === 'week') && (
        <div className="date-nav">
          <button onClick={() => changeDate(-1)} className="date-nav-btn">
            <ChevronLeft size={20} />
          </button>
          <div className="date-nav-current">
            <Calendar size={16} />
            <span>{viewMode === 'week' ? formatWeekRange() : formatDate(selectedDate)}</span>
          </div>
          <button onClick={() => changeDate(1)} className="date-nav-btn">
            <ChevronRight size={20} />
          </button>
          <button
            onClick={() => setSelectedDate(dateToStr(new Date()))}
            className="btn btn-ghost btn-sm"
          >
            Сегодня
          </button>
        </div>
      )}

      {/* Диапазон дат */}
      {viewMode === 'range' && (
        <div className="date-nav" style={{ gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label style={{ fontSize: 13, opacity: 0.7 }}>С</label>
            <input
              type="date"
              value={rangeStart}
              onChange={(e) => setRangeStart(e.target.value)}
              className="form-input"
              style={{ width: 160 }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label style={{ fontSize: 13, opacity: 0.7 }}>По</label>
            <input
              type="date"
              value={rangeEnd}
              onChange={(e) => setRangeEnd(e.target.value)}
              className="form-input"
              style={{ width: 160 }}
            />
          </div>
          <button
            onClick={() => {
              const today = dateToStr(new Date());
              const weekAgo = new Date();
              weekAgo.setDate(weekAgo.getDate() - 7);
              setRangeStart(dateToStr(weekAgo));
              setRangeEnd(today);
            }}
            className="btn btn-ghost btn-sm"
          >
            7 дней
          </button>
          <button
            onClick={() => {
              const today = dateToStr(new Date());
              const monthAgo = new Date();
              monthAgo.setDate(monthAgo.getDate() - 30);
              setRangeStart(dateToStr(monthAgo));
              setRangeEnd(today);
            }}
            className="btn btn-ghost btn-sm"
          >
            30 дней
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
              {formatMoney(stats.totalRev, settings.currency)}
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
              {formatMoney(stats.tableRev, settings.currency)}
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
              {formatMoney(stats.barRev, settings.currency)}
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
            <p className="report-stat-label">Средний счёт</p>
            <p className="report-stat-value">
              {formatMoney(stats.avgCheck, settings.currency)}
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
      {!isSafeWebViewMode && (
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
                  {formatMoney(data.revenue, settings.currency)}
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
      )}

      {/* Таблица сессий */}
      <div className="report-table-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
          <h3 className="report-chart-title" style={{ marginBottom: 0 }}>История игр</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <button
              onClick={() => setShowHistoryFilters((prev) => !prev)}
              className="btn btn-ghost btn-sm"
              title="Фильтры истории"
            >
              <Filter size={14} />
              Фильтр
            </button>
            {(historyTableFilter !== 'all' || historyModeFilter !== 'all' || historyAmountSort !== 'default' || historyTimeSort !== 'default' || historyTableTimeSort !== 'default') && (
              <button onClick={resetHistoryFilters} className="btn btn-ghost btn-sm" title="Сбросить фильтрацию">
                Сбросить фильтрацию
              </button>
            )}
          </div>
        </div>

        {showHistoryFilters && (
          <div className="date-nav" style={{ gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <select
              className="form-input"
              value={historyTableFilter}
              onChange={(e) => setHistoryTableFilter(e.target.value)}
              style={{ width: 180 }}
            >
              <option value="all">Все столы</option>
              {historyTableNames.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>

            <select
              className="form-input"
              value={historyAmountSort}
              onChange={(e) => setHistoryAmountSort(e.target.value as 'default' | 'max' | 'min')}
              style={{ width: 220 }}
            >
              <option value="default">Сумма: по умолчанию</option>
              <option value="max">Сумма: максимальная</option>
              <option value="min">Сумма: минимальная</option>
            </select>

            <select
              className="form-input"
              value={historyTimeSort}
              onChange={(e) => setHistoryTimeSort(e.target.value as 'default' | 'max' | 'min')}
              style={{ width: 220 }}
            >
              <option value="default">Время: по умолчанию</option>
              <option value="max">Время: максимальное</option>
              <option value="min">Время: минимальное</option>
            </select>

            <select
              className="form-input"
              value={historyTableTimeSort}
              onChange={(e) => setHistoryTableTimeSort(e.target.value as 'default' | 'max' | 'min')}
              style={{ width: 240 }}
            >
              <option value="default">Стол по времени: по умолчанию</option>
              <option value="max">Стол по времени: больше всего</option>
              <option value="min">Стол по времени: меньше всего</option>
            </select>

            <button
              onClick={() => setHistoryModeFilter('tariff')}
              className={`btn btn-sm ${historyModeFilter === 'tariff' ? 'btn-primary' : 'btn-ghost'}`}
            >
              Тариф
            </button>
            <button
              onClick={() => setHistoryModeFilter('time')}
              className={`btn btn-sm ${historyModeFilter === 'time' ? 'btn-primary' : 'btn-ghost'}`}
            >
              Время
            </button>
            <button
              onClick={() => setHistoryModeFilter('infinite')}
              className={`btn btn-sm ${historyModeFilter === 'infinite' ? 'btn-primary' : 'btn-ghost'}`}
            >
              Бессрочно
            </button>
            <button
              onClick={() => setHistoryModeFilter('all')}
              className={`btn btn-sm ${historyModeFilter === 'all' ? 'btn-primary' : 'btn-ghost'}`}
            >
              Все режимы
            </button>
          </div>
        )}

        {historySessions.length === 0 ? (
          <div className="report-empty">
            <BarChart3 size={48} className="text-slate-600" />
            <p>Нет записей по выбранным фильтрам</p>
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
                  <th>Пречек</th>
                </tr>
              </thead>
              <tbody>
                {historySessions
                  .slice()
                  .reverse()
                  .map((session) => (
                    <tr key={session.id}>
                      <td>{session.tableName}</td>
                      <td>
                        {session.tariffName && session.tariffName.trim()
                          ? `Тариф: ${session.tariffName}`
                          : session.mode === 'time'
                            ? 'По времени'
                            : session.mode === 'amount'
                              ? 'На сумму'
                              : 'Бессрочно'}
                      </td>
                      <td>{formatTime(session.startTime)}</td>
                      <td>{formatTime(session.endTime)}</td>
                      <td>{session.duration} мин</td>
                      <td className="text-emerald-400">
                        {formatMoney(session.tableCost, settings.currency)}
                      </td>
                      <td className="text-amber-400">
                        {formatMoney(session.barCost, settings.currency)}
                      </td>
                      <td className="font-bold">
                        {formatMoney(session.totalCost, settings.currency)}
                      </td>
                      <td>
                        <button
                          className="btn btn-ghost btn-sm report-print-btn"
                          onClick={() => handlePrintSession(session)}
                          title="Печать пречека"
                        >
                          <Printer size={14} />
                          Пречек
                        </button>
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
