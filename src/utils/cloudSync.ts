/**
 * Cloud Sync: модуль связи десктоп-приложения с biliardo.kz.
 *
 * Контракт сервера (services/club в biliardo-site):
 *  REST:
 *   - POST /api/club/auth      → {phone, password}        → {token, clubId, clubName}
 *   - POST /api/club/sync      → {tables, todayRevenue}   → {ok, syncedAt}
 *   - POST /api/club/session   → SessionPayload           → {ok}  (или 409 DUPLICATE)
 *  WebSocket (для real-time управления с веба):
 *   - wss://biliardo.kz/club-ws/club/<clubId>?token=<desktopToken>
 *   - desktop → server: SYNC, COMMAND_ACK
 *   - server → desktop: TABLE_TOGGLE_LIGHT, TABLE_START_SESSION, TABLE_END_SESSION
 *
 * Авторизация: header `Authorization: Bearer <desktopToken>` для REST.
 * WS: тот же токен в query string.
 *
 * Использование:
 *   await cloudSync.login(phone, password)   // один раз
 *   cloudSync.startAutoSync()                // запускает HTTP-sync + WS канал
 *   cloudSync.pushSession(record)            // вызывать сразу после endSession()
 *   cloudSync.broadcastSync()                // вызывать после изменений в столах (для WS)
 *   cloudSync.onCommand(fn)                  // регистрирует обработчик команд от веба
 */

import type { BilliardTable, SessionRecord, Reservation } from '../types';
import { calculatePausedSessionCost } from './pricing';

const STORAGE_KEY_TOKEN = 'cloudSync.token';
const STORAGE_KEY_CLUB_ID = 'cloudSync.clubId';
const STORAGE_KEY_PHONE = 'cloudSync.phone';
const STORAGE_KEY_API_URL = 'cloudSync.apiUrl';
const STORAGE_KEY_WS_URL = 'cloudSync.wsUrl';

const DEFAULT_API_URL = 'https://biliardo.kz/api';
const DEFAULT_WS_URL = 'wss://biliardo.kz/club-ws';
const SYNC_INTERVAL_MS = 30_000;
const REQUEST_TIMEOUT_MS = 10_000;
const WS_RECONNECT_BASE_MS = 2_000;
const WS_RECONNECT_MAX_MS = 60_000;

type SessionMode = 'time' | 'amount' | 'unlimited';
type TableStatusOut = 'free' | 'occupied' | 'reserved' | 'maintenance';

interface TableSessionOut {
  startTime: number;
  mode: SessionMode;
  plannedDuration: number | null;
  tariffName?: string | null;
  currentTableCost?: number;
  currentBarCost?: number;
  paused?: boolean;
}

interface ReservationOut {
  customerName?: string | null;
  customerPhone?: string | null;
  reservedFor?: number;
  notes?: string | null;
}

interface TableSnapshotOut {
  id: number;
  name: string;
  status: TableStatusOut;
  lightOn: boolean;
  session: TableSessionOut | null;
  pricePerHour?: number;
  reservation?: ReservationOut | null;
}

interface ClubRevenueOut {
  table: number;
  bar: number;
  total: number;
  sessionsCount: number;
}

interface SyncPayload {
  tables: TableSnapshotOut[];
  todayRevenue: ClubRevenueOut;
}

interface BarOrderOut {
  menuItemName: string;
  quantity: number;
  price: number;
}

interface ShiftPayload {
  id: string;
  operatorId: string;
  operatorName: string;
  startTime: number;
  endTime: number | null;
  totalRevenue: number;
  tableRevenue: number;
  barRevenue: number;
  sessionsCount: number;
}

interface SessionPayload {
  id: string;
  tableId: number;
  tableName: string;
  mode: SessionMode;
  tariffName?: string | null;
  startTime: number;
  endTime: number;
  duration: number;
  tableCost: number;
  barCost: number;
  totalCost: number;
  date: string;
  barOrders?: BarOrderOut[];
  shiftId?: string | null;
  paymentMethod?: 'cash' | 'card' | 'transfer';
}

interface AuthResponse {
  token: string;
  clubId: string;
  clubName: string;
}

