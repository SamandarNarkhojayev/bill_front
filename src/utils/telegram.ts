/**
 * Telegram-бот бильярдной — уведомления + интерактивный просмотр данных по кнопкам.
 *
 * Полностью бессерверно: десктоп-приложение само работает с Telegram Bot API
 * (https://api.telegram.org/bot<token>/...). Поскольку приложение в клубе всегда
 * запущено, оно держит long-polling (getUpdates) и отвечает на нажатия кнопок —
 * владелец в любой момент открывает бота и смотрит «Сегодня / Столы / Смена /
 * Товары бара / Последние сессии». Дополнительно бот push-ит события (смена, столы,
 * сессии, ежедневный итог, низкий остаток). Сервер biliardo.kz (cloudSync) при
 * этом продолжает работать — Telegram это отдельный канал.
 *
 * Модель: у КАЖДОЙ бильярдной свой бот.
 *  1. Владелец создаёт бота через @BotFather, копирует токен.
 *  2. Разработчик вписывает токен + задаёт КОД ДОСТУПА в Настройки → «Telegram-бот».
 *  3. Сотрудник открывает бота и вводит «/start <код>» — только с верным кодом чат
 *     авторизуется (добавляется в config.authorizedChats). Можно подключить несколько
 *     чатов; все авторизованные видят кнопки и получают push. Уже подключённые ранее
 *     чаты мигрируют из legacy chatId и сохраняются без повторного ввода кода.
 *
 * Конфиг хранится в localStorage (НЕ в store — чтобы не было цикла импортов).
 * Данные для бота отдаёт reportProvider/dataProvider, зарегистрированные из App.tsx.
 */

const STORAGE_KEY_CONFIG = 'telegram.config';
const STORAGE_KEY_DAILY_SENT = 'telegram.lastDailySent';

const API_BASE = 'https://api.telegram.org';
const REQUEST_TIMEOUT_MS = 10_000;
const POLL_TIMEOUT_SEC = 30;             // long-poll окно getUpdates
const POLL_ABORT_MS = (POLL_TIMEOUT_SEC + 10) * 1000;
const SCHEDULER_TICK_MS = 30_000;

// ===== Типы конфигурации =====
export type TelegramEvent = 'shiftClose' | 'tableLoad' | 'sessionEnd' | 'dailySummary' | 'lowStock';

export interface TelegramEventToggles {
  shiftClose: boolean;
  tableLoad: boolean;
  sessionEnd: boolean;
  dailySummary: boolean;
  lowStock: boolean;
}

export interface AuthorizedChat {
  id: string;
  title: string;
  linkedAt: number;
}

export interface TelegramConfig {
  enabled: boolean;
  botToken: string;
  botUsername: string;       // @username бота (для deep-link); заполняется через getMe
  chatId: string;            // legacy «основной» чат (первый привязанный) — для обратной совместимости
  chatTitle: string;
  accessCode: string;        // код доступа: чат авторизуется только через «/start <код>» (задаёт разработчик)
  authorizedChats: AuthorizedChat[]; // все авторизованные чаты — им доступны кнопки и push
  events: TelegramEventToggles;
  dailySummaryTime: string;
  lowStockThreshold: number;
}

const DEFAULT_CONFIG: TelegramConfig = {
  enabled: false,
  botToken: '',
  botUsername: '',
  chatId: '',
  chatTitle: '',
  accessCode: '',
  authorizedChats: [],
  events: {
    shiftClose: true,
    tableLoad: false,
    sessionEnd: false,
    dailySummary: true,
    lowStock: true,
  },
  dailySummaryTime: '23:00',
  lowStockThreshold: 5,
};

export interface TelegramStatus {
  enabled: boolean;
  configured: boolean;       // токен И хотя бы один авторизованный чат
  hasToken: boolean;
  hasAccessCode: boolean;    // задан ли код доступа
  botUsername: string;
  chatTitle: string;
  authorizedChats: AuthorizedChat[];
  polling: boolean;          // бот слушает кнопки
  lastSentAt: number | null;
  lastError: string | null;
  sending: boolean;
}

// ===== Состояние модуля =====
let config: TelegramConfig = loadConfig();
let lastSentAt: number | null = null;
let lastError: string | null = null;
let sending = false;
let schedulerTimer: ReturnType<typeof setInterval> | null = null;

// Polling
let polling = false;
let pollGen = 0;
let pollOffset = 0;
let pollAbort: AbortController | null = null;

// Провайдеры данных (регистрируются из App.tsx со ссылкой на store).
let reportProvider: (() => DailySummaryPayload | null) | null = null;
let dataProvider: (() => BotData | null) | null = null;

