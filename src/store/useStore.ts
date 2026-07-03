import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { AppStore } from './types';
import type { BilliardTable, Reservation } from '../types';
import { defaultUsers } from './defaults';
import { createAuthSlice } from './slices/authSlice';
import { createTablesSlice } from './slices/tablesSlice';
import { createBarSlice } from './slices/barSlice';
import { createCancelSlice } from './slices/cancelSlice';
import { createReportsSlice } from './slices/reportsSlice';
import { createCatalogSlice } from './slices/catalogSlice';
import { createSettingsSlice } from './slices/settingsSlice';
import { createUiSlice } from './slices/uiSlice';

const STORAGE_KEY = 'billiard-club-storage';
const STORAGE_MIRROR_KEY = 'billiard-club-storage-mirror'; // Резервная копия в localStorage
const STORAGE_VERSION = 0;

const safeLocalStorageGet = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const safeLocalStorageSet = (key: string, value: string): void => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore
  }
};

const safeLocalStorageRemove = (key: string): void => {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
};

// ===== НАДЁЖНОЕ ФАЙЛОВОЕ ХРАНИЛИЩЕ (через IPC в Electron) =====
// Защита от перезаписи данных до завершения гидратации
let _hydrationComplete = false;
let _autoSaveStarted = false;
let _closeHookRegistered = false;

const partializeStore = (state: AppStore) => ({
  tables: state.tables,
  barOrders: state.barOrders,
  currentShift: state.currentShift,
  sessionHistory: state.sessionHistory,
  completedOrders: state.completedOrders,
  cancelLog: state.cancelLog,
  settings: state.settings,
  barMenu: state.barMenu,
  barCategories: state.barCategories,
  inventoryRevisions: state.inventoryRevisions,
  sidebarCollapsed: state.sidebarCollapsed,
  users: state.users,
  shiftHistory: state.shiftHistory,
  reservations: state.reservations,
  tournaments: state.tournaments,
  tariffs: state.tariffs,
});

const buildPersistedPayload = (state: AppStore) => JSON.stringify({
  state: partializeStore(state),
  version: STORAGE_VERSION,
});

async function persistStoreSnapshot(forceFlush = false) {
  if (!_hydrationComplete) {
    return;
  }

  const payload = buildPersistedPayload(useStore.getState());

  try {
    if (window.electronAPI?.store) {
      await window.electronAPI.store.set(STORAGE_KEY, payload);
      if (forceFlush) {
        await window.electronAPI.store.flush();
      }
      return;
    }
  } catch (err) {
    console.error('[Storage] persist snapshot error:', err);
  }

  safeLocalStorageSet(STORAGE_KEY, payload);
}

function registerClosePersistHook() {
  if (_closeHookRegistered || typeof window === 'undefined') {
    return;
  }

  _closeHookRegistered = true;

  window.electronAPI?.app?.onBeforeClose?.(() => {
    void persistStoreSnapshot(true).finally(() => {
      window.electronAPI?.app?.confirmCloseReady().catch((err: unknown) => {
        console.error('[Storage] close confirm error:', err);
      });
    });
  });
}

