// Полный тип стора. Вынесен отдельно, чтобы слайсы могли импортировать AppStore
// без циклической зависимости с useStore.ts.
import type {
  BilliardTable,
  BarMenuItem,
  BarOrder,
  BarCategoryConfig,
  InventoryRevision,
  InventoryRevisionItem,
  SessionRecord,
  AppSettings,
  PageType,
  SessionMode,
  PaymentMethod,
  ToastMessage,
  User,
  UserRole,
  Shift,
  Reservation,
  Tournament,
  Tariff,
} from '../types';

export interface AppStore {
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
  confirmEndShiftAndLogout: () => void;

  currentPage: PageType;
  setCurrentPage: (page: PageType) => void;
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;

  tables: BilliardTable[];
  startSession: (tableId: number, mode: SessionMode, options?: { hours?: number; minutes?: number; amount?: number; plannedDurationSeconds?: number; packagePrice?: number; tariffName?: string }) => void;
  endSession: (tableId: number, endTimeOverride?: number, paymentMethod?: PaymentMethod) => void;
  pauseSession: (tableId: number) => void;
  resumeSession: (tableId: number) => void;
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
  addBarOrderToTable: (tableId: number, menuItem: BarMenuItem, quantity: number, options?: { priceOverride?: number; silent?: boolean }) => void;
  createBarOrder: (tableId: number | null, items: { menuItem: BarMenuItem; quantity: number }[]) => void;
  sellFromBar: (items: { menuItem: BarMenuItem; quantity: number }[], paymentMethod?: PaymentMethod) => void;
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

  // Турниры
  tournaments: Tournament[];
  addTournament: (tournament: Tournament) => void;
  updateTournament: (id: string, updates: Partial<Tournament>) => void;
  removeTournament: (id: string) => void;

  // Тарифы
  tariffs: Tariff[];
  addTariff: (tariff: Tariff) => void;
  updateTariff: (id: string, updates: Partial<Tariff>) => void;
  removeTariff: (id: string) => void;

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
