import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { playOrderSound } from '../utils/sounds';
import type {
  BilliardTable,
  BarMenuItem,
  BarOrderItem,
  BarOrder,
  BarCategoryConfig,
  InventoryRevision,
  InventoryRevisionItem,
  SessionRecord,
  AppSettings,
  PageType,
  SessionMode,
  ToastMessage,
} from '../types';

// ===== ГЕНЕРАЦИЯ ID =====
const generateId = () => Math.random().toString(36).substring(2, 9) + Date.now().toString(36);

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

// ===== КАТЕГОРИИ ПО УМОЛЧАНИЮ =====
const defaultBarCategories: BarCategoryConfig[] = [
  { id: 'drinks',  name: 'Напитки',  icon: 'Coffee',       color: '#3b82f6', sortOrder: 0 },
  { id: 'alcohol', name: 'Алкоголь', icon: 'Wine',         color: '#a855f7', sortOrder: 1 },
  { id: 'snacks',  name: 'Закуски',  icon: 'Sandwich',     color: '#f59e0b', sortOrder: 2 },
  { id: 'hookah',  name: 'Кальян',   icon: 'Wind',         color: '#6366f1', sortOrder: 3 },
];

// ===== МЕНЮ БАРА ПО УМОЛЧАНИЮ =====
const defaultBarMenu: BarMenuItem[] = [
  { id: 'drink-1', name: 'Чай',           categoryId: 'drinks',  price: 300,  costPrice: 50,  available: true, image: '', stock: -1, unit: 'шт' },
  { id: 'drink-2', name: 'Кофе',          categoryId: 'drinks',  price: 500,  costPrice: 80,  available: true, image: '', stock: -1, unit: 'шт' },
  { id: 'drink-3', name: 'Coca-Cola',     categoryId: 'drinks',  price: 600,  costPrice: 200, available: true, image: '', stock: 24, unit: 'шт' },
  { id: 'drink-4', name: 'Вода',          categoryId: 'drinks',  price: 200,  costPrice: 50,  available: true, image: '', stock: 48, unit: 'шт' },
  { id: 'drink-5', name: 'Сок',           categoryId: 'drinks',  price: 500,  costPrice: 150, available: true, image: '', stock: 12, unit: 'шт' },
  { id: 'drink-6', name: 'Энергетик',     categoryId: 'drinks',  price: 800,  costPrice: 350, available: true, image: '', stock: 10, unit: 'шт' },
  { id: 'alco-1',  name: 'Пиво 0.5',     categoryId: 'alcohol', price: 800,  costPrice: 300, available: true, image: '', stock: 20, unit: 'шт' },
  { id: 'alco-2',  name: 'Пиво 0.33',    categoryId: 'alcohol', price: 600,  costPrice: 200, available: true, image: '', stock: 24, unit: 'шт' },
  { id: 'alco-3',  name: 'Виски',         categoryId: 'alcohol', price: 1500, costPrice: 600, available: true, image: '', stock: -1, unit: 'мл' },
  { id: 'alco-4',  name: 'Вино (бокал)',  categoryId: 'alcohol', price: 1200, costPrice: 400, available: true, image: '', stock: -1, unit: 'шт' },
  { id: 'alco-5',  name: 'Водка 50мл',   categoryId: 'alcohol', price: 600,  costPrice: 150, available: true, image: '', stock: -1, unit: 'мл' },
  { id: 'snack-1', name: 'Чипсы',        categoryId: 'snacks',  price: 400,  costPrice: 150, available: true, image: '', stock: 15, unit: 'шт' },
  { id: 'snack-2', name: 'Орехи',        categoryId: 'snacks',  price: 500,  costPrice: 200, available: true, image: '', stock: 10, unit: 'шт' },
  { id: 'snack-3', name: 'Сухарики',     categoryId: 'snacks',  price: 300,  costPrice: 100, available: true, image: '', stock: 20, unit: 'шт' },
  { id: 'snack-4', name: 'Пицца',        categoryId: 'snacks',  price: 1500, costPrice: 500, available: true, image: '', stock: 5,  unit: 'шт' },
  { id: 'snack-5', name: 'Сэндвич',      categoryId: 'snacks',  price: 900,  costPrice: 300, available: true, image: '', stock: 8,  unit: 'шт' },
  { id: 'hookah-1', name: 'Кальян классический', categoryId: 'hookah', price: 3000, costPrice: 800, available: true, image: '', stock: -1, unit: 'шт' },
  { id: 'hookah-2', name: 'Кальян фруктовый',   categoryId: 'hookah', price: 3500, costPrice: 1000, available: true, image: '', stock: -1, unit: 'шт' },
  { id: 'hookah-3', name: 'Доп. угли',          categoryId: 'hookah', price: 300,  costPrice: 50,  available: true, image: '', stock: 30, unit: 'шт' },
];