interface SyncStatus {
  loggedIn: boolean;
  clubName: string | null;
  lastSyncAt: number | null;
  lastError: string | null;
  pendingSessions: number;
  pendingShifts: number;
  wsConnected: boolean;
}

// ===== Команды от веба =====
export type IncomingCommand =
  | { type: 'TABLE_TOGGLE_LIGHT'; tableId: number; commandId: string }
  | {
      type: 'TABLE_START_SESSION'
      tableId: number
      commandId: string
      payload?: {
        mode?: SessionMode
        hours?: number
        minutes?: number
        amount?: number
        plannedDurationSeconds?: number
        packagePrice?: number
        tariffName?: string
      }
    }
  | { type: 'TABLE_END_SESSION'; tableId: number; commandId: string };

type CommandHandler = (cmd: IncomingCommand) => Promise<{ ok: true; newStatus: TableStatusOut } | { ok: false; error: string }>;

// ===== Состояние =====
const listeners = new Set<(status: SyncStatus) => void>();
let lastSyncAt: number | null = null;
let lastError: string | null = null;
let syncTimer: ReturnType<typeof setInterval> | null = null;
let snapshotProvider: (() => SyncPayload | null) | null = null;
let commandHandler: CommandHandler | null = null;
let ws: WebSocket | null = null;
let wsRetryAttempt = 0;
let wsReconnectTimer: ReturnType<typeof setTimeout> | null = null;
let wsConnected = false;
/**
 * Флаг "мы сами закрываем сокет" — выставляется в disconnectWs() перед ws.close().
 * Внутри ws.onclose проверяем: если флаг true → НЕ запускаем scheduleReconnect,
 * иначе попадаем в бесконечный цикл (StrictMode размонтирование → close → reconnect → mount → connect → close...).
 */
let wsClosingIntentionally = false;
// Сессии, отправка которых упала с сетевой ошибкой — повторяем при следующем sync.
const pendingSessions: SessionPayload[] = [];
// Смены, отправка которых упала — повторяем при следующем sync. Map по id: запись
// идемпотентна (open/close с одним id), последняя версия (закрытие) перетирает раннюю.
const pendingShifts = new Map<string, ShiftPayload>();

function emit(): void {
  const status = getStatus();
  for (const fn of listeners) fn(status);
}

// ===== Адреса сервера =====
// Приложение всегда работает с продакшен-доменом biliardo.kz.
// Кастомные URL (для локальной разработки) больше не настраиваются из UI.
// Чистим устаревшие переопределения, оставшиеся от старых версий.
try {
  localStorage.removeItem(STORAGE_KEY_API_URL);
  localStorage.removeItem(STORAGE_KEY_WS_URL);
} catch { /* localStorage недоступен — игнорируем */ }

function getApiUrl(): string {
  return DEFAULT_API_URL;
}

function getWsUrl(): string {
  return DEFAULT_WS_URL;
}

// Публичные геттеры для UI/диагностики.
export function getCurrentApiUrl(): string { return getApiUrl(); }
export function getCurrentWsUrl(): string { return getWsUrl(); }

function getClubId(): string | null {
  return localStorage.getItem(STORAGE_KEY_CLUB_ID);
}

function getToken(): string | null {
  return localStorage.getItem(STORAGE_KEY_TOKEN);
}

function getClubName(): string | null {
  // clubName приходит при login. Если token есть, но clubName потерян — не критично.
  return localStorage.getItem('cloudSync.clubName');
}

function clearAuth(): void {
  localStorage.removeItem(STORAGE_KEY_TOKEN);
  localStorage.removeItem(STORAGE_KEY_CLUB_ID);
  localStorage.removeItem('cloudSync.clubName');
  lastSyncAt = null;
  lastError = null;
  disconnectWs();
  emit();
}