const notifiedLowStock = new Set<string>();
const listeners = new Set<(status: TelegramStatus) => void>();

function loadConfig(): TelegramConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CONFIG);
    if (!raw) return { ...DEFAULT_CONFIG };
    const parsed = JSON.parse(raw) as Partial<TelegramConfig>;
    const merged: TelegramConfig = {
      ...DEFAULT_CONFIG,
      ...parsed,
      events: { ...DEFAULT_CONFIG.events, ...(parsed.events ?? {}) },
      authorizedChats: Array.isArray(parsed.authorizedChats) ? parsed.authorizedChats : [],
    };
    // Миграция: у существующих установок был один привязанный chatId. Переносим его
    // в список авторизованных чатов — уже подключённые аккаунты сохраняются и
    // продолжают работать без ввода кода.
    if (merged.authorizedChats.length === 0 && merged.chatId) {
      merged.authorizedChats = [{ id: merged.chatId, title: merged.chatTitle || merged.chatId, linkedAt: Date.now() }];
    }
    return merged;
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function saveConfig(): void {
  try { localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(config)); } catch { /* ignore */ }
}

function emit(): void {
  const status = getStatus();
  for (const fn of listeners) fn(status);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ===== Публичный конфиг API =====
export function getConfig(): TelegramConfig {
  return { ...config, events: { ...config.events }, authorizedChats: config.authorizedChats.map((c) => ({ ...c })) };
}

export function setConfig(patch: Partial<TelegramConfig>): TelegramConfig {
  config = {
    ...config,
    ...patch,
    events: { ...config.events, ...(patch.events ?? {}) },
  };
  saveConfig();
  reconcilePolling();
  emit();
  return getConfig();
}

export function isConfigured(): boolean {
  return !!config.botToken && config.authorizedChats.length > 0;
}

export function getStatus(): TelegramStatus {
  return {
    enabled: config.enabled,
    configured: isConfigured(),
    hasToken: !!config.botToken,
    hasAccessCode: !!config.accessCode,
    botUsername: config.botUsername,
    chatTitle: config.chatTitle,
    authorizedChats: config.authorizedChats.map((c) => ({ ...c })),
    polling,
    lastSentAt,
    lastError,
    sending,
  };
}

export function subscribe(fn: (status: TelegramStatus) => void): () => void {
  listeners.add(fn);
  fn(getStatus());
  return () => { listeners.delete(fn); };
}

// ===== Низкоуровневый вызов Bot API =====
interface TgApiResult<T> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
}

async function tgApi<T>(token: string, method: string, params?: Record<string, unknown>, timeoutMs = REQUEST_TIMEOUT_MS): Promise<TgApiResult<T>> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_BASE}/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params ?? {}),
      signal: controller.signal,
    });
    return await res.json().catch(() => ({ ok: false, description: `HTTP ${res.status}` })) as TgApiResult<T>;
  } catch (err) {
    return { ok: false, description: (err as Error).message || 'network error' };
  } finally {
    clearTimeout(timeoutId);
  }
}

// ===== Клавиатура (reply keyboard — кнопки в самой клавиатуре Telegram) =====
interface KeyboardButton { text: string; }
interface ReplyKeyboard {
  keyboard: KeyboardButton[][];
  resize_keyboard?: boolean;
  is_persistent?: boolean;
  input_field_placeholder?: string;
}

async function rawSend(chatId: string | number, text: string, replyMarkup?: ReplyKeyboard): Promise<TgApiResult<{ message_id: number }>> {
  return tgApi(config.botToken, 'sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    reply_markup: replyMarkup,
  });
}

async function answerCallback(id: string, text?: string): Promise<void> {
  await tgApi(config.botToken, 'answerCallbackQuery', { callback_query_id: id, text });
}

