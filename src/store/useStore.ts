import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
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
  User,
  UserRole,
  Shift,
  Reservation,
} from '../types';

// ===== ГЕНЕРАЦИЯ ID =====
const generateId = () => Math.random().toString(36).substring(2, 9) + Date.now().toString(36);

// Локальная дата в формате YYYY-MM-DD (без UTC-сдвига)
const localDateStr = (d: Date = new Date()): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

// ===== Простое хеширование пароля (для локального хранения) =====
const hashPassword = (password: string): string => {
  let hash = 0;
  for (let i = 0; i < password.length; i++) {
    const char = password.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return 'h_' + Math.abs(hash).toString(36) + '_' + password.length;
};

// ===== ПОЛЬЗОВАТЕЛИ ПО УМОЛЧАНИЮ =====
const defaultUsers: User[] = [
  {
    id: 'dev-001',
    username: 'developer',
    password: hashPassword('dev2026'),
    displayName: 'Разработчик',
    role: 'developer',
    createdAt: Date.now(),
    createdBy: null,
    isActive: true,
  },
  {
    id: 'admin-001',
    username: 'admin',
    password: hashPassword('admin2026'),
    displayName: 'Администратор',
    role: 'admin',
    createdAt: Date.now(),
    createdBy: null,
    isActive: true,
  },
];

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
  receiptCompanyName: 'ИП Coffee Time',
  receiptCity: 'г. Шымкент',
  receiptPhone: '+7 777 123 45 67',
  receiptCashierName: 'ИМЯ',
  defaultPricePerHour: 2000,
  currency: 'тг',
  theme: 'dark',
  autoLightOff: true,
  soundEnabled: true,
  autoPrintReceipt: false,
  silentPrint: true,
  savedPortPath: null,
  receiptWidthMm: 80,
  receiptFontSize: 14,
  receiptPaddingMm: 5,
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
  // Авторизация
  isAuthenticated: boolean;
  currentUser: User | null;
  users: User[];
  login: (username: string, password: string) => boolean;
  logout: () => void;
  addUser: (username: string, password: string, displayName: string, role: UserRole) => boolean;
  updateUser: (id: string, updates: Partial<Pick<User, 'displayName' | 'role' | 'isActive'>>) => void;
  changeUserPassword: (id: string, newPassword: string) => void;
  removeUser: (id: string) => void;

  // Смены
  currentShift: Shift | null;
  shiftHistory: Shift[];
  startShift: () => void;
  endShift: () => void;

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
  restoreLightsToArduino: () => void;

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
  sellFromBar: (items: { menuItem: BarMenuItem; quantity: number }[]) => void;
  updateStock: (menuItemId: string, delta: number) => void;
  setStock: (menuItemId: string, qty: number) => void;
  createRevision: (items: Omit<InventoryRevisionItem, 'difference'>[], notes: string) => void;

  sessionHistory: SessionRecord[];
  completedOrders: BarOrder[];
  addSessionRecord: (record: SessionRecord) => void;
  getTodayRevenue: () => { table: number; bar: number; total: number };
  getTodaySessions: () => number;

  // Бронирование
  reservations: Reservation[];
  addReservation: (tableId: number, customerName: string, customerPhone: string, reservedFor: number, notes: string) => void;
  cancelReservation: (reservationId: string) => void;

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

// ===== НАДЁЖНОЕ ФАЙЛОВОЕ ХРАНИЛИЩЕ (через IPC в Electron) =====
// Защита от перезаписи данных до завершения гидратации
let _hydrationComplete = false;

const electronFileStorage = createJSONStorage<Partial<AppStore>>(() => ({
  getItem: async (name: string): Promise<string | null> => {
    try {
      if (window.electronAPI?.store) {
        const value = await window.electronAPI.store.get(name);
        console.log('[Storage] getItem:', name, value ? `${value.length} bytes` : 'null');
        return value ?? null;
      }
    } catch (err) {
      console.error('[Storage] getItem error:', err);
    }
    // Fallback на localStorage (dev-mode без Electron)
    return localStorage.getItem(name);
  },
  setItem: async (name: string, value: string): Promise<void> => {
    // КРИТИЧНО: не писать до завершения гидратации, иначе дефолты затрут данные
    if (!_hydrationComplete) {
      console.log('[Storage] setItem BLOCKED (hydration not complete)');
      return;
    }
    try {
      if (window.electronAPI?.store) {
        await window.electronAPI.store.set(name, value);
        return;
      }
    } catch (err) {
      console.error('[Storage] setItem error:', err);
    }
    // Fallback на localStorage
    localStorage.setItem(name, value);
  },
  removeItem: async (name: string): Promise<void> => {
    try {
      if (window.electronAPI?.store) {
        await window.electronAPI.store.remove(name);
        return;
      }
    } catch (err) {
      console.error('[Storage] removeItem error:', err);
    }
    localStorage.removeItem(name);
  },
}));

// ===== АВТОСОХРАНЕНИЕ И ЗАЩИТА ОТ ПОТЕРИ ДАННЫХ =====

/**
 * Принудительный flush данных на диск через IPC.
 * Вызывается периодически и при критических событиях.
 */
function flushStorageToDisk() {
  try {
    if (window.electronAPI?.store?.flush) {
      window.electronAPI.store.flush().catch((err: unknown) => {
        console.error('[AutoSave] Flush error:', err);
      });
    }
  } catch {
    // Не в Electron — игнорируем
  }
}

/**
 * Запускает систему автосохранения:
 * 1) Периодический flush каждые 30 секунд
 * 2) Flush при потере видимости/фокуса окна (пользователь свернул, переключился)
 * 3) Flush перед закрытием страницы (beforeunload)
 */
function startAutoSave() {
  // Периодический flush каждые 30 секунд
  const autoSaveInterval = setInterval(() => {
    if (_hydrationComplete) {
      flushStorageToDisk();
    }
  }, 30_000);

  // Flush когда вкладка/окно теряет видимость (пользователь свернул или переключился)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && _hydrationComplete) {
      console.log('[AutoSave] Visibility hidden — flushing...');
      flushStorageToDisk();
    }
  });

  // Flush при потере фокуса окна
  window.addEventListener('blur', () => {
    if (_hydrationComplete) {
      flushStorageToDisk();
    }
  });

  // Последний шанс — перед закрытием страницы
  window.addEventListener('beforeunload', () => {
    if (_hydrationComplete) {
      console.log('[AutoSave] beforeunload — flushing...');
      flushStorageToDisk();
    }
  });

  // Cleanup (на случай HMR в dev-режиме)
  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      clearInterval(autoSaveInterval);
    });
  }
}