// ===== HTTP помощник =====
async function request(path: string, init: RequestInit & { auth?: boolean } = {}): Promise<Response> {
  const { auth = true, headers, ...rest } = init;
  const finalHeaders = new Headers(headers);
  if (!finalHeaders.has('Content-Type') && rest.body) {
    finalHeaders.set('Content-Type', 'application/json');
  }
  if (auth) {
    const token = getToken();
    if (!token) throw new Error('Not logged in to cloud');
    finalHeaders.set('Authorization', `Bearer ${token}`);
  }
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(`${getApiUrl()}${path}`, {
      ...rest,
      headers: finalHeaders,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

// ===== Login =====
export async function login(phone: string, password: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await request('/club/auth', {
      method: 'POST',
      auth: false,
      body: JSON.stringify({ phone, password }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { code?: string; message?: string };
      const msg = body.message || body.code || `HTTP ${res.status}`;
      lastError = msg;
      emit();
      return { ok: false, error: msg };
    }
    const data = await res.json() as AuthResponse;
    localStorage.setItem(STORAGE_KEY_TOKEN, data.token);
    localStorage.setItem(STORAGE_KEY_CLUB_ID, data.clubId);
    localStorage.setItem('cloudSync.clubName', data.clubName);
    localStorage.setItem(STORAGE_KEY_PHONE, phone);
    lastError = null;
    emit();
    return { ok: true };
  } catch (err) {
    const msg = (err as Error).message || 'Network error';
    lastError = msg;
    emit();
    return { ok: false, error: msg };
  }
}

export function logout(): void {
  clearAuth();
  stopAutoSync();
}

// ===== Маппинг локальных типов → серверный контракт =====
function mapTables(tables: BilliardTable[], reservations: Reservation[]): TableSnapshotOut[] {
  const now = Date.now();
  return tables.map((t) => {
    const session = t.currentSession;
    const sessionOut: TableSessionOut | null = session
      ? {
          startTime: session.startTime,
          mode: session.mode,
          plannedDuration: session.plannedDuration,
          tariffName: session.tariffName ?? null,
          currentTableCost: typeof session.packagePrice === 'number' && Number.isFinite(session.packagePrice)
            ? Math.round(session.packagePrice)
            : Math.round(calculatePausedSessionCost(
                session.startTime, now,
                t.pricePerHour, t.priceSchedule,
                session.mode, session.fixedAmount, session.packagePrice,
                session.pauseIntervals,
              )),
          currentBarCost: Math.round(
            session.barOrders.reduce((sum, o) => sum + (o.price * o.quantity || 0), 0),
          ),
          paused: !!session.pausedAt,
        }
      : null;
    const reservation = t.status === 'reserved'
      ? reservations.find((r) => r.tableId === t.id) ?? null
      : null;
    return {
      id: t.id,
      name: t.name,
      status: t.status,
      lightOn: t.lightOn,
      session: sessionOut,
      pricePerHour: Math.round(t.pricePerHour),
      reservation: reservation
        ? {
            customerName: reservation.customerName ?? null,
            customerPhone: reservation.customerPhone ?? null,
            reservedFor: reservation.reservedFor,
            notes: reservation.notes ?? null,
          }
        : null,
    };
  });
}

function todayRevenue(sessionHistory: SessionRecord[]): ClubRevenueOut {
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, '0');
  const d = String(today.getDate()).padStart(2, '0');
  const todayStr = `${y}-${m}-${d}`;
  const todaySessions = sessionHistory.filter((s) => s.date === todayStr);
  const tableSum = todaySessions.reduce((sum, s) => sum + (s.tableCost || 0), 0);
  const barSum = todaySessions.reduce((sum, s) => sum + (s.barCost || 0), 0);
  return {
    table: tableSum,
    bar: barSum,
    total: tableSum + barSum,
    sessionsCount: todaySessions.length,
  };
}

/**
 * Регистрирует провайдер, который cloudSync будет вызывать при каждом auto-sync,
 * чтобы получить актуальный snapshot. Обычно подключается из App.tsx с доступом к store.
 */
export function setSnapshotProvider(fn: () => { tables: BilliardTable[]; sessionHistory: SessionRecord[]; reservations: Reservation[] } | null): void {
  snapshotProvider = () => {
    try {
      const s = fn();
      if (!s) return null;
      return {
        tables: mapTables(s.tables, s.reservations),
        todayRevenue: todayRevenue(s.sessionHistory),
      };
    } catch (err) {
      console.warn('[cloudSync] snapshotProvider fn threw:', err);
      return null;
    }
  };
  console.log('[cloudSync] snapshotProvider registered');
}

// ===== Sync snapshot =====
export async function syncNow(): Promise<{ ok: boolean; error?: string }> {
  // Все ранние выходы теперь пишут в lastError и emit-ят, чтобы UI показывал причину.
  if (!snapshotProvider) {
    lastError = 'snapshot provider not set (App.tsx не зарегистрировал)';
    emit();
    return { ok: false, error: lastError };
  }
  if (!getToken()) {
    lastError = 'not logged in';
    emit();
    return { ok: false, error: lastError };
  }
  const payload = snapshotProvider();
  if (!payload) {
    lastError = 'snapshot provider вернул null';
    emit();
    return { ok: false, error: lastError };
  }

  const url = `${getApiUrl()}/club/sync`;
  try {
    const res = await request('/club/sync', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      if (res.status === 401) {
        clearAuth();
        return { ok: false, error: 'token expired — please re-login' };
      }
      const body = await res.json().catch(() => ({})) as { message?: string; code?: string };
      lastError = `${res.status}: ${body.message || body.code || 'sync failed'}`;
      console.warn('[cloudSync] sync HTTP error', res.status, 'url:', url, 'body:', body);
      emit();
      return { ok: false, error: lastError };
    }
    lastSyncAt = Date.now();
    lastError = null;
    emit();
    // Попробуем сбросить накопленные сессии и смены (если были network-fail).
    await flushPendingSessions();
    await flushPendingShifts();
    return { ok: true };
  } catch (err) {
    lastError = (err as Error).message || 'network error';
    console.warn('[cloudSync] sync network/fetch error to', url, err);
    emit();
    return { ok: false, error: lastError };
  }
}

export function startAutoSync(): void {
  if (syncTimer) return;
  // Первый sync — сразу, потом каждые SYNC_INTERVAL_MS.
  void syncNow();
  syncTimer = setInterval(() => { void syncNow(); }, SYNC_INTERVAL_MS);
  // Подключаемся к WS для real-time управления с веба.
  connectWs();
}

export function stopAutoSync(): void {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
  }
  disconnectWs();
}

// ===== WebSocket для real-time канала =====

/** Регистрирует обработчик команд от веба. Возвращает функцию отписки. */
export function onCommand(handler: CommandHandler): () => void {
  commandHandler = handler;
  return () => { if (commandHandler === handler) commandHandler = null; };
}

/**
 * Отправить SYNC сообщение через WS (если открыт). Так веб видит изменения столов
 * мгновенно, не дожидаясь следующего HTTP /club/sync (каждые 30с).
 */
export function broadcastSync(): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  if (!snapshotProvider) return;
  const payload = snapshotProvider();
  if (!payload) return;
  try {
    ws.send(JSON.stringify({
      type: 'SYNC',
      tables: payload.tables,
      revenue: payload.todayRevenue,
    }));
  } catch { /* ignore */ }
}

function connectWs(): void {
  const token = getToken();
  const clubId = getClubId();
  if (!token || !clubId) return;
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;

  const base = getWsUrl();
  const url = `${base}/club/${clubId}?token=${encodeURIComponent(token)}`;
  console.log('[cloudSync] WS connecting →', `${base}/club/${clubId}`);

  let thisWs: WebSocket;
  try {
    thisWs = new WebSocket(url);
    ws = thisWs;
  } catch (err) {
    console.warn('[cloudSync] WS construct failed:', err);
    lastError = `WS construct error: ${(err as Error).message}`;
    emit();
    scheduleReconnect();
    return;
  }

  thisWs.onopen = () => {
    // Защита от гонки: если ws-module уже указывает на ДРУГОЙ сокет (StrictMode mount-cleanup-mount),
    // не считаем эту "победившую" конструкцию рабочей.
    if (ws !== thisWs) return;
    wsConnected = true;
    wsRetryAttempt = 0;
    console.log('[cloudSync] WS open ✓');
    emit();
    // Отправляем актуальный snapshot сразу — веб увидит свежее состояние.
    broadcastSync();
  };

  thisWs.onmessage = async (ev) => {
    let msg: unknown;
    try { msg = JSON.parse(typeof ev.data === 'string' ? ev.data : ev.data.toString()); }
    catch { return; }
    if (!msg || typeof msg !== 'object' || !('type' in msg)) return;
    const m = msg as { type: string; commandId?: string; tableId?: number; payload?: { mode?: SessionMode }; code?: string };

    if (m.type === 'TABLE_TOGGLE_LIGHT' || m.type === 'TABLE_START_SESSION' || m.type === 'TABLE_END_SESSION') {
      if (typeof m.commandId !== 'string' || typeof m.tableId !== 'number') return;
      if (!commandHandler) {
        sendWs({
          type: 'COMMAND_ACK',
          commandId: m.commandId,
          tableId: m.tableId,
          newStatus: 'free',
        });
        return;
      }
      // Если хэндлер падает или возвращает ok:false — всё равно ОБЯЗАНЫ отправить
      // COMMAND_ACK, иначе веб висит 10 сек в watchdog и все кнопки заблокированы.
      // Текущий статус берём из snapshotProvider'а (он отражает локальный store).
      const getCurrentTableStatus = (): TableStatusOut => {
        const snap = snapshotProvider ? snapshotProvider() : null;
        return snap?.tables.find((t) => t.id === m.tableId)?.status ?? 'free';
      };
      try {
        const result = await commandHandler(m as IncomingCommand);
        if (result.ok) {
          sendWs({
            type: 'COMMAND_ACK',
            commandId: m.commandId,
            tableId: m.tableId,
            newStatus: result.newStatus,
          });
          broadcastSync();
        } else {
          sendWs({
            type: 'COMMAND_ACK',
            commandId: m.commandId,
            tableId: m.tableId,
            newStatus: getCurrentTableStatus(),
          });
        }
      } catch (err) {
        console.warn('[cloudSync] command handler error:', err);
        sendWs({
          type: 'COMMAND_ACK',
          commandId: m.commandId,
          tableId: m.tableId,
          newStatus: getCurrentTableStatus(),
        });
      }
      return;
    }
    if (m.type === 'ERROR') {
      console.warn('[cloudSync] WS error:', m.code, m);
    }
  };

  thisWs.onerror = (ev) => {
    console.warn('[cloudSync] WS error event:', ev);
  };

  thisWs.onclose = (ev) => {
    const wasIntentional = wsClosingIntentionally;
    // ВАЖНО: трогаем module-level ws/wsConnected ТОЛЬКО если это "наш" сокет.
    // Старый закрывшийся сокет не должен обнулять new ws, который уже подключился
    // в параллельном connectWs (StrictMode / гонка reconnect-mount).
    if (ws === thisWs) {
      ws = null;
      wsConnected = false;
      wsClosingIntentionally = false;
    }
    if (ev.code !== 1000) {
      const reason = ev.reason || `code ${ev.code}`;
      console.warn('[cloudSync] WS closed:', reason);
      lastError = `WS: ${reason}`;
    } else {
      console.log('[cloudSync] WS closed normally', wasIntentional ? '(intentional)' : '(server-side)');
    }
    emit();
    // Не реконнектимся если МЫ сами закрыли (logout, stopAutoSync, HMR unmount).
    // И не реконнектимся если уже есть другой активный ws (race-условие).
    if (wasIntentional) return;
    if (ws && ws.readyState === WebSocket.OPEN) return;
    scheduleReconnect();
  };
}

function sendWs(msg: object): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  try { ws.send(JSON.stringify(msg)); } catch { /* ignore */ }
}