/** Отправляет текстовый файл (CSV) в чат через sendDocument (multipart/form-data). */
async function sendDocument(chatId: string | number, filename: string, content: string): Promise<boolean> {
  if (!config.botToken) return false;
  // BOM, чтобы Excel корректно открыл UTF-8 кириллицу.
  const blob = new Blob(['﻿' + content], { type: 'text/csv;charset=utf-8' });
  const form = new FormData();
  form.append('chat_id', String(chatId));
  form.append('document', blob, filename);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30_000);
  try {
    const res = await fetch(`${API_BASE}/bot${config.botToken}/sendDocument`, {
      method: 'POST',
      body: form,
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({ ok: false })) as { ok: boolean };
    return !!data.ok;
  } catch (err) {
    console.warn('[telegram] sendDocument failed:', err);
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ===== Отправка push-сообщения (на сохранённый chatId) =====
async function sendMessage(text: string): Promise<{ ok: boolean; error?: string }> {
  if (!config.enabled) return { ok: false, error: 'disabled' };
  if (!isConfigured()) return { ok: false, error: 'not configured' };
  sending = true;
  emit();
  // Рассылаем во ВСЕ авторизованные чаты. Успех, если доставлено хотя бы в один.
  let anyOk = false;
  let lastErr: string | null = null;
  for (const chat of config.authorizedChats) {
    const res = await rawSend(chat.id, text);
    if (res.ok) anyOk = true;
    else lastErr = res.description || 'send failed';
  }
  sending = false;
  if (anyOk) {
    lastSentAt = Date.now();
    lastError = null;
    emit();
    return { ok: true };
  }
  lastError = lastErr || 'send failed';
  console.warn('[telegram] sendMessage failed:', lastError);
  emit();
  return { ok: false, error: lastError };
}

// ===== getMe / проверка токена =====
async function refreshBotInfo(): Promise<void> {
  if (!config.botToken) return;
  const res = await tgApi<{ username?: string }>(config.botToken, 'getMe');
  if (res.ok && res.result?.username && res.result.username !== config.botUsername) {
    config.botUsername = res.result.username;
    saveConfig();
    emit();
  }
}

// Регистрирует список команд бота (меню «/» в Telegram).
async function registerBotCommands(): Promise<void> {
  if (!config.botToken) return;
  await tgApi(config.botToken, 'setMyCommands', {
    commands: [
      { command: 'keyboard', description: 'Показать клавиатуру с кнопками' },
      { command: 'menu', description: 'Главное меню' },
      { command: 'start', description: 'Запуск / ввод кода доступа' },
    ],
  });
}

export async function checkToken(token: string): Promise<{ ok: true; username: string } | { ok: false; error: string }> {
  const t = token.trim();
  if (!t) return { ok: false, error: 'Токен не задан' };
  const res = await tgApi<{ username?: string; first_name?: string }>(t, 'getMe');
  if (res.ok && res.result) {
    const username = res.result.username || res.result.first_name || 'bot';
    if (res.result.username) setConfig({ botUsername: res.result.username });
    return { ok: true, username };
  }
  return { ok: false, error: res.description || 'Неверный токен' };
}

export async function sendTestMessage(): Promise<{ ok: boolean; error?: string }> {
  if (!isConfigured()) return { ok: false, error: 'Не задан токен или чат (нажмите «Старт» в боте)' };
  const wasEnabled = config.enabled;
  if (!wasEnabled) config.enabled = true;
  const res = await sendMessage('✅ <b>Проверка связи прошла успешно</b>\nОткройте меню командой /menu.');
  if (!wasEnabled) config.enabled = false;
  emit();
  return res;
}

// ===== Хелперы форматирования =====
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function fmtMoney(n: number, currency: string): string {
  const v = Math.round(Number.isFinite(n) ? n : 0);
  return `${v.toLocaleString('ru-RU')} ${currency}`;
}
function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}
function fmtDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return h > 0 ? `${h} ч ${mm} мин` : `${mm} мин`;
}
function header(clubName?: string): string {
  return clubName ? `🎱 <b>${escapeHtml(clubName)}</b>\n` : '';
}
function canNotify(event: TelegramEvent): boolean {
  return config.enabled && config.events[event] && isConfigured();
}

// ===== Payload-типы для push-уведомлений =====
export interface ShiftClosedPayload {
  operatorName: string; startTime: number; endTime: number;
  tableRevenue: number; barRevenue: number; totalRevenue: number;
  sessionsCount: number; currency: string; clubName?: string;
}
export interface TableLoadPayload {
  tableName: string; action: 'occupied' | 'free';
  occupied: number; total: number; clubName?: string;
}
export interface SessionEndedPayload {
  tableName: string; durationMinutes: number;
  tableCost: number; barCost: number; totalCost: number;
  currency: string; tariffName?: string | null; clubName?: string;
}
export interface DailySummaryPayload {
  date: string; tableRevenue: number; barRevenue: number; totalRevenue: number;
  sessionsCount: number; currency: string; clubName?: string;
}
export interface LowStockItem { id: string; name: string; stock: number; unit: string; }

// ===== push-уведомления (вызываются из store) =====
export function notifyShiftClosed(p: ShiftClosedPayload): void {
  if (!canNotify('shiftClose')) return;
  const text =
    header(p.clubName) +
    `🧾 <b>Смена закрыта</b>\n` +
    `Оператор: ${escapeHtml(p.operatorName)}\n` +
    `⏱ ${fmtTime(p.startTime)}–${fmtTime(p.endTime)}\n` +
    `🎱 Стол: ${fmtMoney(p.tableRevenue, p.currency)}\n` +
    `🍹 Бар: ${fmtMoney(p.barRevenue, p.currency)}\n` +
    `💰 Итого: <b>${fmtMoney(p.totalRevenue, p.currency)}</b>\n` +
    `Сессий: ${p.sessionsCount}`;
  void sendMessage(text);
}

