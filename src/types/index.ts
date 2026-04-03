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
  tariffName?: string | null; // название выбранного тарифа (если сессия запущена по тарифу)
  plannedDuration: number | null; // в минутах (для mode='time')
  fixedAmount: number | null; // фиксированная сумма (для mode='amount')
  packagePrice: number | null; // фиксированная цена пакета/тарифа
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

// ===== БРОНИРОВАНИЕ =====

export interface Reservation {
  id: string;
  tableId: number;
  customerName: string;
  customerPhone: string;
  reservedFor: number; // timestamp — на какое время бронь
  createdAt: number;
  notes: string;
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
  tariffName?: string | null;
  startTime: number;
  endTime: number;
  duration: number; // минуты
  tableCost: number;
  barOrders?: BarOrderItem[];
  barCost: number;
  totalCost: number;
  date: string;
}

// ===== НАСТРОЙКИ =====

export interface AppSettings {
  clubName: string;
  receiptCompanyName: string;
  receiptCity: string;
  receiptPhone: string;
  receiptCashierName: string;
  defaultPricePerHour: number;
  currency: string;
  theme: 'dark' | 'light';
  autoLightOff: boolean; // Автоматически выключать свет при завершении сессии
  soundEnabled: boolean;
  autoPrintReceipt: boolean; // Автоматически печатать чек при закрытии стола
  silentPrint: boolean;      // Печатать без диалога выбора принтера (авто)
  savedPortPath: string | null; // Вручную сохранённый порт (приоритет при подключении)
  // Настройки размера чека
  receiptWidthMm: number;    // Ширина чека в мм (по умолчанию 80)
  receiptFontSize: number;   // Базовый размер шрифта в px (по умолчанию 14)
  receiptPaddingMm: number;  // Внутренний отступ в мм (по умолчанию 5)
  tables: TableSettings[];
}

export interface TableSettings {
  id: number;
  name: string;
  relayNumber: number;
  pricePerHour: number;
  isActive: boolean;
}

// ===== ТУРНИРЫ =====

export type TournamentStatus = 'draft' | 'active' | 'completed' | 'cancelled';

export type BracketType =
  | 'single-elimination'
  | 'double-elimination'
  | 'round-robin'
  | 'swiss'
  | 'group-playoff'
  | 'page-playoff';

export interface TournamentParticipant {
  id: string;
  name: string;
  firstName?: string;
  lastName?: string;
  birthDate?: string;
  birthYear?: number;
  phone?: string;
  photo?: string;
  tableNumber?: number;
  position: number;
}

export type MatchStatus = 'pending' | 'in-progress' | 'completed' | 'bye';

export interface TournamentMatch {
  id: string;
  round: number;
  matchNumber: number;
  participant1?: TournamentParticipant;
  participant2?: TournamentParticipant;
  winner?: TournamentParticipant;
  score1?: number;
  score2?: number;
  matchStatus?: MatchStatus;
  tableId?: number;
  tableNumber?: number;
  startTime?: number;
  endTime?: number;
}

export interface TournamentPrizePlace {
  place: number;
  prize: string;
}

export interface TournamentPlacement {
  place: number;
  participantId: string;
  participantName: string;
  prize?: string;
}

export interface Tournament {
  id: string;
  name: string;
  status: TournamentStatus;
  bracketType: BracketType;
  participantCountMode?: 'fixed' | 'min' | 'max';
  participantCount: number;
  participants: TournamentParticipant[];
  tableIds: number[]; // Столы, участвующие в турнире
  tableCount?: number; // Количество виртуальных столов для отображения
  matches: TournamentMatch[];
  currentRound?: number;
  winnerId?: string; // id победителя турнира
  prizePlaces?: TournamentPrizePlace[];
  placements?: TournamentPlacement[];
  scheduledStartTime?: number;
  startTime?: number;
  endTime?: number;
  prizeFund?: number;
  entryFee?: number;
}

// ===== ТАРИФЫ =====

export interface TariffMenuProduct {
  productId: string;
  productName: string;
  quantity: number;
}

export interface Tariff {
  id: string;
  name: string;
  tableIds: number[]; // Столы, к которым применяется тариф
  startTime: string; // HH:MM формат
  endTime: string; // HH:MM формат
  durationHours: number; // Продолжительность пакета в часах
  price: number; // Цена пакета
  menuProducts: TariffMenuProduct[]; // Дополнительные продукты из меню
  isActive: boolean;
  createdAt: number;
}

// ===== НАВИГАЦИЯ =====

export type PageType = 'dashboard' | 'bar' | 'reports' | 'settings' | 'users' | 'tournaments' | 'tariffs';

// ===== ТОСТЫ =====

export interface ToastMessage {
  id: string;
  type: 'success' | 'info' | 'warning' | 'error';
  message: string;
  duration?: number;
}
