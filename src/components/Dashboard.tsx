import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { useShallow } from "zustand/react/shallow";
import {
  Play,
  Pause,
  Square,
  Plus,
  Clock,
  ShoppingBag,
  DollarSign,
  Banknote,
  Briefcase,
  Zap,
  TrendingUp,
  Timer,
  Infinity as InfinityIcon,
  AlertCircle,
  Printer,
  CalendarClock,
  X,
  User,
  Phone,
  FileText,
  LayoutGrid,
  Grid2x2,
  List,
  ReceiptText,
} from "lucide-react";
import { useStore } from "../store/useStore";
import { useT } from "../i18n";
import { requestCancelAuth } from "./cancelAuthController";
import ModalCloseX from "./ModalCloseX";
import type {
  BilliardTable,
  SessionMode,
  Tariff,
  PaymentDetails,
  BarOrderItem,
  BarOrder,
  PersonnelMember,
} from "../types";
import TableModal from "./TableModal";
import NumberInput from "./NumberInput";
import PaymentBreakdownPicker from "./PaymentBreakdownPicker";
import { playStartSound, playStopSound } from "../utils/sounds";
import {
  generateBarSaleReceiptHTML,
  printSessionReceipt,
  printKitchenTicket,
} from "../utils/receipt";
import { computeSessionCharges } from "../utils/sessionCharges";
import { getItemDepartment } from "../utils/department";
import { useModalKeyboard } from "../hooks/useModalKeyboard";
import {
  calculatePausedSessionCost,
  estimateCostForDuration,
  estimateDurationSecondsForAmount,
  getCurrentPricePerHour,
  getActiveElapsedMs,
  isMinuteInRange,
  parseTimeToMinutes,
} from "../utils/pricing";

const formatPhone = (value: string, prevValue = "") => {
  let digits = value.replace(/\D/g, "");
  const prevDigitsRaw = prevValue.replace(/\D/g, "");

  // Если удалили только символ-разделитель (пробел/скобку/дефис), удаляем и последнюю цифру
  if (
    value.length < prevValue.length &&
    digits.length === prevDigitsRaw.length
  ) {
    digits = digits.slice(0, -1);
  }

  if (digits.startsWith("8")) digits = "7" + digits.slice(1);
  if (!digits.startsWith("7")) digits = "7" + digits;
  digits = digits.slice(0, 11);

  const local = digits.slice(1);
  let formatted = "+7";
  if (local.length > 0) formatted += ` (${local.slice(0, 3)}`;
  if (local.length >= 3) formatted += ")";
  if (local.length > 3) formatted += ` ${local.slice(3, 6)}`;
  if (local.length > 6) formatted += `-${local.slice(6, 8)}`;
  if (local.length > 8) formatted += `-${local.slice(8, 10)}`;
  return formatted;
};

