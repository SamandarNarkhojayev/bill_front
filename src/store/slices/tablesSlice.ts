import type { StateCreator } from 'zustand';
import type { AppStore } from '../types';
import type { SessionRecord, Reservation } from '../../types';
import { generateId, localDateStr } from '../helpers';
import { defaultTables } from '../defaults';
import { calculatePausedSessionCost, estimateDurationSecondsForAmount, getActiveElapsedMs } from '../../utils/pricing';
import { translate } from '../../i18n/translate';
import cloudSync from '../../utils/cloudSync';
import telegram from '../../utils/telegram';

export const createTablesSlice: StateCreator<AppStore, [], [], Pick<AppStore, 'tables' | 'startSession' | 'endSession' | 'pauseSession' | 'resumeSession' | 'toggleLight' | 'setLightState' | 'updateTableFromRelay' | 'syncTablesFromArduino' | 'restoreLightsToArduino' | 'reservations' | 'addReservation' | 'cancelReservation'>> = (set, get) => ({
      tables: defaultTables,

      startSession: (tableId, mode, options = {}) => {
        const { hours = 0, minutes = 0, amount = 0, plannedDurationSeconds, packagePrice, tariffName } = options;
        const table = get().tables.find((t) => t.id === tableId);
        const pricePerHour = table?.pricePerHour || get().settings.defaultPricePerHour;
        const priceSchedule = table?.priceSchedule || [];
        let plannedDuration: number | null = null;
        if (typeof plannedDurationSeconds === 'number' && plannedDurationSeconds > 0) {
          plannedDuration = Math.max(1, Math.ceil(plannedDurationSeconds));
        } else if (mode === 'time') {
          plannedDuration = (hours * 60 + minutes) * 60; // в секундах
        } else if (mode === 'amount' && amount > 0) {
          plannedDuration = estimateDurationSecondsForAmount(Date.now(), amount, pricePerHour, priceSchedule);
        }
        const fixedAmount = mode === 'amount' ? amount : null;
        const normalizedPackagePrice = typeof packagePrice === 'number' && packagePrice > 0 ? packagePrice : null;
        const normalizedTariffName = (typeof tariffName === 'string' && tariffName.trim()) ? tariffName.trim() : null;

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
                    tariffName: normalizedTariffName,
                    plannedDuration,
                    fixedAmount,
                    packagePrice: normalizedPackagePrice,
                    pausedAt: null,
                    totalPausedMs: 0,
                    pauseIntervals: [],
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
        const lang = get().settings.language;
        const modeKey = mode === 'time' ? 'dashboard.mode_time' : mode === 'amount' ? 'dashboard.mode_amount' : 'dashboard.mode_unlimited';
        get().addToast('success', translate(lang, 'dashboard.started', { name: tableName, mode: translate(lang, modeKey) }));

        // Telegram: загрузка столов (стол занят).
        {
          const all = get().tables;
          telegram.notifyTableLoad({
            tableName,
            action: 'occupied',
            occupied: all.filter((t) => t.status === 'occupied').length,
            total: all.length,
            clubName: get().settings.clubName,
          });
        }
      },

      endSession: (tableId, endTimeOverride, paymentMethod = 'cash') => {
        const table = get().tables.find((t) => t.id === tableId);
        if (!table || !table.currentSession) return;

        const session = table.currentSession;
        // endTimeOverride передаётся из UI, когда чек уже посчитан по фиксированному
        // моменту времени — чтобы сумма в отчёте совпадала с чеком до тенге
        // (иначе Date.now() здесь > времени расчёта чека на величину печати/задержки).
        const endTime = typeof endTimeOverride === 'number' && Number.isFinite(endTimeOverride)
          ? endTimeOverride
          : Date.now();
        // Тарифицируем только активное время (без пауз). Длительность — активные минуты,
        // стоимость — по реальным интервалам игры (корректно с тарифной сеткой по времени суток).
        const activeMs = getActiveElapsedMs(session.startTime, endTime, session.pausedAt, session.totalPausedMs);
        const durationMinutes = Math.ceil(activeMs / 60000);
        const tableCost = calculatePausedSessionCost(
          session.startTime,
          endTime,
          table.pricePerHour,
          table.priceSchedule,
          session.mode,
          session.fixedAmount,
          session.packagePrice,
          session.pauseIntervals
        );

        const barCost = session.barOrders.reduce((sum, item) => sum + item.price * item.quantity, 0);

        const record: SessionRecord = {
          id: session.id,
          tableId: table.id,
          tableName: table.name,
          mode: session.mode,
          tariffName: session.tariffName ?? null,
          startTime: session.startTime,
          endTime,
          duration: durationMinutes,
          tableCost,
          barOrders: session.barOrders.map((item) => ({ ...item })),
          barCost,
          totalCost: tableCost + barCost,
          date: localDateStr(),
          paymentMethod,
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

        // Облако (biliardo.kz): отправляем завершённую сессию для веб-отчётов.
        // Если не залогинены или сеть упала — буферим внутри cloudSync, повторим при sync.
        void cloudSync.pushSession(record, get().currentShift?.id ?? null);

        // Telegram: уведомление о завершённой сессии + обновлённая загрузка столов.
        {
          const currency = get().settings.currency;
          const clubName = get().settings.clubName;
          telegram.notifySessionEnded({
            tableName: table.name,
            durationMinutes: durationMinutes,
            tableCost,
            barCost,
            totalCost: tableCost + barCost,
            currency,
            tariffName: session.tariffName ?? null,
            clubName,
          });
          const all = get().tables;
          telegram.notifyTableLoad({
            tableName: table.name,
            action: 'free',
            occupied: all.filter((t) => t.status === 'occupied').length,
            total: all.length,
            clubName,
          });
        }

        get().addToast('info', translate(get().settings.language, 'dashboard.ended_toast', { name: table.name, sum: (tableCost + barCost).toLocaleString(), currency: get().settings.currency }));
      },

      pauseSession: (tableId) => {
        const table = get().tables.find((t) => t.id === tableId);
        if (!table || !table.currentSession || table.currentSession.pausedAt) return;
        // Ставим на паузу: фиксируем момент, добавляем открытый интервал, гасим свет
        const pauseStart = Date.now();
        set((state) => ({
          tables: state.tables.map((t) =>
            t.id === tableId && t.currentSession
              ? {
                  ...t,
                  lightOn: false,
                  currentSession: {
                    ...t.currentSession,
                    pausedAt: pauseStart,
                    pauseIntervals: [...(t.currentSession.pauseIntervals ?? []), { start: pauseStart, end: null }],
                  },
                }
              : t
          ),
        }));
        if (window.electronAPI?.arduino) {
          window.electronAPI.arduino.setRelay(table.relayNumber, false).catch(console.error);
        }
        get().addToast('info', translate(get().settings.language, 'dashboard.paused_toast', { name: table.name }));
      },

      resumeSession: (tableId) => {
        const table = get().tables.find((t) => t.id === tableId);
        if (!table || !table.currentSession || !table.currentSession.pausedAt) return;
        const resumeAt = Date.now();
        const pausedFor = Math.max(0, resumeAt - table.currentSession.pausedAt);
        // Снимаем с паузы: закрываем открытый интервал, копим время паузы, включаем свет
        set((state) => ({
          tables: state.tables.map((t) => {
            if (t.id !== tableId || !t.currentSession) return t;
            const intervals = (t.currentSession.pauseIntervals ?? []).map((iv) =>
              iv.end === null ? { ...iv, end: resumeAt } : iv
            );
            return {
              ...t,
              lightOn: true,
              currentSession: {
                ...t.currentSession,
                pausedAt: null,
                totalPausedMs: (t.currentSession.totalPausedMs ?? 0) + pausedFor,
                pauseIntervals: intervals,
              },
            };
          }),
        }));
        if (window.electronAPI?.arduino) {
          window.electronAPI.arduino.setRelay(table.relayNumber, true).catch(console.error);
        }
        get().addToast('success', translate(get().settings.language, 'dashboard.resumed_toast', { name: table.name }));
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
        // Нет такого реле или свет уже в нужном состоянии — НЕ трогаем стор вообще.
        // Важно проверить ДО set(): persist-middleware вызывает setItem() (сериализация
        // + запись) на каждый set, даже если состояние не изменилось. Без этого guard
        // каждый STATUS-кадр Arduino (по реле на кадр) вызывал лавину ре-рендеров всего
        // App (ввод «съедался») и лишние записи в хранилище.
        const target = get().tables.find((t) => t.relayNumber === relayNumber);
        if (!target || target.lightOn === state) return;
        set((s) => ({
          tables: s.tables.map((t) =>
            t.relayNumber === relayNumber ? { ...t, lightOn: state } : t
          ),
        }));
      },

      syncTablesFromArduino: (relayCount, relays) => {
        // Если набор реле тот же, что уже сопоставлен со столами — структура не изменилась.
        // Не пересобираем таблицы и не показываем тост (иначе повторные INFO от контроллера
        // при нестабильном USB вызывали лавину ре-рендеров и спам тостов → «подвисал» ввод).
        const cur = get().tables;
        const curKey = cur.map((t) => t.relayNumber).sort((a, b) => a - b).join(',');
        const newKey = relays.map((r) => r.number).sort((a, b) => a - b).join(',');
        if (curKey === newKey) {
          return;
        }
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
              priceSchedule: settingsTable?.priceSchedule || [],
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
              priceSchedule: existing?.priceSchedule || t.priceSchedule || [],
              isActive: existing?.isActive ?? true,
            };
          });
          return {
            tables: newTables,
            settings: { ...state.settings, tables: newSettingsTables },
          };
        });
        get().addToast('info', translate(get().settings.language, 'toasts.relays_detected', { count: relayCount }));
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
          // Стол на паузе должен оставаться без света даже после переподключения Arduino —
          // иначе свет снова загорится, хотя UI показывает «⏸ Пауза».
          const isPaused = !!table.currentSession?.pausedAt;
          // Восстанавливаем свет если (и стол НЕ на паузе):
          // 1) он был включён в памяти ИЛИ
          // 2) стол занят активной сессией (должен быть освещён)
          const shouldBeOn = !isPaused && (table.lightOn || table.status === 'occupied' || !!table.currentSession);
          if (shouldBeOn) {
            restoreCandidates++;
            window.electronAPI!.arduino!.setRelay(table.relayNumber, true)
              .then(() => {
                console.log(`[Arduino] ✅ Restored light for ${table.name} (relay ${table.relayNumber})`);
                // Синхронизируем UI-флаг только если он реально отличается — иначе лишние
                // ре-рендеры при повторных INFO от контроллера.
                if (!get().tables.find((t) => t.id === table.id)?.lightOn) {
                  set((state) => ({
                    tables: state.tables.map((t) =>
                      t.id === table.id ? { ...t, lightOn: true } : t
                    ),
                  }));
                }
              })
              .catch((err) => {
                console.error(`[Arduino] ❌ Failed to restore light for ${table.name}:`, err);
              });
          } else if (isPaused && table.lightOn) {
            // Стол на паузе, но свет почему-то горит в памяти — гасим физически и в UI
            window.electronAPI!.arduino!.setRelay(table.relayNumber, false).catch(() => {});
            set((state) => ({
              tables: state.tables.map((t) => (t.id === table.id ? { ...t, lightOn: false } : t)),
            }));
          }
        });
        
        if (restoreCandidates > 0) {
          // Небольшая задержка чтобы команды успели отправиться
          setTimeout(() => {
            get().addToast('success', translate(get().settings.language, 'toasts.lights_restored', { count: restoreCandidates }));
          }, 500);
        }
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
        get().addToast('success', translate(get().settings.language, 'toasts.table_reserved', { name: tableName }));
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
        get().addToast('info', translate(get().settings.language, 'toasts.reservation_cancelled'));
      },

});
