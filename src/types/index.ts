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
  lastLoginAt?: number; // timestamp последнего входа (для сортировки на экране выбора)
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

// Способ оплаты (для разбивки выручки в отчётах/сверке кассы)
export type PaymentMethod = 'cash' | 'card' | 'transfer';

export interface TablePriceRule {
  id: string;
  startTime: string;
  endTime: string;
  pricePerHour: number;
}

export interface BilliardTable {
  id: number;
  name: string;
  relayNumber: number; // Реле Arduino (1-4)
  status: TableStatus;
  lightOn: boolean;
  pricePerHour: number;
  priceSchedule: TablePriceRule[];
  currentSession: TableSession | null;
}

export interface PauseInterval {
  start: number;       // timestamp начала паузы
  end: number | null;  // timestamp конца паузы (null — пауза ещё идёт)
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
  pausedAt: number | null;     // timestamp начала текущей паузы (null — игра идёт)
  totalPausedMs: number;       // суммарное время на паузе из завершённых пауз (мс)
  pauseIntervals: PauseInterval[]; // интервалы пауз (для точного расчёта по тарифной сетке)
  barOrders: BarOrderItem[];
  totalTableCost: number;
  totalBarCost: number;
  isPaid: boolean;
}

// ===== БАР =====

export type BarCategory = string; // кастомные категории

export type Department = 'bar' | 'kitchen';

export interface BarCategoryConfig {
  id: string;
  name: string;
  icon: string;      // lucide icon name или URL картинки
  color: string;     // цвет категории (hex)
  sortOrder: number;
  department?: Department; // 'bar' (напитки/снэки) или 'kitchen' (блюда). undefined = 'bar'
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
  totalCost: number;             // стол + бар (без сервисного сбора)
  serviceCharge?: number;        // сервисный сбор на момент продажи (0/undefined для старых записей)
  date: string;
  paymentMethod?: PaymentMethod; // как оплатили (по умолчанию наличные для старых записей)
}

// ===== ОТМЕНА ПОЗИЦИЙ (VOID) =====

// Откуда отменяется позиция:
//  - 'open-table'     — из открытого стола (живая сессия);
//  - 'quick-sale'     — из быстрой продажи без стола (record.tableId === 0);
//  - 'closed-session' — из уже закрытого стола (историческая запись).
export type CancelSource = 'open-table' | 'quick-sale' | 'closed-session';

// Данные подтверждения отмены (заполняет модалка ввода пароля + причины).
export interface CancelAuthMeta {
  authorizedById: string | null; // id пользователя, чьим паролем подтвердили отмену
  authorizedByName: string;      // отображаемое имя подтвердившего
  reason: string;                // обязательная причина отмены
}

// Запись журнала отмён — для подотчётности (кто, что, почему, когда).
export interface CancelLogEntry {
  id: string;
  itemName: string;
  quantity: number;
  amount: number;                // сумма отменённой позиции (price × quantity)
  source: CancelSource;
  tableId: number | null;
  tableName: string;
  recordId?: string;             // id записи в истории/продаже (для закрытых)
  cancelledById: string | null;  // кто выполнял отмену (текущий вошедший пользователь)
  cancelledByName: string;
  authorizedById: string | null; // чьим паролем подтвердили
  authorizedByName: string;
  reason: string;
  timestamp: number;
  date: string;                  // localDateStr — для фильтрации по периоду
}

// ===== НАСТРОЙКИ =====

export type AppLanguage = 'ru' | 'kk' | 'uz' | 'en';

export interface AppSettings {
  language: AppLanguage;        // язык интерфейса (по умолчанию 'ru')
  lastSeenVersion: string;      // последняя версия, для которой показали «Что нового»
  sidebarPinned: PageType[];    // закреплённые пункты бокового меню (остальные — в «Ещё»)
  userVisiblePages: PageType[]; // какие страницы видны роли 'user' (настраивает админ); dashboard всегда виден
  tablesViewMode: 'grid' | 'compact' | 'list'; // вид сетки столов на главной
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
  // ===== Процент за обслуживание (сервисный сбор) =====
  serviceChargeEnabled: boolean;  // добавлять процент за обслуживание к чеку (по умолчанию выключено)
  serviceChargePercent: number;   // процент за обслуживание, %
  // ===== Бар / Кухня =====
  kitchenSeparate: boolean;       // true — Кухня отдельной страницей; false — кухня внутри Бара
  autoPrintKitchenTicket: boolean; // Автоматически печатать заказ на кухню при пробитии блюда
  // ===== Принтеры (не должны пересекаться) =====
  receiptPrinterName: string;     // Принтер для чеков/пречеков (пусто = принтер по умолчанию)
  kitchenPrinterName: string;     // Принтер для заказов на кухню (xprinter)
  tables: TableSettings[];
}

export interface TableSettings {
  id: number;
  name: string;
  relayNumber: number;
  pricePerHour: number;
  priceSchedule: TablePriceRule[];
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

export type PageType = 'dashboard' | 'bar' | 'kitchen' | 'reports' | 'settings' | 'users' | 'tournaments' | 'tariffs' | 'knowledge';

// ===== ТОСТЫ =====

export interface ToastMessage {
  id: string;
  type: 'success' | 'info' | 'warning' | 'error';
  message: string;
  duration?: number;
}