const getWalkInAccountNumber = (label: string): number | null => {
  const match = label.match(/(\d+)$/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
};

// ===== ТАЙМЕР СЕССИИ (с обратным отсчётом для режима "по времени") =====
const SessionTimer = React.memo(function SessionTimer({
  startTime,
  mode,
  plannedDuration,
  pausedAt,
  totalPausedMs,
}: {
  startTime: number;
  mode: SessionMode;
  plannedDuration: number | null;
  pausedAt: number | null;
  totalPausedMs: number;
}) {
  const [display, setDisplay] = useState("");
  const [expired, setExpired] = useState(false);
  const isPaused = !!pausedAt;

  // Сброс флага «истекло» при новой сессии (тот же стол переиспользует этот компонент)
  useEffect(() => {
    setExpired(false);
  }, [startTime]);

  useEffect(() => {
    const tick = () => {
      const elapsedSec = Math.floor(
        getActiveElapsedMs(startTime, Date.now(), pausedAt, totalPausedMs) /
          1000,
      );

      if ((mode === "time" || mode === "amount") && plannedDuration !== null) {
        const totalSec = plannedDuration;
        const remaining = totalSec - elapsedSec;

        // Истечение не срабатывает на паузе (там время заморожено).
        // Завершение сессии и печать делает глобальный watchdog в App.tsx —
        // здесь только переключаем визуальное состояние «истекло» (красный таймер).
        if (remaining <= 0 && !expired && !pausedAt) {
          setExpired(true);
        }

        const absRemaining = Math.abs(remaining);
        const h = Math.floor(absRemaining / 3600);
        const m = Math.floor((absRemaining % 3600) / 60);
        const s = absRemaining % 60;
        const pad = (n: number) => String(n).padStart(2, "0");
        const prefix = remaining < 0 ? "+" : "";
        setDisplay(`${prefix}${h > 0 ? pad(h) + ":" : ""}${pad(m)}:${pad(s)}`);
      } else {
        const h = Math.floor(elapsedSec / 3600);
        const m = Math.floor((elapsedSec % 3600) / 60);
        const s = elapsedSec % 60;
        const pad = (n: number) => String(n).padStart(2, "0");
        setDisplay(`${pad(h)}:${pad(m)}:${pad(s)}`);
      }
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [startTime, mode, plannedDuration, pausedAt, totalPausedMs, expired]);

  return (
    <span
      className={`timer-display ${expired ? "timer-expired" : ""} ${isPaused ? "timer-paused" : ""}`}
    >
      {isPaused ? (
        <Pause size={14} className="timer-icon text-amber-400" />
      ) : mode === "time" && !expired ? (
        <Timer size={14} className="timer-icon" />
      ) : null}
      {expired && !isPaused && (
        <AlertCircle size={14} className="timer-icon text-red-400" />
      )}
      {display}
      {isPaused ? " · пауза" : ""}
    </span>
  );
});

const PersonnelAssignField = React.memo(function PersonnelAssignField({
  value,
  options,
  onChange,
}: {
  value: string | null | undefined;
  options: PersonnelMember[];
  onChange: (personnelId: string | null) => void;
}) {
  const { t } = useT();
  const selectedMember = options.find((member) => member.id === value) ?? null;

  return (
    <div
      className="session-info-row session-info-row-personnel"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="personnel-assign-card">
        <div className="personnel-assign-head">
          <div className="personnel-assign-icon">
            <Briefcase size={14} className="text-sky-400" />
          </div>
          <div className="personnel-assign-copy">
            <span className="personnel-assign-label">
              {t("personnel.assign")}
            </span>
            <span className="personnel-assign-value">
              {selectedMember
                ? `${selectedMember.name} · ${selectedMember.roleLabel}`
                : t("personnel.unassigned")}
            </span>
          </div>
        </div>
        <select
          className="form-select personnel-assign-select"
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value || null)}
        >
          <option value="">{t("personnel.unassigned")}</option>
          {options.map((member) => (
            <option key={member.id} value={member.id}>
              {member.name} · {member.roleLabel}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
});

// ===== КАРТОЧКА СТОЛА =====
const TableCard = React.memo(function TableCard({
  table,
  personnelEnabled,
  personnelOptions,
  onStart,
  onStop,
  onPause,
  onResume,
  onOpenBar,
  onAssignPersonnel,
  onReserve,
  onCancelReservation,
  reservation,
}: {
  table: BilliardTable;
  personnelEnabled: boolean;
  personnelOptions: PersonnelMember[];
  onStart: (tableId: number) => void;
  onStop: (tableId: number) => void;
  onPause: (tableId: number) => void;
  onResume: (tableId: number) => void;
  onOpenBar: (tableId: number) => void;
  onAssignPersonnel: (tableId: number, personnelId: string | null) => void;
  onReserve: (tableId: number) => void;
  onCancelReservation: (tableId: number) => void;
  reservation?: {
    customerName: string;
    customerPhone: string;
    reservedFor: number;
    notes: string;
  } | null;
}) {
  // Узкая подписка: карточке нужна только валюта из настроек, а не весь стор.
  // Иначе любое изменение стора (тост, продажа в баре, чужой стол) ре-рендерило
  // ВСЕ карточки. Теперь карточка ре-рендерится только при смене своих props (table)
  // благодаря React.memo + стабильным обработчикам из Dashboard (useCallback).
  const currency = useStore((s) => s.settings.currency);
  const { t } = useT();
  const isOccupied = table.status === "occupied";
  const isReserved = table.status === "reserved";
  const session = table.currentSession;
  const isPaused = !!session?.pausedAt;

  const [currentCost, setCurrentCost] = useState(0);
  useEffect(() => {
    if (!session) {
      setCurrentCost(0);
      return;
    }
    if (
      typeof session.packagePrice === "number" &&
      Number.isFinite(session.packagePrice)
    ) {
      setCurrentCost(session.packagePrice);
      return;
    }
    const compute = () => {
      // Тарифицируем активное время по реальным интервалам — на паузе стоимость «замораживается»
      setCurrentCost(
        calculatePausedSessionCost(
          session.startTime,
          Date.now(),
          table.pricePerHour,
          table.priceSchedule,
          session.mode,
          session.fixedAmount,
          session.packagePrice,
          session.pauseIntervals,
        ),
      );
    };
    compute();
    const interval = setInterval(compute, 1000);
    return () => clearInterval(interval);
  }, [session, table.pricePerHour, table.priceSchedule]);

  const activePricePerHour = getCurrentPricePerHour(
    Date.now(),
    table.pricePerHour,
    table.priceSchedule,
  );

  const barTotal =
    session?.barOrders.reduce((sum, item) => {
      const price = Number.isFinite(item.price) ? item.price : 0;
      const qty = Number.isFinite(item.quantity) ? item.quantity : 0;
      return sum + price * qty;
    }, 0) || 0;

  const modeLabel = session?.tariffName
    ? session.tariffName
    : session?.mode === "time"
      ? t("dashboard.mode_time")
      : session?.mode === "amount"
        ? t("dashboard.mode_amount")
        : t("dashboard.mode_unlimited");

  const modeIcon =
    session?.mode === "time" ? (
      <Timer size={12} />
    ) : session?.mode === "amount" ? (
      <Banknote size={12} />
    ) : (
      <InfinityIcon size={12} />
    );

  return (
    <div
      className={`table-card ${isOccupied ? "occupied" : isReserved ? "reserved" : "free"} ${isPaused ? "paused" : ""}`}
    >
      <div
        className={`table-card-status-bar ${isPaused ? "bg-amber-500" : isOccupied ? "bg-emerald-500" : isReserved ? "bg-amber-500" : "bg-slate-600"}`}
      />

      <div className="table-card-content">
        <div className="table-card-header">
          <div>
            <h3 className="table-card-name">{table.name}</h3>
            <span
              className={`table-card-status ${isPaused ? "status-paused" : isOccupied ? "status-occupied" : isReserved ? "status-reserved" : "status-free"}`}
            >
              {isOccupied
                ? isPaused
                  ? `⏸ ${t("dashboard.status_paused")}`
                  : `● ${t("dashboard.status_occupied")}`
                : isReserved
                  ? `◉ ${t("dashboard.status_reserved")}`
                  : `○ ${t("dashboard.status_free")}`}
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
                pausedAt={session.pausedAt}
                totalPausedMs={session.totalPausedMs ?? 0}
              />
            </div>
            <div className="session-info-row">
              <DollarSign size={14} className="text-emerald-400" />
              <span className="session-cost">
                {currentCost.toLocaleString()} {currency}
              </span>
            </div>
            {barTotal > 0 && (
              <div className="session-info-row">
                <ShoppingBag size={14} className="text-amber-400" />
                <span className="session-bar-cost">
                  Бар: {barTotal.toLocaleString()} {currency}
                </span>
              </div>
            )}
            {personnelEnabled && (
              <PersonnelAssignField
                value={session.assignedPersonnelId}
                options={personnelOptions}
                onChange={(personnelId) =>
                  onAssignPersonnel(table.id, personnelId)
                }
              />
            )}
            <div className="session-total">
              <TrendingUp size={14} />
              <span>
                Итого: {(currentCost + barTotal).toLocaleString()} {currency}
              </span>
            </div>
          </div>
        ) : isReserved && reservation ? (
          <div className="table-card-session">
            <div className="session-info-row">
              <CalendarClock size={14} className="text-amber-400" />
              <span style={{ color: "var(--text-secondary)", fontSize: 13 }}>
                {new Date(reservation.reservedFor).toLocaleString("ru-RU", {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
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
                <span style={{ fontSize: 13 }}>
                  {reservation.customerPhone}
                </span>
              </div>
            )}
            {reservation.notes && (
              <div className="session-info-row">
                <FileText size={14} className="text-slate-400" />
                <span style={{ fontSize: 12, opacity: 0.7 }}>
                  {reservation.notes}
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="table-card-empty">
            <div className="table-card-price">
              <Zap size={14} />
              {activePricePerHour.toLocaleString()} {currency}/час
            </div>
            <p className="table-card-hint">
              {table.priceSchedule.length > 0
                ? t("dashboard.schedule_active")
                : t("dashboard.ready")}
            </p>
          </div>
        )}

        <div className="table-card-actions">
          {!isOccupied && !isReserved ? (
            <>
              <button
                onClick={() => onStart(table.id)}
                className="btn btn-primary"
                style={{ flex: 2 }}
              >
                <Play size={16} />
                <span>{t("dashboard.start")}</span>
              </button>
              <button
                onClick={() => onReserve(table.id)}
                className="btn btn-ghost btn-icon-only"
                style={{ flex: "0 0 auto" }}
                title={t("dashboard.reserve")}
              >
                <CalendarClock size={16} />
              </button>
            </>
          ) : isReserved ? (
            <>
              <button
                onClick={() => onStart(table.id)}
                className="btn btn-primary btn-half"
              >
                <Play size={16} />
                <span>{t("dashboard.start_short")}</span>
              </button>
              <button
                onClick={() => onCancelReservation(table.id)}
                className="btn btn-ghost btn-half"
              >
                <X size={16} />
                <span>{t("dashboard.cancel_reserve")}</span>
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => onOpenBar(table.id)}
                className="btn btn-amber"
                style={{ flex: 1 }}
              >
                <ShoppingBag size={16} />
                <span>{t("nav.bar")}</span>
              </button>
              {isPaused ? (
                <button
                  onClick={() => onResume(table.id)}
                  className="btn btn-primary"
                  style={{ flex: 1 }}
                >
                  <Play size={16} />
                  <span>{t("dashboard.resume")}</span>
                </button>
              ) : (
                <button
                  onClick={() => onPause(table.id)}
                  className="btn btn-ghost"
                  style={{ flex: 1 }}
                >
                  <Pause size={16} />
                  <span>{t("dashboard.pause")}</span>
                </button>
              )}
              <button
                onClick={() => onStop(table.id)}
                className="btn btn-danger"
                style={{ flex: 1 }}
              >
                <Square size={16} />
                <span>{t("dashboard.stop")}</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
});

const WalkInCard = React.memo(function WalkInCard({
  order,
  currency,
  updatedAt,
  personnelEnabled,
  personnelOptions,
  onOpen,
  onOpenBar,
  onClose,
  onAssignPersonnel,
}: {
  order: BarOrder;
  currency: string;
  updatedAt: string;
  personnelEnabled: boolean;
  personnelOptions: PersonnelMember[];
  onOpen: () => void;
  onOpenBar: () => void;
  onClose: () => void;
  onAssignPersonnel: (orderId: string, personnelId: string | null) => void;
}) {
  const { t } = useT();
  const itemsCount = order.items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div className="table-card walkin-table-card" onClick={onOpen}>
      <div className="table-card-status-bar bg-amber-500" />

      <div className="table-card-content">
        <div className="table-card-header">
          <div>
            <h3 className="table-card-name">
              {order.label || t("bar.no_table")}
            </h3>
            <span className="table-card-status status-occupied">
              ● {t("dashboard.walkin_active")}
            </span>
          </div>
          <span className="session-mode-badge">
            <ReceiptText size={12} /> {itemsCount} {t("dashboard.walkin_items")}
          </span>
        </div>

        <div className="table-card-session">
          <div className="session-info-row">
            <Clock size={14} className="text-slate-400" />
            <span style={{ color: "var(--text-secondary)", fontSize: 13 }}>
              {t("dashboard.walkin_updated_at")}: {updatedAt}
            </span>
          </div>
          <div className="session-info-row">
            <ShoppingBag size={14} className="text-amber-400" />
            <span className="session-bar-cost">
              {t("dashboard.walkin_total_items")}: {itemsCount}
            </span>
          </div>
          {personnelEnabled && (
            <PersonnelAssignField
              value={order.assignedPersonnelId}
              options={personnelOptions}
              onChange={(personnelId) =>
                onAssignPersonnel(order.id, personnelId)
              }
            />
          )}
          <div className="session-total">
            <TrendingUp size={14} />
            <span>
              {t("common.total")}: {order.totalCost.toLocaleString()} {currency}
            </span>
          </div>
        </div>

        <div
          className="table-card-actions"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={onOpenBar}
            className="btn btn-amber"
            style={{ flex: 1 }}
          >
            <ShoppingBag size={16} />
            <span>{t("nav.bar")}</span>
          </button>
          <button
            onClick={onClose}
            className="btn btn-danger"
            style={{ flex: 1 }}
          >
            <Square size={16} />
            <span>{t("dashboard.walkin_close_account")}</span>
          </button>
        </div>
      </div>
    </div>
  );
});

const WalkInCreateCard = React.memo(function WalkInCreateCard({
  onCreate,
}: {
  onCreate: () => void;
}) {
  const { t } = useT();

  return (
    <div className="table-card walkin-create-card" onClick={onCreate}>
      <div className="table-card-status-bar bg-slate-600" />

      <div className="table-card-content">
        <div className="table-card-header">
          <div>
            <h3 className="table-card-name">
              {t("dashboard.walkin_create_title")}
            </h3>
            <span className="table-card-status status-free">
              ○ {t("dashboard.walkin_create_hint")}
            </span>
          </div>
        </div>

        <div className="table-card-empty walkin-create-empty">
          <div className="walkin-create-icon">
            <Plus size={22} />
          </div>
          <p className="table-card-hint">
            {t("dashboard.walkin_create_description")}
          </p>
        </div>

        <div className="table-card-actions">
          <button onClick={onCreate} className="btn btn-primary btn-full">
            <Plus size={16} />
            <span>{t("dashboard.walkin_open_account")}</span>
          </button>
        </div>
      </div>
    </div>
  );
});

// ===== DASHBOARD =====
const Dashboard: React.FC = () => {
  // Узкая подписка (useShallow) вместо useStore() на весь стор: Dashboard больше не
  // ре-рендерится на каждый тост / открытие модалки / изменение чужого среза. Ре-рендер
  // только при смене реально нужных срезов. sessionHistory — ради живого пересчёта
  // выручки (getTodayRevenue читает его). Экшены zustand стабильны по ссылке.
  const {
    tables,
    startSession,
    endSession,
    pauseSession,
    resumeSession,
    settings,
    getTodayRevenue,
    getTodaySessions,
    openModal,
    reservations,
    addReservation,
    cancelReservation,
    cancelOpenWalkInItem,
    personnel,
    assignPersonnelToTable,
    assignPersonnelToBarOrder,
    tariffs,
    addBarOrderToTable,
    barMenu,
    barCategories,
    updateSettings,
    barOrders,
    finalizeBarOrder,
    createBarOrder,
  } = useStore(
    useShallow((s) => ({
      tables: s.tables,
      startSession: s.startSession,
      endSession: s.endSession,
      pauseSession: s.pauseSession,
      resumeSession: s.resumeSession,
      settings: s.settings,
      getTodayRevenue: s.getTodayRevenue,
      getTodaySessions: s.getTodaySessions,
      openModal: s.openModal,
      reservations: s.reservations,
      addReservation: s.addReservation,
      cancelReservation: s.cancelReservation,
      cancelOpenWalkInItem: s.cancelOpenWalkInItem,
      personnel: s.personnel,
      assignPersonnelToTable: s.assignPersonnelToTable,
      assignPersonnelToBarOrder: s.assignPersonnelToBarOrder,
      tariffs: s.tariffs,
      addBarOrderToTable: s.addBarOrderToTable,
      barMenu: s.barMenu,
      barCategories: s.barCategories,
      updateSettings: s.updateSettings,
      barOrders: s.barOrders,
      finalizeBarOrder: s.finalizeBarOrder,
      createBarOrder: s.createBarOrder,
      sessionHistory: s.sessionHistory,
    })),
  );
  const { t } = useT();
  // Защита от двойного клика по «Завершить»: синхронный замок (ref обновляется
  // мгновенно, в отличие от state) + флаг для блокировки кнопки в UI.
  const closingRef = useRef(false);
  const [isClosing, setIsClosing] = useState(false);
  const [showStartModal, setShowStartModal] = useState(false);
  const [showEndModal, setShowEndModal] = useState(false);
  const [showReserveModal, setShowReserveModal] = useState(false);
  const [dashboardSection, setDashboardSection] = useState<
    "tables" | "walkins"
  >("tables");
  const [selectedTable, setSelectedTable] = useState<number | null>(null);
  const [selectedWalkInOrderId, setSelectedWalkInOrderId] = useState<
    string | null
  >(null);
  const [showWalkInItemsModal, setShowWalkInItemsModal] = useState(false);
  const [showWalkInCloseModal, setShowWalkInCloseModal] = useState(false);
  const [isClosingWalkIn, setIsClosingWalkIn] = useState(false);

  // Стартовая модалка
  const [selectedMode, setSelectedMode] = useState<SessionMode | null>(null);
  const [timeHours, setTimeHours] = useState(1);
  const [timeMinutes, setTimeMinutes] = useState(0);
  const [fixedAmount, setFixedAmount] = useState(5000);
  const [selectedTariff, setSelectedTariff] = useState<Tariff | null>(null);

  // Бронирование
  const [reserveName, setReserveName] = useState("");
  const [reservePhone, setReservePhone] = useState("");
  const [reserveDate, setReserveDate] = useState("");
  const [reserveTime, setReserveTime] = useState("");
  const [reserveNotes, setReserveNotes] = useState("");

  const revenue = getTodayRevenue();
  const todaySessions = getTodaySessions();
  const walkInOrders = useMemo(
    () =>
      barOrders
        .filter((order) => order.tableId == null && !order.isPaid)
        .sort((left, right) => {
          const leftNumber = Number(
            left.label?.match(/(\d+)$/)?.[1] ?? Number.MAX_SAFE_INTEGER,
          );
          const rightNumber = Number(
            right.label?.match(/(\d+)$/)?.[1] ?? Number.MAX_SAFE_INTEGER,
          );
          if (leftNumber !== rightNumber) return leftNumber - rightNumber;
          return (left.label ?? "").localeCompare(right.label ?? "", "ru");
        }),
    [barOrders],
  );
  const selectedWalkInOrder = selectedWalkInOrderId
    ? (walkInOrders.find((order) => order.id === selectedWalkInOrderId) ?? null)
    : null;
  const nextWalkInLabel = useMemo(() => {
    const maxNumber = walkInOrders.reduce((max, order) => {
      const current = getWalkInAccountNumber(order.label ?? "");
      return current != null && current > max ? current : max;
    }, 0);
    return `${t("bar.walk_in_account")} ${maxNumber + 1}`;
  }, [walkInOrders, t]);
  const selectedTableData = selectedTable
    ? tables.find((t) => t.id === selectedTable)
    : null;
  const selectedTableCurrentRate = selectedTableData
    ? getCurrentPricePerHour(
        Date.now(),
        selectedTableData.pricePerHour,
        selectedTableData.priceSchedule,
      )
    : 0;
  const timeEstimateCost = selectedTableData
    ? estimateCostForDuration(
        Date.now(),
        (timeHours * 60 + timeMinutes) * 60,
        selectedTableData.pricePerHour,
        selectedTableData.priceSchedule,
      )
    : 0;
  const amountEstimateSeconds = selectedTableData
    ? estimateDurationSecondsForAmount(
        Date.now(),
        fixedAmount,
        selectedTableData.pricePerHour,
        selectedTableData.priceSchedule,
      )
    : 0;
  const walkInClosingRef = useRef(false);
  const activePersonnel = useMemo(
    () => personnel.filter((member) => member.isActive),
    [personnel],
  );

  const handleStart = useCallback((tableId: number) => {
    setSelectedTable(tableId);
    setSelectedMode(null);
    setTimeHours(1);
    setTimeMinutes(0);
    setFixedAmount(5000);
    setSelectedTariff(null);
    setShowStartModal(true);
  }, []);

  const handleConfirmStart = () => {
    if (!selectedTable || !selectedMode) return;

    if (selectedMode === "time" && timeHours === 0 && timeMinutes === 0) return;
    if (selectedMode === "amount" && fixedAmount <= 0) return;

    startSession(selectedTable, selectedMode, {
      hours: timeHours,
      minutes: timeMinutes,
      amount: fixedAmount,
      plannedDurationSeconds: selectedTariff
        ? Math.max(1, Math.round(selectedTariff.durationHours * 3600))
        : undefined,
      packagePrice: selectedTariff ? selectedTariff.price : undefined,
      tariffName: selectedTariff ? selectedTariff.name : undefined,
    });

    if (settings.soundEnabled) playStartSound();
    setShowStartModal(false);

    // Если был выбран тариф — автоматически добавляем продукты из бара
    if (selectedTariff && selectedTariff.menuProducts.length > 0) {
      const tableId = selectedTable;
      const tariff = selectedTariff;
      const tableName = tables.find((t) => t.id === tableId)?.name;
      setTimeout(() => {
        const kitchenItems: { name: string; quantity: number }[] = [];
        tariff.menuProducts.forEach((tp) => {
          const menuItem = barMenu.find((m) => m.id === tp.productId);
          if (menuItem) {
            addBarOrderToTable(tableId, menuItem, tp.quantity, {
              priceOverride: 0,
              silent: true,
            });
            if (getItemDepartment(menuItem, barCategories) === "kitchen") {
              kitchenItems.push({ name: menuItem.name, quantity: tp.quantity });
            }
          }
        });
        // Блюда из пакета тарифа тоже отправляем на кухню
        if (settings.autoPrintKitchenTicket && kitchenItems.length > 0) {
          void printKitchenTicket({
            clubName: settings.clubName,
            tableName,
            cashierName: settings.receiptCashierName,
            items: kitchenItems,
            receiptWidthMm: settings.receiptWidthMm,
            receiptFontSize: settings.receiptFontSize,
            receiptPaddingMm: settings.receiptPaddingMm,
            deviceName: settings.kitchenPrinterName,
          });
        }
      }, 100);
    }
    setSelectedTariff(null);
  };

  const handleStop = useCallback((tableId: number) => {
    setSelectedTable(tableId);
    setShowEndModal(true);
  }, []);

  const handleConfirmEnd = async (
    shouldPrint?: boolean,
    payment: PaymentDetails = { paymentMethod: "cash" },
  ) => {
    if (!selectedTable) return;
    // Re-entry guard: повторный клик до завершения первого — игнорируем.
    if (closingRef.current) return;

    const table = tables.find((t) => t.id === selectedTable);
    if (!table || !table.currentSession) return;

    closingRef.current = true;
    setIsClosing(true);
    try {
      const session = table.currentSession;
      // Фиксируем момент завершения ОДИН раз: и для чека, и для записи в отчёт,
      // чтобы суммы совпадали до тенге (см. endSession(tableId, endTime)).
      const endTime = Date.now();

      if (shouldPrint || settings.autoPrintReceipt) {
        await printSessionReceipt({ table, session, settings, endTime });
      }

      endSession(selectedTable, endTime, payment);
      if (settings.soundEnabled) playStopSound();
      setShowEndModal(false);
    } finally {
      closingRef.current = false;
      setIsClosing(false);
    }
  };

  const handleOpenBar = useCallback(
    (tableId: number) => {
      openModal("bar-order", { tableId });
    },
    [openModal],
  );

  const formatWalkInTime = useCallback(
    (timestamp: number) =>
      new Date(timestamp).toLocaleTimeString(settings.language, {
        hour: "2-digit",
        minute: "2-digit",
      }),
    [settings.language],
  );

  const handleCreateWalkIn = useCallback(() => {
    createBarOrder(null, [], { label: nextWalkInLabel });
    setDashboardSection("walkins");
  }, [createBarOrder, nextWalkInLabel]);

  const handleOpenWalkInClose = useCallback((orderId: string) => {
    setSelectedWalkInOrderId(orderId);
    setShowWalkInCloseModal(true);
  }, []);

  const handleOpenWalkInItems = useCallback((orderId: string) => {
    setSelectedWalkInOrderId(orderId);
    setShowWalkInItemsModal(true);
  }, []);

  const handleConfirmWalkInClose = useCallback(
    async (
      shouldPrint?: boolean,
      payment: PaymentDetails = { paymentMethod: "cash" },
    ) => {
      if (!selectedWalkInOrder || walkInClosingRef.current) return;

      walkInClosingRef.current = true;
      setIsClosingWalkIn(true);
      try {
        const serviceCharge = settings.serviceChargeEnabled
          ? Math.round(
              (selectedWalkInOrder.totalCost * settings.serviceChargePercent) /
                100,
            )
          : 0;

        if (shouldPrint) {
          const html = generateBarSaleReceiptHTML({
            clubName: settings.clubName,
            receiptCompanyName: settings.receiptCompanyName,
            receiptCity: settings.receiptCity,
            receiptPhone: settings.receiptPhone,
            receiptCashierName: settings.receiptCashierName,
            items: selectedWalkInOrder.items.map((item) => ({
              name: item.menuItemName,
              quantity: item.quantity,
              price: item.price,
            })),
            totalCost: selectedWalkInOrder.totalCost,
            serviceCharge,
            serviceChargePercent: settings.serviceChargePercent,
            currency: settings.currency,
            tableName: selectedWalkInOrder.label || t("bar.no_table"),
            receiptWidthMm: settings.receiptWidthMm,
            receiptFontSize: settings.receiptFontSize,
            receiptPaddingMm: settings.receiptPaddingMm,
          });
          await window.electronAPI?.printer?.printReceipt(
            html,
            settings.receiptWidthMm,
            settings.silentPrint,
            settings.receiptPrinterName,
          );
        }

        finalizeBarOrder(selectedWalkInOrder.id, payment);
        if (settings.soundEnabled) playStopSound();
        setShowWalkInCloseModal(false);
        setSelectedWalkInOrderId(null);
      } finally {
        walkInClosingRef.current = false;
        setIsClosingWalkIn(false);
      }
    },
    [finalizeBarOrder, selectedWalkInOrder, settings, t],
  );

  useEffect(() => {
    if (!selectedWalkInOrderId) return;
    const exists = walkInOrders.some(
      (order) => order.id === selectedWalkInOrderId,
    );
    if (!exists) {
      setSelectedWalkInOrderId(null);
      setShowWalkInItemsModal(false);
      setShowWalkInCloseModal(false);
    }
  }, [selectedWalkInOrderId, walkInOrders]);

  const handleCancelWalkInItem = useCallback(
    async (order: BarOrder, item: BarOrderItem) => {
      const auth = await requestCancelAuth({
        itemLabel: `${item.menuItemName} × ${item.quantity}`,
      });
      if (!auth) return;

      const cancelled = cancelOpenWalkInItem(order.id, item.id, auth);
      if (cancelled && order.items.length === 1) {
        setShowWalkInItemsModal(false);
      }
    },
    [cancelOpenWalkInItem],
  );

  const handleReserve = useCallback((tableId: number) => {
    setSelectedTable(tableId);
    setReserveName("");
    setReservePhone("");
    // Дефолт — сегодня
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    setReserveDate(`${y}-${m}-${d}`);
    const h = String(now.getHours()).padStart(2, "0");
    const min = String(now.getMinutes()).padStart(2, "0");
    setReserveTime(`${h}:${min}`);
    setReserveNotes("");
    setShowReserveModal(true);
  }, []);

  const handleConfirmReserve = () => {
    if (!selectedTable || !reserveDate || !reserveTime) return;
    const [y, m, d] = reserveDate.split("-").map(Number);
    const [hh, mm] = reserveTime.split(":").map(Number);
    const reservedFor = new Date(y, m - 1, d, hh, mm).getTime();
    addReservation(
      selectedTable,
      reserveName,
      reservePhone,
      reservedFor,
      reserveNotes,
    );
    setShowReserveModal(false);
  };

  const handleCancelReservation = useCallback(
    (tableId: number) => {
      const r = reservations.find((res) => res.tableId === tableId);
      if (r) cancelReservation(r.id);
    },
    [reservations, cancelReservation],
  );

  // O(1)-поиск брони по столу: было reservations.find() на КАЖДЫЙ стол в рендере (O(столы×броней)).
  const reservationByTableId = useMemo(
    () => new Map(reservations.map((r) => [r.tableId, r])),
    [reservations],
  );
  const getTableReservation = (tableId: number) =>
    reservationByTableId.get(tableId) ?? null;

  // Клавиатура для модалок: Escape закрывает; для брони Enter подтверждает.
  // У модалки старта Enter не вешаем — там сперва выбирают режим.
  useModalKeyboard({
    active: showStartModal,
    onEscape: () => setShowStartModal(false),
  });
  useModalKeyboard({
    active: showReserveModal,
    onEscape: () => setShowReserveModal(false),
    onEnter: handleConfirmReserve,
  });

  return (
    <div className="dashboard">
      {/* Статистика за день */}
      <div className="dashboard-stats">
        <div className="stat-card stat-revenue">
          <div className="stat-icon">
            <DollarSign size={24} />
          </div>
          <div>
            <p className="stat-label">{t("dashboard.revenue_total")}</p>
            <p className="stat-value">
              {revenue.total.toLocaleString()} {settings.currency}
            </p>
          </div>
        </div>
        <div className="stat-card stat-table-rev">
          <div className="stat-icon">
            <Clock size={24} />
          </div>
          <div>
            <p className="stat-label">{t("dashboard.revenue_table")}</p>
            <p className="stat-value">
              {revenue.table.toLocaleString()} {settings.currency}
            </p>
          </div>
        </div>
        <div className="stat-card stat-bar-rev">
          <div className="stat-icon">
            <ShoppingBag size={24} />
          </div>
          <div>
            <p className="stat-label">{t("dashboard.revenue_bar")}</p>
            <p className="stat-value">
              {revenue.bar.toLocaleString()} {settings.currency}
            </p>
          </div>
        </div>
        <div className="stat-card stat-sessions">
          <div className="stat-icon">
            <TrendingUp size={24} />
          </div>
          <div>
            <p className="stat-label">{t("dashboard.revenue_today")}</p>
            <p className="stat-value">{todaySessions}</p>
          </div>
        </div>
      </div>

      {/* Панель столов: заголовок + переключатель вида */}
      <div className="tables-toolbar">
        <h2 className="tables-toolbar-title">
          {dashboardSection === "tables"
            ? t("dashboard.tables_title")
            : t("dashboard.walkin_title")}
        </h2>
        <div className="tables-toolbar-controls">
          <div className="seg-toggle tables-section-seg" role="tablist">
            <button
              type="button"
              className={`seg-option ${dashboardSection === "tables" ? "active" : ""}`}
              onClick={() => setDashboardSection("tables")}
            >
              <LayoutGrid size={15} />
              <span className="seg-label">{t("dashboard.tables_title")}</span>
            </button>
            <button
              type="button"
              className={`seg-option ${dashboardSection === "walkins" ? "active" : ""}`}
              onClick={() => setDashboardSection("walkins")}
            >
              <ReceiptText size={15} />
              <span className="seg-label">
                {t("dashboard.walkin_title")} ({walkInOrders.length})
              </span>
            </button>
          </div>
          <div className="seg-toggle tables-view-seg" role="tablist">
            <button
              type="button"
              className={`seg-option ${settings.tablesViewMode === "grid" ? "active" : ""}`}
              onClick={() => updateSettings({ tablesViewMode: "grid" })}
              title={t("dashboard.view_grid")}
            >
              <LayoutGrid size={15} />
              <span className="seg-label">{t("dashboard.view_grid")}</span>
            </button>
            <button
              type="button"
              className={`seg-option ${settings.tablesViewMode === "compact" ? "active" : ""}`}
              onClick={() => updateSettings({ tablesViewMode: "compact" })}
              title={t("dashboard.view_compact")}
            >
              <Grid2x2 size={15} />
              <span className="seg-label">{t("dashboard.view_compact")}</span>
            </button>
            <button
              type="button"
              className={`seg-option ${settings.tablesViewMode === "list" ? "active" : ""}`}
              onClick={() => updateSettings({ tablesViewMode: "list" })}
              title={t("dashboard.view_list")}
            >
              <List size={15} />
              <span className="seg-label">{t("dashboard.view_list")}</span>
            </button>
          </div>
        </div>
      </div>

      {dashboardSection === "tables" ? (
        <div className={`tables-grid view-${settings.tablesViewMode}`}>
          {tables.map((table) => (
            <TableCard
              key={table.id}
              table={table}
              personnelEnabled={settings.personnelEnabled}
              personnelOptions={activePersonnel}
              onStart={handleStart}
              onStop={handleStop}
              onPause={pauseSession}
              onResume={resumeSession}
              onOpenBar={handleOpenBar}
              onAssignPersonnel={assignPersonnelToTable}
              onReserve={handleReserve}
              onCancelReservation={handleCancelReservation}
              reservation={getTableReservation(table.id)}
            />
          ))}
          {walkInOrders.length === 0 && (
            <WalkInCreateCard onCreate={handleCreateWalkIn} />
          )}
        </div>
      ) : (
        <div className={`tables-grid view-${settings.tablesViewMode}`}>
          {walkInOrders.map((order) => (
            <WalkInCard
              key={order.id}
              order={order}
              currency={settings.currency}
              updatedAt={formatWalkInTime(order.timestamp)}
              personnelEnabled={settings.personnelEnabled}
              personnelOptions={activePersonnel}
              onOpen={() => handleOpenWalkInItems(order.id)}
              onOpenBar={() =>
                openModal("bar-order", { walkInLabel: order.label ?? "" })
              }
              onClose={() => handleOpenWalkInClose(order.id)}
              onAssignPersonnel={assignPersonnelToBarOrder}
            />
          ))}
          <WalkInCreateCard onCreate={handleCreateWalkIn} />
        </div>
      )}

      {/* === МОДАЛКА НАЧАЛА ИГРЫ (выбор режима) === */}
      {showStartModal && selectedTableData && (
        <div className="modal-overlay" onClick={() => setShowStartModal(false)}>
          <div
            className="modal modal-start"
            onClick={(e) => e.stopPropagation()}
          >
            <ModalCloseX onClose={() => setShowStartModal(false)} />
            <h2 className="modal-title">
              <Play size={20} className="text-emerald-400" />
              {t("dashboard.choose_mode", { name: selectedTableData.name })}
            </h2>

            <p className="modal-hint" style={{ marginBottom: "16px" }}>
              Сейчас: {selectedTableCurrentRate.toLocaleString()}{" "}
              {settings.currency}/час
              {selectedTableData.priceSchedule.length > 0 &&
                ` · вне интервалов ${selectedTableData.pricePerHour.toLocaleString()} ${settings.currency}/час`}
            </p>

            {/* Выбор режима */}
            <div className="mode-selector">
              <button
                onClick={() => {
                  setSelectedMode("time");
                  setSelectedTariff(null);
                }}
                className={`mode-btn ${selectedMode === "time" && !selectedTariff ? "active mode-time" : ""}`}
              >
                <Timer size={24} />
                <span className="mode-btn-label">По времени</span>
                <span className="mode-btn-desc">Выбрать длительность</span>
              </button>
              <button
                onClick={() => {
                  setSelectedMode("amount");
                  setSelectedTariff(null);
                  setFixedAmount(5000);
                }}
                className={`mode-btn ${selectedMode === "amount" && !selectedTariff ? "active mode-amount" : ""}`}
              >
                <Banknote size={24} />
                <span className="mode-btn-label">На сумму</span>
                <span className="mode-btn-desc">Фиксированная оплата</span>
              </button>
              <button
                onClick={() => {
                  setSelectedMode("unlimited");
                  setSelectedTariff(null);
                }}
                className={`mode-btn ${selectedMode === "unlimited" && !selectedTariff ? "active mode-unlimited" : ""}`}
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
                if (
                  !t.isActive ||
                  selectedTable === null ||
                  !t.tableIds.includes(selectedTable)
                )
                  return false;
                return isMinuteInRange(
                  currentMinutes,
                  parseTimeToMinutes(t.startTime),
                  parseTimeToMinutes(t.endTime),
                );
              });
              if (tableTariffs.length === 0) return null;
              return (
                <div style={{ marginTop: 4 }}>
                  <p
                    style={{
                      fontSize: 12,
                      color: "#64748b",
                      marginBottom: 8,
                      fontWeight: 500,
                    }}
                  >
                    Или выберите тариф:
                  </p>
                  <div
                    style={{ display: "flex", flexDirection: "column", gap: 6 }}
                  >
                    {tableTariffs.map((tariff) => (
                      <button
                        key={tariff.id}
                        onClick={() => {
                          if (!selectedTable) return;
                          // Выбираем тариф: режим "на сумму" с ценой тарифа (итоговая цена за всё)
                          setSelectedTariff(tariff);
                          setSelectedMode("amount");
                          setFixedAmount(tariff.price);
                        }}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "10px 14px",
                          borderRadius: 10,
                          border:
                            selectedTariff?.id === tariff.id
                              ? "2px solid rgba(139, 92, 246, 0.6)"
                              : "1px solid rgba(139, 92, 246, 0.25)",
                          background:
                            selectedTariff?.id === tariff.id
                              ? "rgba(139, 92, 246, 0.15)"
                              : "rgba(139, 92, 246, 0.06)",
                          cursor: "pointer",
                          transition: "all 0.2s",
                          textAlign: "left",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 2,
                          }}
                        >
                          <span
                            style={{
                              fontSize: 13,
                              fontWeight: 600,
                              color: "#c4b5fd",
                            }}
                          >
                            {tariff.name}
                          </span>
                          <span style={{ fontSize: 11, color: "#94a3b8" }}>
                            {tariff.startTime}–{tariff.endTime} ·{" "}
                            {tariff.durationHours} ч
                            {tariff.menuProducts.length > 0 &&
                              ` · +${tariff.menuProducts.length} продукт.`}
                          </span>
                        </div>
                        <span
                          style={{
                            fontSize: 14,
                            fontWeight: 700,
                            color: "#a78bfa",
                          }}
                        >
                          {tariff.price.toLocaleString()} {settings.currency}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Настройки для режима "по времени" */}
            {selectedMode === "time" && !selectedTariff && (
              <div className="time-selector">
                <label className="modal-label">Длительность</label>
                <div className="time-presets">
                  {[1, 2, 3].map((h) => (
                    <button
                      key={h}
                      onClick={() => {
                        setTimeHours(h);
                        setTimeMinutes(0);
                      }}
                      className={`time-preset-btn ${timeHours === h && timeMinutes === 0 ? "active" : ""}`}
                    >
                      {h} час{h > 1 ? "а" : ""}
                    </button>
                  ))}
                </div>
                <div className="time-custom">
                  <div className="time-input-group">
                    <label className="time-input-label">Часы</label>
                    <div className="time-spinner">
                      <button
                        onClick={() => setTimeHours(Math.max(0, timeHours - 1))}
                        className="spinner-btn"
                      >
                        −
                      </button>
                      <span className="spinner-value">{timeHours}</span>
                      <button
                        onClick={() =>
                          setTimeHours(Math.min(12, timeHours + 1))
                        }
                        className="spinner-btn"
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <div className="time-input-group">
                    <label className="time-input-label">Минуты</label>
                    <div className="time-spinner">
                      <button
                        onClick={() =>
                          setTimeMinutes(Math.max(0, timeMinutes - 15))
                        }
                        className="spinner-btn"
                      >
                        −
                      </button>
                      <span className="spinner-value">{timeMinutes}</span>
                      <button
                        onClick={() =>
                          setTimeMinutes(Math.min(45, timeMinutes + 15))
                        }
                        className="spinner-btn"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
                {(timeHours > 0 || timeMinutes > 0) && (
                  <div className="time-estimate">
                    Стоимость: {timeEstimateCost.toLocaleString()}{" "}
                    {settings.currency}
                  </div>
                )}
              </div>
            )}

            {/* Настройки для режима "на сумму" */}
            {selectedMode === "amount" && !selectedTariff && (
              <div className="amount-selector">
                <label className="modal-label">Сумма</label>
                <div className="amount-presets">
                  {[2000, 3000, 5000, 10000].map((a) => (
                    <button
                      key={a}
                      onClick={() => setFixedAmount(a)}
                      className={`amount-preset-btn ${fixedAmount === a ? "active" : ""}`}
                    >
                      {a.toLocaleString()} {settings.currency}
                    </button>
                  ))}
                </div>
                <NumberInput
                  value={fixedAmount}
                  onChange={setFixedAmount}
                  className="modal-input"
                  placeholder="Или введите сумму..."
                />
                <div className="time-estimate">
                  ≈ {Math.max(1, Math.round(amountEstimateSeconds / 60))} минут
                  игры
                </div>
              </div>
            )}

            {/* Бессрочный */}
            {selectedMode === "unlimited" && !selectedTariff && (
              <div className="unlimited-info">
                <p className="unlimited-text">
                  Стол будет открыт без ограничений. Оплата по факту времени.
                </p>
              </div>
            )}

            {/* Инфо о выбранном тарифе */}
            {selectedTariff && (
              <div
                style={{
                  padding: "14px 16px",
                  borderRadius: 12,
                  background: "rgba(139, 92, 246, 0.08)",
                  border: "1px solid rgba(139, 92, 246, 0.2)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span
                    style={{ fontSize: 14, fontWeight: 600, color: "#c4b5fd" }}
                  >
                    Тариф: {selectedTariff.name}
                  </span>
                  <span
                    style={{ fontSize: 16, fontWeight: 700, color: "#a78bfa" }}
                  >
                    {selectedTariff.price.toLocaleString()} {settings.currency}
                  </span>
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: "#94a3b8",
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                  }}
                >
                  <span>⏱ Игра: {selectedTariff.durationHours} ч</span>
                  {selectedTariff.menuProducts.length > 0 && (
                    <span>
                      🍺 Включено:{" "}
                      {selectedTariff.menuProducts
                        .map((p) => `${p.productName} ×${p.quantity}`)
                        .join(", ")}
                    </span>
                  )}
                  <span
                    style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}
                  >
                    Цена итоговая (время + бар)
                  </span>
                </div>
              </div>
            )}

            <div className="modal-actions">
              <button
                onClick={() => setShowStartModal(false)}
                className="btn btn-ghost"
              >
                Отмена
              </button>
              <button
                onClick={handleConfirmStart}
                disabled={
                  !selectedMode ||
                  (selectedMode === "time" &&
                    timeHours === 0 &&
                    timeMinutes === 0)
                }
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
      {showEndModal &&
        selectedTableData &&
        selectedTableData.currentSession && (
          <EndSessionModal
            table={selectedTableData}
            onConfirm={handleConfirmEnd}
            onCancel={() => setShowEndModal(false)}
            autoPrintEnabled={settings.autoPrintReceipt}
            busy={isClosing}
          />
        )}

      {/* Модалка заказа бара */}
      <TableModal />

      {showWalkInCloseModal && selectedWalkInOrder && (
        <WalkInCloseModal
          order={selectedWalkInOrder}
          onConfirm={handleConfirmWalkInClose}
          onCancel={() => setShowWalkInCloseModal(false)}
          onCancelItem={(item) =>
            handleCancelWalkInItem(selectedWalkInOrder, item)
          }
          busy={isClosingWalkIn}
        />
      )}

      {showWalkInItemsModal && selectedWalkInOrder && (
        <WalkInItemsModal
          order={selectedWalkInOrder}
          currency={settings.currency}
          onCancel={() => setShowWalkInItemsModal(false)}
          onCancelItem={(item) =>
            handleCancelWalkInItem(selectedWalkInOrder, item)
          }
        />
      )}

      {/* Модалка бронирования */}
      {showReserveModal && selectedTableData && (
        <div
          className="modal-overlay"
          onClick={() => setShowReserveModal(false)}
        >
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <ModalCloseX onClose={() => setShowReserveModal(false)} />
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
                    autoFocus
                  />
                </div>
                <div>
                  <label className="modal-label">Телефон</label>
                  <input
                    type="tel"
                    value={reservePhone}
                    onChange={(e) =>
                      setReservePhone((prev) =>
                        formatPhone(e.target.value, prev),
                      )
                    }
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
              <button
                onClick={() => setShowReserveModal(false)}
                className="btn btn-ghost"
              >
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
  onConfirm: (shouldPrint?: boolean, payment?: PaymentDetails) => void;
  onCancel: () => void;
  autoPrintEnabled: boolean;
  busy?: boolean;
}> = ({ table, onConfirm, onCancel, autoPrintEnabled, busy }) => {
  const settings = useStore((s) => s.settings);
  const cancelOpenTableItem = useStore((s) => s.cancelOpenTableItem);
  const { t } = useT();
  const [payment, setPayment] = useState<PaymentDetails>({
    paymentMethod: "cash",
  });
  const [isPaymentValid, setIsPaymentValid] = useState(true);

  // Отмена ошибочно пробитой позиции прямо на чекауте (защищено паролем + причина).
  const handleCancelBarItem = async (item: BarOrderItem) => {
    const auth = await requestCancelAuth({
      itemLabel: `${item.menuItemName} × ${item.quantity}`,
    });
    if (auth) cancelOpenTableItem(table.id, item.id, auth);
  };
  // Escape — отмена, Enter — завершить с выбранным способом оплаты (защита от busy —
  // повторный вызов отсекает closingRef в Dashboard).
  useModalKeyboard({
    onEscape: onCancel,
    onEnter: () => {
      if (!busy && isPaymentValid) onConfirm(false, payment);
    },
  });
  const session = table.currentSession!;
  // Предпросмотр сумм на текущий момент (тот же расчёт, что и для чека/отчёта).
  const { durationMinutes, tableCost, barCost, serviceCharge, grandTotal } =
    computeSessionCharges(table, session, settings, Date.now());
  const hours = Math.floor(durationMinutes / 60);
  const mins = durationMinutes % 60;

  const modeLabel =
    session.mode === "time"
      ? t("dashboard.mode_time")
      : session.mode === "amount"
        ? t("dashboard.mode_amount")
        : t("dashboard.mode_unlimited");

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div
        className="modal modal-lg end-session-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <ModalCloseX onClose={onCancel} title={t("common.back")} />
        <h2 className="modal-title">
          <Square size={20} className="text-red-400" />
          {t("dashboard.end_title", { name: table.name })}
        </h2>
        <div className="modal-body">
          <div className="end-session-grid">
            <div className="end-session-item">
              <span className="end-session-label">{t("dashboard.mode")}</span>
              <span className="end-session-value">{modeLabel}</span>
            </div>
            <div className="end-session-item">
              <span className="end-session-label">
                {t("dashboard.playtime")}
              </span>
              <span className="end-session-value">
                {hours > 0 ? `${hours}ч ` : ""}
                {mins}мин
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
              <h4 className="end-session-orders-title">
                Заказы бара · {session.barOrders.length}
              </h4>
              {session.barOrders.map((item) => (
                <div key={item.id} className="end-session-order-item">
                  <span>
                    {item.menuItemName} × {item.quantity}
                  </span>
                  <span className="end-session-order-right">
                    <span>
                      {(item.price * item.quantity).toLocaleString()}{" "}
                      {settings.currency}
                    </span>
                    <button
                      type="button"
                      className="order-cancel-btn"
                      title={t("cancel.cancel_position")}
                      onClick={() => handleCancelBarItem(item)}
                      disabled={busy}
                    >
                      <X size={14} />
                    </button>
                  </span>
                </div>
              ))}
            </div>
          )}

          {serviceCharge > 0 && (
            <div className="end-session-grid" style={{ marginTop: 4 }}>
              <div className="end-session-item">
                <span className="end-session-label">Сумма</span>
                <span className="end-session-value">
                  {(tableCost + barCost).toLocaleString()} {settings.currency}
                </span>
              </div>
              <div className="end-session-item">
                <span className="end-session-label">
                  Обслуживание ({settings.serviceChargePercent}%)
                </span>
                <span className="end-session-value text-amber-400">
                  +{serviceCharge.toLocaleString()} {settings.currency}
                </span>
              </div>
            </div>
          )}

          {/* Способ оплаты — над итогом к оплате */}
          <PaymentBreakdownPicker
            total={grandTotal}
            currency={settings.currency}
            busy={busy}
            onChange={(details, valid) => {
              setPayment(details);
              setIsPaymentValid(valid);
            }}
          />

          <div className="end-session-total">
            <span>ИТОГО К ОПЛАТЕ</span>
            <span>
              {grandTotal.toLocaleString()} {settings.currency}
            </span>
          </div>

          <div
            style={{
              textAlign: "center",
              marginTop: 12,
              padding: "8px 0",
              borderTop: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <p style={{ fontSize: 11, color: "#f59e0b", fontWeight: 600 }}>
              Фискальный документ НЕ сформирован
            </p>
            <p style={{ fontSize: 10, color: "#64748b", marginTop: 2 }}>
              Для получения фискального документа используйте ККМ
            </p>
          </div>
        </div>
        <div className="modal-actions end-session-actions">
          <button onClick={onCancel} className="btn btn-ghost" disabled={busy}>
            {t("common.back")}
          </button>
          {!autoPrintEnabled && (
            <button
              onClick={() => onConfirm(true, payment)}
              className="btn btn-primary"
              disabled={busy || !isPaymentValid}
            >
              <Printer size={16} />
              {t("dashboard.end_print")}
            </button>
          )}
          <button
            onClick={() => onConfirm(false, payment)}
            className="btn btn-danger"
            disabled={busy || !isPaymentValid}
          >
            <Square size={16} />
            {t("dashboard.end_close")}
          </button>
        </div>
      </div>
    </div>
  );
};

const WalkInCloseModal: React.FC<{
  order: BarOrder;
  onConfirm: (shouldPrint?: boolean, payment?: PaymentDetails) => void;
  onCancel: () => void;
  onCancelItem: (item: BarOrderItem) => void;
  busy?: boolean;
}> = ({ order, onConfirm, onCancel, onCancelItem, busy }) => {
  const settings = useStore((s) => s.settings);
  const { t } = useT();
  const [payment, setPayment] = useState<PaymentDetails>({
    paymentMethod: "cash",
  });
  const [isPaymentValid, setIsPaymentValid] = useState(true);

  useModalKeyboard({
    onEscape: onCancel,
    onEnter: () => {
      if (!busy && isPaymentValid) onConfirm(false, payment);
    },
  });

  const serviceCharge = settings.serviceChargeEnabled
    ? Math.round((order.totalCost * settings.serviceChargePercent) / 100)
    : 0;
  const grandTotal = order.totalCost + serviceCharge;

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div
        className="modal modal-lg end-session-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <ModalCloseX onClose={onCancel} title={t("common.back")} />
        <h2 className="modal-title">
          <Square size={20} className="text-red-400" />
          {t("dashboard.walkin_close_title", {
            name: order.label || t("bar.no_table"),
          })}
        </h2>
        <div className="modal-body">
          <div className="end-session-grid">
            <div className="end-session-item">
              <span className="end-session-label">{t("dashboard.mode")}</span>
              <span className="end-session-value">
                {t("dashboard.walkin_active")}
              </span>
            </div>
            <div className="end-session-item">
              <span className="end-session-label">
                {t("dashboard.walkin_total_items")}
              </span>
              <span className="end-session-value">
                {order.items.reduce((sum, item) => sum + item.quantity, 0)}
              </span>
            </div>
            <div className="end-session-item">
              <span className="end-session-label">
                {t("dashboard.bar_cost")}
              </span>
              <span className="end-session-value text-amber-400">
                {order.totalCost.toLocaleString()} {settings.currency}
              </span>
            </div>
            <div className="end-session-item">
              <span className="end-session-label">
                {t("dashboard.walkin_updated_at")}
              </span>
              <span className="end-session-value">
                {new Date(order.timestamp).toLocaleTimeString(
                  settings.language,
                  {
                    hour: "2-digit",
                    minute: "2-digit",
                  },
                )}
              </span>
            </div>
          </div>

          <div className="end-session-orders">
            <h4 className="end-session-orders-title">
              {t("dashboard.walkin_positions_title")} · {order.items.length}
            </h4>
            {order.items.map((item) => (
              <div key={item.id} className="end-session-order-item">
                <span>
                  {item.menuItemName} × {item.quantity}
                </span>
                <span className="end-session-order-right">
                  <span>
                    {(item.price * item.quantity).toLocaleString()}{" "}
                    {settings.currency}
                  </span>
                  <button
                    type="button"
                    className="order-cancel-btn"
                    title={t("cancel.cancel_position")}
                    onClick={() => onCancelItem(item)}
                    disabled={busy}
                  >
                    <X size={14} />
                  </button>
                </span>
              </div>
            ))}
          </div>

          {serviceCharge > 0 && (
            <div className="end-session-grid" style={{ marginTop: 4 }}>
              <div className="end-session-item">
                <span className="end-session-label">Сумма</span>
                <span className="end-session-value">
                  {order.totalCost.toLocaleString()} {settings.currency}
                </span>
              </div>
              <div className="end-session-item">
                <span className="end-session-label">
                  Обслуживание ({settings.serviceChargePercent}%)
                </span>
                <span className="end-session-value text-amber-400">
                  +{serviceCharge.toLocaleString()} {settings.currency}
                </span>
              </div>
            </div>
          )}

          <PaymentBreakdownPicker
            total={grandTotal}
            currency={settings.currency}
            busy={busy}
            onChange={(details, valid) => {
              setPayment(details);
              setIsPaymentValid(valid);
            }}
          />

          <div className="end-session-total">
            <span>ИТОГО К ОПЛАТЕ</span>
            <span>
              {grandTotal.toLocaleString()} {settings.currency}
            </span>
          </div>
        </div>
        <div className="modal-actions end-session-actions">
          <button onClick={onCancel} className="btn btn-ghost" disabled={busy}>
            {t("common.back")}
          </button>
          <button
            onClick={() => onConfirm(true, payment)}
            className="btn btn-primary"
            disabled={busy || !isPaymentValid}
          >
            <Printer size={16} />
            {t("dashboard.end_print")}
          </button>
          <button
            onClick={() => onConfirm(false, payment)}
            className="btn btn-danger"
            disabled={busy || !isPaymentValid}
          >
            <Square size={16} />
            {t("dashboard.end_close")}
          </button>
        </div>
      </div>
    </div>
  );
};

const WalkInItemsModal: React.FC<{
  order: BarOrder;
  currency: string;
  onCancel: () => void;
  onCancelItem: (item: BarOrderItem) => void;
}> = ({ order, currency, onCancel, onCancelItem }) => {
  const { t } = useT();

  useModalKeyboard({ onEscape: onCancel });

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
        <ModalCloseX onClose={onCancel} title={t("common.back")} />
        <h2 className="modal-title">
          <ReceiptText size={20} className="text-amber-400" />
          {t("dashboard.walkin_positions_title")} —{" "}
          {order.label || t("bar.no_table")}
        </h2>
        <div className="modal-body">
          {order.items.length > 0 ? (
            <div className="end-session-orders">
              <h4 className="end-session-orders-title">
                {t("dashboard.walkin_positions_title")} · {order.items.length}
              </h4>
              {order.items.map((item) => (
                <div key={item.id} className="end-session-order-item">
                  <span>
                    {item.menuItemName} × {item.quantity}
                  </span>
                  <span className="end-session-order-right">
                    <span>
                      {(item.price * item.quantity).toLocaleString()} {currency}
                    </span>
                    <button
                      type="button"
                      className="order-cancel-btn"
                      title={t("cancel.cancel_position")}
                      onClick={() => onCancelItem(item)}
                    >
                      <X size={14} />
                    </button>
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="confirm-modal-message">{t("cancel.void_empty")}</p>
          )}
        </div>
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onCancel}>
            {t("common.close")}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