export function notifyTableLoad(p: TableLoadPayload): void {
  if (!canNotify('tableLoad')) return;
  const icon = p.action === 'occupied' ? '🟢' : '⚪️';
  const verb = p.action === 'occupied' ? 'занят' : 'освобождён';
  const text =
    header(p.clubName) +
    `${icon} <b>${escapeHtml(p.tableName)}</b> ${verb}\n` +
    `Загрузка: ${p.occupied}/${p.total} столов`;
  void sendMessage(text);
}

export function notifySessionEnded(p: SessionEndedPayload): void {
  if (!canNotify('sessionEnd')) return;
  const tariff = p.tariffName ? `\nТариф: ${escapeHtml(p.tariffName)}` : '';
  const text =
    header(p.clubName) +
    `⏹ <b>Сессия завершена</b> — ${escapeHtml(p.tableName)}${tariff}\n` +
    `Длительность: ${fmtDuration(p.durationMinutes)}\n` +
    `🎱 ${fmtMoney(p.tableCost, p.currency)} · 🍹 ${fmtMoney(p.barCost, p.currency)}\n` +
    `Итого: <b>${fmtMoney(p.totalCost, p.currency)}</b>`;
  void sendMessage(text);
}

function notifyDailySummary(p: DailySummaryPayload): void {
  if (!canNotify('dailySummary')) return;
  void sendMessage(buildTodayText({
    clubName: p.clubName ?? '',
    currency: p.currency,
    today: { date: p.date, tableRevenue: p.tableRevenue, barRevenue: p.barRevenue, totalRevenue: p.totalRevenue, sessionsCount: p.sessionsCount },
  }, '📊 <b>Итог за день</b>'));
}

export function checkLowStock(items: LowStockItem[], clubName?: string): void {
  const threshold = config.lowStockThreshold;
  const fresh: LowStockItem[] = [];
  for (const item of items) {
    if (typeof item.stock !== 'number' || item.stock < 0) { notifiedLowStock.delete(item.id); continue; }
    if (item.stock <= threshold) {
      if (!notifiedLowStock.has(item.id)) { notifiedLowStock.add(item.id); fresh.push(item); }
    } else {
      notifiedLowStock.delete(item.id);
    }
  }
  if (fresh.length === 0) return;
  if (!canNotify('lowStock')) return;
  const lines = fresh.map((i) => `• ${escapeHtml(i.name)}: <b>${i.stock}</b> ${escapeHtml(i.unit || 'шт')}`);
  void sendMessage(header(clubName) + `⚠️ <b>Низкий остаток</b> (порог ${threshold})\n` + lines.join('\n'));
}

// ===== Данные для интерактивного бота =====
export interface BotTableInfo {
  name: string;
  status: 'free' | 'occupied' | 'reserved' | 'maintenance';
  elapsedMin?: number;
  currentCost?: number;
  paused?: boolean;
}
export interface BotShiftInfo {
  operatorName: string; startTime: number;
  tableRevenue: number; barRevenue: number; total: number; sessionsCount: number;
}
export interface BotStockInfo {
  name: string;
  stock: number;        // остаток; -1 = без учёта
  unit: string;
  price: number;
  category: string;     // название категории (для группировки в боте)
  available: boolean;
}
export interface BotSessionInfo { tableName: string; durationMin: number; total: number; endTime: number; }
export interface BotRevenueAgg { tableRevenue: number; barRevenue: number; totalRevenue: number; sessionsCount: number; }
export interface BotTableAgg { name: string; sessions: number; revenue: number; }
export interface BotData {
  clubName: string;
  currency: string;
  today: { date: string } & BotRevenueAgg;
  week: BotRevenueAgg;          // последние 7 дней
  month: BotRevenueAgg;         // текущий календарный месяц
  perTable: BotTableAgg[];      // разбивка по столам за сегодня
  tables: BotTableInfo[];
  occupied: number;
  total: number;
  shift: BotShiftInfo | null;
  stock: BotStockInfo[];
  recent: BotSessionInfo[];
}

// Провайдер CSV-экспорта (например, за текущий месяц), регистрируется из App.tsx.
let exportProvider: (() => { filename: string; csv: string } | null) | null = null;

export function setReportProvider(fn: () => DailySummaryPayload | null): void { reportProvider = fn; }
export function setDataProvider(fn: () => BotData | null): void { dataProvider = fn; }
export function setExportProvider(fn: () => { filename: string; csv: string } | null): void { exportProvider = fn; }