// ===== STORE =====
export const useStore = create<AppStore>()(
  persist(
    (set, get) => ({
      // ===== АВТОРИЗАЦИЯ =====
      isAuthenticated: false,
      currentUser: null,
      users: defaultUsers,

      login: (username, password) => {
        const hashedPass = hashPassword(password);
        const user = get().users.find(
          (u) => u.username === username && u.password === hashedPass && u.isActive
        );
        if (user) {
          set({ isAuthenticated: true, currentUser: user });
          // Автоматически стартуем смену при входе
          const shift: Shift = {
            id: generateId(),
            userId: user.id,
            userName: user.displayName,
            startTime: Date.now(),
            endTime: null,
            isActive: true,
          };
          set({ currentShift: shift });
          return true;
        }
        return false;
      },

      logout: () => {
        const shift = get().currentShift;
        if (shift?.isActive) {
          get().endShift();
        }
        set({ isAuthenticated: false, currentUser: null, currentPage: 'dashboard' });
      },

      addUser: (username, password, displayName, role) => {
        const existing = get().users.find((u) => u.username === username);
        if (existing) return false;
        const currentUser = get().currentUser;
        const newUser: User = {
          id: generateId(),
          username,
          password: hashPassword(password),
          displayName,
          role,
          createdAt: Date.now(),
          createdBy: currentUser?.id || null,
          isActive: true,
        };
        set((state) => ({ users: [...state.users, newUser] }));
        return true;
      },

      updateUser: (id, updates) => {
        set((state) => ({
          users: state.users.map((u) => (u.id === id ? { ...u, ...updates } : u)),
        }));
      },

      changeUserPassword: (id, newPassword) => {
        set((state) => ({
          users: state.users.map((u) =>
            u.id === id ? { ...u, password: hashPassword(newPassword) } : u
          ),
        }));
      },

      removeUser: (id) => {
        set((state) => ({
          users: state.users.filter((u) => u.id !== id),
        }));
      },

      // ===== СМЕНЫ =====
      currentShift: null,
      shiftHistory: [],

      startShift: () => {
        const user = get().currentUser;
        if (!user) return;
        const shift: Shift = {
          id: generateId(),
          userId: user.id,
          userName: user.displayName,
          startTime: Date.now(),
          endTime: null,
          isActive: true,
        };
        set({ currentShift: shift });
      },

      endShift: () => {
        const shift = get().currentShift;
        if (!shift) return;
        const ended = { ...shift, endTime: Date.now(), isActive: false };
        set((state) => ({
          currentShift: null,
          shiftHistory: [ended, ...state.shiftHistory],
        }));
      },

      // ===== НАВИГАЦИЯ =====
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

        // Убрать бронь если запускаем забронированный стол
        const existingReservation = get().reservations.find((r) => r.tableId === tableId);
        if (existingReservation) {
          set((state) => ({
            reservations: state.reservations.filter((r) => r.tableId !== tableId),
          }));
        }

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
          date: localDateStr(),
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
              // КРИТИЧНО: не перетирать сохранённое состояние света при переподключении Arduino.
              // После reconnect Arduino обычно отдает STATUS: OFF для всех реле,
              // но мы должны восстановить память приложения (открытые столы/включённый свет).
              return { ...existing };
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

      // Восстановление состояния света при переподключении Arduino
      restoreLightsToArduino: () => {
        const tables = get().tables;
        if (!window.electronAPI?.arduino) {
          console.warn('[Arduino] API not available, cannot restore lights');
          return;
        }
        
        console.log('[Arduino] Restoring lights from memory...');
        let restoreCandidates = 0;
        
        tables.forEach((table) => {
          // Восстанавливаем свет если:
          // 1) он был включён в памяти ИЛИ
          // 2) стол занят активной сессией (должен быть освещён)
          const shouldBeOn = table.lightOn || table.status === 'occupied' || !!table.currentSession;
          if (shouldBeOn) {
            restoreCandidates++;
            window.electronAPI!.arduino!.setRelay(table.relayNumber, true)
              .then(() => {
                console.log(`[Arduino] ✅ Restored light for ${table.name} (relay ${table.relayNumber})`);
                // Синхронизируем UI-флаг света обратно в true
                set((state) => ({
                  tables: state.tables.map((t) =>
                    t.id === table.id ? { ...t, lightOn: true } : t
                  ),
                }));
              })
              .catch((err) => {
                console.error(`[Arduino] ❌ Failed to restore light for ${table.name}:`, err);
              });
          }
        });
        
        if (restoreCandidates > 0) {
          // Небольшая задержка чтобы команды успели отправиться
          setTimeout(() => {
            get().addToast('success', `Восстановлено состояние света: ${restoreCandidates} столов`);
          }, 500);
        }
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

      sellFromBar: (items) => {
        // Списать со склада
        items.forEach((i) => {
          if (i.menuItem.stock > 0) {
            set((state) => ({
              barMenu: state.barMenu.map((m) =>
                m.id === i.menuItem.id && m.stock > 0
                  ? { ...m, stock: Math.max(0, m.stock - i.quantity) }
                  : m
              ),
            }));
          }
        });

        const totalCost = items.reduce((sum, i) => sum + i.menuItem.price * i.quantity, 0);

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
          tableName: 'Бар (продажа)',
          mode: 'unlimited',
          startTime: Date.now(),
          endTime: Date.now(),
          duration: 0,
          tableCost: 0,
          barCost: totalCost,
          totalCost,
          date: localDateStr(),
        };

        set((state) => ({
          completedOrders: [...state.completedOrders, order],
          sessionHistory: [...state.sessionHistory, record],
        }));

        if (get().settings.soundEnabled) {
          playOrderSound();
        }
        get().addToast('success', `Продажа: ${totalCost.toLocaleString()} ${get().settings.currency}`);
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
        const today = localDateStr();
        const todaySessions = get().sessionHistory.filter((s) => s.date === today);
        const tableRev = todaySessions.reduce((sum, s) => sum + s.tableCost, 0);
        const barRev = todaySessions.reduce((sum, s) => sum + s.barCost, 0);
        return { table: tableRev, bar: barRev, total: tableRev + barRev };
      },

      getTodaySessions: () => {
        const today = localDateStr();
        return get().sessionHistory.filter((s) => s.date === today).length;
      },

      // ===== БРОНИРОВАНИЕ =====
      reservations: [],

      addReservation: (tableId, customerName, customerPhone, reservedFor, notes) => {
        const reservation: Reservation = {
          id: generateId(),
          tableId,
          customerName,
          customerPhone,
          reservedFor,
          createdAt: Date.now(),
          notes,
        };
        set((state) => ({
          reservations: [...state.reservations, reservation],
          tables: state.tables.map((t) =>
            t.id === tableId && t.status === 'free'
              ? { ...t, status: 'reserved' as const }
              : t
          ),
        }));
        const tableName = get().tables.find((t) => t.id === tableId)?.name || '';
        get().addToast('success', `${tableName} забронирован`);
      },

      cancelReservation: (reservationId) => {
        const reservation = get().reservations.find((r) => r.id === reservationId);
        if (!reservation) return;
        set((state) => ({
          reservations: state.reservations.filter((r) => r.id !== reservationId),
          tables: state.tables.map((t) =>
            t.id === reservation.tableId && t.status === 'reserved'
              ? { ...t, status: 'free' as const }
              : t
          ),
        }));
        get().addToast('info', 'Бронь отменена');
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
      storage: electronFileStorage,
      partialize: (state) => ({
        tables: state.tables,
        barOrders: state.barOrders,
        currentShift: state.currentShift,
        sessionHistory: state.sessionHistory,
        completedOrders: state.completedOrders,
        settings: state.settings,
        barMenu: state.barMenu,
        barCategories: state.barCategories,
        inventoryRevisions: state.inventoryRevisions,
        sidebarCollapsed: state.sidebarCollapsed,
        users: state.users,
        shiftHistory: state.shiftHistory,
        reservations: state.reservations,
      }),
      merge: (persistedState, currentState) => {
        // Если нет сохранённых данных — используем текущее состояние (дефолтное)
        if (!persistedState) {
          console.log('[Store] No persisted state found, using defaults');
          return currentState;
        }
        try {
          const persisted = persistedState as Partial<AppStore>;
          const merged = { ...currentState, ...persisted };
          // Авторизация всегда сбрасывается при перезапуске
          merged.isAuthenticated = false;
          merged.currentUser = null;
          merged.settings = {
            ...currentState.settings,
            ...(persisted.settings || {}),
            currency: 'тг',
          };
          // Если нет пользователей — используем дефолтных
          if (!persisted.users || persisted.users.length === 0) {
            merged.users = defaultUsers;
          }
          // Таблицы берём из persisted.tables (если есть), чтобы сохранялись:
          // - открытые/закрытые столы
          // - текущие сессии
          // - состояние света
          if (persisted.tables && persisted.tables.length > 0) {
            merged.tables = persisted.tables;
          } else if (persisted.settings?.tables) {
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
          // Восстановить статус забронированных столов
          if (persisted.reservations && persisted.reservations.length > 0) {
            const now = Date.now();
            // Убираем устаревшие брони (старше 24 часов от reservedFor)
            merged.reservations = persisted.reservations.filter(
              (r: Reservation) => r.reservedFor + 24 * 60 * 60 * 1000 > now
            );
            merged.reservations.forEach((r: Reservation) => {
              const table = merged.tables.find((t: BilliardTable) => t.id === r.tableId);
              if (table && table.status === 'free') {
                table.status = 'reserved';
              }
            });
          }
          console.log('[Store] Rehydrated from persistent storage');
          return merged as AppStore;
        } catch (err) {
          console.error('[Store] Merge error, using defaults:', err);
          return currentState;
        }
      },
      onRehydrateStorage: () => {
        console.log('[Store] Starting rehydration...');
        return (state, error) => {
          if (error) {
            console.error('[Store] Rehydration error:', error);
          } else {
            console.log('[Store] Rehydration complete, sessions:', state?.sessionHistory?.length ?? 0);
          }
          // Разрешаем запись ТОЛЬКО после завершения гидратации
          _hydrationComplete = true;
          console.log('[Store] Hydration flag set — writes enabled');
          // Запускаем систему автосохранения
          startAutoSave();
        };
      },
    }
  )
);
