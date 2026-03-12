// ===== АВТОРИЗАЦИЯ И ПОЛЬЗОВАТЕЛИ =====

export type UserRole = 'developer' | 'admin' | 'user';

export interface User {
  id: string;
  username: string;
  password: string; // хеш пароля (простой, для локального хранения)
  displayName: string;
  role: UserRole;
  createdAt: number;
  createdBy: string | null; // id пользователя-создателя
  isActive: boolean;
}

export interface Shift {
  id: string;
  userId: string;
  userName: string;
  startTime: number;
  endTime: number | null;
  isActive: boolean;
}

// ===== БИЛЬЯРДНЫЕ СТОЛЫ =====

export type TableStatus = 'free' | 'occupied' | 'reserved' | 'maintenance';

export type SessionMode = 'time' | 'amount' | 'unlimited';

export interface BilliardTable {
  id: number;
  name: string;
  relayNumber: number; // Реле Arduino (1-4)
  status: TableStatus;
  lightOn: boolean;
  pricePerHour: number;
  currentSession: TableSession | null;
}

export interface TableSession {
  id: string;
  tableId: number;
  startTime: number; // timestamp
  endTime: number | null;
  mode: SessionMode;
  plannedDuration: number | null; // в минутах (для mode='time')
  fixedAmount: number | null; // фиксированная сумма (для mode='amount')
  barOrders: BarOrderItem[];
  totalTableCost: number;
  totalBarCost: number;
  isPaid: boolean;
}

// ===== БАР =====

export type BarCategory = string; // кастомные категории

export interface BarCategoryConfig {
  id: string;
  name: string;
  icon: string;      // lucide icon name или URL картинки
  color: string;     // цвет категории (hex)
  sortOrder: number;
}

export interface BarMenuItem {
  id: string;
  name: string;
  categoryId: string;
  price: number;
  costPrice: number;      // себестоимость (для ревизий)
  available: boolean;
  image: string;           // URL картинки или data:URI
  stock: number;           // текущий остаток (-1 = без учёта)
  unit: string;            // единица: шт, мл, г
}

export interface BarOrderItem {
  id: string;
  menuItemId: string;
  menuItemName: string;
  quantity: number;
  price: number;
  timestamp: number;
}

export interface BarOrder {
  id: string;
  tableId: number | null; // null если заказ без стола
  items: BarOrderItem[];
  totalCost: number;
  timestamp: number;
  isPaid: boolean;
}

// ===== РЕВИЗИИ =====

export interface InventoryRevision {
  id: string;
  date: string;          // ISO date
  timestamp: number;
  items: InventoryRevisionItem[];
  notes: string;
}

export interface InventoryRevisionItem {
  menuItemId: string;
  menuItemName: string;
  expectedStock: number;   // ожидаемый остаток (расчётный)
  actualStock: number;     // фактический остаток (подсчёт)
  difference: number;      // разница
  costPrice: number;       // себестоимость единицы
}

// ===== ОТЧЁТЫ =====

export interface DailyReport {
  date: string;
  totalRevenue: number;
  tableRevenue: number;
  barRevenue: number;
  sessionsCount: number;
  totalHoursPlayed: number;
  barOrdersCount: number;
}

export interface SessionRecord {
  id: string;
  tableId: number;
  tableName: string;
  mode: SessionMode;
  startTime: number;
  endTime: number;
  duration: number; // минуты
  tableCost: number;
  barCost: number;
  totalCost: number;
  date: string;
}

// ===== НАСТРОЙКИ =====

export interface AppSettings {
  clubName: string;
  defaultPricePerHour: number;
  currency: string;
  theme: 'dark' | 'light';
  autoLightOff: boolean; // Автоматически выключать свет при завершении сессии
  soundEnabled: boolean;
  autoPrintReceipt: boolean; // Автоматически печатать чек при закрытии стола
  tables: TableSettings[];
}

export interface TableSettings {
  id: number;
  name: string;
  relayNumber: number;
  pricePerHour: number;
  isActive: boolean;
}

// ===== НАВИГАЦИЯ =====

export type PageType = 'dashboard' | 'bar' | 'reports' | 'settings' | 'users';

// ===== ТОСТЫ =====

export interface ToastMessage {
  id: string;
  type: 'success' | 'info' | 'warning' | 'error';
  message: string;
  duration?: number;
}
