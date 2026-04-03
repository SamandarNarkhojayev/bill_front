import React, { useState, useEffect, useCallback } from 'react';
import {
  Play,
  Square,
  Clock,
  ShoppingBag,
  DollarSign,
  Zap,
  TrendingUp,
  Timer,
  Infinity as InfinityIcon,
  Banknote,
  AlertCircle,
  Printer,
  CalendarClock,
  X,
  User,
  Phone,
  FileText,
} from 'lucide-react';
import { useStore } from '../store/useStore';
import type { BilliardTable, SessionMode, Tariff } from '../types';
import TableModal from './TableModal';
import { playStartSound, playStopSound, playTimerEndSound } from '../utils/sounds';
import { printReceipt } from '../utils/receipt';

const calculateSessionTableCost = (
  startTime: number,
  endTime: number,
  pricePerHour: number,
  mode: SessionMode,
  fixedAmount: number | null
) => {
  const durationMinutes = Math.ceil((endTime - startTime) / 60000);
  const elapsedCost = Math.ceil((durationMinutes / 60) * pricePerHour);

  if (mode === 'amount' && fixedAmount) {
    return Math.min(elapsedCost, fixedAmount);
  }

  return elapsedCost;
};

const formatPhone = (value: string, prevValue = '') => {
  let digits = value.replace(/\D/g, '');
  const prevDigitsRaw = prevValue.replace(/\D/g, '');

  // Если удалили только символ-разделитель (пробел/скобку/дефис), удаляем и последнюю цифру
  if (value.length < prevValue.length && digits.length === prevDigitsRaw.length) {
    digits = digits.slice(0, -1);
  }

  if (digits.startsWith('8')) digits = '7' + digits.slice(1);
  if (!digits.startsWith('7')) digits = '7' + digits;
  digits = digits.slice(0, 11);

  const local = digits.slice(1);
  let formatted = '+7';
  if (local.length > 0) formatted += ` (${local.slice(0, 3)}`;
  if (local.length >= 3) formatted += ')';
  if (local.length > 3) formatted += ` ${local.slice(3, 6)}`;
  if (local.length > 6) formatted += `-${local.slice(6, 8)}`;
  if (local.length > 8) formatted += `-${local.slice(8, 10)}`;
  return formatted;
};

// ===== ТАЙМЕР СЕССИИ (с обратным отсчётом для режима "по времени") =====
const SessionTimer: React.FC<{
  startTime: number;
  mode: SessionMode;
  plannedDuration: number | null;
  onTimeExpired?: () => void;
}> = ({ startTime, mode, plannedDuration, onTimeExpired }) => {
  const [display, setDisplay] = useState('');
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      const elapsedSec = Math.floor((Date.now() - startTime) / 1000);

      if ((mode === 'time' || mode === 'amount') && plannedDuration !== null) {
        const totalSec = plannedDuration;
        const remaining = totalSec - elapsedSec;

        if (remaining <= 0 && !expired) {
          setExpired(true);
          onTimeExpired?.();
        }

        const absRemaining = Math.abs(remaining);
        const h = Math.floor(absRemaining / 3600);
        const m = Math.floor((absRemaining % 3600) / 60);
        const s = absRemaining % 60;
        const pad = (n: number) => String(n).padStart(2, '0');
        const prefix = remaining < 0 ? '+' : '';
        setDisplay(`${prefix}${h > 0 ? pad(h) + ':' : ''}${pad(m)}:${pad(s)}`);
      } else {
        const h = Math.floor(elapsedSec / 3600);
        const m = Math.floor((elapsedSec % 3600) / 60);
        const s = elapsedSec % 60;
        const pad = (n: number) => String(n).padStart(2, '0');
        setDisplay(`${pad(h)}:${pad(m)}:${pad(s)}`);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [startTime, mode, plannedDuration, expired, onTimeExpired]);

  return (
    <span className={`timer-display ${expired ? 'timer-expired' : ''}`}>
      {mode === 'time' && !expired && <Timer size={14} className="timer-icon" />}
      {expired && <AlertCircle size={14} className="timer-icon text-red-400" />}
      {display}
    </span>
  );
};

