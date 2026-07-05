import type { StateCreator } from "zustand";
import type { AppStore } from "../types";
import type {
  CancelLogEntry,
  CancelSource,
  CancelAuthMeta,
  SessionRecord,
} from "../../types";
import { generateId, localDateStr } from "../helpers";
import { translate } from "../../i18n/translate";
import cloudSync from "../../utils/cloudSync";

// Запись истории доступна к отмене, только если она относится к текущей смене
// (если смена открыта) либо к сегодняшнему дню (если смены нет). Так нельзя
// задним числом править закрытые отчёты за прошлые дни.
function isRecordVoidable(
  record: SessionRecord,
  shiftStart: number | null,
): boolean {
  if (shiftStart != null) return record.startTime >= shiftStart;
  return record.date === localDateStr();
}

export const createCancelSlice: StateCreator<
  AppStore,
  [],
  [],
  Pick<
    AppStore,
    | "cancelLog"
    | "cancelOpenTableItem"
    | "cancelOpenWalkInItem"
    | "voidHistoryItem"
  >
> = (set, get) => {
  // Общая запись в журнал отмён: кто выполнял (текущий вошедший), кто подтвердил
  // (чей пароль подошёл), что и почему.
  const appendCancelLog = (data: {
    itemName: string;
    quantity: number;
    amount: number;
    source: CancelSource;
    tableId: number | null;
    tableName: string;
    recordId?: string;
    meta: CancelAuthMeta;
  }): void => {
    const currentUser = get().currentUser;
    const entry: CancelLogEntry = {
      id: generateId(),
      itemName: data.itemName,
      quantity: data.quantity,
      amount: data.amount,
      source: data.source,
      tableId: data.tableId,
      tableName: data.tableName,
      recordId: data.recordId,
      cancelledById: currentUser?.id ?? null,
      cancelledByName: currentUser?.displayName ?? "—",
      authorizedById: data.meta.authorizedById,
      authorizedByName: data.meta.authorizedByName,
      reason: data.meta.reason,
      timestamp: Date.now(),
      date: localDateStr(),
    };
    set((state) => ({ cancelLog: [entry, ...state.cancelLog] }));
  };

  return {
    cancelLog: [],

    cancelOpenTableItem: (tableId, orderItemId, meta) => {
      const table = get().tables.find((t) => t.id === tableId);
      const session = table?.currentSession;
      const item = session?.barOrders.find((o) => o.id === orderItemId);
      if (!table || !session || !item) return false;

      const amount = item.price * item.quantity;

      // Убираем позицию из живой сессии и пересчитываем бар-итог.
      set((state) => ({
        tables: state.tables.map((tb) => {
          if (tb.id !== tableId || !tb.currentSession) return tb;
          return {
            ...tb,
            currentSession: {
              ...tb.currentSession,
              barOrders: tb.currentSession.barOrders.filter(
                (o) => o.id !== orderItemId,
              ),
              totalBarCost: Math.max(
                0,
                tb.currentSession.totalBarCost - amount,
              ),
            },
          };
        }),
      }));

      // Возврат склада (updateStock не трогает безлимитные позиции со stock === -1).
      get().updateStock(item.menuItemId, item.quantity);

      appendCancelLog({
        itemName: item.menuItemName,
        quantity: item.quantity,
        amount,
        source: "open-table",
        tableId: table.id,
        tableName: table.name,
        meta,
      });

      // Облако: currentBarCost стола сервер пересчитывает из barOrders — пушим сразу.
      cloudSync.broadcastSync();
      get().addToast(
        "success",
        translate(get().settings.language, "cancel.done_toast", {
          name: item.menuItemName,
        }),
      );
      return true;
    },

    cancelOpenWalkInItem: (orderId, orderItemId, meta) => {
      const order = get().barOrders.find((o) => o.id === orderId && !o.isPaid);
      const item = order?.items.find((o) => o.id === orderItemId);
      if (!order || !item) return false;

      const amount = item.price * item.quantity;

      set((state) => ({
        barOrders: state.barOrders
          .map((current) => {
            if (current.id !== orderId) return current;
            return {
              ...current,
              items: current.items.filter((o) => o.id !== orderItemId),
              totalCost: Math.max(0, current.totalCost - amount),
              timestamp: Date.now(),
            };
          })
          .filter(
            (current) =>
              !(current.id === orderId && current.items.length === 0),
          ),
      }));

      get().updateStock(item.menuItemId, item.quantity);

      appendCancelLog({
        itemName: item.menuItemName,
        quantity: item.quantity,
        amount,
        source: "open-walkin",
        tableId: null,
        tableName: order.label?.trim() || "Бар (заказ без стола)",
        recordId: order.id,
        meta,
      });

      cloudSync.broadcastSync();
      get().addToast(
        "success",
        translate(get().settings.language, "cancel.done_toast", {
          name: item.menuItemName,
        }),
      );
      return true;
    },

    voidHistoryItem: (recordId, orderItemId, meta) => {
      const record = get().sessionHistory.find((r) => r.id === recordId);
      const item = record?.barOrders?.find((o) => o.id === orderItemId);
      if (!record || !item) return false;

      // Гейт: только текущая смена/сегодня.
      const shiftStart = get().currentShift?.startTime ?? null;
      if (!isRecordVoidable(record, shiftStart)) {
        get().addToast(
          "error",
          translate(get().settings.language, "cancel.too_old"),
        );
        return false;
      }

      const amount = item.price * item.quantity;

      set((state) => {
        const sessionHistory = state.sessionHistory
          .map((r) => {
            if (r.id !== recordId || !r.barOrders) return r;
            return {
              ...r,
              barOrders: r.barOrders.filter((o) => o.id !== orderItemId),
              barCost: Math.max(0, (r.barCost || 0) - amount),
              totalCost: Math.max(0, (r.totalCost || 0) - amount),
            };
          })
          // Полностью обнулённую продажу без стола убираем из истории целиком.
          .filter(
            (r) =>
              !(
                r.id === recordId &&
                r.tableCost <= 0 &&
                (r.barOrders?.length ?? 0) === 0
              ),
          );

        // Зеркальная запись быстрой продажи в completedOrders — держим синхронной.
        const completedOrders = state.completedOrders
          .map((ord) => {
            if (ord.id !== recordId) return ord;
            return {
              ...ord,
              items: ord.items.filter((o) => o.id !== orderItemId),
              totalCost: Math.max(0, ord.totalCost - amount),
            };
          })
          .filter((ord) => !(ord.id === recordId && ord.items.length === 0));

        return { sessionHistory, completedOrders };
      });

      get().updateStock(item.menuItemId, item.quantity);

      const source: CancelSource =
        record.tableId === 0 ? "quick-sale" : "closed-session";
      appendCancelLog({
        itemName: item.menuItemName,
        quantity: item.quantity,
        amount,
        source,
        tableId: record.tableId,
        tableName: record.tableName,
        recordId,
        meta,
      });

      // Облако: следующий /club/sync пересчитает todayRevenue из истории — пушим сразу.
      void cloudSync.syncNow();
      get().addToast(
        "success",
        translate(get().settings.language, "cancel.done_toast", {
          name: item.menuItemName,
        }),
      );
      return true;
    },
  };
};