// ===== НАСТРОЙКИ ПО УМОЛЧАНИЮ =====
const defaultSettings: AppSettings = {
  clubName: 'Бильярдный Клуб',
  defaultPricePerHour: 2000,
  currency: 'тг',
  theme: 'dark',
  autoLightOff: true,
  soundEnabled: true,
  autoPrintReceipt: false,
  tables: [
    { id: 1, name: 'Стол №1', relayNumber: 1, pricePerHour: 2000, isActive: true },
    { id: 2, name: 'Стол №2', relayNumber: 2, pricePerHour: 2000, isActive: true },
    { id: 3, name: 'Стол №3', relayNumber: 3, pricePerHour: 2500, isActive: true },
    { id: 4, name: 'Стол №4', relayNumber: 4, pricePerHour: 2500, isActive: true },
  ],
};

// ===== СТОЛЫ ПО УМОЛЧАНИЮ =====
const defaultTables: BilliardTable[] = defaultSettings.tables.map((t) => ({
  id: t.id,
  name: t.name,
  relayNumber: t.relayNumber,
  status: 'free' as const,
  lightOn: false,
  pricePerHour: t.pricePerHour,
  currentSession: null,
}));

// ===== ИНТЕРФЕЙС STORE =====
interface AppStore {
  currentPage: PageType;
  setCurrentPage: (page: PageType) => void;
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;

  tables: BilliardTable[];
  startSession: (tableId: number, mode: SessionMode, options?: { hours?: number; minutes?: number; amount?: number }) => void;
  endSession: (tableId: number) => void;
  toggleLight: (tableId: number) => void;
  setLightState: (tableId: number, on: boolean) => void;
  updateTableFromRelay: (relayNumber: number, state: boolean) => void;
  syncTablesFromArduino: (relayCount: number, relays: { number: number; pin: number; state: boolean }[]) => void;

  barMenu: BarMenuItem[];
  barCategories: BarCategoryConfig[];
  barOrders: BarOrder[];
  inventoryRevisions: InventoryRevision[];
  addMenuItem: (item: Omit<BarMenuItem, 'id'>) => void;
  updateMenuItem: (id: string, item: Partial<BarMenuItem>) => void;
  removeMenuItem: (id: string) => void;
  addBarCategory: (cat: Omit<BarCategoryConfig, 'id'>) => void;
  updateBarCategory: (id: string, cat: Partial<BarCategoryConfig>) => void;
  removeBarCategory: (id: string) => void;
  addBarOrderToTable: (tableId: number, menuItem: BarMenuItem, quantity: number) => void;
  createBarOrder: (tableId: number | null, items: { menuItem: BarMenuItem; quantity: number }[]) => void;
  updateStock: (menuItemId: string, delta: number) => void;
  setStock: (menuItemId: string, qty: number) => void;
  createRevision: (items: Omit<InventoryRevisionItem, 'difference'>[], notes: string) => void;

  sessionHistory: SessionRecord[];
  completedOrders: BarOrder[];
  addSessionRecord: (record: SessionRecord) => void;
  getTodayRevenue: () => { table: number; bar: number; total: number };
  getTodaySessions: () => number;

  settings: AppSettings;
  updateSettings: (settings: Partial<AppSettings>) => void;