// ===== КАРТОЧКА СТОЛА =====
const TableCard: React.FC<{
  table: BilliardTable;
  onStart: (tableId: number) => void;
  onStop: (tableId: number) => void;
  onOpenBar: (tableId: number) => void;
  onTimeExpired: (tableId: number) => void;
  onReserve: (tableId: number) => void;
  onCancelReservation: (tableId: number) => void;
  reservation?: { customerName: string; customerPhone: string; reservedFor: number; notes: string } | null;
}> = ({ table, onStart, onStop, onOpenBar, onTimeExpired, onReserve, onCancelReservation, reservation }) => {
  const { settings } = useStore();
  const isOccupied = table.status === 'occupied';
  const isReserved = table.status === 'reserved';
  const session = table.currentSession;

  const [currentCost, setCurrentCost] = useState(0);
  useEffect(() => {
    if (!session) {
      setCurrentCost(0);
      return;
    }
    if (typeof session.packagePrice === 'number' && Number.isFinite(session.packagePrice)) {
      setCurrentCost(session.packagePrice);
      return;
    }
    const interval = setInterval(() => {
      setCurrentCost(
        calculateSessionTableCost(
          session.startTime,
          Date.now(),
          table.pricePerHour,
          session.mode,
          session.fixedAmount
        )
      );
    }, 1000);
    return () => clearInterval(interval);
  }, [session, table.pricePerHour]);

  const barTotal = session?.barOrders.reduce((sum, item) => {
    const price = Number.isFinite(item.price) ? item.price : 0;
    const qty = Number.isFinite(item.quantity) ? item.quantity : 0;
    return sum + price * qty;
  }, 0) || 0;

  const modeLabel = session?.tariffName
    ? session.tariffName
    : session?.mode === 'time'
    ? 'По времени'
    : session?.mode === 'amount'
    ? 'На сумму'
    : 'Бессрочно';

  const modeIcon = session?.mode === 'time'
    ? <Timer size={12} />
    : session?.mode === 'amount'
    ? <Banknote size={12} />
    : <InfinityIcon size={12} />;

  const handleTimeExpired = useCallback(() => {
    onTimeExpired(table.id);
  }, [table.id, onTimeExpired]);

  return (
    <div className={`table-card ${isOccupied ? 'occupied' : isReserved ? 'reserved' : 'free'}`}>
      <div className={`table-card-status-bar ${isOccupied ? 'bg-emerald-500' : isReserved ? 'bg-amber-500' : 'bg-slate-600'}`} />

      <div className="table-card-content">
        <div className="table-card-header">
          <div>
            <h3 className="table-card-name">{table.name}</h3>
            <span className={`table-card-status ${isOccupied ? 'status-occupied' : isReserved ? 'status-reserved' : 'status-free'}`}>
              {isOccupied ? '● Занят' : isReserved ? '◉ Бронь' : '○ Свободен'}
            </span>
          </div>
          {isOccupied && session && (
            <span className="session-mode-badge">
              {modeIcon} {modeLabel}
            </span>
          )}
        </div>

        {isOccupied && session ? (
          <div className="table-card-session">
            <div className="session-info-row">
              <Clock size={14} className="text-slate-400" />
              <SessionTimer
                startTime={session.startTime}
                mode={session.mode}
                plannedDuration={session.plannedDuration}
                onTimeExpired={handleTimeExpired}
              />
            </div>
            <div className="session-info-row">
              <DollarSign size={14} className="text-emerald-400" />
              <span className="session-cost">
                {currentCost.toLocaleString()} {settings.currency}
              </span>
            </div>
            {barTotal > 0 && (
              <div className="session-info-row">
                <ShoppingBag size={14} className="text-amber-400" />
                <span className="session-bar-cost">
                  Бар: {barTotal.toLocaleString()} {settings.currency}
                </span>
              </div>
            )}
            <div className="session-total">
              <TrendingUp size={14} />
              <span>
                Итого: {(currentCost + barTotal).toLocaleString()} {settings.currency}
              </span>
            </div>
          </div>
        ) : isReserved && reservation ? (
          <div className="table-card-session">
            <div className="session-info-row">
              <CalendarClock size={14} className="text-amber-400" />
              <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                {new Date(reservation.reservedFor).toLocaleString('ru-RU', {
                  day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                })}
              </span>
            </div>
            {reservation.customerName && (
              <div className="session-info-row">
                <User size={14} className="text-slate-400" />
                <span style={{ fontSize: 13 }}>{reservation.customerName}</span>
              </div>
            )}
            {reservation.customerPhone && (
              <div className="session-info-row">
                <Phone size={14} className="text-slate-400" />
                <span style={{ fontSize: 13 }}>{reservation.customerPhone}</span>
              </div>
            )}
            {reservation.notes && (
              <div className="session-info-row">
                <FileText size={14} className="text-slate-400" />
                <span style={{ fontSize: 12, opacity: 0.7 }}>{reservation.notes}</span>
              </div>
            )}
          </div>
        ) : (
          <div className="table-card-empty">
            <div className="table-card-price">
              <Zap size={14} />
              {table.pricePerHour.toLocaleString()} {settings.currency}/час
            </div>
            <p className="table-card-hint">Готов к игре</p>
          </div>
        )}

        <div className="table-card-actions">
          {!isOccupied && !isReserved ? (
            <>
              <button onClick={() => onStart(table.id)} className="btn btn-primary" style={{ flex: 2 }}>
                <Play size={16} />
                Начать игру
              </button>
              <button onClick={() => onReserve(table.id)} className="btn btn-ghost" style={{ flex: 1 }} title="Забронировать">
                <CalendarClock size={16} />
              </button>
            </>
          ) : isReserved ? (
            <>
              <button onClick={() => onStart(table.id)} className="btn btn-primary btn-half">
                <Play size={16} />
                Начать
              </button>
              <button onClick={() => onCancelReservation(table.id)} className="btn btn-ghost btn-half">
                <X size={16} />
                Отменить
              </button>
            </>
          ) : (
            <>
              <button onClick={() => onOpenBar(table.id)} className="btn btn-amber btn-half">
                <ShoppingBag size={16} />
                Бар
              </button>
              <button onClick={() => onStop(table.id)} className="btn btn-danger btn-half">
                <Square size={16} />
                Стоп
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// ===== DASHBOARD =====
const Dashboard: React.FC = () => {
  const {
    tables, startSession, endSession, settings, getTodayRevenue, getTodaySessions, openModal,
    reservations, addReservation, cancelReservation, tariffs, addBarOrderToTable, barMenu,
  } = useStore();
  const [showStartModal, setShowStartModal] = useState(false);
  const [showEndModal, setShowEndModal] = useState(false);
  const [showReserveModal, setShowReserveModal] = useState(false);
  const [selectedTable, setSelectedTable] = useState<number | null>(null);

  // Стартовая модалка
  const [selectedMode, setSelectedMode] = useState<SessionMode | null>(null);
  const [timeHours, setTimeHours] = useState(1);
  const [timeMinutes, setTimeMinutes] = useState(0);
  const [fixedAmount, setFixedAmount] = useState(5000);
  const [selectedTariff, setSelectedTariff] = useState<Tariff | null>(null);

  // Бронирование
  const [reserveName, setReserveName] = useState('');
  const [reservePhone, setReservePhone] = useState('');
  const [reserveDate, setReserveDate] = useState('');
  const [reserveTime, setReserveTime] = useState('');
  const [reserveNotes, setReserveNotes] = useState('');

  const revenue = getTodayRevenue();
  const todaySessions = getTodaySessions();

  const handleStart = (tableId: number) => {
    setSelectedTable(tableId);
    setSelectedMode(null);
    setTimeHours(1);
    setTimeMinutes(0);
    setFixedAmount(5000);
    setSelectedTariff(null);
    setShowStartModal(true);
  };

  const handleConfirmStart = () => {
    if (!selectedTable || !selectedMode) return;

    if (selectedMode === 'time' && timeHours === 0 && timeMinutes === 0) return;
    if (selectedMode === 'amount' && fixedAmount <= 0) return;

    startSession(selectedTable, selectedMode, {
      hours: timeHours,
      minutes: timeMinutes,
      amount: fixedAmount,
      plannedDurationSeconds: selectedTariff ? Math.max(1, Math.round(selectedTariff.durationHours * 3600)) : undefined,
      packagePrice: selectedTariff ? selectedTariff.price : undefined,
      tariffName: selectedTariff ? selectedTariff.name : undefined,
    });

    if (settings.soundEnabled) playStartSound();
    setShowStartModal(false);

    // Если был выбран тариф — автоматически добавляем продукты из бара
    if (selectedTariff && selectedTariff.menuProducts.length > 0) {
      const tableId = selectedTable;
      setTimeout(() => {
        selectedTariff.menuProducts.forEach((tp) => {
          const menuItem = barMenu.find((m) => m.id === tp.productId);
          if (menuItem) {
            addBarOrderToTable(tableId, menuItem, tp.quantity, { priceOverride: 0, silent: true });
          }
        });
      }, 100);
    }
    setSelectedTariff(null);
  };

  const handleStop = (tableId: number) => {
    setSelectedTable(tableId);
    setShowEndModal(true);
  };

  const handleConfirmEnd = async (shouldPrint?: boolean) => {
    if (!selectedTable) return;
    
    const table = tables.find(t => t.id === selectedTable);
    if (!table || !table.currentSession) return;

    // Если нужно печатать чек (или включена автопечать)
    if (shouldPrint || settings.autoPrintReceipt) {
      const session = table.currentSession;
      const endTime = Date.now();
      const durationMinutes = Math.ceil((endTime - session.startTime) / 60000);
      const tableCost = calculateSessionTableCost(
        session.startTime,
        endTime,
        table.pricePerHour,
        session.mode,
        session.fixedAmount
      );
      const barCost = session.barOrders.reduce((sum, item) => sum + item.price * item.quantity, 0);

      await printReceipt({
        clubName: settings.clubName,
        receiptCompanyName: settings.receiptCompanyName,
        receiptCity: settings.receiptCity,
        receiptPhone: settings.receiptPhone,
        receiptCashierName: settings.receiptCashierName,
        tableName: table.name,
        mode: session.mode,
        startTime: session.startTime,
        endTime,
        duration: durationMinutes,
        tableCost,
        barOrders: session.barOrders,
        barCost,
        totalCost: tableCost + barCost,
        currency: settings.currency,
        receiptWidthMm: settings.receiptWidthMm,
        receiptFontSize: settings.receiptFontSize,
        receiptPaddingMm: settings.receiptPaddingMm,
        silentPrint: settings.silentPrint,
      });
    }

    endSession(selectedTable);
    if (settings.soundEnabled) playStopSound();
    setShowEndModal(false);
  };

  const handleTimeExpired = useCallback(async (tableId: number) => {
    const table = tables.find((t) => t.id === tableId);
    if (!table?.currentSession) return;

    if (settings.soundEnabled) playTimerEndSound();

    const session = table.currentSession;
    const endTime = Date.now();
    const durationMinutes = Math.ceil((endTime - session.startTime) / 60000);
    const tableCost = calculateSessionTableCost(
      session.startTime,
      endTime,
      table.pricePerHour,
      session.mode,
      session.fixedAmount
    );
    const barCost = session.barOrders.reduce((sum, item) => sum + item.price * item.quantity, 0);

    try {
      await printReceipt({
        clubName: settings.clubName,
        receiptCompanyName: settings.receiptCompanyName,
        receiptCity: settings.receiptCity,
        receiptPhone: settings.receiptPhone,
        receiptCashierName: settings.receiptCashierName,
        tableName: table.name,
        mode: session.mode,
        startTime: session.startTime,
        endTime,
        duration: durationMinutes,
        tableCost,
        barOrders: session.barOrders,
        barCost,
        totalCost: tableCost + barCost,
        currency: settings.currency,
        receiptWidthMm: settings.receiptWidthMm,
        receiptFontSize: settings.receiptFontSize,
        receiptPaddingMm: settings.receiptPaddingMm,
        silentPrint: settings.silentPrint,
      });
    } catch (error) {
      console.error('Auto print on expire failed:', error);
    }

    endSession(tableId);
  }, [
    tables,
    settings.soundEnabled,
    settings.clubName,
    settings.receiptCompanyName,
    settings.receiptCity,
    settings.receiptPhone,
    settings.receiptCashierName,
    settings.currency,
    settings.receiptWidthMm,
    settings.receiptFontSize,
    settings.receiptPaddingMm,
    settings.silentPrint,
    endSession,
  ]);

  const handleOpenBar = (tableId: number) => {
    openModal('bar-order', { tableId });
  };

  const handleReserve = (tableId: number) => {
    setSelectedTable(tableId);
    setReserveName('');
    setReservePhone('');
    // Дефолт — сегодня
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    setReserveDate(`${y}-${m}-${d}`);
    const h = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    setReserveTime(`${h}:${min}`);
    setReserveNotes('');
    setShowReserveModal(true);
  };

  const handleConfirmReserve = () => {
    if (!selectedTable || !reserveDate || !reserveTime) return;
    const [y, m, d] = reserveDate.split('-').map(Number);
    const [hh, mm] = reserveTime.split(':').map(Number);
    const reservedFor = new Date(y, m - 1, d, hh, mm).getTime();
    addReservation(selectedTable, reserveName, reservePhone, reservedFor, reserveNotes);
    setShowReserveModal(false);
  };

  const handleCancelReservation = (tableId: number) => {
    const r = reservations.find((res) => res.tableId === tableId);
    if (r) cancelReservation(r.id);
  };

  const getTableReservation = (tableId: number) => {
    return reservations.find((r) => r.tableId === tableId) || null;
  };

  const selectedTableData = selectedTable ? tables.find((t) => t.id === selectedTable) : null;

  return (
    <div className="dashboard">
      {/* Статистика за день */}
      <div className="dashboard-stats">
        <div className="stat-card stat-revenue">
          <div className="stat-icon"><DollarSign size={24} /></div>
          <div>
            <p className="stat-label">Выручка сегодня</p>
            <p className="stat-value">{revenue.total.toLocaleString()} {settings.currency}</p>
          </div>
        </div>
        <div className="stat-card stat-table-rev">
          <div className="stat-icon"><Clock size={24} /></div>
          <div>
            <p className="stat-label">Столы</p>
            <p className="stat-value">{revenue.table.toLocaleString()} {settings.currency}</p>
          </div>
        </div>
        <div className="stat-card stat-bar-rev">
          <div className="stat-icon"><ShoppingBag size={24} /></div>
          <div>
            <p className="stat-label">Бар</p>
            <p className="stat-value">{revenue.bar.toLocaleString()} {settings.currency}</p>
          </div>
        </div>
        <div className="stat-card stat-sessions">
          <div className="stat-icon"><TrendingUp size={24} /></div>
          <div>
            <p className="stat-label">Игр сегодня</p>
            <p className="stat-value">{todaySessions}</p>
          </div>
        </div>
      </div>

      {/* Сетка столов */}
      <div className="tables-grid">
        {tables.map((table) => (
          <TableCard
            key={table.id}
            table={table}
            onStart={handleStart}
            onStop={handleStop}
            onOpenBar={handleOpenBar}
            onTimeExpired={handleTimeExpired}
            onReserve={handleReserve}
            onCancelReservation={handleCancelReservation}
            reservation={getTableReservation(table.id)}
          />
        ))}
      </div>

      {/* === МОДАЛКА НАЧАЛА ИГРЫ (выбор режима) === */}
      {showStartModal && selectedTableData && (
        <div className="modal-overlay" onClick={() => setShowStartModal(false)}>
          <div className="modal modal-start" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">
              <Play size={20} className="text-emerald-400" />
              Начать игру — {selectedTableData.name}
            </h2>

            <p className="modal-hint" style={{ marginBottom: '16px' }}>
              Тариф: {selectedTableData.pricePerHour.toLocaleString()} {settings.currency}/час
            </p>

            {/* Выбор режима */}
            <div className="mode-selector">
              <button
                onClick={() => { setSelectedMode('time'); setSelectedTariff(null); }}
                className={`mode-btn ${selectedMode === 'time' && !selectedTariff ? 'active mode-time' : ''}`}
              >
                <Timer size={24} />
                <span className="mode-btn-label">По времени</span>
                <span className="mode-btn-desc">Выбрать длительность</span>
              </button>
              <button
                onClick={() => { setSelectedMode('amount'); setSelectedTariff(null); setFixedAmount(5000); }}
                className={`mode-btn ${selectedMode === 'amount' && !selectedTariff ? 'active mode-amount' : ''}`}
              >
                <Banknote size={24} />
                <span className="mode-btn-label">На сумму</span>
                <span className="mode-btn-desc">Фиксированная оплата</span>
              </button>
              <button
                onClick={() => { setSelectedMode('unlimited'); setSelectedTariff(null); }}
                className={`mode-btn ${selectedMode === 'unlimited' && !selectedTariff ? 'active mode-unlimited' : ''}`}
              >
                <InfinityIcon size={24} />
                <span className="mode-btn-label">Бессрочно</span>
                <span className="mode-btn-desc">Без ограничений</span>
              </button>
            </div>

            {/* Сохранённые тарифы (видны только если текущее время попадает в диапазон тарифа) */}
            {(() => {
              const now = new Date();
              const currentMinutes = now.getHours() * 60 + now.getMinutes();
              const tableTariffs = tariffs.filter((t) => {
                if (!t.isActive || selectedTable === null || !t.tableIds.includes(selectedTable)) return false;
                const [sh, sm] = t.startTime.split(':').map(Number);
                const [eh, em] = t.endTime.split(':').map(Number);
                const start = sh * 60 + sm;
                const end = eh * 60 + em;
                // Поддержка ночных тарифов (например 22:00–06:00)
                if (start <= end) {
                  return currentMinutes >= start && currentMinutes < end;
                } else {
                  return currentMinutes >= start || currentMinutes < end;
                }
              });
              if (tableTariffs.length === 0) return null;
              return (
                <div style={{ marginTop: 4 }}>
                  <p style={{ fontSize: 12, color: '#64748b', marginBottom: 8, fontWeight: 500 }}>Или выберите тариф:</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {tableTariffs.map((tariff) => (
                      <button
                        key={tariff.id}
                        onClick={() => {
                          if (!selectedTable) return;
                          // Выбираем тариф: режим "на сумму" с ценой тарифа (итоговая цена за всё)
                          setSelectedTariff(tariff);
                          setSelectedMode('amount');
                          setFixedAmount(tariff.price);
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '10px 14px',
                          borderRadius: 10,
                          border: selectedTariff?.id === tariff.id
                            ? '2px solid rgba(139, 92, 246, 0.6)'
                            : '1px solid rgba(139, 92, 246, 0.25)',
                          background: selectedTariff?.id === tariff.id
                            ? 'rgba(139, 92, 246, 0.15)'
                            : 'rgba(139, 92, 246, 0.06)',
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                          textAlign: 'left',
                        }}
                      >
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: '#c4b5fd' }}>
                            {tariff.name}
                          </span>
                          <span style={{ fontSize: 11, color: '#94a3b8' }}>
                            {tariff.startTime}–{tariff.endTime} · {tariff.durationHours} ч
                            {tariff.menuProducts.length > 0 && ` · +${tariff.menuProducts.length} продукт.`}
                          </span>
                        </div>
                        <span style={{ fontSize: 14, fontWeight: 700, color: '#a78bfa' }}>
                          {tariff.price.toLocaleString()} {settings.currency}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Настройки для режима "по времени" */}
            {selectedMode === 'time' && !selectedTariff && (
              <div className="time-selector">
                <label className="modal-label">Длительность</label>
                <div className="time-presets">
                  {[1, 2, 3].map((h) => (
                    <button
                      key={h}
                      onClick={() => { setTimeHours(h); setTimeMinutes(0); }}
                      className={`time-preset-btn ${timeHours === h && timeMinutes === 0 ? 'active' : ''}`}
                    >
                      {h} час{h > 1 ? 'а' : ''}
                    </button>
                  ))}
                </div>
                <div className="time-custom">
                  <div className="time-input-group">
                    <label className="time-input-label">Часы</label>
                    <div className="time-spinner">
                      <button onClick={() => setTimeHours(Math.max(0, timeHours - 1))} className="spinner-btn">−</button>
                      <span className="spinner-value">{timeHours}</span>
                      <button onClick={() => setTimeHours(Math.min(12, timeHours + 1))} className="spinner-btn">+</button>
                    </div>
                  </div>
                  <div className="time-input-group">
                    <label className="time-input-label">Минуты</label>
                    <div className="time-spinner">
                      <button onClick={() => setTimeMinutes(Math.max(0, timeMinutes - 15))} className="spinner-btn">−</button>
                      <span className="spinner-value">{timeMinutes}</span>
                      <button onClick={() => setTimeMinutes(Math.min(45, timeMinutes + 15))} className="spinner-btn">+</button>
                    </div>
                  </div>
                </div>
                {(timeHours > 0 || timeMinutes > 0) && (
                  <div className="time-estimate">
                    Стоимость: {Math.ceil(((timeHours * 60 + timeMinutes) / 60) * selectedTableData.pricePerHour).toLocaleString()} {settings.currency}
                  </div>
                )}
              </div>
            )}

            {/* Настройки для режима "на сумму" */}
            {selectedMode === 'amount' && !selectedTariff && (
              <div className="amount-selector">
                <label className="modal-label">Сумма</label>
                <div className="amount-presets">
                  {[2000, 3000, 5000, 10000].map((a) => (
                    <button
                      key={a}
                      onClick={() => setFixedAmount(a)}
                      className={`amount-preset-btn ${fixedAmount === a ? 'active' : ''}`}
                    >
                      {a.toLocaleString()} {settings.currency}
                    </button>
                  ))}
                </div>
                <input
                  type="number"
                  value={fixedAmount}
                  onChange={(e) => setFixedAmount(Number(e.target.value))}
                  className="modal-input"
                  placeholder="Или введите сумму..."
                  min={0}
                  step={500}
                />
                <div className="time-estimate">
                  ≈ {Math.round((fixedAmount / selectedTableData.pricePerHour) * 60)} минут игры
                </div>
              </div>
            )}

            {/* Бессрочный */}
            {selectedMode === 'unlimited' && !selectedTariff && (
              <div className="unlimited-info">
                <p className="unlimited-text">
                  Стол будет открыт без ограничений. Оплата по факту времени.
                </p>
              </div>
            )}

            {/* Инфо о выбранном тарифе */}
            {selectedTariff && (
              <div style={{
                padding: '14px 16px',
                borderRadius: 12,
                background: 'rgba(139, 92, 246, 0.08)',
                border: '1px solid rgba(139, 92, 246, 0.2)',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#c4b5fd' }}>
                    Тариф: {selectedTariff.name}
                  </span>
                  <span style={{ fontSize: 16, fontWeight: 700, color: '#a78bfa' }}>
                    {selectedTariff.price.toLocaleString()} {settings.currency}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: '#94a3b8', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span>⏱ Игра: {selectedTariff.durationHours} ч</span>
                  {selectedTariff.menuProducts.length > 0 && (
                    <span>
                      🍺 Включено: {selectedTariff.menuProducts.map(p => `${p.productName} ×${p.quantity}`).join(', ')}
                    </span>
                  )}
                  <span style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>Цена итоговая (время + бар)</span>
                </div>
              </div>
            )}

            <div className="modal-actions">
              <button onClick={() => setShowStartModal(false)} className="btn btn-ghost">
                Отмена
              </button>
              <button
                onClick={handleConfirmStart}
                disabled={!selectedMode || (selectedMode === 'time' && timeHours === 0 && timeMinutes === 0)}
                className="btn btn-primary"
              >
                <Play size={16} />
                Начать
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Модалка завершения игры */}
      {showEndModal && selectedTableData && selectedTableData.currentSession && (
        <EndSessionModal
          table={selectedTableData}
          onConfirm={handleConfirmEnd}
          onCancel={() => setShowEndModal(false)}
          autoPrintEnabled={settings.autoPrintReceipt}
        />
      )}

      {/* Модалка заказа бара */}
      <TableModal />

      {/* Модалка бронирования */}
      {showReserveModal && selectedTableData && (
        <div className="modal-overlay" onClick={() => setShowReserveModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">
              <CalendarClock size={20} className="text-amber-400" />
              Бронирование — {selectedTableData.name}
            </h2>
          <div className="modal-body">
            <div className="modal-field-group">
              <div>
                <label className="modal-label">Имя клиента</label>
                <input
                  type="text"
                  value={reserveName}
                  onChange={(e) => setReserveName(e.target.value)}
                  placeholder="Имя клиента"
                  className="modal-input"
                />
              </div>
              <div>
                <label className="modal-label">Телефон</label>
                <input
                  type="tel"
                  value={reservePhone}
                  onChange={(e) => setReservePhone((prev) => formatPhone(e.target.value, prev))}
                  placeholder="+7 (___) ___-__-__"
                  className="modal-input"
                />
              </div>
            </div>
            <div className="modal-field-group">
              <div className="modal-field-row">
                <div>
                  <label className="modal-label">Дата</label>
                  <input
                    type="date"
                    value={reserveDate}
                    onChange={(e) => setReserveDate(e.target.value)}
                    className="modal-input"
                  />
                </div>
                <div>
                  <label className="modal-label">Время</label>
                  <input
                    type="time"
                    value={reserveTime}
                    onChange={(e) => setReserveTime(e.target.value)}
                    className="modal-input"
                  />
                </div>
              </div>
              <div>
                <label className="modal-label">Заметка</label>
                <input
                  type="text"
                  value={reserveNotes}
                  onChange={(e) => setReserveNotes(e.target.value)}
                  placeholder="Доп. информация..."
                  className="modal-input"
                />
              </div>
            </div>
          </div>
            <div className="modal-actions">
              <button onClick={() => setShowReserveModal(false)} className="btn btn-ghost">
                Отмена
              </button>
              <button
                onClick={handleConfirmReserve}
                disabled={!reserveDate || !reserveTime}
                className="btn btn-primary"
              >
                <CalendarClock size={16} />
                Забронировать
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ===== МОДАЛКА ЗАВЕРШЕНИЯ СЕССИИ =====
const EndSessionModal: React.FC<{
  table: BilliardTable;
  onConfirm: (shouldPrint?: boolean) => void;
  onCancel: () => void;
  autoPrintEnabled: boolean;
}> = ({ table, onConfirm, onCancel, autoPrintEnabled }) => {
  const { settings } = useStore();
  const session = table.currentSession!;
  const endTime = Date.now();
  const durationMinutes = Math.ceil((endTime - session.startTime) / 60000);
  const tableCost = calculateSessionTableCost(
    session.startTime,
    endTime,
    table.pricePerHour,
    session.mode,
    session.fixedAmount
  );

  const barCost = session.barOrders.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const hours = Math.floor(durationMinutes / 60);
  const mins = durationMinutes % 60;

  const modeLabel = session.mode === 'time'
    ? 'По времени'
    : session.mode === 'amount'
    ? 'На сумму'
    : 'Бессрочно';

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal modal-lg end-session-modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">
          <Square size={20} className="text-red-400" />
          Закрыть заказ — {table.name}
        </h2>
        <div className="modal-body">
          <div className="end-session-grid">
            <div className="end-session-item">
              <span className="end-session-label">Режим</span>
              <span className="end-session-value">{modeLabel}</span>
            </div>
            <div className="end-session-item">
              <span className="end-session-label">Время игры</span>
              <span className="end-session-value">
                {hours > 0 ? `${hours}ч ` : ''}{mins}мин
              </span>
            </div>
            <div className="end-session-item">
              <span className="end-session-label">За стол</span>
              <span className="end-session-value text-emerald-400">
                {tableCost.toLocaleString()} {settings.currency}
              </span>
            </div>
            <div className="end-session-item">
              <span className="end-session-label">За бар</span>
              <span className="end-session-value text-amber-400">
                {barCost.toLocaleString()} {settings.currency}
              </span>
            </div>
          </div>

          {session.barOrders.length > 0 && (
            <div className="end-session-orders">
              <h4 className="end-session-orders-title">Заказы бара:</h4>
              {session.barOrders.map((item) => (
                <div key={item.id} className="end-session-order-item">
                  <span>{item.menuItemName} × {item.quantity}</span>
                  <span>{(item.price * item.quantity).toLocaleString()} {settings.currency}</span>
                </div>
              ))}
            </div>
          )}

          <div className="end-session-total">
            <span>ИТОГО К ОПЛАТЕ</span>
            <span>{(tableCost + barCost).toLocaleString()} {settings.currency}</span>
          </div>

          <div style={{ textAlign: 'center', marginTop: 12, padding: '8px 0', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <p style={{ fontSize: 11, color: '#f59e0b', fontWeight: 600 }}>Фискальный документ НЕ сформирован</p>
            <p style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>Для получения фискального документа используйте ККМ</p>
          </div>
        </div>
        <div className="modal-actions end-session-actions">
          <button onClick={onCancel} className="btn btn-ghost">Назад</button>
          {!autoPrintEnabled && (
            <button onClick={() => onConfirm(true)} className="btn btn-primary">
              <Printer size={16} />
              Печать пречека
            </button>
          )}
          <button onClick={() => onConfirm(false)} className="btn btn-danger">
            <Square size={16} />
            {autoPrintEnabled ? 'Закрыть заказ' : 'Закрыть заказ'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
