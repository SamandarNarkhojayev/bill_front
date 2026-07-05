import type { StateCreator } from "zustand";
import type { AppStore } from "../types";
import type {
  BarOrder,
  BarOrderItem,
  SessionRecord,
  InventoryRevision,
} from "../../types";
import { generateId, localDateStr } from "../helpers";
import { defaultBarMenu, defaultBarCategories } from "../defaults";
import { playOrderSound } from "../../utils/sounds";
import { translate } from "../../i18n/translate";
import telegram from "../../utils/telegram";
import {
  getEffectivePaymentMethod,
  normalizePaymentBreakdown,
  toPaymentDetails,
} from "../../utils/payment";

export const createBarSlice: StateCreator<
  AppStore,
  [],
  [],
  Pick<
    AppStore,
    | "barMenu"
    | "barCategories"
    | "barOrders"
    | "inventoryRevisions"
    | "addMenuItem"
    | "updateMenuItem"
    | "removeMenuItem"
    | "addBarCategory"
    | "updateBarCategory"
    | "removeBarCategory"
    | "addBarOrderToTable"
    | "createBarOrder"
    | "finalizeBarOrder"
    | "sellFromBar"
    | "updateStock"
    | "setStock"
    | "createRevision"
  >
> = (set, get) => ({
  barMenu: defaultBarMenu,
  barCategories: defaultBarCategories,
  barOrders: [],
  inventoryRevisions: [],

  addMenuItem: (item) => {
    const role = get().currentUser?.role;
    if (role !== "admin" && role !== "developer") {
      get().addToast(
        "error",
        "Недостаточно прав для изменения меню бара/кухни",
      );
      return;
    }
    set((state) => ({
      barMenu: [...state.barMenu, { ...item, id: generateId() }],
    }));
  },

  updateMenuItem: (id, updates) => {
    const role = get().currentUser?.role;
    if (role !== "admin" && role !== "developer") {
      get().addToast(
        "error",
        "Недостаточно прав для изменения меню бара/кухни",
      );
      return;
    }
    set((state) => ({
      barMenu: state.barMenu.map((item) =>
        item.id === id ? { ...item, ...updates } : item,
      ),
    }));
  },

  removeMenuItem: (id) => {
    const role = get().currentUser?.role;
    if (role !== "admin" && role !== "developer") {
      get().addToast(
        "error",
        "Недостаточно прав для изменения меню бара/кухни",
      );
      return;
    }
    set((state) => ({
      barMenu: state.barMenu.filter((item) => item.id !== id),
    }));
  },

  addBarCategory: (cat) => {
    const role = get().currentUser?.role;
    if (role !== "admin" && role !== "developer") {
      get().addToast(
        "error",
        "Недостаточно прав для изменения меню бара/кухни",
      );
      return;
    }
    set((state) => ({
      barCategories: [...state.barCategories, { ...cat, id: generateId() }],
    }));
  },

  updateBarCategory: (id, updates) => {
    const role = get().currentUser?.role;
    if (role !== "admin" && role !== "developer") {
      get().addToast(
        "error",
        "Недостаточно прав для изменения меню бара/кухни",
      );
      return;
    }
    set((state) => ({
      barCategories: state.barCategories.map((c) =>
        c.id === id ? { ...c, ...updates } : c,
      ),
    }));
  },

  removeBarCategory: (id) => {
    const role = get().currentUser?.role;
    if (role !== "admin" && role !== "developer") {
      get().addToast(
        "error",
        "Недостаточно прав для изменения меню бара/кухни",
      );
      return;
    }
    set((state) => ({
      barCategories: state.barCategories.filter((c) => c.id !== id),
    }));
  },

  addBarOrderToTable: (tableId, menuItem, quantity, options = {}) => {
    const { priceOverride, silent = false } = options;
    const orderItemPrice =
      typeof priceOverride === "number" ? priceOverride : menuItem.price;
    // Списать со склада
    if (menuItem.stock > 0) {
      set((state) => ({
        barMenu: state.barMenu.map((item) =>
          item.id === menuItem.id && item.stock > 0
            ? { ...item, stock: Math.max(0, item.stock - quantity) }
            : item,
        ),
      }));
    }
    set((state) => ({
      tables: state.tables.map((table) => {
        if (table.id !== tableId || !table.currentSession) return table;
        const orderItem: BarOrderItem = {
          id: generateId(),
          menuItemId: menuItem.id,
          menuItemName: menuItem.name,
          quantity,
          price: orderItemPrice,
          timestamp: Date.now(),
        };
        return {
          ...table,
          currentSession: {
            ...table.currentSession,
            barOrders: [...table.currentSession.barOrders, orderItem],
            totalBarCost:
              table.currentSession.totalBarCost + orderItemPrice * quantity,
          },
        };
      }),
    }));
    if (get().settings.soundEnabled) {
      playOrderSound();
    }
    if (!silent) {
      get().addToast(
        "success",
        translate(get().settings.language, "bar.added_toast", {
          name: menuItem.name,
          qty: quantity,
        }),
      );
    }
    // Telegram: предупреждение о низком остатке (если списали со склада).
    if (menuItem.stock > 0) {
      telegram.checkLowStock(get().barMenu, get().settings.clubName);
    }
  },

  createBarOrder: (tableId, items, options = {}) => {
    const now = Date.now();
    const orderItems: BarOrder["items"] = items.map((i) => ({
      id: generateId(),
      menuItemId: i.menuItem.id,
      menuItemName: i.menuItem.name,
      quantity: i.quantity,
      price: i.menuItem.price,
      timestamp: now,
    }));
    const addedCost = orderItems.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0,
    );

    if (tableId == null) {
      items.forEach((i) => {
        if (i.menuItem.stock > 0) {
          set((state) => ({
            barMenu: state.barMenu.map((m) =>
              m.id === i.menuItem.id && m.stock > 0
                ? { ...m, stock: Math.max(0, m.stock - i.quantity) }
                : m,
            ),
          }));
        }
      });

      set((state) => {
        const existingOrder =
          options.label == null
            ? null
            : state.barOrders.find(
                (order) =>
                  order.tableId == null &&
                  !order.isPaid &&
                  order.label === options.label,
              );

        if (!existingOrder) {
          const order: BarOrder = {
            id: generateId(),
            tableId: null,
            label: options.label,
            items: orderItems,
            totalCost: addedCost,
            timestamp: now,
            isPaid: false,
          };
          return { barOrders: [...state.barOrders, order] };
        }

        return {
          barOrders: state.barOrders.map((order) =>
            order.id === existingOrder.id
              ? {
                  ...order,
                  items: [...order.items, ...orderItems],
                  totalCost: order.totalCost + addedCost,
                  timestamp: now,
                }
              : order,
          ),
        };
      });

      if (get().settings.soundEnabled) {
        playOrderSound();
      }
      telegram.checkLowStock(get().barMenu, get().settings.clubName);
      return;
    }

    const order: BarOrder = {
      id: generateId(),
      tableId,
      items: orderItems,
      totalCost: addedCost,
      timestamp: now,
      isPaid: false,
    };

    set((state) => ({
      barOrders: [...state.barOrders, order],
    }));

    items.forEach((i) => {
      get().addBarOrderToTable(tableId, i.menuItem, i.quantity);
    });
  },

  finalizeBarOrder: (orderId, payment = "cash") => {
    const order = get().barOrders.find(
      (item) => item.id === orderId && !item.isPaid,
    );
    if (!order) return;

    const paymentDetails = toPaymentDetails(payment);
    const paymentMethod = getEffectivePaymentMethod(paymentDetails);
    const paymentBreakdown = normalizePaymentBreakdown(
      paymentDetails.paymentBreakdown,
    );

    const svc = get().settings;
    const serviceCharge = svc.serviceChargeEnabled
      ? Math.round((order.totalCost * svc.serviceChargePercent) / 100)
      : 0;

    const completedOrder: BarOrder = {
      ...order,
      isPaid: true,
      timestamp: Date.now(),
    };

    const record: SessionRecord = {
      id: order.id,
      tableId: 0,
      tableName: order.label?.trim() || "Бар (продажа)",
      mode: "unlimited",
      startTime: order.timestamp,
      endTime: Date.now(),
      duration: 0,
      tableCost: 0,
      barOrders: order.items.map((item) => ({ ...item })),
      barCost: order.totalCost,
      totalCost: order.totalCost,
      serviceCharge,
      date: localDateStr(),
      paymentMethod,
      paymentBreakdown,
    };

    set((state) => ({
      barOrders: state.barOrders.filter((item) => item.id !== orderId),
      completedOrders: [...state.completedOrders, completedOrder],
      sessionHistory: [...state.sessionHistory, record],
    }));

    get().addToast(
      "success",
      translate(get().settings.language, "bar.sold_toast", {
        sum: order.totalCost.toLocaleString(),
        currency: get().settings.currency,
      }),
    );
  },

  sellFromBar: (items, paymentMethod = "cash") => {
    // Списать со склада
    items.forEach((i) => {
      if (i.menuItem.stock > 0) {
        set((state) => ({
          barMenu: state.barMenu.map((m) =>
            m.id === i.menuItem.id && m.stock > 0
              ? { ...m, stock: Math.max(0, m.stock - i.quantity) }
              : m,
          ),
        }));
      }
    });

    const totalCost = items.reduce(
      (sum, i) => sum + i.menuItem.price * i.quantity,
      0,
    );
    // Сервисный сбор для продажи без стола — фиксируем в записи отчёта (та же формула, что на чеке).
    const svc = get().settings;
    const serviceCharge = svc.serviceChargeEnabled
      ? Math.round((totalCost * svc.serviceChargePercent) / 100)
      : 0;

    // Создать BarOrder для completedOrders
    const order: BarOrder = {
      id: generateId(),
      tableId: null,
      items: items.map((i) => ({
        id: generateId(),
        menuItemId: i.menuItem.id,
        menuItemName: i.menuItem.name,
        quantity: i.quantity,
        price: i.menuItem.price,
        timestamp: Date.now(),
      })),
      totalCost,
      timestamp: Date.now(),
      isPaid: true,
    };

    // Создать SessionRecord для отчётов
    const record: SessionRecord = {
      id: order.id,
      tableId: 0,
      tableName: "Бар (продажа)",
      mode: "unlimited",
      startTime: Date.now(),
      endTime: Date.now(),
      duration: 0,
      tableCost: 0,
      barOrders: order.items.map((item) => ({ ...item })),
      barCost: totalCost,
      totalCost,
      serviceCharge,
      date: localDateStr(),
      paymentMethod,
    };

    set((state) => ({
      completedOrders: [...state.completedOrders, order],
      sessionHistory: [...state.sessionHistory, record],
    }));

    if (get().settings.soundEnabled) {
      playOrderSound();
    }
    get().addToast(
      "success",
      translate(get().settings.language, "bar.sold_toast", {
        sum: totalCost.toLocaleString(),
        currency: get().settings.currency,
      }),
    );
    // Telegram: предупреждение о низком остатке после продажи.
    telegram.checkLowStock(get().barMenu, get().settings.clubName);
  },

  updateStock: (menuItemId, delta) => {
    set((state) => ({
      barMenu: state.barMenu.map((item) =>
        item.id === menuItemId
          ? {
              ...item,
              stock: item.stock === -1 ? -1 : Math.max(0, item.stock + delta),
            }
          : item,
      ),
    }));
  },

  setStock: (menuItemId, qty) => {
    set((state) => ({
      barMenu: state.barMenu.map((item) =>
        item.id === menuItemId ? { ...item, stock: qty } : item,
      ),
    }));
  },

  createRevision: (items, notes) => {
    const revision: InventoryRevision = {
      id: generateId(),
      date: localDateStr(),
      timestamp: Date.now(),
      notes,
      items: items.map((i) => ({
        ...i,
        difference: i.actualStock - i.expectedStock,
      })),
    };
    // Обновить остатки по факту ревизии
    items.forEach((i) => {
      get().setStock(i.menuItemId, i.actualStock);
    });
    set((state) => ({
      inventoryRevisions: [...state.inventoryRevisions, revision],
    }));
    get().addToast(
      "success",
      translate(get().settings.language, "toasts.revision_saved"),
    );
  },
});
