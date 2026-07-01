import { useEffect, useRef, useState } from 'react'
import { useStore } from './store/useStore'
import LoginPage from './components/LoginPage'
import AppHeader from './components/AppHeader'
import Sidebar from './components/Sidebar'
import Dashboard from './components/Dashboard'
import BarPage from './components/BarPage'
import ReportsPage from './components/ReportsPage'
import SettingsPage from './components/SettingsPage'
import UsersPage from './components/UsersPage'
import TournamentPage from './components/TournamentPage'
import TariffsPage from './components/TariffsPage'
import KnowledgePage from './components/KnowledgePage'
import ToastContainer from './components/ToastContainer'
import AdBanner from './components/AdBanner'
import UpdateModal from './components/UpdateModal'
import WhatsNewModal, { getUnseenEntries } from './components/WhatsNewModal'
import LogoutConfirmModal from './components/LogoutConfirmModal'
import { playTimerEndSound } from './utils/sounds'
import { getActiveElapsedMs, calculatePausedSessionCost } from './utils/pricing'
import { printSessionReceipt } from './utils/receipt'
import cloudSync from './utils/cloudSync'
import telegram, { type BotShiftInfo } from './utils/telegram'
import type { RelayChangeEvent, ButtonPressEvent, RelayInfo, UpdaterState } from './types/arduino'
import type { Shift } from './types'
import './App.css'

// КРИТИЧНО: регистрируем snapshot-провайдер на уровне модуля, ДО любого React-рендера.
// Если делать это внутри useEffect — при HMR / StrictMode / гонке логина с инициализацией
// cloudSync.syncNow() может стартовать раньше, чем effect успеет setSnapshotProvider,
// и завалится с "snapshot provider not set".
cloudSync.setSnapshotProvider(() => {
  const s = useStore.getState()
  return { tables: s.tables, sessionHistory: s.sessionHistory, reservations: s.reservations }
})

// Провайдер данных ежедневного итога для Telegram-планировщика.
// Регистрируем на уровне модуля, чтобы scheduler всегда имел доступ к свежему store.
telegram.setReportProvider(() => {
  const s = useStore.getState()
  const rev = s.getTodayRevenue()
  const d = new Date()
  const date = `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`
  return {
    date,
    tableRevenue: rev.table,
    barRevenue: rev.bar,
    totalRevenue: rev.total,
    sessionsCount: s.getTodaySessions(),
    currency: s.settings.currency,
    clubName: s.settings.clubName,
  }
})