  toasts: ToastMessage[];
  addToast: (type: ToastMessage['type'], message: string, duration?: number) => void;
  removeToast: (id: string) => void;

  activeModal: string | null;
  modalData: Record<string, unknown> | null;
  openModal: (modal: string, data?: Record<string, unknown>) => void;
  closeModal: () => void;
}

// ===== STORE =====
export const useStore = create<AppStore>()(
  persist(
    (set, get) => ({
      currentPage: 'dashboard',
      setCurrentPage: (page) => set({ currentPage: page }),

      tables: defaultTables,

      startSession: (tableId, mode, options = {}) => {
        const { hours = 0, minutes = 0, amount = 0 } = options;
        const table = get().tables.find((t) => t.id === tableId);
        const pricePerHour = table?.pricePerHour || get().settings.defaultPricePerHour;
        let plannedDuration: number | null = null;
        if (mode === 'time') {
          plannedDuration = (hours * 60 + minutes) * 60; // в секундах
        } else if (mode === 'amount' && amount > 0) {
          plannedDuration = Math.max(1, Math.ceil((amount / pricePerHour) * 3600)); // в секундах
        }
        const fixedAmount = mode === 'amount' ? amount : null;

        set((state) => ({
          tables: state.tables.map((table) =>
            table.id === tableId
              ? {
                  ...table,
                  status: 'occupied' as const,
                  lightOn: true,
                  currentSession: {
                    id: generateId(),
                    tableId,
                    startTime: Date.now(),
                    endTime: null,
                    mode,
                    plannedDuration,
                    fixedAmount,
                    barOrders: [],
                    totalTableCost: 0,
                    totalBarCost: 0,
                    isPaid: false,
                  },
                }
              : table
          ),
        }));

        const updatedTable = get().tables.find((t) => t.id === tableId);
        if (updatedTable && window.electronAPI?.arduino) {
          window.electronAPI.arduino.setRelay(updatedTable.relayNumber, true).catch(console.error);
        }

        const tableName = get().tables.find((t) => t.id === tableId)?.name || '';
        const modeLabel = mode === 'time' ? 'по времени' : mode === 'amount' ? 'на сумму' : 'бессрочно';
        get().addToast('success', `${tableName} запущен (${modeLabel})`);
      },

      endSession: (tableId) => {
        const table = get().tables.find((t) => t.id === tableId);
        if (!table || !table.currentSession) return;

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

        const record: SessionRecord = {
          id: session.id,
          tableId: table.id,
          tableName: table.name,
          mode: session.mode,
          startTime: session.startTime,
          endTime,
          duration: durationMinutes,
          tableCost,
          barCost,
          totalCost: tableCost + barCost,
          date: new Date().toISOString().split('T')[0],
        };

        set((state) => ({
          tables: state.tables.map((t) =>
            t.id === tableId
              ? {
                  ...t,
                  status: 'free' as const,
                  lightOn: state.settings.autoLightOff ? false : t.lightOn,
                  currentSession: null,
                }
              : t
          ),
          sessionHistory: [...state.sessionHistory, record],
        }));

        if (get().settings.autoLightOff && window.electronAPI?.arduino) {
          window.electronAPI.arduino.setRelay(table.relayNumber, false).catch(console.error);
        }

        get().addToast('info', `${table.name} завершён — ${tableCost + barCost} ${get().settings.currency}`);
      },

      toggleLight: (tableId) => {
        const table = get().tables.find((t) => t.id === tableId);
        if (!table) return;
        const newState = !table.lightOn;
        set((state) => ({
          tables: state.tables.map((t) =>
            t.id === tableId ? { ...t, lightOn: newState } : t
          ),
        }));
        if (window.electronAPI?.arduino) {
          window.electronAPI.arduino.setRelay(table.relayNumber, newState).catch(console.error);
        }
      },

      setLightState: (tableId, on) => {
        set((state) => ({
          tables: state.tables.map((t) =>
            t.id === tableId ? { ...t, lightOn: on } : t
          ),
        }));
      },

      updateTableFromRelay: (relayNumber, state) => {
        set((s) => ({
          tables: s.tables.map((t) =>
            t.relayNumber === relayNumber ? { ...t, lightOn: state } : t
          ),
        }));
      },

      syncTablesFromArduino: (relayCount, relays) => {
        set((state) => {
          const newTables = relays.map((relay) => {
            const existing = state.tables.find((t) => t.relayNumber === relay.number);
            if (existing) {
              return { ...existing, lightOn: relay.state };
            }
            const settingsTable = state.settings.tables.find((t) => t.relayNumber === relay.number);
            return {
              id: relay.number,
              name: settingsTable?.name || `Стол №${relay.number}`,
              relayNumber: relay.number,
              status: 'free' as const,
              lightOn: relay.state,
              pricePerHour: settingsTable?.pricePerHour || state.settings.defaultPricePerHour,
              currentSession: null,
            };
          });
          // Обновляем settings.tables тоже
          const newSettingsTables = newTables.map((t) => {
            const existing = state.settings.tables.find((st) => st.relayNumber === t.relayNumber);
            return {
              id: t.id,
              name: t.name,
              relayNumber: t.relayNumber,
              pricePerHour: existing?.pricePerHour || t.pricePerHour,
              isActive: existing?.isActive ?? true,
            };
          });
          return {
            tables: newTables,
            settings: { ...state.settings, tables: newSettingsTables },
          };
        });
        get().addToast('info', `Обнаружено реле: ${relayCount} шт.`);
      },

      barMenu: defaultBarMenu,
      barCategories: defaultBarCategories,
      barOrders: [],
      inventoryRevisions: [],

      addMenuItem: (item) => {
        set((state) => ({
          barMenu: [...state.barMenu, { ...item, id: generateId() }],
        }));
      },

      updateMenuItem: (id, updates) => {
        set((state) => ({
          barMenu: state.barMenu.map((item) =>
            item.id === id ? { ...item, ...updates } : item
          ),
        }));
      },

      removeMenuItem: (id) => {
        set((state) => ({
          barMenu: state.barMenu.filter((item) => item.id !== id),
        }));
      },

      addBarCategory: (cat) => {
        set((state) => ({
          barCategories: [...state.barCategories, { ...cat, id: generateId() }],
        }));
      },

      updateBarCategory: (id, updates) => {
        set((state) => ({
          barCategories: state.barCategories.map((c) =>
            c.id === id ? { ...c, ...updates } : c
          ),
        }));
      },

      removeBarCategory: (id) => {
        set((state) => ({
          barCategories: state.barCategories.filter((c) => c.id !== id),
        }));
      },

      addBarOrderToTable: (tableId, menuItem, quantity) => {
        // Списать со склада
        if (menuItem.stock > 0) {
          set((state) => ({
            barMenu: state.barMenu.map((item) =>
              item.id === menuItem.id && item.stock > 0
                ? { ...item, stock: Math.max(0, item.stock - quantity) }
                : item
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
              price: menuItem.price,
              timestamp: Date.now(),
            };
            return {
              ...table,
              currentSession: {
                ...table.currentSession,
                barOrders: [...table.currentSession.barOrders, orderItem],
                totalBarCost: table.currentSession.totalBarCost + menuItem.price * quantity,
              },
            };
          }),
        }));
        if (get().settings.soundEnabled) {
          playOrderSound();
        }
        get().addToast('success', `${menuItem.name} × ${quantity} добавлено`);
      },

      createBarOrder: (tableId, items) => {
        const order: BarOrder = {
          id: generateId(),
          tableId,
          items: items.map((i) => ({
            id: generateId(),
            menuItemId: i.menuItem.id,
            menuItemName: i.menuItem.name,
            quantity: i.quantity,
            price: i.menuItem.price,
            timestamp: Date.now(),
          })),
          totalCost: items.reduce((sum, i) => sum + i.menuItem.price * i.quantity, 0),
          timestamp: Date.now(),
          isPaid: false,
        };

        set((state) => ({
          barOrders: [...state.barOrders, order],
        }));

        if (tableId) {
          items.forEach((i) => {
            get().addBarOrderToTable(tableId, i.menuItem, i.quantity);
          });
        }
      },

      updateStock: (menuItemId, delta) => {
        set((state) => ({
          barMenu: state.barMenu.map((item) =>
            item.id === menuItemId
              ? { ...item, stock: item.stock === -1 ? -1 : Math.max(0, item.stock + delta) }
              : item
          ),
        }));
      },

      setStock: (menuItemId, qty) => {
        set((state) => ({
          barMenu: state.barMenu.map((item) =>
            item.id === menuItemId ? { ...item, stock: qty } : item
          ),
        }));
      },

      createRevision: (items, notes) => {
        const revision: InventoryRevision = {
          id: generateId(),
          date: new Date().toISOString().split('T')[0],
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
        get().addToast('success', 'Ревизия сохранена');
      },

      sessionHistory: [],
      completedOrders: [],

      addSessionRecord: (record) => {
        set((state) => ({
          sessionHistory: [...state.sessionHistory, record],
        }));
      },

      getTodayRevenue: () => {
        const today = new Date().toISOString().split('T')[0];
        const todaySessions = get().sessionHistory.filter((s) => s.date === today);
        const tableRev = todaySessions.reduce((sum, s) => sum + s.tableCost, 0);
        const barRev = todaySessions.reduce((sum, s) => sum + s.barCost, 0);
        return { table: tableRev, bar: barRev, total: tableRev + barRev };
      },

      getTodaySessions: () => {
        const today = new Date().toISOString().split('T')[0];
        return get().sessionHistory.filter((s) => s.date === today).length;
      },

      settings: defaultSettings,

      updateSettings: (updates) => {
        set((state) => {
          const newSettings = { ...state.settings, ...updates, currency: 'тг' };
          let newTables = state.tables;
          if (updates.tables) {
            newTables = newSettings.tables.map((st) => {
              const existing = state.tables.find((t) => t.id === st.id);
              if (existing) {
                return {
                  ...existing,
                  name: st.name,
                  relayNumber: st.relayNumber,
                  pricePerHour: st.pricePerHour,
                };
              }
              return {
                id: st.id,
                name: st.name,
                relayNumber: st.relayNumber,
                status: 'free' as const,
                lightOn: false,
                pricePerHour: st.pricePerHour,
                currentSession: null,
              };
            });
          }
          return { settings: newSettings, tables: newTables };
        });
      },

      toasts: [],

      addToast: (type, message, duration = 3000) => {
        const id = generateId();
        set((state) => ({
          toasts: [...state.toasts, { id, type, message, duration }],
        }));
        setTimeout(() => {
          get().removeToast(id);
        }, duration);
      },

      removeToast: (id) => {
        set((state) => ({
          toasts: state.toasts.filter((t) => t.id !== id),
        }));
      },

      activeModal: null,
      modalData: null,
      openModal: (modal, data) => set({ activeModal: modal, modalData: data || null }),
      closeModal: () => set({ activeModal: null, modalData: null }),

      sidebarCollapsed: false,
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
    }),
    {
      name: 'billiard-club-storage',
      partialize: (state) => ({
        sessionHistory: state.sessionHistory,
        completedOrders: state.completedOrders,
        settings: state.settings,
        barMenu: state.barMenu,
        barCategories: state.barCategories,
        inventoryRevisions: state.inventoryRevisions,
        sidebarCollapsed: state.sidebarCollapsed,
      }),
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<AppStore>;
        const merged = { ...currentState, ...persisted };
        merged.settings = {
          ...currentState.settings,
          ...persisted.settings,
          currency: 'тг',
        };
        if (persisted.settings?.tables) {
          merged.tables = persisted.settings.tables.map((st) => ({
            id: st.id,
            name: st.name,
            relayNumber: st.relayNumber,
            status: 'free' as const,
            lightOn: false,
            pricePerHour: st.pricePerHour,
            currentSession: null,
          }));
        }
        return merged as AppStore;
      },
    }
  )
);