const electronFileStorage = createJSONStorage<Partial<AppStore>>(() => ({
  getItem: async (name: string): Promise<string | null> => {
    try {
      if (window.electronAPI?.store) {
        const value = await window.electronAPI.store.get(name);
        console.log('[Storage] getItem:', name, value ? `${value.length} bytes` : 'null');
        if (value) return value;
      }
    } catch (err) {
      console.error('[Storage] getItem error:', err);
    }
    // Fallback: сначала пробуем основной ключ в localStorage, потом mirror
    const primary = safeLocalStorageGet(name);
    if (primary) return primary;
    const mirror = safeLocalStorageGet(STORAGE_MIRROR_KEY);
    if (mirror) {
      console.log('[Storage] Восстановлено из localStorage mirror');
      return mirror;
    }
    return null;
  },
  setItem: async (name: string, value: string): Promise<void> => {
    // КРИТИЧНО: не писать до завершения гидратации, иначе дефолты затрут данные
    if (!_hydrationComplete) {
      console.log('[Storage] setItem BLOCKED (hydration not complete)');
      return;
    }

    // ЗЕРКАЛО: всегда дублируем в localStorage как резервную копию
    safeLocalStorageSet(STORAGE_MIRROR_KEY, value);

    try {
      if (window.electronAPI?.store) {
        await window.electronAPI.store.set(name, value);
        return;
      }
    } catch (err) {
      console.error('[Storage] setItem error:', err);
    }
    // Fallback на localStorage
    safeLocalStorageSet(name, value);
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
    safeLocalStorageRemove(name);
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
  if (_autoSaveStarted) {
    return;
  }

  _autoSaveStarted = true;

  // Периодический flush каждые 30 секунд
  const autoSaveInterval = setInterval(() => {
    if (_hydrationComplete) {
      void persistStoreSnapshot(true);
    }
  }, 30_000);

  // Flush когда вкладка/окно теряет видимость (пользователь свернул или переключился)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && _hydrationComplete) {
      console.log('[AutoSave] Visibility hidden — flushing...');
      void persistStoreSnapshot(true);
    }
  });

  // Flush при потере фокуса окна
  window.addEventListener('blur', () => {
    if (_hydrationComplete) {
      void persistStoreSnapshot(true);
    }
  });

  // Последний шанс — перед закрытием страницы
  window.addEventListener('beforeunload', () => {
    if (_hydrationComplete) {
      console.log('[AutoSave] beforeunload — flushing...');
      void persistStoreSnapshot(true);
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
    (...a) => ({
      ...createAuthSlice(...a),
      ...createTablesSlice(...a),
      ...createBarSlice(...a),
      ...createCancelSlice(...a),
      ...createReportsSlice(...a),
      ...createCatalogSlice(...a),
      ...createSettingsSlice(...a),
      ...createUiSlice(...a),
    }),
    {
      name: STORAGE_KEY,
      storage: electronFileStorage,
      version: STORAGE_VERSION,
      partialize: partializeStore,
      merge: (persistedState, currentState) => {
        // Если нет сохранённых данных — используем текущее состояние (дефолтное)
        if (!persistedState) {
          console.log('[Store] No persisted state found, using defaults');
          // Свежая установка уже содержит дефолтные бар + кухню (defaultBarMenu).
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
            tables: (persisted.settings?.tables || currentState.settings.tables).map((table) => ({
              ...table,
              priceSchedule: table.priceSchedule || [],
            })),
          };
          // ===== Миграция Бар/Кухня (только бэкфилл, без вмешательства в меню) =====
          // Существующим установкам НЕ подсыпаем дефолтную кухню — их меню остаётся
          // нетронутым. Кухню они заводят сами на странице «Кухня». Дефолтная кухня
          // есть только на свежих установках (см. defaultBarCategories/defaultBarMenu).
          // Здесь лишь проставляем отдел старым категориям (undefined → 'bar').
          if (Array.isArray(merged.barCategories)) {
            merged.barCategories = merged.barCategories.map((c) => ({
              ...c,
              department: c.department === 'kitchen' ? 'kitchen' : 'bar',
            }));
          }

          // Если нет пользователей — используем дефолтных
          if (!persisted.users || persisted.users.length === 0) {
            merged.users = defaultUsers;
          }
          // Таблицы берём из persisted.tables (если есть), чтобы сохранялись:
          // - открытые/закрытые столы
          // - текущие сессии
          // - состояние света
          if (persisted.tables && persisted.tables.length > 0) {
            merged.tables = persisted.tables.map((table) => ({
              ...table,
              priceSchedule: table.priceSchedule || [],
            }));
          } else if (persisted.settings?.tables) {
            merged.tables = persisted.settings.tables.map((st) => ({
              id: st.id,
              name: st.name,
              relayNumber: st.relayNumber,
              status: 'free' as const,
              lightOn: false,
              pricePerHour: st.pricePerHour,
              priceSchedule: st.priceSchedule || [],
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
          // Сразу сохраняем результат миграции (бэкфилл отдела категорий),
          // чтобы он не потерялся при аварийном завершении до первого автосейва.
          void persistStoreSnapshot(true);
          registerClosePersistHook();
          // Запускаем систему автосохранения
          startAutoSave();
        };
      },
    }
  )
);

registerClosePersistHook();
