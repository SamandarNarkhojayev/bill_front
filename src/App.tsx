import { useEffect, useState } from 'react'
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
import ToastContainer from './components/ToastContainer'
import AdBanner from './components/AdBanner'
import UpdateModal from './components/UpdateModal'
import LogoutConfirmModal from './components/LogoutConfirmModal'
import { playTimerEndSound } from './utils/sounds'
import cloudSync from './utils/cloudSync'
import type { RelayChangeEvent, ButtonPressEvent, RelayInfo, UpdaterState } from './types/arduino'
import './App.css'

// КРИТИЧНО: регистрируем snapshot-провайдер на уровне модуля, ДО любого React-рендера.
// Если делать это внутри useEffect — при HMR / StrictMode / гонке логина с инициализацией
// cloudSync.syncNow() может стартовать раньше, чем effect успеет setSnapshotProvider,
// и завалится с "snapshot provider not set".
cloudSync.setSnapshotProvider(() => {
  const s = useStore.getState()
  return { tables: s.tables, sessionHistory: s.sessionHistory, reservations: s.reservations }
})

function App() {
  const { isAuthenticated, currentPage, updateTableFromRelay, syncTablesFromArduino, restoreLightsToArduino, settings, sidebarCollapsed, currentUser, tables, endSession, activeModal, modalData, closeModal, confirmEndShiftAndLogout } = useStore()
  const canManageUsers = currentUser?.role === 'admin' || currentUser?.role === 'developer'
  const [showUpdateModal, setShowUpdateModal] = useState(false)
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
    return () => {
      unsubCmd()
      unsubStore()
      cloudSync.stopAutoSync()
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

  // Глобальная проверка истечения времени/суммы для всех столов
  useEffect(() => {
    const interval = setInterval(() => {
      tables.forEach((table) => {
        if (!table.currentSession) return

        const session = table.currentSession
        const elapsedSec = Math.floor((Date.now() - session.startTime) / 1000)

        // Проверяем истечение по времени или сумме
        if ((session.mode === 'time' || session.mode === 'amount') && session.plannedDuration !== null) {
          const totalSec = session.plannedDuration
          const remaining = totalSec - elapsedSec

          // Если время истекло, проигрываем звук и завершаем сессию
          if (remaining <= 0) {
            if (settings.soundEnabled) playTimerEndSound()
            endSession(table.id)
          }
        }
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [tables, endSession, settings.soundEnabled])

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
      {activeModal === 'logout-confirm' && modalData?.shift && (
        <LogoutConfirmModal
          shift={modalData.shift as Shift}
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
    </div>
  )
}

export default App
