import React, { useEffect, useState, useCallback } from 'react';
import {
  Settings,
  Save,
  RotateCcw,
  Lightbulb,
  Hash,
  Building2,
  Trash2,
  Cpu,
  Printer,
  Download,
  RefreshCw,
  Usb,
  Unplug,
  Plug,
  Search,
} from 'lucide-react';
import { useStore } from '../store/useStore';
import type { UpdaterState, SerialPort as SerialPortInfo } from '../types/arduino';

const SettingsPage: React.FC = () => {
  const { settings, updateSettings, sessionHistory, currentUser } = useStore();
  const [localSettings, setLocalSettings] = useState({ ...settings });
  const [saved, setSaved] = useState(false);
  const canDeleteData = currentUser?.role === 'admin' || currentUser?.role === 'developer';
  const [updater, setUpdater] = useState<UpdaterState>({
    status: 'idle',
    message: 'Ожидание проверки обновлений',
    currentVersion: __APP_VERSION__,
    availableVersion: null,
    percent: null,
  });

  // ===== Состояния для Serial-порта =====
  const [allPorts, setAllPorts] = useState<SerialPortInfo[]>([]);
  const [selectedPortPath, setSelectedPortPath] = useState<string | null>(localSettings.savedPortPath || null);
  const [isArduinoConnected, setIsArduinoConnected] = useState(false);
  const [portLoading, setPortLoading] = useState(false);
  const [portStatus, setPortStatus] = useState<string>('');
  const [isRelayTestRunning, setIsRelayTestRunning] = useState(false);
  const [relayTestMode, setRelayTestMode] = useState<'ultra' | 'fast' | 'medium' | 'slow'>('medium');

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const formatPhone = (value: string, prevValue = '') => {
    let digits = value.replace(/\D/g, '');
    const prevDigitsRaw = prevValue.replace(/\D/g, '');

    // Если удалили только символ-разделитель (пробел/скобку/дефис), удаляем и последнюю цифру
    if (value.length < prevValue.length && digits.length === prevDigitsRaw.length) {
      digits = digits.slice(0, -1);
    }

    if (digits.startsWith('8')) digits = '7' + digits.slice(1);
    if (!digits.startsWith('7')) digits = '7' + digits;
    digits = digits.slice(0, 11);

    const local = digits.slice(1);
    let formatted = '+7';
    if (local.length > 0) formatted += ` (${local.slice(0, 3)}`;
    if (local.length >= 3) formatted += ')';
    if (local.length > 3) formatted += ` ${local.slice(3, 6)}`;
    if (local.length > 6) formatted += `-${local.slice(6, 8)}`;
    if (local.length > 8) formatted += `-${local.slice(8, 10)}`;
    return formatted;
  };

  const handleRelayMusicTest = async () => {
    const api = window.electronAPI?.arduino;
    if (!api || isRelayTestRunning) return;

    setIsRelayTestRunning(true);
    setPortStatus('🎵 Тест реле запущен...');

    try {
      const connected = await api.isConnected();
      if (!connected) {
        setPortStatus('❌ Arduino не подключен');
        return;
      }

      const relayNumbers = Array.from(
        new Set(
          localSettings.tables
            .filter((t) => t.isActive)
            .map((t) => t.relayNumber)
        )
      ).sort((a, b) => a - b);

      const availableRelays = relayNumbers.length > 0 ? relayNumbers : [1, 2, 3, 4, 5, 6];

      const speedConfig: Record<'ultra' | 'fast' | 'medium' | 'slow', { onMs: number; offMs: number; label: string }> = {
        ultra: { onMs: 45, offMs: 30, label: 'ультра быстрый' },
        fast: { onMs: 90, offMs: 55, label: 'быстрый' },
        medium: { onMs: 140, offMs: 80, label: 'средний' },
        slow: { onMs: 220, offMs: 140, label: 'медленный' },
      };
      const speed = speedConfig[relayTestMode];

      setPortStatus(`🎵 Тест реле: ${speed.label}`);

      // «Музыкальный» порядок: подъём + спуск + акценты
      const pattern = [
        ...availableRelays,
        ...[...availableRelays].reverse(),
        availableRelays[0],
        availableRelays[Math.floor(availableRelays.length / 2)],
        availableRelays[availableRelays.length - 1],
      ].filter((relay): relay is number => typeof relay === 'number');

      for (const relay of pattern) {
        await api.setRelay(relay, true);
        await sleep(speed.onMs);
        await api.setRelay(relay, false);
        await sleep(speed.offMs);
      }

      setPortStatus('✅ Тест реле завершён');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setPortStatus(`❌ Ошибка теста: ${msg}`);
    } finally {
      // Страховка: выключаем все активные реле после теста
      try {
        const api2 = window.electronAPI?.arduino;
        if (api2) {
          const relayNumbers = Array.from(
            new Set(localSettings.tables.filter((t) => t.isActive).map((t) => t.relayNumber))
          );
          const relays = relayNumbers.length > 0 ? relayNumbers : [1, 2, 3, 4, 5, 6];
          await Promise.all(relays.map((relay) => api2.setRelay(relay, false).catch(() => undefined)));
        }
      } catch {
        // ignore
      }

      setIsRelayTestRunning(false);
      setTimeout(() => setPortStatus(''), 3000);
    }
  };

  const loadAllPorts = useCallback(async () => {
    const api = window.electronAPI?.arduino;
    if (!api) return;
    setPortLoading(true);
    try {
      const ports = await api.listAllPorts();
      setAllPorts(ports);
      const connected = await api.isConnected();
      setIsArduinoConnected(connected);
    } catch {
      setAllPorts([]);
    } finally {
      setPortLoading(false);
    }
  }, []);

  const handleSavePort = async () => {
    const api = window.electronAPI?.arduino;
    if (!api) return;

    // Сохраняем в main process
    await api.savePort(selectedPortPath);
    // Сохраняем в настройки (zustand persist)
    updateSettings({ savedPortPath: selectedPortPath });
    setLocalSettings((prev) => ({ ...prev, savedPortPath: selectedPortPath }));
    setPortStatus(selectedPortPath ? `Порт ${selectedPortPath} сохранён` : 'Порт сброшен (авто-поиск)');
    setTimeout(() => setPortStatus(''), 3000);
  };

  const handleConnectToPort = async () => {
    const api = window.electronAPI?.arduino;
    if (!api || !selectedPortPath) return;
    setPortLoading(true);
    setPortStatus('');
    try {
      // Сохраняем порт + переподключаемся
      await api.savePort(selectedPortPath);
      updateSettings({ savedPortPath: selectedPortPath });
      setLocalSettings((prev) => ({ ...prev, savedPortPath: selectedPortPath }));

      // Отключаемся от текущего и подключаемся к новому
      if (isArduinoConnected) {
        await api.disconnect();
      }
      await api.connect(selectedPortPath);
      setIsArduinoConnected(true);
      setPortStatus(`✅ Подключено к ${selectedPortPath}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setPortStatus(`❌ Ошибка: ${msg}`);
      setIsArduinoConnected(false);
    } finally {
      setPortLoading(false);
      setTimeout(() => setPortStatus(''), 5000);
    }
  };

  const handleDisconnect = async () => {
    const api = window.electronAPI?.arduino;
    if (!api) return;
    try {
      await api.disconnect();
      setIsArduinoConnected(false);
      setPortStatus('Устройство отключено');
      setTimeout(() => setPortStatus(''), 3000);
    } catch {
      // ignore
    }
  };

  const handleResetPort = async () => {
    const api = window.electronAPI?.arduino;
    if (!api) return;
    setSelectedPortPath(null);
    await api.savePort(null);
    updateSettings({ savedPortPath: null });
    setLocalSettings((prev) => ({ ...prev, savedPortPath: null }));
    setPortStatus('Порт сброшен. Будет использован авто-поиск.');
    setTimeout(() => setPortStatus(''), 3000);
  };

  const handleAutoSearch = async () => {
    const api = window.electronAPI?.arduino;
    if (!api) return;
    setPortLoading(true);
    setPortStatus('Поиск ESP32 устройства...');
    try {
      // Сбрасываем ручной порт, чтобы автопоиск сработал
      await api.savePort(null);
      updateSettings({ savedPortPath: null });
      setLocalSettings((prev) => ({ ...prev, savedPortPath: null }));
      setSelectedPortPath(null);

      const result = await api.reconnect();
      if (result.connected) {
        const connected = await api.isConnected();
        setIsArduinoConnected(connected);
        setPortStatus('✅ Устройство найдено и подключено автоматически!');
      } else {
        setPortStatus('❌ Устройство не найдено. Выберите порт вручную.');
      }
      await loadAllPorts();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setPortStatus(`❌ Ошибка: ${msg}`);
    } finally {
      setPortLoading(false);
      setTimeout(() => setPortStatus(''), 5000);
    }
  };

  // Загружаем порты при монтировании
  useEffect(() => {
    loadAllPorts();
    // Загружаем сохранённый порт из main process
    window.electronAPI?.arduino?.getSavedPort().then((port) => {
      if (port) setSelectedPortPath(port);
    });
  }, [loadAllPorts]);

  const handleSave = () => {
    updateSettings(localSettings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  // const handleReset = () => {
  //   setLocalSettings({ ...settings });
  // };

  const handleFactoryReset = () => {
    if (!canDeleteData) {
      return;
    }

    const confirmed = window.confirm(
      'Сбросить приложение к заводским настройкам? Это удалит сохранённые настройки, меню бара, категории, ревизии и историю.'
    );

    if (!confirmed) return;

    localStorage.removeItem('billiard-club-storage');
    // Также очищаем файловое хранилище (Electron)
    if (window.electronAPI?.store) {
      window.electronAPI.store.remove('billiard-club-storage').catch(() => {});
    }
    window.location.reload();
  };

  const updateTableSetting = (index: number, field: string, value: string | number | boolean) => {
    const newTables = [...localSettings.tables];
    newTables[index] = { ...newTables[index], [field]: value };
    setLocalSettings((prev) => ({ ...prev, tables: newTables }));
  };

  useEffect(() => {
    const updaterApi = window.electronAPI?.updater;
    if (!updaterApi) return;

    updaterApi.getState().then(setUpdater).catch(() => null);
    updaterApi.onStatus(setUpdater);

    return () => {
      updaterApi.removeAllListeners();
    };
  }, []);

  const handleCheckUpdates = async () => {
    await window.electronAPI?.updater?.checkForUpdates();
  };

  const handleDownloadUpdate = async () => {
    await window.electronAPI?.updater?.downloadUpdate();
  };

  const handleInstallUpdate = async () => {
    const confirmed = window.confirm('Установить обновление сейчас? Приложение перезапустится.');
    if (!confirmed) return;
    await window.electronAPI?.updater?.installUpdate();
  };


  return (
    <div className="page-content">
      <div className="page-header">
        <div className="page-header-left">
          <Settings size={28} className="text-slate-300" />
          <h2 className="page-title">Настройки</h2>
        </div>
        <div className="page-header-actions">
          {saved && (
            <span className="save-indicator">
              ✓ Сохранено
            </span>
          )}
          {/* <button onClick={handleReset} className="btn btn-ghost">
            <RotateCcw size={16} />
            Сбросить
          </button> */}
          <button onClick={handleSave} className="btn btn-primary">
            <Save size={16} />
            Сохранить
          </button>
        </div>
      </div>

      <div className="settings-grid">
        {/* Основные */}
        <div className="settings-section">
          <h3 className="settings-section-title">
            <Building2 size={18} />
            Основные
          </h3>
          <div className="settings-fields">
            <div className="settings-field">
              <label className="settings-label">Название клуба</label>
              <input
                type="text"
                value={localSettings.clubName}
                onChange={(e) =>
                  setLocalSettings((prev) => ({ ...prev, clubName: e.target.value }))
                }
                className="form-input"
              />
            </div>
            <div className="settings-field">
              <label className="settings-label">Юр. название в пречеке</label>
              <input
                type="text"
                value={localSettings.receiptCompanyName}
                onChange={(e) =>
                  setLocalSettings((prev) => ({ ...prev, receiptCompanyName: e.target.value }))
                }
                className="form-input"
                placeholder="ИП Coffee Time"
              />
            </div>
            <div className="settings-field">
              <label className="settings-label">Город</label>
              <input
                type="text"
                value={localSettings.receiptCity}
                onChange={(e) =>
                  setLocalSettings((prev) => ({ ...prev, receiptCity: e.target.value }))
                }
                className="form-input"
                placeholder="г. Шымкент"
              />
            </div>
            <div className="settings-field">
              <label className="settings-label">Телефон</label>
              <input
                type="tel"
                value={localSettings.receiptPhone}
                onChange={(e) =>
                  setLocalSettings((prev) => ({ ...prev, receiptPhone: formatPhone(e.target.value, prev.receiptPhone) }))
                }
                className="form-input"
                placeholder="+7 (777) 123-45-67"
              />
            </div>
            <div className="settings-field">
              <label className="settings-label">Кассир (по умолчанию)</label>
              <input
                type="text"
                value={localSettings.receiptCashierName}
                onChange={(e) =>
                  setLocalSettings((prev) => ({ ...prev, receiptCashierName: e.target.value }))
                }
                className="form-input"
                placeholder="ИМЯ"
              />
            </div>
          </div>
        </div>

        {/* Автоматизация */}
        <div className="settings-section">
          <h3 className="settings-section-title">
            <Lightbulb size={18} />
            Автоматизация
          </h3>
          <div className="settings-fields">
            {/* <div className="settings-toggle-field">
              <div>
                <label className="settings-label">Авто-выключение света</label>
                <p className="settings-hint">
                  Автоматически выключать свет при завершении игры
                </p>
              </div>
              <button
                onClick={() =>
                  setLocalSettings((prev) => ({ ...prev, autoLightOff: !prev.autoLightOff }))
                }
                className={`toggle ${localSettings.autoLightOff ? 'on' : 'off'}`}
              >
                <div className="toggle-dot" />
              </button>
            </div> */}
            <div className="settings-toggle-field">
              <div>
                <label className="settings-label">Звуковые уведомления</label>
                <p className="settings-hint">Звуковой сигнал при событиях</p>
              </div>
              <button
                onClick={() =>
                  setLocalSettings((prev) => ({ ...prev, soundEnabled: !prev.soundEnabled }))
                }
                className={`toggle ${localSettings.soundEnabled ? 'on' : 'off'}`}
              >
                <div className="toggle-dot" />
              </button>
            </div>
            <div className="settings-toggle-field">
              <div>
                <label className="settings-label">
                  <Printer size={14} style={{ marginRight: 6 }} />
                  Авто-печать
                </label>
                <p className="settings-hint">Автоматически печатать пречек при закрытии стола</p>
              </div>
              <button
                onClick={() =>
                  setLocalSettings((prev) => ({ ...prev, autoPrintReceipt: !prev.autoPrintReceipt }))
                }
                className={`toggle ${localSettings.autoPrintReceipt ? 'on' : 'off'}`}
              >
                <div className="toggle-dot" />
              </button>
            </div>
            <div className="settings-toggle-field">
              <div>
                <label className="settings-label">
                  <Printer size={14} style={{ marginRight: 6 }} />
                  Режим печати
                </label>
                <p className="settings-hint">
                  {localSettings.silentPrint ? 'Автоматически (без диалога принтера)' : 'Вручную (показывать диалог выбора принтера)'}
                </p>
              </div>
              <button
                onClick={() =>
                  setLocalSettings((prev) => ({ ...prev, silentPrint: !prev.silentPrint }))
                }
                className={`toggle ${localSettings.silentPrint ? 'on' : 'off'}`}
              >
                <div className="toggle-dot" />
              </button>
            </div>
          </div>
        </div>

        {/* Столы */}
        <div className="settings-section settings-section-full">
          <div className="settings-section-header">
            <h3 className="settings-section-title">
              <Hash size={18} />
              Столы
            </h3>
            <span className="settings-hint" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Cpu size={14} />
              Кол-во столов определяется автоматически ({localSettings.tables.length} реле)
            </span>
          </div>
          <div className="settings-tables">
            <div className="settings-table-header">
              <span>Название</span>
              <span>Реле №</span>
              <span>Цена/час</span>
            </div>
            {localSettings.tables.map((table, index) => (
              <div key={index} className="settings-table-row">
                <input
                  type="text"
                  value={table.name}
                  onChange={(e) => updateTableSetting(index, 'name', e.target.value)}
                  className="form-input"
                />
                <span className="settings-relay-badge">
                  {table.relayNumber}
                </span>
                <input
                  type="number"
                  value={table.pricePerHour}
                  onChange={(e) =>
                    updateTableSetting(index, 'pricePerHour', Number(e.target.value))
                  }
                  className="form-input form-input-sm"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Настройки печати */}
        <div className="settings-section">
          <h3 className="settings-section-title">
            <Printer size={18} />
            Настройки печати
          </h3>
          <div className="settings-fields">
            <div className="settings-field">
              <label className="settings-label">Ширина бумаги (мм)</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input
                  type="range"
                  min={40}
                  max={120}
                  step={1}
                  value={localSettings.receiptWidthMm}
                  onChange={(e) =>
                    setLocalSettings((prev) => ({ ...prev, receiptWidthMm: Number(e.target.value) }))
                  }
                  style={{ flex: 1 }}
                />
                <input
                  type="number"
                  min={40}
                  max={120}
                  value={localSettings.receiptWidthMm}
                  onChange={(e) =>
                    setLocalSettings((prev) => ({ ...prev, receiptWidthMm: Math.max(40, Math.min(120, Number(e.target.value))) }))
                  }
                  className="form-input form-input-sm"
                  style={{ width: 70, textAlign: 'center' }}
                />
                <span style={{ fontSize: 12, color: '#94a3b8' }}>мм</span>
              </div>
              <p className="settings-hint">Стандарт: 58мм (узкий) или 80мм (широкий)</p>
            </div>
            <div className="settings-field">
              <label className="settings-label">Размер шрифта (px)</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input
                  type="range"
                  min={8}
                  max={24}
                  step={1}
                  value={localSettings.receiptFontSize}
                  onChange={(e) =>
                    setLocalSettings((prev) => ({ ...prev, receiptFontSize: Number(e.target.value) }))
                  }
                  style={{ flex: 1 }}
                />
                <input
                  type="number"
                  min={8}
                  max={24}
                  value={localSettings.receiptFontSize}
                  onChange={(e) =>
                    setLocalSettings((prev) => ({ ...prev, receiptFontSize: Math.max(8, Math.min(24, Number(e.target.value))) }))
                  }
                  className="form-input form-input-sm"
                  style={{ width: 70, textAlign: 'center' }}
                />
                <span style={{ fontSize: 12, color: '#94a3b8' }}>px</span>
              </div>
            </div>
            <div className="settings-field">
              <label className="settings-label">Отступы (мм)</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input
                  type="range"
                  min={0}
                  max={15}
                  step={1}
                  value={localSettings.receiptPaddingMm}
                  onChange={(e) =>
                    setLocalSettings((prev) => ({ ...prev, receiptPaddingMm: Number(e.target.value) }))
                  }
                  style={{ flex: 1 }}
                />
                <input
                  type="number"
                  min={0}
                  max={15}
                  value={localSettings.receiptPaddingMm}
                  onChange={(e) =>
                    setLocalSettings((prev) => ({ ...prev, receiptPaddingMm: Math.max(0, Math.min(15, Number(e.target.value))) }))
                  }
                  className="form-input form-input-sm"
                  style={{ width: 70, textAlign: 'center' }}
                />
                <span style={{ fontSize: 12, color: '#94a3b8' }}>мм</span>
              </div>
            </div>
          </div>
        </div>

        {/* Данные */}
        <div className="settings-section">
          <h3 className="settings-section-title">
            <Trash2 size={18} />
            Данные
          </h3>
          <div className="settings-fields">
            <div className="settings-info">
              <p>Записей в истории: <strong>{sessionHistory.length}</strong></p>
              <p>Полный сброс вернёт приложение к значениям по умолчанию при следующем старте.</p>
              {!canDeleteData && (
                <p>Удаление данных доступно только администратору или разработчику.</p>
              )}
            </div>
            <button onClick={handleFactoryReset} className="btn btn-danger" disabled={!canDeleteData}>
              <Trash2 size={16} />
              Сбросить приложение
            </button>
          </div>
        </div>

        {/* Обновления */}
        <div className="settings-section">
          <h3 className="settings-section-title">
            <RefreshCw size={18} />
            Обновление приложения
          </h3>
          <div className="settings-fields">
            <div className="settings-info">
              <p>Текущая версия: <strong>v{updater.currentVersion || __APP_VERSION__}</strong></p>
              {updater.availableVersion && (
                <p>Доступная версия: <strong>v{updater.availableVersion}</strong></p>
              )}
              <p>{updater.message}</p>
            </div>

            <div className="page-header-actions" style={{ justifyContent: 'flex-start' }}>
              <button
                onClick={handleCheckUpdates}
                className="btn btn-ghost"
                disabled={updater.status === 'checking' || updater.status === 'downloading'}
              >
                <RefreshCw size={16} />
                Проверить обновления
              </button>

              {updater.status === 'available' && (
                <button onClick={handleDownloadUpdate} className="btn btn-primary">
                  <Download size={16} />
                  Скачать обновление
                </button>
              )}

              {updater.status === 'downloaded' && (
                <button onClick={handleInstallUpdate} className="btn btn-primary">
                  <RefreshCw size={16} />
                  Установить и перезапустить
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Порт устройства */}
        <div className="settings-section settings-section-full">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <h3 className="settings-section-title" style={{ margin: 0 }}>
              <Usb size={16} />
              Порт ESP32
              <span style={{ fontSize: 12, fontWeight: 400, marginLeft: 8, color: isArduinoConnected ? '#22c55e' : '#ef4444' }}>
                {isArduinoConnected ? '● подключено' : '● не подключено'}
              </span>
              {localSettings.savedPortPath && (
                <span style={{ fontSize: 11, fontWeight: 400, marginLeft: 8, color: '#64748b' }}>
                  ({localSettings.savedPortPath})
                </span>
              )}
            </h3>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <button onClick={handleAutoSearch} className="btn btn-ghost" disabled={portLoading} style={{ padding: '4px 10px', fontSize: 12 }}>
                <Search size={13} />
                Автопоиск
              </button>
              <button onClick={loadAllPorts} className="btn btn-ghost" disabled={portLoading} style={{ padding: '4px 10px', fontSize: 12 }}>
                <RefreshCw size={13} className={portLoading ? 'animate-spin' : ''} />
                Обновить
              </button>
              <select
                value={relayTestMode}
                onChange={(e) => setRelayTestMode(e.target.value as 'ultra' | 'fast' | 'medium' | 'slow')}
                className="form-input"
                disabled={isRelayTestRunning || portLoading}
                style={{ padding: '4px 8px', fontSize: 12, minWidth: 150 }}
              >
                <option value="ultra">Ультра быстрый</option>
                <option value="fast">Быстрый</option>
                <option value="medium">Средний</option>
                <option value="slow">Медленный</option>
              </select>
              <button
                onClick={handleRelayMusicTest}
                className="btn btn-ghost"
                disabled={!isArduinoConnected || isRelayTestRunning || portLoading}
                style={{ padding: '4px 10px', fontSize: 12 }}
              >
                <Cpu size={13} />
                {isRelayTestRunning ? 'Тест...' : 'Тест реле'}
              </button>
              {isArduinoConnected && (
                <button onClick={handleDisconnect} className="btn btn-danger" style={{ padding: '4px 10px', fontSize: 12 }}>
                  <Unplug size={13} />
                  Отключить
                </button>
              )}
              {localSettings.savedPortPath && (
                <button onClick={handleResetPort} className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 12 }}>
                  <RotateCcw size={13} />
                  Сброс
                </button>
              )}
            </div>
          </div>

          {portStatus && (
            <p style={{ fontSize: 12, marginTop: 8, color: portStatus.startsWith('✅') ? '#22c55e' : portStatus.startsWith('❌') ? '#ef4444' : '#94a3b8' }}>
              {portStatus}
            </p>
          )}

          {allPorts.length > 0 ? (
            <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <select
                value={selectedPortPath || ''}
                onChange={(e) => setSelectedPortPath(e.target.value || null)}
                className="form-input"
                style={{ flex: 1, minWidth: 180, maxWidth: 360, fontSize: 13, padding: '6px 10px' }}
              >
                <option value="">— выберите порт —</option>
                {allPorts.map((port) => {
                  const hint = [port.manufacturer, port.product, port.friendlyName].filter(Boolean).join(' · ');
                  const isJtag = (port.product || '').toLowerCase().includes('jtag') || (port.friendlyName || '').toLowerCase().includes('jtag');
                  const isBiliardo = (port.manufacturer || '').toLowerCase().includes('biliardo');
                  const tag = isBiliardo ? ' ★ Biliardo' : isJtag ? ' ★ ESP32' : '';
                  return (
                    <option key={port.path} value={port.path}>
                      {port.path}{hint ? ` (${hint})` : ''}{tag}
                    </option>
                  );
                })}
              </select>
              <button onClick={handleConnectToPort} className="btn btn-primary" disabled={!selectedPortPath || portLoading} style={{ padding: '6px 12px', fontSize: 12 }}>
                <Plug size={13} />
                Подключить
              </button>
              <button onClick={handleSavePort} className="btn btn-ghost" disabled={!selectedPortPath} style={{ padding: '6px 12px', fontSize: 12 }}>
                <Save size={13} />
                Сохранить
              </button>
            </div>
          ) : (
            <p style={{ color: '#64748b', fontSize: 12, marginTop: 8 }}>
              {portLoading ? 'Поиск...' : 'Нет портов. Подключите ESP32.'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