// Провайдер данных для интерактивного бота (кнопки «Сегодня / Столы / Смена / …»).
telegram.setDataProvider(() => {
  const s = useStore.getState()
  const now = Date.now()
  const rev = s.getTodayRevenue()
  const d = new Date()
  const date = `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`

  const tables = s.tables.map((t) => {
    if (t.status === 'occupied' && t.currentSession) {
      const ses = t.currentSession
      const elapsedMin = Math.round(getActiveElapsedMs(ses.startTime, now, ses.pausedAt, ses.totalPausedMs) / 60000)
      const tableCost = calculatePausedSessionCost(
        ses.startTime, now, t.pricePerHour, t.priceSchedule,
        ses.mode, ses.fixedAmount, ses.packagePrice, ses.pauseIntervals,
      )
      const barCost = ses.barOrders.reduce((sum, o) => sum + (o.price * o.quantity || 0), 0)
      return { name: t.name, status: t.status, elapsedMin, currentCost: Math.round(tableCost + barCost), paused: !!ses.pausedAt }
    }
    return { name: t.name, status: t.status }
  })

  let shift: BotShiftInfo | null = null
  if (s.currentShift) {
    const sh = s.currentShift
    const sessions = s.sessionHistory.filter((x) => x.startTime >= sh.startTime)
    const tableRevenue = sessions.reduce((sum, x) => sum + (x.tableCost || 0), 0)
    const barRevenue = sessions.reduce((sum, x) => sum + (x.barCost || 0), 0)
    shift = {
      operatorName: sh.userName,
      startTime: sh.startTime,
      tableRevenue,
      barRevenue,
      total: tableRevenue + barRevenue,
      sessionsCount: sessions.length,
    }
  }

  const stock = s.barMenu
    .filter((m) => m.stock >= 0)
    .map((m) => ({ name: m.name, stock: m.stock, unit: m.unit }))
    .sort((a, b) => a.stock - b.stock)

  const recent = [...s.sessionHistory]
    .sort((a, b) => b.endTime - a.endTime)
    .slice(0, 8)
    .map((r) => ({ tableName: r.tableName, durationMin: r.duration, total: r.totalCost, endTime: r.endTime }))

  // Агрегаты выручки за период
  const aggregate = (list: typeof s.sessionHistory) => {
    const tableRevenue = list.reduce((sum, x) => sum + (x.tableCost || 0), 0)
    const barRevenue = list.reduce((sum, x) => sum + (x.barCost || 0), 0)
    return { tableRevenue, barRevenue, totalRevenue: tableRevenue + barRevenue, sessionsCount: list.length }
  }
  const weekStart = now - 7 * 24 * 60 * 60 * 1000
  const monthStart = new Date(d.getFullYear(), d.getMonth(), 1).getTime()
  const week = aggregate(s.sessionHistory.filter((x) => x.startTime >= weekStart))
  const month = aggregate(s.sessionHistory.filter((x) => x.startTime >= monthStart))

  // Разбивка по столам за сегодня
  const todayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const perTableMap = new Map<string, { sessions: number; revenue: number }>()
  s.sessionHistory.filter((x) => x.date === todayStr).forEach((x) => {
    const cur = perTableMap.get(x.tableName) ?? { sessions: 0, revenue: 0 }
    cur.sessions += 1
    cur.revenue += x.totalCost || 0
    perTableMap.set(x.tableName, cur)
  })
  const perTable = Array.from(perTableMap.entries()).map(([name, v]) => ({ name, ...v }))

  return {
    clubName: s.settings.clubName,
    currency: s.settings.currency,
    today: { date, tableRevenue: rev.table, barRevenue: rev.bar, totalRevenue: rev.total, sessionsCount: s.getTodaySessions() },
    week,
    month,
    perTable,
    tables,
    occupied: s.tables.filter((t) => t.status === 'occupied').length,
    total: s.tables.length,
    shift,
    stock,
    recent,
  }
})

// CSV-экспорт сессий за текущий месяц для Telegram-бота.
telegram.setExportProvider(() => {
  const s = useStore.getState()
  const d = new Date()
  const monthStart = new Date(d.getFullYear(), d.getMonth(), 1).getTime()
  const rows = s.sessionHistory
    .filter((x) => x.startTime >= monthStart)
    .sort((a, b) => a.startTime - b.startTime)
  if (rows.length === 0) return null
  const cur = s.settings.currency
  const pay = (m?: string) => (m === 'card' ? 'Карта' : m === 'transfer' ? 'Перевод' : 'Наличные')
  const header = `Стол;Начало;Конец;Минут;Стол (${cur});Бар (${cur});Итого (${cur});Оплата`
  const body = rows.map((x) => {
    const start = new Date(x.startTime).toLocaleString('ru-RU')
    const end = new Date(x.endTime).toLocaleString('ru-RU')
    return `${x.tableName};${start};${end};${x.duration};${x.tableCost};${x.barCost};${x.totalCost};${pay(x.paymentMethod)}`
  })
  const filename = `biliardo_${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}.csv`
  return { filename, csv: [header, ...body].join('\n') }
})