// ===== Рендер разделов бота =====
const SEP = '━━━━━━━━━━━━━';

function buildTodayText(d: Pick<BotData, 'clubName' | 'currency' | 'today'>, title = '📊 <b>Сегодня</b>'): string {
  return (
    header(d.clubName) +
    `${title} · ${escapeHtml(d.today.date)}\n${SEP}\n` +
    `🎱 Столы:  ${fmtMoney(d.today.tableRevenue, d.currency)}\n` +
    `🍹 Бар:    ${fmtMoney(d.today.barRevenue, d.currency)}\n` +
    `💰 <b>Итого:  ${fmtMoney(d.today.totalRevenue, d.currency)}</b>\n` +
    `🧾 Сессий: ${d.today.sessionsCount}`
  );
}

function tableIcon(status: BotTableInfo['status']): string {
  switch (status) {
    case 'occupied': return '🟢';
    case 'reserved': return '🟡';
    case 'maintenance': return '🛠';
    default: return '⚪️';
  }
}

function buildTablesText(d: BotData): string {
  const lines = d.tables.map((t) => {
    if (t.status === 'occupied') {
      const dur = t.elapsedMin != null ? fmtDuration(t.elapsedMin) : '';
      const cost = t.currentCost != null ? ` · ${fmtMoney(t.currentCost, d.currency)}` : '';
      const pause = t.paused ? ' ⏸' : '';
      return `${tableIcon(t.status)} ${escapeHtml(t.name)} — ${dur}${cost}${pause}`;
    }
    const label = t.status === 'reserved' ? 'бронь' : t.status === 'maintenance' ? 'обслуживание' : 'свободен';
    return `${tableIcon(t.status)} ${escapeHtml(t.name)} — ${label}`;
  });
  return (
    header(d.clubName) +
    `🎱 <b>Столы</b> · занято ${d.occupied}/${d.total}\n${SEP}\n` +
    (lines.length ? lines.join('\n') : 'Нет столов')
  );
}

function buildShiftText(d: BotData): string {
  if (!d.shift) {
    return header(d.clubName) + `🧾 <b>Смена</b>\n${SEP}\nСмена не открыта.`;
  }
  const s = d.shift;
  return (
    header(d.clubName) +
    `🧾 <b>Текущая смена</b>\n${SEP}\n` +
    `👤 Оператор: ${escapeHtml(s.operatorName)}\n` +
    `🕐 Открыта: ${fmtTime(s.startTime)}\n` +
    `🎱 Стол: ${fmtMoney(s.tableRevenue, d.currency)}\n` +
    `🍹 Бар: ${fmtMoney(s.barRevenue, d.currency)}\n` +
    `💰 <b>Итого: ${fmtMoney(s.total, d.currency)}</b>\n` +
    `Сессий: ${s.sessionsCount}`
  );
}

function buildStockText(d: BotData): string {
  if (d.stock.length === 0) {
    return header(d.clubName) + `🍹 <b>Товары бара</b>\n${SEP}\nМеню пустое.`;
  }
  const threshold = config.lowStockThreshold;
  const MAX = 50; // держим сообщение в пределах лимита Telegram (4096 символов)
  const shown = d.stock.slice(0, MAX);
  const lines: string[] = [];
  let lastCat = '';
  for (const i of shown) {
    if (i.category !== lastCat) {
      lastCat = i.category;
      if (lines.length) lines.push(''); // пустая строка между группами категорий
      lines.push(`📁 <b>${escapeHtml(i.category)}</b>`);
    }
    const tracked = typeof i.stock === 'number' && i.stock >= 0;
    // 🚫 недоступен · ▫️ без учёта остатка · ⚠️ низкий остаток · ✅ в наличии
    const mark = !i.available ? '🚫' : !tracked ? '▫️' : i.stock <= threshold ? '⚠️' : '✅';
    const left = tracked ? `${i.stock} ${escapeHtml(i.unit || 'шт')}` : '∞';
    lines.push(`  ${mark} ${escapeHtml(i.name)} — ${fmtMoney(i.price, d.currency)} · ост. ${left}`);
  }
  const more = d.stock.length > MAX ? `\n\n…ещё ${d.stock.length - MAX} поз.` : '';
  return (
    header(d.clubName) +
    `🍹 <b>Товары бара</b> · ${d.stock.length} поз. (порог ⚠️ ${threshold})\n${SEP}\n` +
    lines.join('\n') +
    more
  );
}