function disconnectWs(): void {
  if (wsReconnectTimer) {
    clearTimeout(wsReconnectTimer);
    wsReconnectTimer = null;
  }
  if (ws) {
    // Помечаем "сами закрываем" — onclose не запустит reconnect.
    wsClosingIntentionally = true;
    try { ws.close(1000, 'desktop logout'); } catch { /* ignore */ }
    ws = null;
  }
  wsConnected = false;
  wsRetryAttempt = 0;
  emit();
}

function scheduleReconnect(): void {
  // Не пытаемся, если уже разлогинились.
  if (!getToken()) return;
  if (wsReconnectTimer) return;
  wsRetryAttempt++;
  const delay = Math.min(WS_RECONNECT_BASE_MS * Math.pow(2, wsRetryAttempt - 1), WS_RECONNECT_MAX_MS);
  wsReconnectTimer = setTimeout(() => {
    wsReconnectTimer = null;
    connectWs();
  }, delay);
}

// ===== Push session (по завершении) =====
function recordToPayload(r: SessionRecord, shiftId: string | null): SessionPayload {
  const barOrders: BarOrderOut[] = (r.barOrders ?? []).map((o) => ({
    menuItemName: o.menuItemName,
    quantity: o.quantity,
    price: o.price,
  }));
  return {
    id: r.id,
    tableId: r.tableId,
    tableName: r.tableName,
    mode: r.mode,
    tariffName: r.tariffName ?? null,
    startTime: r.startTime,
    endTime: r.endTime,
    duration: r.duration,
    tableCost: r.tableCost,
    barCost: r.barCost,
    totalCost: r.totalCost,
    date: r.date,
    barOrders: barOrders.length > 0 ? barOrders : undefined,
    shiftId: shiftId ?? undefined,
    paymentMethod: r.paymentMethod ?? undefined,
  };
}

