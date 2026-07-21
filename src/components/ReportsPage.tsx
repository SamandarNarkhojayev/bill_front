import React, { useState, useMemo } from "react";
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
  Banknote,
  CreditCard,
  Smartphone,
  Percent,
  Ban,
  X,
  ShieldAlert,
} from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { useStore } from "../store/useStore";
import { useT } from "../i18n";
import { printReceipt, printReportReceipt } from "../utils/receipt";
import {
  formatPaymentSummary,
  PAYMENT_METHODS,
  normalizePaymentBreakdown,
} from "../utils/payment";
import { requestCancelAuth } from "./cancelAuthController";
import ModalCloseX from "./ModalCloseX";
import type { SessionRecord, BarOrderItem } from "../types";

// Утилита: дата в строку YYYY-MM-DD (локальное время)
const dateToStr = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

// Утилита: строка → локальный Date
const strToDate = (s: string) => {
  if (!s || typeof s !== "string" || !s.includes("-")) return new Date();
  const [y, m, d] = s.split("-").map(Number);
  const parsed = new Date(y, m - 1, d);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
};

const safeNumber = (value: unknown, fallback = 0): number => {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
};

const safeDate = (value: unknown): Date | null => {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

const formatMoney = (value: unknown, currency: string): string => {
  // Локаль 'ru-RU' зафиксирована, чтобы разделитель разрядов на экране совпадал
  // с чеком (receipt.ts тоже печатает в ru-RU). Раньше бралась системная локаль.
  return `${safeNumber(value).toLocaleString("ru-RU")} ${currency}`;
};

const ReportsPage: React.FC = () => {
  const {
    sessionHistory,
    settings,
    currentShift,
    shiftHistory,
    addToast,
    voidHistoryItem,
    cancelLog,
  } = useStore(
    useShallow((s) => ({
      sessionHistory: s.sessionHistory,
      settings: s.settings,
      currentShift: s.currentShift,
      shiftHistory: s.shiftHistory,
      addToast: s.addToast,
      voidHistoryItem: s.voidHistoryItem,
      cancelLog: s.cancelLog,
    })),
  );
  const { t } = useT();
  // Открытая запись для отмены позиций (id записи истории).
  const [voidSessionId, setVoidSessionId] = useState<string | null>(null);
  const [showCancelLog, setShowCancelLog] = useState(false);
  const isSafeWebViewMode = useMemo(() => {
    if (typeof window === "undefined") return false;
    try {
      const ua = navigator.userAgent.toLowerCase();
      const embedded = window.self !== window.top;
      return embedded || ua.includes("vscode") || ua.includes("webview");
    } catch {
      return true;
    }
  }, []);
  const [selectedDate, setSelectedDate] = useState(dateToStr(new Date()));
  const [viewMode, setViewMode] = useState<
    "day" | "week" | "range" | "all" | "shift"
  >("day");
  const [selectedShiftId, setSelectedShiftId] = useState<string | null>(null);
  const [rangeStart, setRangeStart] = useState(dateToStr(new Date()));
  const [rangeEnd, setRangeEnd] = useState(dateToStr(new Date()));
  const [showHistoryFilters, setShowHistoryFilters] = useState(false);
  const [historyTableFilter, setHistoryTableFilter] = useState<"all" | string>(
    "all",
  );
  const [historyModeFilter, setHistoryModeFilter] = useState<
    "all" | "tariff" | "time" | "infinite"
  >("all");
  const [historyAmountSort, setHistoryAmountSort] = useState<
    "default" | "max" | "min"
  >("default");
  const [historyTimeSort, setHistoryTimeSort] = useState<
    "default" | "max" | "min"
  >("default");

  // Активная смена или выбранная из истории
  const activeShift = useMemo(() => {
    if (viewMode !== "shift") return null;
    if (selectedShiftId) {
      return shiftHistory.find((s) => s.id === selectedShiftId) || currentShift;
    }
    return currentShift;
  }, [viewMode, selectedShiftId, currentShift, shiftHistory]);

  // Фильтрация по дате
  const filteredSessions = useMemo(() => {
    const normalized = sessionHistory.filter((s) => {
      if (!s || typeof s !== "object") return false;
      const startOk =
        typeof s.startTime === "number" && Number.isFinite(s.startTime);
      const dateOk = typeof s.date === "string" && s.date.length >= 8;
      return startOk && dateOk;
    });

    if (viewMode === "all") return normalized;
    if (viewMode === "shift") {
      const shift = activeShift;
      if (!shift) return [];
      const start = shift.startTime;
      const end = shift.endTime || Date.now();
      return normalized.filter(
        (s) => s.startTime >= start && s.startTime <= end,
      );
    }
    if (viewMode === "day") {
      return normalized.filter((s) => s.date === selectedDate);
    }
    if (viewMode === "range") {
      return normalized.filter(
        (s) => s.date >= rangeStart && s.date <= rangeEnd,
      );
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
  }, [
    sessionHistory,
    selectedDate,
    viewMode,
    rangeStart,
    rangeEnd,
    activeShift,
  ]);

  // Журнал отмён за тот же период, что и сессии.
  const filteredCancelLog = useMemo(() => {
    const list = (cancelLog || []).filter(Boolean);
    if (viewMode === "all") return list;
    if (viewMode === "shift") {
      const shift = activeShift;
      if (!shift) return [];
      const start = shift.startTime;
      const end = shift.endTime || Date.now();
      return list.filter((e) => e.timestamp >= start && e.timestamp <= end);
    }
    if (viewMode === "day") return list.filter((e) => e.date === selectedDate);
    if (viewMode === "range")
      return list.filter((e) => e.date >= rangeStart && e.date <= rangeEnd);
    // week
    const sel = strToDate(selectedDate);
    const day = sel.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    const monday = new Date(sel);
    monday.setDate(sel.getDate() + mondayOffset);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const wStart = dateToStr(monday);
    const wEnd = dateToStr(sunday);
    return list.filter((e) => e.date >= wStart && e.date <= wEnd);
  }, [cancelLog, viewMode, selectedDate, rangeStart, rangeEnd, activeShift]);

  // Позицию из закрытой записи можно отменить только в текущей смене/дне
  // (совпадает с гейтом в voidHistoryItem) и только если в записи есть бар-позиции.
  const todayStr = dateToStr(new Date());
  const canVoidRecord = (s: SessionRecord): boolean => {
    if (!s.barOrders || s.barOrders.length === 0) return false;
    if (currentShift) return s.startTime >= currentShift.startTime;
    return s.date === todayStr;
  };

  const handleVoidItem = async (record: SessionRecord, item: BarOrderItem) => {
    const auth = await requestCancelAuth({
      itemLabel: `${item.menuItemName} × ${item.quantity} — ${formatMoney(
        item.price * item.quantity,
        settings.currency,
      )}`,
    });
    if (auth) voidHistoryItem(record.id, item.id, auth);
  };

  // Живая запись открытого диалога отмены (следит за стором после каждой отмены).
  const voidRecord = voidSessionId
    ? (sessionHistory.find((r) => r.id === voidSessionId) ?? null)
    : null;

  // Статистика
  const stats = useMemo(() => {
    const tableRev = filteredSessions.reduce(
      (sum, s) => sum + safeNumber(s.tableCost),
      0,
    );
    const barRev = filteredSessions.reduce(
      (sum, s) => sum + safeNumber(s.barCost),
      0,
    );
    const totalRev = tableRev + barRev;
    const serviceRev = filteredSessions.reduce(
      (sum, s) => sum + safeNumber(s.serviceCharge),
      0,
    );
    const totalHours =
      filteredSessions.reduce((sum, s) => sum + safeNumber(s.duration), 0) / 60;
    const avgSession =
      filteredSessions.length > 0
        ? Math.round(
            filteredSessions.reduce(
              (sum, s) => sum + safeNumber(s.duration),
              0,
            ) / filteredSessions.length,
          )
        : 0;
    const avgCheck =
      filteredSessions.length > 0
        ? Math.round(totalRev / filteredSessions.length)
        : 0;

    // По столам
    const byTable: Record<
      string,
      { sessions: number; revenue: number; hours: number }
    > = {};
    filteredSessions.forEach((s) => {
      if (!byTable[s.tableName])
        byTable[s.tableName] = { sessions: 0, revenue: 0, hours: 0 };
      byTable[s.tableName].sessions++;
      byTable[s.tableName].revenue += safeNumber(
        s.totalCost,
        safeNumber(s.tableCost) + safeNumber(s.barCost),
      );
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

    // По способу оплаты (старые записи без метода считаем наличными)
    const byPayment = { cash: 0, card: 0, transfer: 0 };
    filteredSessions.forEach((s) => {
      const breakdown = normalizePaymentBreakdown(s.paymentBreakdown);
      if (breakdown) {
        PAYMENT_METHODS.forEach((method) => {
          byPayment[method] += safeNumber(breakdown[method]);
        });
        return;
      }
      const amount =
        safeNumber(
          s.totalCost,
          safeNumber(s.tableCost) + safeNumber(s.barCost),
        ) + safeNumber(s.serviceCharge);
      const method = s.paymentMethod ?? "cash";
      byPayment[method] += amount;
    });

    // Сумма фактических оплат (нал+карта+перевод). Она включает обслуживание,
    // поэтому равна выручке + сервисный сбор. Нужна для сверки с кассой.
    const paymentsTotal = byPayment.cash + byPayment.card + byPayment.transfer;

    return {
      tableRev,
      barRev,
      totalRev,
      serviceRev,
      totalHours,
      avgSession,
      avgCheck,
      byTable,
      byHour,
      byPayment,
      paymentsTotal,
      count: filteredSessions.length,
    };
  }, [filteredSessions]);

  const historyTableNames = useMemo(() => {
    return Array.from(new Set(filteredSessions.map((s) => s.tableName))).sort(
      (a, b) => a.localeCompare(b, "ru"),
    );
  }, [filteredSessions]);

  const historySessions = useMemo(() => {
    let list = filteredSessions.slice();

    if (historyTableFilter !== "all") {
      list = list.filter((s) => s.tableName === historyTableFilter);
    }

    if (historyModeFilter === "tariff") {
      list = list.filter((s) => Boolean(s.tariffName && s.tariffName.trim()));
    }
    if (historyModeFilter === "time") {
      list = list.filter((s) => s.mode === "time" && !s.tariffName);
    }
    if (historyModeFilter === "infinite") {
      list = list.filter((s) => s.mode === "unlimited" && !s.tariffName);
    }

    if (historyAmountSort === "max") {
      list.sort((a, b) => safeNumber(a.totalCost) - safeNumber(b.totalCost));
    }
    if (historyAmountSort === "min") {
      list.sort((a, b) => safeNumber(b.totalCost) - safeNumber(a.totalCost));
    }

    if (historyTimeSort === "max") {
      list.sort((a, b) => safeNumber(a.duration) - safeNumber(b.duration));
    }
    if (historyTimeSort === "min") {
      list.sort((a, b) => safeNumber(b.duration) - safeNumber(a.duration));
    }

    return list;
  }, [
    filteredSessions,
    historyTableFilter,
    historyModeFilter,
    historyAmountSort,
    historyTimeSort,
  ]);

  // Реверс мемоизируем: historySessions может быть тысячи записей — не аллоцируем
  // перевёрнутую копию на каждый рендер, только при смене самого списка/фильтров.
  const reversedHistory = useMemo(
    () => historySessions.slice().reverse(),
    [historySessions],
  );

  const resetHistoryFilters = () => {
    setHistoryTableFilter("all");
    setHistoryModeFilter("all");
    setHistoryAmountSort("default");
    setHistoryTimeSort("default");
  };

  const maxByHour = useMemo(() => Math.max(...stats.byHour, 1), [stats.byHour]);

  // Экспорт отчёта в CSV
  const exportReport = () => {
    const modeLabel = (m: string, tariffName?: string | null) => {
      if (tariffName && tariffName.trim())
        return t("reports.modeTariff", { name: tariffName });
      if (m === "time") return t("reports.modeTime");
      if (m === "amount") return t("reports.modeAmount");
      return t("reports.modeUnlimited");
    };
    const paymentLabel = (m: "cash" | "card" | "transfer") => t(`payment.${m}`);
    const header =
      t("reports.csvTable") +
      ";" +
      t("reports.csvMode") +
      ";" +
      t("reports.csvStart") +
      ";" +
      t("reports.csvEnd") +
      ";" +
      t("reports.csvDurationMin") +
      ";" +
      t("reports.csvTableCost") +
      " (" +
      settings.currency +
      ");" +
      t("reports.csvBar") +
      " (" +
      settings.currency +
      ");" +
      t("reports.csvTotal") +
      " (" +
      settings.currency +
      ");Оплата";
    const rows = filteredSessions
      .slice()
      .reverse()
      .map((s) => {
        const start = new Date(s.startTime).toLocaleString("ru-RU");
        const end = new Date(s.endTime).toLocaleString("ru-RU");
        return `${s.tableName};${modeLabel(s.mode, s.tariffName)};${start};${end};${s.duration};${s.tableCost};${s.barCost};${s.totalCost};${formatPaymentSummary(s, paymentLabel, settings.currency)}`;
      });

    // Итоги
    rows.push("");
    rows.push(`${t("reports.csvTotalGames")}:;${stats.count}`);
    rows.push(`${t("reports.csvRevenueTables")}:;${stats.tableRev}`);
    rows.push(`${t("reports.csvRevenueBar")}:;${stats.barRev}`);
    rows.push(`${t("reports.csvRevenueTotal")}:;${stats.totalRev}`);
    if (stats.serviceRev > 0)
      rows.push(`${t("reports.statService")}:;${stats.serviceRev}`);

    const csv = "\uFEFF" + header + "\n" + rows.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const now = new Date();
    const ts =
      dateToStr(now) +
      "_" +
      now
        .toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })
        .replace(":", "-");
    a.href = url;
    a.download = `${t("reports.fileNameReport")}_${viewMode}_${ts}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const changeDate = (delta: number) => {
    const d = strToDate(selectedDate);
    if (viewMode === "week") {
      d.setDate(d.getDate() + delta * 7);
    } else {
      d.setDate(d.getDate() + delta);
    }
    setSelectedDate(dateToStr(d));
  };

  const formatDate = (dateStr: string) => {
    return strToDate(dateStr).toLocaleDateString("ru-RU", {
      weekday: "short",
      day: "numeric",
      month: "long",
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
    const fmt = (d: Date) =>
      d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
    return `${fmt(monday)} — ${fmt(sunday)}`;
  };

  const formatTime = (timestamp: number) => {
    const d = safeDate(timestamp);
    if (!d) return "—";
    return d.toLocaleTimeString("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getPeriodLabel = () => {
    if (viewMode === "day") return formatDate(selectedDate);
    if (viewMode === "week") return formatWeekRange();
    if (viewMode === "range")
      return `${formatDate(rangeStart)} — ${formatDate(rangeEnd)}`;
    if (viewMode === "all") return t("reports.allTime");
    if (viewMode === "shift") {
      if (!activeShift) return t("reports.shiftNotSelected");
      const start = new Date(activeShift.startTime).toLocaleString("ru-RU");
      const end = activeShift.endTime
        ? new Date(activeShift.endTime).toLocaleString("ru-RU")
        : t("reports.untilNow");
      return t("reports.shiftLabel", {
        name: activeShift.userName,
        start,
        end,
      });
    }
    return t("reports.period");
  };

  const handlePrintSession = async (
    session: (typeof filteredSessions)[number],
  ) => {
    try {
      const detailedBarOrders =
        session.barOrders && session.barOrders.length > 0
          ? session.barOrders
          : session.barCost > 0
            ? [
                {
                  id: `hist-${session.id}`,
                  menuItemId: "history-bar",
                  menuItemName: t("reports.bar"),
                  quantity: 1,
                  price: session.barCost,
                  timestamp: session.endTime,
                },
              ]
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
        deviceName: settings.receiptPrinterName,
      });

      if (!ok) addToast("error", t("reports.printPrecheckFailed"));
    } catch (error) {
      console.error("Print from history failed:", error);
      addToast("error", t("reports.printPrecheckError"));
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
      totalService: stats.serviceRev,
      totalCount: stats.count,
      receiptWidthMm: settings.receiptWidthMm,
      receiptFontSize: settings.receiptFontSize,
      receiptPaddingMm: settings.receiptPaddingMm,
      silentPrint: settings.silentPrint,
      deviceName: settings.receiptPrinterName,
    });

    if (!ok) addToast("error", t("reports.printReportFailed"));
  };

  return (
    <div className="page-content">
      <div className="page-header">
        <div className="page-header-left">
          <BarChart3 size={28} className="text-violet-400" />
          <h2 className="page-title">{t("reports.title")}</h2>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <div className="page-tabs">
            <button
              onClick={() => setViewMode("day")}
              className={`page-tab ${viewMode === "day" ? "active" : ""}`}
            >
              {t("reports.tabDay")}
            </button>
            <button
              onClick={() => {
                setViewMode("shift");
                setSelectedShiftId(null);
              }}
              className={`page-tab ${viewMode === "shift" ? "active" : ""}`}
            >
              <Briefcase size={14} /> {t("reports.tabShift")}
            </button>
            <button
              onClick={() => setViewMode("week")}
              className={`page-tab ${viewMode === "week" ? "active" : ""}`}
            >
              {t("reports.tabWeek")}
            </button>
            <button
              onClick={() => setViewMode("range")}
              className={`page-tab ${viewMode === "range" ? "active" : ""}`}
            >
              <Filter size={14} /> {t("reports.tabRange")}
            </button>
            <button
              onClick={() => setViewMode("all")}
              className={`page-tab ${viewMode === "all" ? "active" : ""}`}
            >
              {t("reports.tabAll")}
            </button>
          </div>
          {filteredSessions.length > 0 && !isSafeWebViewMode && (
            <>
              <button
                onClick={() => exportReport()}
                className="btn btn-ghost btn-sm"
                style={{ display: "flex", alignItems: "center", gap: 6 }}
              >
                <Download size={14} /> {t("reports.export")}
              </button>
              <button
                onClick={() => handlePrintReport()}
                className="btn btn-primary btn-sm"
                style={{ display: "flex", alignItems: "center", gap: 6 }}
              >
                <Printer size={14} /> {t("reports.printReport")}
              </button>
            </>
          )}
        </div>
      </div>

      {isSafeWebViewMode && (
        <div className="date-nav" style={{ marginBottom: 12 }}>
          <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            {t("reports.lightModeNotice")}
          </span>
        </div>
      )}

      {/* Выбор смены */}
      {viewMode === "shift" && (
        <div className="shift-selector">
          <div
            onClick={() => setSelectedShiftId(null)}
            className={`shift-item ${!selectedShiftId && currentShift ? "active" : ""}`}
          >
            <div className="shift-item-icon">
              <Briefcase size={16} />
            </div>
            <div className="shift-item-content">
              <div className="shift-item-title">
                {currentShift?.isActive
                  ? t("reports.currentShift")
                  : t("reports.noActiveShift")}
              </div>
              {currentShift?.isActive && (
                <div className="shift-item-details">
                  {t("reports.start")}:{" "}
                  {new Date(currentShift.startTime).toLocaleTimeString(
                    "ru-RU",
                    { hour: "2-digit", minute: "2-digit" },
                  )}
                </div>
              )}
            </div>
          </div>
          {shiftHistory.slice(0, 10).map((shift) => {
            const start = new Date(shift.startTime);
            const end = shift.endTime ? new Date(shift.endTime) : null;
            const duration = end
              ? Math.floor((end.getTime() - start.getTime()) / (1000 * 60))
              : null; // в минутах
            return (
              <div
                key={shift.id}
                onClick={() => setSelectedShiftId(shift.id)}
                className={`shift-item ${selectedShiftId === shift.id ? "active" : ""}`}
              >
                <div className="shift-item-icon">
                  <Briefcase size={16} />
                </div>
                <div className="shift-item-content">
                  <div className="shift-item-title">
                    {start.toLocaleDateString("ru-RU", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "2-digit",
                    })}
                  </div>
                  <div className="shift-item-details">
                    {start.toLocaleTimeString("ru-RU", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    {end
                      ? ` — ${end.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`
                      : ` (${t("reports.active")})`}
                    {duration && ` (${duration} ${t("reports.min")})`}
                  </div>
                  <div className="shift-item-user">{shift.userName}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Переключение даты */}
      {(viewMode === "day" || viewMode === "week") && (
        <div className="date-nav">
          <button onClick={() => changeDate(-1)} className="date-nav-btn">
            <ChevronLeft size={20} />
          </button>
          <div className="date-nav-current">
            <Calendar size={16} />
            <span>
              {viewMode === "week"
                ? formatWeekRange()
                : formatDate(selectedDate)}
            </span>
          </div>
          <button onClick={() => changeDate(1)} className="date-nav-btn">
            <ChevronRight size={20} />
          </button>
          <button
            onClick={() => setSelectedDate(dateToStr(new Date()))}
            className="btn btn-ghost btn-sm"
          >
            {t("reports.today")}
          </button>
        </div>
      )}

      {/* Диапазон дат */}
      {viewMode === "range" && (
        <div className="date-nav" style={{ gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <label style={{ fontSize: 13, opacity: 0.7 }}>
              {t("reports.rangeFrom")}
            </label>
            <input
              type="date"
              value={rangeStart}
              onChange={(e) => setRangeStart(e.target.value)}
              className="form-input"
              style={{ width: 160 }}
            />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <label style={{ fontSize: 13, opacity: 0.7 }}>
              {t("reports.rangeTo")}
            </label>
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
            {t("reports.last7Days")}
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
            {t("reports.last30Days")}
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
            <p className="report-stat-label">{t("reports.statTotalRevenue")}</p>
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
            <p className="report-stat-label">{t("reports.statTables")}</p>
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
            <p className="report-stat-label">{t("reports.statBar")}</p>
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
            <p className="report-stat-label">{t("reports.statGames")}</p>
            <p className="report-stat-value">{stats.count}</p>
          </div>
        </div>
        <div className="report-stat-card violet">
          <div className="report-stat-icon">
            <TrendingUp size={24} />
          </div>
          <div>
            <p className="report-stat-label">{t("reports.statAvgCheck")}</p>
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
            <p className="report-stat-label">{t("reports.statAvgTime")}</p>
            <p className="report-stat-value">
              {stats.avgSession} {t("reports.min")}
            </p>
          </div>
        </div>
        {stats.serviceRev > 0 && (
          <div className="report-stat-card violet">
            <div className="report-stat-icon">
              <Percent size={24} />
            </div>
            <div>
              <p className="report-stat-label">{t("reports.statService")}</p>
              <p className="report-stat-value">
                {formatMoney(stats.serviceRev, settings.currency)}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Разбивка по способу оплаты */}
      <div className="report-payment-breakdown">
        <div className="report-payment-item cash">
          <Banknote size={18} />
          <div>
            <span className="report-payment-label">{t("payment.cash")}</span>
            <span className="report-payment-value">
              {formatMoney(stats.byPayment.cash, settings.currency)}
            </span>
          </div>
        </div>
        <div className="report-payment-item card">
          <CreditCard size={18} />
          <div>
            <span className="report-payment-label">{t("payment.card")}</span>
            <span className="report-payment-value">
              {formatMoney(stats.byPayment.card, settings.currency)}
            </span>
          </div>
        </div>
        <div className="report-payment-item transfer">
          <Smartphone size={18} />
          <div>
            <span className="report-payment-label">
              {t("payment.transfer")}
            </span>
            <span className="report-payment-value">
              {formatMoney(stats.byPayment.transfer, settings.currency)}
            </span>
          </div>
        </div>
        {/* Итог оплат — с ним владелец сверяет кассу. Он включает обслуживание,
            поэтому = «Выручка (стол+бар)» + «Обслуживание». Раньше строки не было
            и касса не сходилась с «Общей выручкой» ровно на сервисный сбор. */}
        <div className="report-payment-item report-payments-total">
          <div>
            <span className="report-payment-label">
              {t("reports.paymentsTotal")}
            </span>
            <span className="report-payment-value">
              {formatMoney(stats.paymentsTotal, settings.currency)}
            </span>
          </div>
        </div>
      </div>

      {/* Графики */}
      {!isSafeWebViewMode && (
        <div className="report-charts">
          {/* По столам */}
          <div className="report-chart-card">
            <h3 className="report-chart-title">
              {t("reports.chartRevenueByTable")}
            </h3>
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
                <p className="text-slate-500 text-sm text-center py-4">
                  {t("reports.noData")}
                </p>
              )}
            </div>
          </div>

          {/* По часам */}
          <div className="report-chart-card">
            <h3 className="report-chart-title">
              {t("reports.chartLoadByHour")}
            </h3>
            <div className="report-hours-chart">
              {stats.byHour.map((count, hour) => (
                <div key={hour} className="report-hour-bar">
                  <div
                    className="report-hour-fill"
                    style={{ height: `${(count / maxByHour) * 100}%` }}
                  />
                  <span className="report-hour-label">
                    {hour % 3 === 0 ? `${hour}` : ""}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Таблица сессий */}
      <div className="report-table-card">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 12,
            flexWrap: "wrap",
          }}
        >
          <h3 className="report-chart-title" style={{ marginBottom: 0 }}>
            {t("reports.historyTitle")}
          </h3>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            <button
              onClick={() => setShowHistoryFilters((prev) => !prev)}
              className="btn btn-ghost btn-sm"
              title={t("reports.historyFiltersTitle")}
            >
              <Filter size={14} />
              {t("reports.filter")}
            </button>
            {(historyTableFilter !== "all" ||
              historyModeFilter !== "all" ||
              historyAmountSort !== "default" ||
              historyTimeSort !== "default") && (
              <button
                onClick={resetHistoryFilters}
                className="btn btn-ghost btn-sm"
                title={t("reports.resetFilters")}
              >
                {t("reports.resetFilters")}
              </button>
            )}
          </div>
        </div>

        {showHistoryFilters && (
          <div
            className="date-nav"
            style={{ gap: 8, marginBottom: 12, flexWrap: "wrap" }}
          >
            <select
              className="form-input"
              value={historyTableFilter}
              onChange={(e) => setHistoryTableFilter(e.target.value)}
              style={{ width: 180 }}
            >
              <option value="all">{t("reports.allTables")}</option>
              {historyTableNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>

            <select
              className="form-input"
              value={historyAmountSort}
              onChange={(e) => {
                const v = e.target.value as "default" | "max" | "min";
                setHistoryAmountSort(v);
                // Сортировки взаимоисключающие: раньше три list.sort шли подряд и
                // перетирали друг друга — работала только последняя. Теперь выбор
                // одной сбрасывает другую, и порядок соответствует подписи.
                if (v !== "default") setHistoryTimeSort("default");
              }}
              style={{ width: 220 }}
            >
              <option value="default">{t("reports.amountDefault")}</option>
              <option value="max">{t("reports.amountMax")}</option>
              <option value="min">{t("reports.amountMin")}</option>
            </select>

            <select
              className="form-input"
              value={historyTimeSort}
              onChange={(e) => {
                const v = e.target.value as "default" | "max" | "min";
                setHistoryTimeSort(v);
                if (v !== "default") setHistoryAmountSort("default");
              }}
              style={{ width: 220 }}
            >
              <option value="default">{t("reports.timeDefault")}</option>
              <option value="max">{t("reports.timeMax")}</option>
              <option value="min">{t("reports.timeMin")}</option>
            </select>

            <button
              onClick={() => setHistoryModeFilter("tariff")}
              className={`btn btn-sm ${historyModeFilter === "tariff" ? "btn-primary" : "btn-ghost"}`}
            >
              {t("reports.filterTariff")}
            </button>
            <button
              onClick={() => setHistoryModeFilter("time")}
              className={`btn btn-sm ${historyModeFilter === "time" ? "btn-primary" : "btn-ghost"}`}
            >
              {t("reports.filterTime")}
            </button>
            <button
              onClick={() => setHistoryModeFilter("infinite")}
              className={`btn btn-sm ${historyModeFilter === "infinite" ? "btn-primary" : "btn-ghost"}`}
            >
              {t("reports.filterInfinite")}
            </button>
            <button
              onClick={() => setHistoryModeFilter("all")}
              className={`btn btn-sm ${historyModeFilter === "all" ? "btn-primary" : "btn-ghost"}`}
            >
              {t("reports.filterAllModes")}
            </button>
          </div>
        )}

        {historySessions.length === 0 ? (
          <div className="report-empty">
            <BarChart3 size={48} className="text-slate-600" />
            <p>{t("reports.emptyFiltered")}</p>
          </div>
        ) : (
          <div className="report-table-wrapper">
            <table className="report-table">
              <thead>
                <tr>
                  <th>{t("reports.thTable")}</th>
                  <th>{t("reports.thMode")}</th>
                  <th>{t("reports.thStart")}</th>
                  <th>{t("reports.thEnd")}</th>
                  <th>{t("reports.thTime")}</th>
                  <th>{t("reports.thTableCost")}</th>
                  <th>{t("reports.thBar")}</th>
                  <th>{t("reports.thTotal")}</th>
                  <th>{t("reports.thPrecheck")}</th>
                </tr>
              </thead>
              <tbody>
                {reversedHistory.map((session) => (
                  <tr key={session.id}>
                    <td>{session.tableName}</td>
                    <td>
                      {session.tariffName && session.tariffName.trim()
                        ? t("reports.modeTariff", { name: session.tariffName })
                        : session.mode === "time"
                          ? t("reports.modeTime")
                          : session.mode === "amount"
                            ? t("reports.modeAmount")
                            : t("reports.modeUnlimited")}
                    </td>
                    <td>{formatTime(session.startTime)}</td>
                    <td>{formatTime(session.endTime)}</td>
                    <td>
                      {session.duration} {t("reports.min")}
                    </td>
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
                      <div className="report-row-actions">
                        <button
                          className="btn btn-ghost btn-sm report-print-btn"
                          onClick={() => handlePrintSession(session)}
                          title={t("reports.printPrecheckTitle")}
                        >
                          <Printer size={14} />
                          {t("reports.precheck")}
                        </button>
                        {canVoidRecord(session) && (
                          <button
                            className="btn btn-ghost btn-sm report-void-btn"
                            onClick={() => setVoidSessionId(session.id)}
                            title={t("cancel.void_title", {
                              name: session.tableName,
                            })}
                          >
                            <Ban size={14} />
                            {t("cancel.void_action")}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ===== Журнал отмён ===== */}
      {filteredCancelLog.length > 0 && (
        <div className="report-section cancel-log-section">
          <button
            type="button"
            className="cancel-log-header"
            onClick={() => setShowCancelLog((v) => !v)}
          >
            <span className="cancel-log-title">
              <ShieldAlert size={16} className="text-red-400" />
              {t("cancel.log_title")}
              <span className="cancel-log-count">
                {filteredCancelLog.length}
              </span>
              {/* Сумма отмен видна сразу, не раскрывая журнал — для контроля объёма. */}
              <span className="cancel-log-sum text-amber-400">
                −
                {formatMoney(
                  filteredCancelLog.reduce(
                    (s, e) => s + safeNumber(e.amount),
                    0,
                  ),
                  settings.currency,
                )}
              </span>
            </span>
            <span className="cancel-log-toggle">
              {showCancelLog ? t("cancel.log_hide") : t("cancel.log_show")}
            </span>
          </button>
          {showCancelLog && (
            <div className="report-table-wrapper">
              <table className="report-table">
                <thead>
                  <tr>
                    <th>{t("cancel.col_time")}</th>
                    <th>{t("cancel.col_item")}</th>
                    <th>{t("cancel.col_amount")}</th>
                    <th>{t("cancel.col_source")}</th>
                    <th>{t("cancel.col_reason")}</th>
                    <th>{t("cancel.col_by")}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCancelLog.map((e) => (
                    <tr key={e.id}>
                      <td>
                        {new Date(e.timestamp).toLocaleString("ru-RU", {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td>
                        {e.itemName} × {e.quantity}
                        {e.tableName ? ` · ${e.tableName}` : ""}
                      </td>
                      <td className="text-amber-400">
                        −{formatMoney(e.amount, settings.currency)}
                      </td>
                      <td>
                        {t(
                          `cancel.source_${e.source === "open-table" ? "open" : e.source === "open-walkin" ? "walkin" : e.source === "quick-sale" ? "quick" : "closed"}`,
                        )}
                      </td>
                      <td>{e.reason}</td>
                      <td>
                        {e.cancelledByName}
                        {e.authorizedByName &&
                        e.authorizedByName !== e.cancelledByName
                          ? ` (${e.authorizedByName})`
                          : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={2}>{t("reports.cancelsSum")}</td>
                    <td className="text-amber-400">
                      −
                      {formatMoney(
                        filteredCancelLog.reduce(
                          (s, e) => s + safeNumber(e.amount),
                          0,
                        ),
                        settings.currency,
                      )}
                    </td>
                    <td colSpan={3}></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ===== Модалка отмены позиций закрытой записи ===== */}
      {voidRecord && (
        <div className="modal-overlay" onClick={() => setVoidSessionId(null)}>
          <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
            <ModalCloseX onClose={() => setVoidSessionId(null)} />
            <h2 className="modal-title">
              <Ban size={20} className="text-red-400" />
              {t("cancel.void_title", { name: voidRecord.tableName })}
            </h2>
            <div className="modal-body">
              <p className="confirm-modal-message">{t("cancel.void_hint")}</p>
              {voidRecord.barOrders && voidRecord.barOrders.length > 0 ? (
                <div className="end-session-orders">
                  {voidRecord.barOrders.map((item) => (
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
                          onClick={() => handleVoidItem(voidRecord, item)}
                        >
                          <X size={14} />
                        </button>
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="confirm-modal-message">
                  {t("cancel.void_empty")}
                </p>
              )}
            </div>
            <div className="modal-actions">
              <button
                className="btn btn-ghost"
                onClick={() => setVoidSessionId(null)}
              >
                {t("common.close")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReportsPage;
