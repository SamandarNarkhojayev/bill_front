import React, { useEffect, useState } from 'react';
import {
  Clock,
  Calendar,
  Play,
  Square,
  Timer,
} from 'lucide-react';
import { useStore } from '../store/useStore';

const AppHeader: React.FC = () => {
  const { currentShift, startShift, endShift } = useStore();
  const [now, setNow] = useState(Date.now());

  // Обновлять время каждую секунду
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

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

  const handleShiftToggle = () => {
    if (currentShift?.isActive) {
      if (window.confirm('Завершить смену?')) {
        endShift();
      }
    } else {
      startShift();
    }
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
        {/* Смена */}
        <div className={`header-shift ${currentShift?.isActive ? 'active' : ''}`}>
          <button
            className={`header-shift-btn ${currentShift?.isActive ? 'shift-active' : 'shift-inactive'}`}
            onClick={handleShiftToggle}
          >
            {currentShift?.isActive ? <Square size={14} /> : <Play size={14} />}
            <span>{currentShift?.isActive ? 'Завершить смену' : 'Начать смену'}</span>
          </button>
          {currentShift?.isActive && (
            <div className="header-shift-timer">
              <Timer size={14} />
              <span>{formatShiftDuration(currentShift.startTime)}</span>
            </div>
          )}
        </div>
      </div>

      <div className="header-right" />
    </header>
  );
};

export default AppHeader;