export async function pushSession(record: SessionRecord, shiftId?: string | null): Promise<void> {
  if (!getToken()) return; // не залогинены — нечего слать
  const payload = recordToPayload(record, shiftId ?? null);
  try {
    const res = await request('/club/session', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (res.ok || res.status === 409) {
      // 409 = duplicate, тоже OK (idempotency).
      return;
    }
    if (res.status === 401) {
      clearAuth();
      return;
    }
    // Иначе — буферим до следующего sync.
    pendingSessions.push(payload);
    emit();
  } catch {
    // Сеть упала — буферим.
    pendingSessions.push(payload);
    emit();
  }
}

async function flushPendingSessions(): Promise<void> {
  if (pendingSessions.length === 0) return;
  const toFlush = [...pendingSessions];
  pendingSessions.length = 0;
  for (const p of toFlush) {
    try {
      const res = await request('/club/session', {
        method: 'POST',
        body: JSON.stringify(p),
      });
      if (!res.ok && res.status !== 409 && res.status !== 401) {
        pendingSessions.push(p); // повторим позже
      }
    } catch {
      pendingSessions.push(p);
    }
  }
  emit();
}

// ===== Push shift (open/close/update) =====
/**
 * Отправляет смену на сервер. Idempotent: повторный вызов с тем же id обновит
 * endTime и итоги. Используется как при открытии, так и при закрытии смены.
 */
export async function pushShift(payload: ShiftPayload): Promise<void> {
  if (!getToken()) return;
  try {
    const res = await request('/club/shift', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      pendingShifts.delete(payload.id);
      emit();
      return;
    }
    if (res.status === 401) {
      clearAuth();
      return;
    }
    // Иначе — буферим до следующего sync (последняя версия по id побеждает).
    console.warn('[cloudSync] pushShift failed:', res.status);
    pendingShifts.set(payload.id, payload);
    emit();
  } catch (err) {
    console.warn('[cloudSync] pushShift network error:', err);
    pendingShifts.set(payload.id, payload);
    emit();
  }
}

async function flushPendingShifts(): Promise<void> {
  if (pendingShifts.size === 0) return;
  const toFlush = Array.from(pendingShifts.values());
  for (const p of toFlush) {
    try {
      const res = await request('/club/shift', {
        method: 'POST',
        body: JSON.stringify(p),
      });
      if (res.ok) {
        pendingShifts.delete(p.id);
      } else if (res.status === 401) {
        return; // токен протух — прекращаем, дофлашим после повторного логина
      }
      // иначе оставляем в очереди, повторим позже
    } catch {
      // сеть упала — оставляем в очереди
    }
  }
  emit();
}

// ===== Status API =====
export function getStatus(): SyncStatus {
  return {
    loggedIn: !!getToken(),
    clubName: getClubName(),
    lastSyncAt,
    lastError,
    pendingSessions: pendingSessions.length,
    pendingShifts: pendingShifts.size,
    wsConnected,
  };
}

export function subscribe(fn: (status: SyncStatus) => void): () => void {
  listeners.add(fn);
  fn(getStatus());
  return () => { listeners.delete(fn); };
}

export const cloudSync = {
  login,
  logout,
  syncNow,
  startAutoSync,
  stopAutoSync,
  pushSession,
  pushShift,
  setSnapshotProvider,
  onCommand,
  broadcastSync,
  getStatus,
  subscribe,
};

export default cloudSync;