function buildRecentText(d: BotData): string {
  if (d.recent.length === 0) {
    return header(d.clubName) + `📒 <b>Последние сессии</b>\n${SEP}\nПока нет завершённых сессий.`;
  }
  const lines = d.recent.map((r) =>
    `${fmtTime(r.endTime)} · ${escapeHtml(r.tableName)} · ${fmtDuration(r.durationMin)} · ${fmtMoney(r.total, d.currency)}`,
  );
  return header(d.clubName) + `📒 <b>Последние сессии</b>\n${SEP}\n` + lines.join('\n');
}

function buildAggText(d: BotData, title: string, agg: BotRevenueAgg): string {
  return (
    header(d.clubName) +
    `${title}\n${SEP}\n` +
    `🎱 Стол: ${fmtMoney(agg.tableRevenue, d.currency)}\n` +
    `🍹 Бар: ${fmtMoney(agg.barRevenue, d.currency)}\n` +
    `💰 <b>Всего: ${fmtMoney(agg.totalRevenue, d.currency)}</b>\n` +
    `🧾 Сессий: ${agg.sessionsCount}`
  );
}

function buildPerTableText(d: BotData): string {
  if (d.perTable.length === 0) {
    return header(d.clubName) + `🏓 <b>По столам (сегодня)</b>\n${SEP}\nПока нет данных за сегодня.`;
  }
  const rows = [...d.perTable]
    .sort((a, b) => b.revenue - a.revenue)
    .map((r) => `${escapeHtml(r.name)} — ${fmtMoney(r.revenue, d.currency)} (${r.sessions})`);
  return header(d.clubName) + `🏓 <b>По столам (сегодня)</b>\n${SEP}\n` + rows.join('\n');
}

function mainMenuText(d: BotData | null): string {
  const club = d?.clubName ? `🎱 <b>${escapeHtml(d.clubName)}</b>\n` : '';
  const occ = d ? `\nЗагрузка столов: <b>${d.occupied}/${d.total}</b>` : '';
  const rev = d ? `\nВыручка сегодня: <b>${fmtMoney(d.today.totalRevenue, d.currency)}</b>` : '';
  return club + `🤖 <b>Главное меню</b>${occ}${rev}\n\nВыберите раздел кнопкой ниже:`;
}

// Кнопки меню в порядке отображения. Из этого списка строится и reply-клавиатура,
// и обратный маппинг «текст кнопки → раздел» (reply-кнопка присылает свой текст сообщением).
const MENU_BUTTONS: { label: string; section: string }[] = [
  { label: '📊 Сегодня', section: 'today' },
  { label: '🎱 Столы', section: 'tables' },
  { label: '📅 Неделя', section: 'week' },
  { label: '🗓 Месяц', section: 'month' },
  { label: '🏓 По столам', section: 'pertable' },
  { label: '🧾 Смена', section: 'shift' },
  { label: '🍹 Товары бара', section: 'stock' },
  { label: '📒 Сессии', section: 'recent' },
  { label: '📄 Экспорт CSV', section: 'csv' },
  { label: '🏠 Меню', section: 'menu' },
];

// Постоянная клавиатура снизу (кнопки «в самой клавиатуре» Telegram) — по 2 в ряд.
function mainReplyKeyboard(): ReplyKeyboard {
  const rows: KeyboardButton[][] = [];
  for (let i = 0; i < MENU_BUTTONS.length; i += 2) {
    rows.push(MENU_BUTTONS.slice(i, i + 2).map((b) => ({ text: b.label })));
  }
  return { keyboard: rows, resize_keyboard: true, is_persistent: true, input_field_placeholder: 'Выберите раздел…' };
}

// Текст reply-кнопки → id раздела (null, если это не кнопка меню).
function sectionForText(text: string): string | null {
  const t = (text || '').trim();
  return MENU_BUTTONS.find((b) => b.label === t)?.section ?? null;
}

function renderSection(section: string): { text: string; markup: ReplyKeyboard } {
  const d = dataProvider ? dataProvider() : null;
  const markup = mainReplyKeyboard();
  if (section === 'menu' || !d) return { text: mainMenuText(d), markup };
  switch (section) {
    case 'today': return { text: buildTodayText(d), markup };
    case 'week': return { text: buildAggText(d, '📅 <b>За неделю</b>', d.week), markup };
    case 'month': return { text: buildAggText(d, '🗓 <b>За месяц</b>', d.month), markup };
    case 'pertable': return { text: buildPerTableText(d), markup };
    case 'tables': return { text: buildTablesText(d), markup };
    case 'shift': return { text: buildShiftText(d), markup };
    case 'stock': return { text: buildStockText(d), markup };
    case 'recent': return { text: buildRecentText(d), markup };
    default: return { text: mainMenuText(d), markup };
  }
}

