import React, { useState } from 'react';
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
} from 'lucide-react';
import { useStore } from '../store/useStore';

const SettingsPage: React.FC = () => {
  const { settings, updateSettings, sessionHistory } = useStore();
  const [localSettings, setLocalSettings] = useState({ ...settings });
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    updateSettings(localSettings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleReset = () => {
    setLocalSettings({ ...settings });
  };

  const handleFactoryReset = () => {
    const confirmed = window.confirm(
      'Сбросить приложение к заводским настройкам? Это удалит сохранённые настройки, меню бара, категории, ревизии и историю.'
    );

    if (!confirmed) return;

    localStorage.removeItem('billiard-club-storage');
    window.location.reload();
  };

  const updateTableSetting = (index: number, field: string, value: string | number | boolean) => {
    const newTables = [...localSettings.tables];
    newTables[index] = { ...newTables[index], [field]: value };
    setLocalSettings((prev) => ({ ...prev, tables: newTables }));
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
          <button onClick={handleReset} className="btn btn-ghost">
            <RotateCcw size={16} />
            Сбросить
          </button>
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
                  Авто-печать чека
                </label>
                <p className="settings-hint">Автоматически печатать чек при закрытии стола</p>
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
              <span>Активен</span>
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
                <button
                  onClick={() => updateTableSetting(index, 'isActive', !table.isActive)}
                  className={`toggle ${table.isActive ? 'on' : 'off'}`}
                >
                  <div className="toggle-dot" />
                </button>
              </div>
            ))}
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
            </div>
            <button onClick={handleFactoryReset} className="btn btn-danger">
              <Trash2 size={16} />
              Сбросить приложение
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
