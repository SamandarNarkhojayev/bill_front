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
} from 'lucide-react';
import { useStore } from '../store/useStore';
import type { BilliardTable, SessionMode } from '../types';
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
}> = ({ table, onStart, onStop, onOpenBar, onTimeExpired }) => {
  const { settings } = useStore();
  const isOccupied = table.status === 'occupied';
  const session = table.currentSession;

  const [currentCost, setCurrentCost] = useState(0);
  useEffect(() => {
    if (!session) {
      setCurrentCost(0);
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

  const barTotal = session?.barOrders.reduce((sum, item) => sum + item.price * item.quantity, 0) || 0;

  const modeLabel = session?.mode === 'time'
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
    <div className={`table-card ${isOccupied ? 'occupied' : 'free'}`}>
      <div className={`table-card-status-bar ${isOccupied ? 'bg-emerald-500' : 'bg-slate-600'}`} />

      <div className="table-card-content">
        <div className="table-card-header">
          <div>
            <h3 className="table-card-name">{table.name}</h3>
            <span className={`table-card-status ${isOccupied ? 'status-occupied' : 'status-free'}`}>
              {isOccupied ? '● Занят' : '○ Свободен'}
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
          {!isOccupied ? (
            <button onClick={() => onStart(table.id)} className="btn btn-primary btn-full">
              <Play size={16} />
              Начать игру
            </button>
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
  const { tables, startSession, endSession, settings, getTodayRevenue, getTodaySessions, openModal } = useStore();
  const [showStartModal, setShowStartModal] = useState(false);
  const [showEndModal, setShowEndModal] = useState(false);
  const [selectedTable, setSelectedTable] = useState<number | null>(null);

  // Стартовая модалка
  const [selectedMode, setSelectedMode] = useState<SessionMode | null>(null);
  const [timeHours, setTimeHours] = useState(1);
  const [timeMinutes, setTimeMinutes] = useState(0);
  const [fixedAmount, setFixedAmount] = useState(5000);

  const revenue = getTodayRevenue();
  const todaySessions = getTodaySessions();

  const handleStart = (tableId: number) => {
    setSelectedTable(tableId);
    setSelectedMode(null);
    setTimeHours(1);
    setTimeMinutes(0);
    setFixedAmount(5000);
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
    });

    if (settings.soundEnabled) playStartSound();
    setShowStartModal(false);
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
        tableName: table.name,
        mode: session.mode,
        startTime: session.startTime,
        endTime,
        duration: durationMinutes,
        tableCost,
        barOrders: session.barOrders,
        barCost,
        totalCost: tableCost + barCost,
        currency: settings.currency
      });
    }

    endSession(selectedTable);
    if (settings.soundEnabled) playStopSound();
    setShowEndModal(false);
  };

  const handleTimeExpired = useCallback((tableId: number) => {
    if (settings.soundEnabled) playTimerEndSound();
    endSession(tableId);
  }, [settings.soundEnabled, endSession]);

  const handleOpenBar = (tableId: number) => {
    openModal('bar-order', { tableId });
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
                onClick={() => setSelectedMode('time')}
                className={`mode-btn ${selectedMode === 'time' ? 'active mode-time' : ''}`}
              >
                <Timer size={24} />
                <span className="mode-btn-label">По времени</span>
                <span className="mode-btn-desc">Выбрать длительность</span>
              </button>
              <button
                onClick={() => setSelectedMode('amount')}
                className={`mode-btn ${selectedMode === 'amount' ? 'active mode-amount' : ''}`}
              >
                <Banknote size={24} />
                <span className="mode-btn-label">На сумму</span>
                <span className="mode-btn-desc">Фиксированная оплата</span>
              </button>
              <button
                onClick={() => setSelectedMode('unlimited')}
                className={`mode-btn ${selectedMode === 'unlimited' ? 'active mode-unlimited' : ''}`}
              >
                <InfinityIcon size={24} />
                <span className="mode-btn-label">Бессрочно</span>
                <span className="mode-btn-desc">Без ограничений</span>
              </button>
            </div>

            {/* Настройки для режима "по времени" */}
            {selectedMode === 'time' && (
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
            {selectedMode === 'amount' && (
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
            {selectedMode === 'unlimited' && (
              <div className="unlimited-info">
                <p className="unlimited-text">
                  Стол будет открыт без ограничений. Оплата по факту времени.
                </p>
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
      <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">
          <Square size={20} className="text-red-400" />
          Завершить игру — {table.name}
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
        </div>
        <div className="modal-actions">
          <button onClick={onCancel} className="btn btn-ghost">Назад</button>
          {!autoPrintEnabled && (
            <button onClick={() => onConfirm(true)} className="btn btn-primary">
              <Printer size={16} />
              Печать чека
            </button>
          )}
          <button onClick={() => onConfirm(false)} className="btn btn-danger">
            <Square size={16} />
            {autoPrintEnabled ? 'Завершить с чеком' : 'Завершить'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