// ===== Обработка апдейтов =====
interface TgChat { id: number; type: string; title?: string; username?: string; first_name?: string; }
interface TgUpdate {
  update_id: number;
  message?: { chat: TgChat; text?: string };
  callback_query?: { id: string; data?: string; message?: { chat: TgChat; message_id: number } };
}

function chatDisplayName(chat: TgChat): string {
  if (chat.title) return chat.title;
  if (chat.first_name) return chat.first_name;
  if (chat.username) return '@' + chat.username;
  return `chat ${chat.id}`;
}

function isAuthorized(chat: TgChat): boolean {
  const id = String(chat.id);
  return config.authorizedChats.some((c) => c.id === id);
}

// Извлекает код из сообщения: «/start 1234», «/start@Bot 1234» или просто «1234».
function extractAccessCode(text: string): string {
  const t = (text || '').trim();
  const m = t.match(/^\/start(?:@[\w_]+)?\s*(.*)$/i);
  return (m ? m[1] : t).trim();
}

// Авторизует чат (добавляет в список). Первый привязанный остаётся «основным» (chatId).
function authorizeChat(chat: TgChat): void {
  const id = String(chat.id);
  if (config.authorizedChats.some((c) => c.id === id)) return;
  config.authorizedChats = [...config.authorizedChats, { id, title: chatDisplayName(chat), linkedAt: Date.now() }];
  if (!config.chatId) { config.chatId = id; config.chatTitle = chatDisplayName(chat); }
  saveConfig();
  emit();
}

/** Убрать один авторизованный чат по id. */
export function removeAuthorizedChat(id: string): void {
  const authorizedChats = config.authorizedChats.filter((c) => c.id !== id);
  // Если удалили «основной» — назначаем основным первый из оставшихся.
  const chatId = config.chatId === id ? (authorizedChats[0]?.id ?? '') : config.chatId;
  const chatTitle = config.chatId === id ? (authorizedChats[0]?.title ?? '') : config.chatTitle;
  setConfig({ authorizedChats, chatId, chatTitle });
}

/** Отвязать ВСЕ чаты — доступ придётся получать заново через «/start <код>». */
export function unlinkChat(): void {
  setConfig({ authorizedChats: [], chatId: '', chatTitle: '' });
}

// Экспорт CSV: шлём файл документом. reply-клавиатура остаётся видимой сама по себе.
async function handleCsv(chatId: string | number): Promise<void> {
  const exp = exportProvider ? exportProvider() : null;
  if (!exp) { await rawSend(chatId, 'Нет данных для экспорта.', mainReplyKeyboard()); return; }
  const ok = await sendDocument(chatId, exp.filename, exp.csv);
  if (!ok) await rawSend(chatId, 'Не удалось отправить файл.', mainReplyKeyboard());
}

async function handleUpdate(upd: TgUpdate): Promise<void> {
  if (upd.message?.chat) {
    const chat = upd.message.chat;
    // Уже авторизован — обрабатываем нажатие reply-кнопки (её текст приходит сообщением).
    if (isAuthorized(chat)) {
      const raw = (upd.message.text || '').trim();
      // Команда /keyboard — заново показать клавиатуру с кнопками (если её скрыли).
      const command = raw.split(/\s+/)[0].replace(/@[\w_]+$/, '').toLowerCase();
      if (command === '/keyboard') {
        await rawSend(chat.id, '⌨️ Клавиатура открыта. Выберите раздел кнопкой ниже.', mainReplyKeyboard());
        return;
      }
      const section = sectionForText(raw);
      if (section === 'csv') { await handleCsv(chat.id); return; }
      // кнопка меню → раздел; /start, /menu или любой другой текст → главное меню
      const { text, markup } = renderSection(section ?? 'menu');
      await rawSend(chat.id, text, markup);
      return;
    }
    // Не авторизован — доступ только по коду «/start <код>».
    if (!config.accessCode) {
      await rawSend(chat.id, '🔒 Доступ по коду. Код ещё не задан — обратитесь к разработчику приложения.');
      return;
    }
    const code = extractAccessCode(upd.message.text || '');
    if (code && code === config.accessCode) {
      authorizeChat(chat);
      const { text, markup } = renderSection('menu');
      await rawSend(chat.id, '✅ <b>Доступ открыт.</b>\n' + text, markup);
      return;
    }
    // Кода нет или он неверный.
    await rawSend(
      chat.id,
      '🔒 <b>Доступ только по коду.</b>\nОтправьте: <code>/start КОД</code>\nКод выдаёт администратор клуба.',
    );
    return;
  }
  if (upd.callback_query) {
    // Совместимость: старые inline-кнопки, оставшиеся в истории чата. Основной способ
    // теперь reply-клавиатура, поэтому просто отвечаем на callback и присылаем раздел
    // новым сообщением с reply-клавиатурой (reply-клавиатуру нельзя прикрепить к editMessageText).
    const cq = upd.callback_query;
    const chat = cq.message?.chat;
    if (!chat || !cq.message) { await answerCallback(cq.id); return; }
    if (!isAuthorized(chat)) { await answerCallback(cq.id, 'Нет доступа'); return; }
    await answerCallback(cq.id);
    if (cq.data === 'csv') { await handleCsv(chat.id); return; }
    const { text, markup } = renderSection(cq.data || 'menu');
    await rawSend(chat.id, text, markup);
    return;
  }
}