function App() {
  // Узкие селекторы вместо подписки на весь стор: App (и всё дерево страниц под ним)
  // больше не ре-рендерится на каждый тост/изменение бар-меню/историю — только когда
  // меняются реально используемые срезы. Это убирает лавину ре-рендеров, из-за которой
  // «подвисал» ввод в полях.
  const isAuthenticated = useStore((s) => s.isAuthenticated)
  const currentPage = useStore((s) => s.currentPage)
  const settings = useStore((s) => s.settings)
  const sidebarCollapsed = useStore((s) => s.sidebarCollapsed)
  const currentUser = useStore((s) => s.currentUser)
  const activeModal = useStore((s) => s.activeModal)
  const modalData = useStore((s) => s.modalData)
  const updateTableFromRelay = useStore((s) => s.updateTableFromRelay)
  const syncTablesFromArduino = useStore((s) => s.syncTablesFromArduino)
  const restoreLightsToArduino = useStore((s) => s.restoreLightsToArduino)
  const updateSettings = useStore((s) => s.updateSettings)
  const closeModal = useStore((s) => s.closeModal)
  const confirmEndShiftAndLogout = useStore((s) => s.confirmEndShiftAndLogout)
  const canManageUsers = currentUser?.role === 'admin' || currentUser?.role === 'developer'
  const [showUpdateModal, setShowUpdateModal] = useState(false)
  // «Что нового»: записи новее последней показанной версии
  const [whatsNewEntries, setWhatsNewEntries] = useState<ReturnType<typeof getUnseenEntries>>([])
  const [updater, setUpdater] = useState<UpdaterState>({
    status: 'idle',
    message: '',
    currentVersion: '',
    availableVersion: null,
    percent: null
  })

  // Применяем тему
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', settings.theme)
    document.body.setAttribute('data-theme', settings.theme)
  }, [settings.theme])

  // «Что нового»: показываем один раз после входа, если версия приложения новее показанной
  useEffect(() => {
    if (!isAuthenticated) return
    const entries = getUnseenEntries(settings.lastSeenVersion || '', __APP_VERSION__)
    if (entries.length > 0) setWhatsNewEntries(entries)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated])

  const dismissWhatsNew = () => {
    updateSettings({ lastSeenVersion: __APP_VERSION__ })
    setWhatsNewEntries([])
  }

  // Cloud Sync: если владелец залогинился в biliardo.kz — автосинк состояния каждые 30с
  // + real-time WS канал для приёма команд от веб-кабинета владельца.
  // (setSnapshotProvider зарегистрирован на уровне модуля выше — здесь только подписки)
  useEffect(() => {
    // Обработчик команд от веба: выполняем локально и возвращаем новый статус для ACK.
    const unsubCmd = cloudSync.onCommand(async (cmd) => {
      const store = useStore.getState()
      const table = store.tables.find((t) => t.id === cmd.tableId)
      if (!table) return { ok: false, error: 'TABLE_NOT_FOUND' }

      if (cmd.type === 'TABLE_TOGGLE_LIGHT') {
        store.toggleLight(cmd.tableId)
        // toggleLight синхронный — после него можно сразу читать новое состояние.
        const fresh = useStore.getState().tables.find((t) => t.id === cmd.tableId)
        return { ok: true, newStatus: fresh?.status ?? 'free' }
      }
      if (cmd.type === 'TABLE_START_SESSION') {
        if (table.status !== 'free') return { ok: false, error: 'TABLE_BUSY' }
        const p = cmd.payload ?? {}
        const mode = p.mode ?? 'unlimited'
        // Прокидываем все опции — десктопный store сам соберёт plannedDuration.
        // ВНИМАНИЕ: третий аргумент должен быть объектом (или undefined).
        // Раньше передавали null — store.startSession делал const { ... } = options
        // и падал с "Cannot destructure property 'hours' of 'null'", ACK не уходил,
        // веб висел 10 сек в watchdog.
        store.startSession(cmd.tableId, mode, {
          hours: p.hours,
          minutes: p.minutes,
          amount: p.amount,
          packagePrice: p.packagePrice,
          tariffName: p.tariffName,
          plannedDurationSeconds: p.plannedDurationSeconds,
        })
        return { ok: true, newStatus: 'occupied' }
      }
      if (cmd.type === 'TABLE_END_SESSION') {
        if (table.status !== 'occupied') return { ok: false, error: 'NOT_OCCUPIED' }
        store.endSession(cmd.tableId)
        return { ok: true, newStatus: 'free' }
      }
      return { ok: false, error: 'UNKNOWN_COMMAND' }
    })

    // Подписка на изменения столов: при каждом обновлении броадкастим SYNC через WS,
    // чтобы веб видел свежее состояние сразу (не дожидаясь интервала 30с).
    let lastTablesRef = useStore.getState().tables
    const unsubStore = useStore.subscribe((s) => {
      if (s.tables !== lastTablesRef) {
        lastTablesRef = s.tables
        cloudSync.broadcastSync()
      }
    })

    if (cloudSync.getStatus().loggedIn) {
      cloudSync.startAutoSync()
    }
    // Telegram: планировщик ежедневного итога + long-polling интерактивного бота.
    // start() сам решает, нужно ли поднимать polling (по config.enabled + токену).
    telegram.start()
    return () => {
      unsubCmd()
      unsubStore()
      cloudSync.stopAutoSync()
      telegram.stop()
    }
  }, [])

  // Автоматическая проверка обновлений при запуске и каждые 30 минут
  useEffect(() => {
    const checkUpdates = async () => {
      const updaterApi = window.electronAPI?.updater;
      if (!updaterApi) return;
      
      try {
        await updaterApi.checkForUpdates();
      } catch (error) {
        console.error('Auto update check failed:', error);
      }
    };

    // Проверяем через 10 секунд после запуска
    const initialTimeout = setTimeout(() => {
      checkUpdates();
    }, 10000);

    // Затем проверяем каждые 30 минут
    const interval = setInterval(() => {
      checkUpdates();
    }, 30 * 60 * 1000);

    return () => {
      clearTimeout(initialTimeout);
      clearInterval(interval);
    };
  }, []);

  // Слушаем событие для показа модального окна обновления
  useEffect(() => {
    const handleShowUpdateModal = () => {
      setShowUpdateModal(true);
    };

    window.addEventListener('show-update-modal', handleShowUpdateModal);
    return () => window.removeEventListener('show-update-modal', handleShowUpdateModal);
  }, []);

  // Слушаем статус обновлений
  useEffect(() => {
    const updaterApi = window.electronAPI?.updater;
    if (!updaterApi) return;

    updaterApi.getState().then(setUpdater).catch(() => null);
    updaterApi.onStatus(setUpdater);

    return () => {
      updaterApi.removeAllListeners();
    };
  }, []);

  // Автоматически закрываем модал обновления при успешной установке
  useEffect(() => {
    if (updater.status === 'installed') {
      setShowUpdateModal(false);
    }
  }, [updater.status]);

  const handleConfirmUpdate = async () => {
    const updaterApi = window.electronAPI?.updater;
    if (!updaterApi) return;

    try {
      // Скачиваем обновление если еще не скачано
      const state = await updaterApi.getState();
      if (state.status === 'available') {
        await updaterApi.downloadUpdate();
      }
      // Устанавливаем обновление
      await updaterApi.installUpdate();
    } catch (error) {
      console.error('Update installation failed:', error);
    }
  };

  const handleRestartApp = async () => {
    const updaterApi = window.electronAPI?.updater;
    if (!updaterApi) return;

    try {
      await updaterApi.installUpdate();
    } catch (error) {
      console.error('Restart failed:', error);
    }
  };

  // ЕДИНЫЙ путь авто-истечения времени/суммы для всех столов (на любой странице).
  // Раньше истечение обрабатывалось в двух местах (этот watchdog + таймер на Дашборде),
  // что приводило к гонке/двойному срабатыванию. Теперь Дашборд только показывает таймер,
  // а реально завершает сессию (с печатью чека и звуком) только этот watchdog.
  // expiredTablesRef защищает от повторной печати/завершения между тиками (печать async).
  const expiredTablesRef = useRef<Set<number>>(new Set())
  useEffect(() => {
    const interval = setInterval(() => {
      const store = useStore.getState()
      const handled = expiredTablesRef.current
      store.tables.forEach((table) => {
        if (!table.currentSession) {
          handled.delete(table.id) // стол свободен — снимаем пометку для будущей сессии
          return
        }
        const session = table.currentSession
        // На паузе время не идёт — стол не истекает
        if (session.pausedAt) return
        if ((session.mode === 'time' || session.mode === 'amount') && session.plannedDuration !== null) {
          const elapsedSec = Math.floor(getActiveElapsedMs(session.startTime, Date.now(), session.pausedAt, session.totalPausedMs) / 1000)
          if (session.plannedDuration - elapsedSec <= 0 && !handled.has(table.id)) {
            handled.add(table.id)
            const endTime = Date.now()
            const s = useStore.getState().settings
            if (s.soundEnabled) playTimerEndSound()
            // Печатаем чек по тому же endTime, затем завершаем сессию (суммы совпадут).
            void printSessionReceipt({ table, session, settings: s, endTime })
              .catch((err) => console.error('Auto-expire print failed:', err))
              .finally(() => useStore.getState().endSession(table.id, endTime))
          }
        }
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [])

  // Подписка на события Arduino для синхронизации столов
  useEffect(() => {
    if (!window.electronAPI?.arduino) return

    const arduino = window.electronAPI.arduino

    arduino.onRelayChanged((data: RelayChangeEvent) => {
      updateTableFromRelay(data.relay, data.state)
    })

    arduino.onStatusUpdate((states: boolean[]) => {
      states.forEach((state, index) => {
        updateTableFromRelay(index + 1, state)
      })
    })

    arduino.onButtonPressed((data: ButtonPressEvent) => {
      updateTableFromRelay(data.relay, data.state)
    })

    arduino.onInfo((info: RelayInfo) => {
      console.log('Arduino INFO received:', info)
      syncTablesFromArduino(info.count, info.relays)
      // Восстанавливаем состояние света после переподключения
      setTimeout(() => {
        restoreLightsToArduino()
      }, 500)
    })

    return () => {
      arduino.removeAllListeners('relay-changed')
      arduino.removeAllListeners('status-update')
      arduino.removeAllListeners('button-pressed')
      arduino.removeAllListeners('info')
    }
  }, [updateTableFromRelay, syncTablesFromArduino, restoreLightsToArduino])

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <Dashboard />
      case 'bar':
        return <BarPage key="bar" department={settings.kitchenSeparate ? 'bar' : 'combined'} />
      case 'kitchen':
        return <BarPage key="kitchen" department={settings.kitchenSeparate ? 'kitchen' : 'combined'} />
      case 'reports':
        return <ReportsPage />
      case 'settings':
        return <SettingsPage />
      case 'users':
        return canManageUsers ? <UsersPage /> : <Dashboard />
      default:
        return <Dashboard />
      case 'tournaments':
        return <TournamentPage />
      case 'tariffs':
        return <TariffsPage />
      case 'knowledge':
        return <KnowledgePage />
    }
  }

  // Если не авторизован — показываем страницу входа
  if (!isAuthenticated) {
    return (
      <>
        <LoginPage />
        <ToastContainer />
      </>
    )
  }

  return (
    <div className={`app ${settings.theme === 'light' ? 'theme-light' : ''} ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      <Sidebar />
      <main className="main-content">
        <AppHeader />
        <div className="main-content-body">
          {renderPage()}
        </div>
      </main>
      <AdBanner />
      <ToastContainer />
      {activeModal === 'logout-confirm' && Boolean(modalData?.shift) && (
        <LogoutConfirmModal
          shift={modalData?.shift as Shift}
          onConfirm={confirmEndShiftAndLogout}
          onCancel={closeModal}
        />
      )}
      {showUpdateModal && (
        <UpdateModal
          updater={updater}
          onConfirm={handleConfirmUpdate}
          onCancel={() => setShowUpdateModal(false)}
          onRestart={handleRestartApp}
        />
      )}
      {whatsNewEntries.length > 0 && (
        <WhatsNewModal entries={whatsNewEntries} onClose={dismissWhatsNew} />
      )}
    </div>
  )
}

export default App
