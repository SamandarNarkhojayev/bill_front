import React, { useEffect, useState } from 'react';
import {
  Clock,
  Calendar,
  Timer,
  Download,
  RefreshCw,
  DollarSign,
} from 'lucide-react';
import { useStore } from '../store/useStore';
import type { UpdaterState } from '../types/arduino';

const AppHeader: React.FC = () => {
  const { currentShift, endShift, addToast, sessionHistory, settings } = useStore();
  const [now, setNow] = useState(Date.now());
  const [updater, setUpdater] = useState<UpdaterState>({
    status: 'idle',
    message: '',
    currentVersion: __APP_VERSION__,
    availableVersion: null,
    percent: null,
  });
  const [showUpdateButton, setShowUpdateButton] = useState(false);

  // Обновлять время каждую секунду
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Подписка на события обновления
  useEffect(() => {
    const updaterApi = window.electronAPI?.updater;
    if (!updaterApi) return;

    updaterApi.getState().then(setUpdater).catch(() => null);
    updaterApi.onStatus(setUpdater);

    return () => {
      updaterApi.removeAllListeners();
    };
  }, []);

  // Показывать кнопку при наличии обновления
  useEffect(() => {
    setShowUpdateButton(updater.status === 'available' || updater.status === 'downloaded');
  }, [updater.status]);

  const handleUpdateClick = () => {
    // Передаем событие родительскому компоненту через кастомное событие
    window.dispatchEvent(new CustomEvent('show-update-modal', { 
      detail: { version: updater.availableVersion } 
    }));
  };

  const formatDate = (ts: number) => {
    return new Date(ts).toLocaleDateString('ru-RU', {
      weekday: 'short',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  };

  const formatTime = (ts: number) => {
    return new Date(ts).toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const formatShiftDuration = (startTime: number) => {
    const diff = Math.floor((now - startTime) / 1000);
    const hours = Math.floor(diff / 3600);
    const minutes = Math.floor((diff % 3600) / 60);
    const seconds = diff % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  const getShiftRevenue = () => {
    if (!currentShift) return 0;
    const shiftStart = currentShift.startTime;
    const shiftEnd = currentShift.endTime || now;
    return sessionHistory
      .filter((s) => s.startTime >= shiftStart && s.startTime <= shiftEnd)
      .reduce((sum, s) => sum + s.totalCost, 0);
  };

  return (
    <header className="app-header">
      <div className="header-left">
        {/* Дата и время */}
        <div className="header-datetime">
          <div className="header-date">
            <Calendar size={14} />
            <span>{formatDate(now)}</span>
          </div>
          <div className="header-time">
            <Clock size={14} />
            <span>{formatTime(now)}</span>
          </div>
        </div>
      </div>

      <div className="header-center">
        {/* Таймер смены */}
        {currentShift?.isActive && (
          <div className="header-shift active">
            <div className="header-shift-info">
              <span className="header-shift-user">{currentShift.userName}</span>
              <div className="header-shift-timer">
                <Timer size={14} />
                <span>{formatShiftDuration(currentShift.startTime)}</span>
              </div>
              <div className="header-shift-revenue">
                <DollarSign size={14} />
                <span>{getShiftRevenue().toLocaleString()} {settings.currency}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="header-right">
        {showUpdateButton && (
          <button 
            onClick={handleUpdateClick}
            className="header-update-btn"
            title={`Доступно обновление v${updater.availableVersion}`}
          >
            {updater.status === 'downloaded' ? (
              <>
                <Download size={16} />
                <span>Установить v{updater.availableVersion}</span>
              </>
            ) : (
              <>
                <RefreshCw size={16} />
                <span>Обновление v{updater.availableVersion}</span>
              </>
            )}
            <span className="update-badge-pulse" />
          </button>
        )}
      </div>
    </header>
  );
};

export default AppHeader;