// ===== Long-polling =====
async function pollLoop(gen: number): Promise<void> {
  let backoff = 1000;
  while (polling && gen === pollGen) {
    if (!config.enabled || !config.botToken) break;
    pollAbort = new AbortController();
    const timeoutId = setTimeout(() => pollAbort?.abort(), POLL_ABORT_MS);
    try {
      const res = await fetch(`${API_BASE}/bot${config.botToken}/getUpdates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          offset: pollOffset || undefined,
          timeout: POLL_TIMEOUT_SEC,
          allowed_updates: ['message', 'callback_query'],
        }),
        signal: pollAbort.signal,
      });
      const data = await res.json().catch(() => ({ ok: false })) as TgApiResult<TgUpdate[]>;
      if (data.ok && Array.isArray(data.result)) {
        backoff = 1000;
        if (lastError) { lastError = null; emit(); }
        for (const upd of data.result) {
          pollOffset = Math.max(pollOffset, upd.update_id + 1);
          try { await handleUpdate(upd); } catch (e) { console.warn('[telegram] handleUpdate error:', e); }
        }
      } else if (data.error_code === 409) {
        // Конфликт getUpdates (другой инстанс/перезапуск) — подождём и повторим.
        await sleep(3000);
      } else if (data.error_code === 401) {
        lastError = 'Неверный токен — бот остановлен';
        emit();
        break;
      } else {
        await sleep(backoff);
        backoff = Math.min(backoff * 2, 30000);
      }
    } catch {
      if (pollAbort?.signal.aborted && (!polling || gen !== pollGen)) break; // нас остановили
      // Сетевая ошибка / таймаут long-poll — это нормально, продолжаем.
      await sleep(backoff);
      backoff = Math.min(backoff * 2, 30000);
    } finally {
      clearTimeout(timeoutId);
    }
  }
  if (gen === pollGen) { polling = false; emit(); }
}

function startPolling(): void {
  if (polling) return;
  if (!config.enabled || !config.botToken) return;
  polling = true;
  const gen = ++pollGen;
  emit();
  void refreshBotInfo();
  void registerBotCommands();
  void pollLoop(gen);
}

function stopPolling(): void {
  polling = false;
  pollGen++;
  if (pollAbort) { try { pollAbort.abort(); } catch { /* ignore */ } pollAbort = null; }
  emit();
}

function reconcilePolling(): void {
  const shouldPoll = config.enabled && !!config.botToken;
  if (shouldPoll && !polling) startPolling();
  else if (!shouldPoll && polling) stopPolling();
}

// ===== Планировщик ежедневного итога =====
function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function currentHHMM(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function getDailySentDate(): string { try { return localStorage.getItem(STORAGE_KEY_DAILY_SENT) || ''; } catch { return ''; } }
function setDailySentDate(date: string): void { try { localStorage.setItem(STORAGE_KEY_DAILY_SENT, date); } catch { /* ignore */ } }

function schedulerTick(): void {
  if (!config.enabled || !config.events.dailySummary || !isConfigured()) return;
  if (!reportProvider) return;
  const today = todayStr();
  if (getDailySentDate() === today) return;
  if (currentHHMM() < config.dailySummaryTime) return;
  const payload = reportProvider();
  if (!payload) return;
  setDailySentDate(today);
  notifyDailySummary(payload);
}

// ===== Жизненный цикл =====
export function start(): void {
  if (!schedulerTimer) {
    schedulerTick();
    schedulerTimer = setInterval(schedulerTick, SCHEDULER_TICK_MS);
  }
  reconcilePolling();
}

export function stop(): void {
  if (schedulerTimer) { clearInterval(schedulerTimer); schedulerTimer = null; }
  stopPolling();
}

export const telegram = {
  getConfig,
  setConfig,
  isConfigured,
  getStatus,
  subscribe,
  checkToken,
  unlinkChat,
  removeAuthorizedChat,
  sendTestMessage,
  notifyShiftClosed,
  notifyTableLoad,
  notifySessionEnded,
  checkLowStock,
  setReportProvider,
  setDataProvider,
  setExportProvider,
  start,
  stop,
};

export default telegram;
