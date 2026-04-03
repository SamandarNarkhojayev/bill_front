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
import type { RelayChangeEvent, ButtonPressEvent, RelayInfo, UpdaterState } from './types/arduino'
import './App.css'

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
        return <BarPage />
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
