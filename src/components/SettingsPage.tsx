import React, { useEffect, useState, useCallback } from "react";
import {
  Settings,
  Save,
  RotateCcw,
  Lightbulb,
  Building2,
  Trash2,
  Cpu,
  Printer,
  RefreshCw,
  Usb,
  Unplug,
  Plug,
  Search,
  Download,
  Upload,
  Shield,
  FolderArchive,
  History,
  ChefHat,
  Languages,
  BookOpen,
  Menu,
  Pin,
  PinOff,
  Percent,
  Eye,
  EyeOff,
  Users,
} from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { useStore } from "../store/useStore";
import { useT, LANGUAGES } from "../i18n";
import type { PageType } from "../types";
import CloudSyncSection from "./CloudSyncSection";
import TelegramSection from "./TelegramSection";
import NumberInput from "./NumberInput";
import { showConfirm } from "./confirmController";
import type { SerialPort as SerialPortInfo } from "../types/arduino";

const SettingsPage: React.FC = () => {
  const {
    settings,
    updateSettings,
    sessionHistory,
    currentUser,
    currentPage,
    setCurrentPage,
  } = useStore(
    useShallow((s) => ({
      settings: s.settings,
      updateSettings: s.updateSettings,
      sessionHistory: s.sessionHistory,
      currentUser: s.currentUser,
      currentPage: s.currentPage,
      setCurrentPage: s.setCurrentPage,
    })),
  );
  const { t } = useT();

  // Пункты бокового меню, доступные для закрепления (зависят от прав и разделения кухни)
  const sidebarConfigItems: { id: PageType; labelKey: string }[] = [
    { id: "dashboard", labelKey: "nav.dashboard" },
    { id: "bar", labelKey: "nav.bar" },
    ...(settings.kitchenSeparate
      ? [{ id: "kitchen" as PageType, labelKey: "nav.kitchen" }]
      : []),
    { id: "tournaments", labelKey: "nav.tournaments" },
    { id: "tariffs", labelKey: "nav.tariffs" },
    { id: "reports", labelKey: "nav.reports" },
    ...(currentUser?.role === "admin" || currentUser?.role === "developer"
      ? [{ id: "users" as PageType, labelKey: "nav.users" }]
      : []),
    { id: "settings", labelKey: "nav.settings" },
  ];

  const togglePin = (id: PageType) => {
    setLocalSettings((prev) => {
      const cur = prev.sidebarPinned || [];
      const next = cur.includes(id)
        ? cur.filter((x) => x !== id)
        : [...cur, id];
      updateSettings({ sidebarPinned: next });
      return { ...prev, sidebarPinned: next };
    });
  };
  const [localSettings, setLocalSettings] = useState({ ...settings });
  const [saved, setSaved] = useState(false);
  const canDeleteData =
    currentUser?.role === "admin" || currentUser?.role === "developer";
  const isRegularUser = currentUser?.role === "user";
  const canAccessAllSettings = !isRegularUser;
  // Технические разделы и интеграции — только у разработчика (скрыты от админа и юзера).
  const isDeveloper = currentUser?.role === "developer";
  // Управление пользователями/доступом — админ и разработчик.
  const canManageUsers =
    currentUser?.role === "admin" || currentUser?.role === "developer";

  // Страницы, видимость которых для роли «user» настраивает админ (dashboard всегда виден).
  const userMenuConfigItems: { id: PageType; labelKey: string }[] = [
    { id: "dashboard", labelKey: "nav.dashboard" },
    { id: "bar", labelKey: "nav.bar" },
    ...(settings.kitchenSeparate
      ? [{ id: "kitchen" as PageType, labelKey: "nav.kitchen" }]
      : []),
    { id: "reports", labelKey: "nav.reports" },
    { id: "settings", labelKey: "nav.settings" },
  ];

  const toggleUserPage = (id: PageType) => {
    if (id === "dashboard") return; // dashboard виден всегда
    setLocalSettings((prev) => {
      const cur = prev.userVisiblePages || [];
      const next = cur.includes(id)
        ? cur.filter((x) => x !== id)
        : [...cur, id];
      updateSettings({ userVisiblePages: next });
      return { ...prev, userVisiblePages: next };
    });
  };

  // ===== Состояния для Serial-порта =====
  const [allPorts, setAllPorts] = useState<SerialPortInfo[]>([]);
  const [selectedPortPath, setSelectedPortPath] = useState<string | null>(
    localSettings.savedPortPath || null,
  );
  const [isArduinoConnected, setIsArduinoConnected] = useState(false);
  const [portLoading, setPortLoading] = useState(false);
  const [portStatus, setPortStatus] = useState<string>("");
  const [isRelayTestRunning, setIsRelayTestRunning] = useState(false);
  const [relayTestMode, setRelayTestMode] = useState<
    "ultra" | "fast" | "medium" | "slow"
  >("medium");

  // ===== Состояния для бэкапов =====
  const [backupList, setBackupList] = useState<BackupEntry[]>([]);
  const [backupLoading, setBackupLoading] = useState(false);
  const [backupStatus, setBackupStatus] = useState("");
  const [showBackupList, setShowBackupList] = useState(false);

  // ===== Состояния для обновлений =====
  const [updateChecking, setUpdateChecking] = useState(false);
  const [updateStatus, setUpdateStatus] = useState("");

  // ===== Принтеры =====
  const [availablePrinters, setAvailablePrinters] = useState<
    { name: string; displayName?: string }[]
  >([]);

  const loadPrinters = useCallback(async () => {
    try {
      const list = await window.electronAPI?.printer?.getPrinters?.();
      if (Array.isArray(list)) {
        setAvailablePrinters(
          list.map((p) => ({ name: p.name, displayName: p.displayName })),
        );
      }
    } catch (err) {
      console.error("Не удалось получить список принтеров:", err);
    }
  }, []);

  useEffect(() => {
    loadPrinters();
  }, [loadPrinters]);

  const handleTestPrint = async (
    deviceName: string,
    kind: "receipt" | "kitchen",
  ) => {
    const html =
      kind === "kitchen"
        ? `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>@page{size:${localSettings.receiptWidthMm}mm auto;margin:0}body{font-family:'Courier New',monospace;width:${localSettings.receiptWidthMm}mm;padding:${localSettings.receiptPaddingMm}mm;text-align:center}h2{font-size:${localSettings.receiptFontSize + 8}px;font-weight:900}</style></head><body><h2>★ КУХНЯ ★</h2><p>Тестовая печать</p><p>${deviceName || "принтер по умолчанию"}</p></body></html>`
        : `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>@page{size:${localSettings.receiptWidthMm}mm auto;margin:0}body{font-family:'Courier New',monospace;width:${localSettings.receiptWidthMm}mm;padding:${localSettings.receiptPaddingMm}mm;text-align:center}h2{font-size:${localSettings.receiptFontSize + 4}px;font-weight:800}</style></head><body><h2>ЧЕК</h2><p>Тестовая печать</p><p>${deviceName || "принтер по умолчанию"}</p></body></html>`;
    try {
      await window.electronAPI?.printer?.printReceipt(
        html,
        localSettings.receiptWidthMm,
        true,
        deviceName,
      );
    } catch (err) {
      console.error("Ошибка тестовой печати:", err);
    }
  };

  const sleep = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms));

  const formatPhone = (value: string, prevValue = "") => {
    let digits = value.replace(/\D/g, "");
    const prevDigitsRaw = prevValue.replace(/\D/g, "");

    // Если удалили только символ-разделитель (пробел/скобку/дефис), удаляем и последнюю цифру
    if (
      value.length < prevValue.length &&
      digits.length === prevDigitsRaw.length
    ) {
      digits = digits.slice(0, -1);
    }

    if (digits.startsWith("8")) digits = "7" + digits.slice(1);
    if (!digits.startsWith("7")) digits = "7" + digits;
    digits = digits.slice(0, 11);

    const local = digits.slice(1);
    let formatted = "+7";
    if (local.length > 0) formatted += ` (${local.slice(0, 3)}`;
    if (local.length >= 3) formatted += ")";
    if (local.length > 3) formatted += ` ${local.slice(3, 6)}`;
    if (local.length > 6) formatted += `-${local.slice(6, 8)}`;
    if (local.length > 8) formatted += `-${local.slice(8, 10)}`;
    return formatted;
  };

  const handleRelayMusicTest = async () => {
    const api = window.electronAPI?.arduino;
    if (!api || isRelayTestRunning) return;

    setIsRelayTestRunning(true);
    setPortStatus("🎵 Тест реле запущен...");

    try {
      const connected = await api.isConnected();
      if (!connected) {
        setPortStatus("❌ Контроллер не подключен");
        return;
      }

      const relayNumbers = Array.from(
        new Set(
          localSettings.tables
            .filter((t) => t.isActive)
            .map((t) => t.relayNumber),
        ),
      ).sort((a, b) => a - b);

      const availableRelays =
        relayNumbers.length > 0 ? relayNumbers : [1, 2, 3, 4, 5, 6];

      const speedConfig: Record<
        "ultra" | "fast" | "medium" | "slow",
        { onMs: number; offMs: number; label: string }
      > = {
        ultra: { onMs: 45, offMs: 30, label: "ультра быстрый" },
        fast: { onMs: 90, offMs: 55, label: "быстрый" },
        medium: { onMs: 140, offMs: 80, label: "средний" },
        slow: { onMs: 220, offMs: 140, label: "медленный" },
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
      ].filter((relay): relay is number => typeof relay === "number");

      for (const relay of pattern) {
        await api.setRelay(relay, true);
        await sleep(speed.onMs);
        await api.setRelay(relay, false);
        await sleep(speed.offMs);
      }

      setPortStatus("✅ Тест реле завершён");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setPortStatus(`❌ Ошибка теста: ${msg}`);
    } finally {
      // Страховка: выключаем все активные реле после теста
      try {
        const api2 = window.electronAPI?.arduino;
        if (api2) {
          const relayNumbers = Array.from(
            new Set(
              localSettings.tables
                .filter((t) => t.isActive)
                .map((t) => t.relayNumber),
            ),
          );
          const relays =
            relayNumbers.length > 0 ? relayNumbers : [1, 2, 3, 4, 5, 6];
          await Promise.all(
            relays.map((relay) =>
              api2.setRelay(relay, false).catch(() => undefined),
            ),
          );
        }
      } catch {
        // ignore
      }

      setIsRelayTestRunning(false);
      setTimeout(() => setPortStatus(""), 3000);
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
    setPortStatus(
      selectedPortPath
        ? `Порт ${selectedPortPath} сохранён`
        : "Порт сброшен (авто-поиск)",
    );
    setTimeout(() => setPortStatus(""), 3000);
  };

  const handleConnectToPort = async () => {
    const api = window.electronAPI?.arduino;
    if (!api || !selectedPortPath) return;
    setPortLoading(true);
    setPortStatus("");
    try {
      // Сохраняем порт + переподключаемся
      await api.savePort(selectedPortPath);
      updateSettings({ savedPortPath: selectedPortPath });
      setLocalSettings((prev) => ({
        ...prev,
        savedPortPath: selectedPortPath,
      }));

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
      setTimeout(() => setPortStatus(""), 5000);
    }
  };

  const handleDisconnect = async () => {
    const api = window.electronAPI?.arduino;
    if (!api) return;
    try {
      await api.disconnect();
      setIsArduinoConnected(false);
      setPortStatus("Устройство отключено");
      setTimeout(() => setPortStatus(""), 3000);
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
    setPortStatus("Порт сброшен. Будет использован авто-поиск.");
    setTimeout(() => setPortStatus(""), 3000);
  };

  const handleAutoSearch = async () => {
    const api = window.electronAPI?.arduino;
    if (!api) return;
    setPortLoading(true);
    setPortStatus("Поиск контроллера...");
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
        setPortStatus("✅ Устройство найдено и подключено автоматически!");
      } else {
        setPortStatus("❌ Устройство не найдено. Выберите порт вручную.");
      }
      await loadAllPorts();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setPortStatus(`❌ Ошибка: ${msg}`);
    } finally {
      setPortLoading(false);
      setTimeout(() => setPortStatus(""), 5000);
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
    // Если выключили разделение, а мы на странице «Кухня» — её больше нет в меню, уводим на «Бар»
    if (!localSettings.kitchenSeparate && currentPage === "kitchen") {
      setCurrentPage("bar");
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleFactoryReset = async () => {
    if (!canDeleteData) {
      return;
    }

    const confirmed = await showConfirm({
      title: "Сброс к заводским настройкам",
      message:
        "Сбросить приложение к заводским настройкам? Это удалит сохранённые настройки, меню бара, категории, ревизии и историю.",
      confirmText: "Сбросить",
      danger: true,
    });

    if (!confirmed) return;

    localStorage.removeItem("billiard-club-storage");
    // Также очищаем файловое хранилище (Electron)
    if (window.electronAPI?.store) {
      window.electronAPI.store.remove("billiard-club-storage").catch(() => {});
    }
    window.location.reload();
  };

  // ===== Функции для бэкапов =====
  const loadBackupList = async () => {
    const api = window.electronAPI?.backup;
    if (!api) return;
    setBackupLoading(true);
    try {
      const list = await api.list();
      setBackupList(list);
    } catch {
      setBackupList([]);
    } finally {
      setBackupLoading(false);
    }
  };

  const handleExportData = async () => {
    const api = window.electronAPI?.backup;
    if (!api) return;
    setBackupLoading(true);
    setBackupStatus("");
    try {
      const result = await api.exportData();
      if (result.success) {
        setBackupStatus(`✅ Данные экспортированы: ${result.path}`);
      } else {
        setBackupStatus(`❌ ${result.error || "Ошибка экспорта"}`);
      }
    } catch (err: unknown) {
      setBackupStatus(`❌ ${err instanceof Error ? err.message : "Ошибка"}`);
    } finally {
      setBackupLoading(false);
      setTimeout(() => setBackupStatus(""), 8000);
    }
  };

  const handleImportData = async () => {
    const api = window.electronAPI?.backup;
    if (!api) return;

    const confirmed = await showConfirm({
      title: "Импорт данных",
      message:
        "Импортировать данные из файла? Текущие данные будут заменены. Перед этим автоматически создастся бэкап.",
      confirmText: "Импортировать",
      danger: true,
    });
    if (!confirmed) return;

    setBackupLoading(true);
    setBackupStatus("");
    try {
      const result = await api.importData();
      if (result.success) {
        setBackupStatus("✅ Данные импортированы. Перезагрузка...");
        setTimeout(() => window.location.reload(), 1500);
      } else {
        setBackupStatus(`❌ ${result.error || "Ошибка импорта"}`);
      }
    } catch (err: unknown) {
      setBackupStatus(`❌ ${err instanceof Error ? err.message : "Ошибка"}`);
    } finally {
      setBackupLoading(false);
      setTimeout(() => setBackupStatus(""), 8000);
    }
  };

  const handleCreateBackup = async () => {
    const api = window.electronAPI?.backup;
    if (!api) return;
    setBackupLoading(true);
    try {
      const result = await api.createNow();
      if (result.success) {
        setBackupStatus("✅ Бэкап создан");
        await loadBackupList();
      } else {
        setBackupStatus(`❌ ${result.error || "Ошибка"}`);
      }
    } catch {
      setBackupStatus("❌ Ошибка создания бэкапа");
    } finally {
      setBackupLoading(false);
      setTimeout(() => setBackupStatus(""), 5000);
    }
  };

  const handleRestoreFromBackup = async (
    backupPath: string,
    backupName: string,
  ) => {
    const api = window.electronAPI?.backup;
    if (!api) return;

    const confirmed = await showConfirm({
      title: "Восстановление из бэкапа",
      message: `Восстановить данные из "${backupName}"? Текущие данные будут заменены (перед этим создастся бэкап).`,
      confirmText: "Восстановить",
      danger: true,
    });
    if (!confirmed) return;

    setBackupLoading(true);
    setBackupStatus("");
    try {
      const result = await api.restore(backupPath);
      if (result.success) {
        setBackupStatus("✅ Данные восстановлены. Перезагрузка...");
        setTimeout(() => window.location.reload(), 1500);
      } else {
        setBackupStatus(`❌ ${result.error || "Ошибка восстановления"}`);
      }
    } catch (err: unknown) {
      setBackupStatus(`❌ ${err instanceof Error ? err.message : "Ошибка"}`);
    } finally {
      setBackupLoading(false);
      setTimeout(() => setBackupStatus(""), 8000);
    }
  };

  const handleCheckForUpdates = async () => {
    const updaterApi = window.electronAPI?.updater;
    if (!updaterApi) {
      setUpdateStatus("❌ API обновлений недоступен");
      return;
    }

    setUpdateChecking(true);
    setUpdateStatus("🔍 Проверка обновлений...");

    try {
      const result = await updaterApi.checkForUpdates();
      if (result.success) {
        setUpdateStatus("✅ Обновления проверены");
      } else {
        setUpdateStatus(`❌ ${result.reason || "Ошибка проверки"}`);
      }
    } catch (error) {
      setUpdateStatus(
        `❌ ${error instanceof Error ? error.message : "Ошибка"}`,
      );
    } finally {
      setUpdateChecking(false);
      setTimeout(() => setUpdateStatus(""), 5000);
    }
  };

  return (
    <div className="page-content">
      <div className="page-header">
        <div className="page-header-left">
          <Settings size={28} className="text-slate-300" />
          <h2 className="page-title">Настройки</h2>
        </div>
        <div className="page-header-actions">
          {saved && <span className="save-indicator">✓ Сохранено</span>}
          <button onClick={handleSave} className="btn btn-primary">
            <Save size={16} />
            Сохранить
          </button>
        </div>
      </div>

      <div className="settings-grid">
        {/* Основные */}
        {canAccessAllSettings && (
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
                    setLocalSettings((prev) => ({
                      ...prev,
                      clubName: e.target.value,
                    }))
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
                    setLocalSettings((prev) => ({
                      ...prev,
                      receiptCompanyName: e.target.value,
                    }))
                  }
                  className="form-input"
                  placeholder="ИП -"
                />
              </div>
              <div className="settings-field">
                <label className="settings-label">Город</label>
                <input
                  type="text"
                  value={localSettings.receiptCity}
                  onChange={(e) =>
                    setLocalSettings((prev) => ({
                      ...prev,
                      receiptCity: e.target.value,
                    }))
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
                    setLocalSettings((prev) => ({
                      ...prev,
                      receiptPhone: formatPhone(
                        e.target.value,
                        prev.receiptPhone,
                      ),
                    }))
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
                    setLocalSettings((prev) => ({
                      ...prev,
                      receiptCashierName: e.target.value,
                    }))
                  }
                  className="form-input"
                  placeholder="-"
                />
              </div>
            </div>
          </div>
        )}

        {/* Язык интерфейса — доступно всем */}
        <div className="settings-section">
          <h3 className="settings-section-title">
            <Languages size={18} />
            {t("settings.section_language")}
          </h3>
          <p
            className="settings-hint"
            style={{ marginTop: -6, marginBottom: 10 }}
          >
            {t("settings.language_hint")}
          </p>
          <div className="lang-grid">
            {LANGUAGES.map((l) => (
              <button
                key={l.code}
                onClick={() => {
                  setLocalSettings((prev) => ({ ...prev, language: l.code }));
                  updateSettings({ language: l.code });
                }}
                className={`lang-card ${settings.language === l.code ? "active" : ""}`}
              >
                <span className="lang-flag">{l.flag}</span>
                <span className="lang-name">{l.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Боковое меню — настройка закреплённых пунктов (стиль Bitrix24) */}
        {canAccessAllSettings && (
          <div className="settings-section">
            <h3 className="settings-section-title">
              <Menu size={18} />
              {t("settings.section_sidebar")}
            </h3>
            <p
              className="settings-hint"
              style={{ marginTop: -6, marginBottom: 10 }}
            >
              {t("settings.sidebar_hint")}
            </p>
            <div className="sidebar-cfg-list">
              {sidebarConfigItems.map((item) => {
                const isPinned = (localSettings.sidebarPinned || []).includes(
                  item.id,
                );
                return (
                  <div key={item.id} className="sidebar-cfg-row">
                    <span className="cfg-name">{t(item.labelKey)}</span>
                    <button
                      className={`sidebar-cfg-pin ${isPinned ? "on" : ""}`}
                      onClick={() => togglePin(item.id)}
                      title={isPinned ? t("settings.pin") : t("nav.more")}
                    >
                      {isPinned ? <Pin size={13} /> : <PinOff size={13} />}
                      {isPinned ? t("settings.pin") : t("nav.more")}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Доступ пользователей к меню — настраивает админ/разработчик */}
        {canManageUsers && (
          <div className="settings-section">
            <h3 className="settings-section-title">
              <Users size={18} />
              Меню для пользователей
            </h3>
            <p
              className="settings-hint"
              style={{ marginTop: -6, marginBottom: 10 }}
            >
              Какие разделы видят сотрудники с ролью «Пользователь». «Главная»
              доступна всегда.
            </p>
            <div className="sidebar-cfg-list">
              {userMenuConfigItems.map((item) => {
                const forced = item.id === "dashboard";
                const isVisible =
                  forced ||
                  (localSettings.userVisiblePages || []).includes(item.id);
                return (
                  <div key={item.id} className="sidebar-cfg-row">
                    <span className="cfg-name">{t(item.labelKey)}</span>
                    <button
                      className={`sidebar-cfg-pin ${isVisible ? "on" : ""}`}
                      onClick={() => toggleUserPage(item.id)}
                      disabled={forced}
                      title={isVisible ? "Видно" : "Скрыто"}
                    >
                      {isVisible ? <Eye size={13} /> : <EyeOff size={13} />}
                      {isVisible ? "Видно" : "Скрыто"}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* База знаний — перенесена в настройки */}
        <div className="settings-section">
          <h3 className="settings-section-title">
            <BookOpen size={18} />
            {t("settings.section_kb")}
          </h3>
          <p
            className="settings-hint"
            style={{ marginTop: -6, marginBottom: 10 }}
          >
            {t("settings.kb_hint")}
          </p>
          <button
            className="btn btn-primary"
            onClick={() => setCurrentPage("knowledge")}
          >
            <BookOpen size={16} />
            {t("settings.open_kb")}
          </button>
        </div>

        {/* Автоматизация */}
        {canAccessAllSettings && (
          <div className="settings-section">
            <h3 className="settings-section-title">
              <Lightbulb size={18} />
              Автоматизация
            </h3>
            <div className="settings-fields">
              <div className="settings-toggle-field">
                <div>
                  <label className="settings-label">Звуковые уведомления</label>
                  <p className="settings-hint">Звуковой сигнал при событиях</p>
                </div>
                <button
                  onClick={() =>
                    setLocalSettings((prev) => ({
                      ...prev,
                      soundEnabled: !prev.soundEnabled,
                    }))
                  }
                  className={`toggle ${localSettings.soundEnabled ? "on" : "off"}`}
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
                  <p className="settings-hint">
                    Автоматически печатать пречек при закрытии стола
                  </p>
                </div>
                <button
                  onClick={() =>
                    setLocalSettings((prev) => ({
                      ...prev,
                      autoPrintReceipt: !prev.autoPrintReceipt,
                    }))
                  }
                  className={`toggle ${localSettings.autoPrintReceipt ? "on" : "off"}`}
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
                    {localSettings.silentPrint
                      ? "Автоматически (без диалога принтера)"
                      : "Вручную (показывать диалог выбора принтера)"}
                  </p>
                </div>
                <button
                  onClick={() =>
                    setLocalSettings((prev) => ({
                      ...prev,
                      silentPrint: !prev.silentPrint,
                    }))
                  }
                  className={`toggle ${localSettings.silentPrint ? "on" : "off"}`}
                >
                  <div className="toggle-dot" />
                </button>
              </div>
              <div className="settings-toggle-field">
                <div>
                  <label className="settings-label">
                    <ChefHat size={14} style={{ marginRight: 6 }} />
                    Разделить Бар и Кухню
                  </label>
                  <p className="settings-hint">
                    {localSettings.kitchenSeparate
                      ? "Кухня — отдельная страница (только блюда), Бар — напитки и снэки"
                      : "Бар и Кухня на одной странице «Бар»"}
                  </p>
                </div>
                <button
                  onClick={() =>
                    setLocalSettings((prev) => ({
                      ...prev,
                      kitchenSeparate: !prev.kitchenSeparate,
                    }))
                  }
                  className={`toggle ${localSettings.kitchenSeparate ? "on" : "off"}`}
                >
                  <div className="toggle-dot" />
                </button>
              </div>
              <div className="settings-toggle-field">
                <div>
                  <label className="settings-label">
                    <ChefHat size={14} style={{ marginRight: 6 }} />
                    Авто-печать заказа на кухню
                  </label>
                  <p className="settings-hint">
                    Печатать заказ на кухонный принтер при пробитии блюда
                  </p>
                </div>
                <button
                  onClick={() =>
                    setLocalSettings((prev) => ({
                      ...prev,
                      autoPrintKitchenTicket: !prev.autoPrintKitchenTicket,
                    }))
                  }
                  className={`toggle ${localSettings.autoPrintKitchenTicket ? "on" : "off"}`}
                >
                  <div className="toggle-dot" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Настройки печати */}
        {canAccessAllSettings && (
          <div className="settings-section">
            <h3 className="settings-section-title">
              <Printer size={18} />
              Настройки печати
            </h3>
            <div className="settings-fields">
              {/* Процент за обслуживание */}
              <div className="settings-toggle-field">
                <div>
                  <label className="settings-label">
                    <Percent size={14} style={{ marginRight: 6 }} />
                    {t("settings.service_charge")}
                  </label>
                  <p className="settings-hint">
                    {t("settings.service_charge_hint")}
                  </p>
                </div>
                <button
                  onClick={() =>
                    setLocalSettings((prev) => ({
                      ...prev,
                      serviceChargeEnabled: !prev.serviceChargeEnabled,
                    }))
                  }
                  className={`toggle ${localSettings.serviceChargeEnabled ? "on" : "off"}`}
                >
                  <div className="toggle-dot" />
                </button>
              </div>
              {localSettings.serviceChargeEnabled && (
                <div className="settings-field">
                  <label className="settings-label">
                    {t("settings.service_charge_percent")}
                  </label>
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 10 }}
                  >
                    <input
                      type="range"
                      min={0}
                      max={30}
                      step={1}
                      value={localSettings.serviceChargePercent}
                      onChange={(e) =>
                        setLocalSettings((prev) => ({
                          ...prev,
                          serviceChargePercent: Number(e.target.value),
                        }))
                      }
                      style={{ flex: 1 }}
                    />
                    <NumberInput
                      min={0}
                      max={100}
                      value={localSettings.serviceChargePercent}
                      onChange={(n) =>
                        setLocalSettings((prev) => ({
                          ...prev,
                          serviceChargePercent: n,
                        }))
                      }
                      className="form-input form-input-sm"
                      style={{ width: 70, textAlign: "center" }}
                    />
                    <span style={{ fontSize: 12, color: "#94a3b8" }}>%</span>
                  </div>
                </div>
              )}
              <div className="settings-field">
                <label className="settings-label">Ширина бумаги (мм)</label>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <input
                    type="range"
                    min={40}
                    max={120}
                    step={1}
                    value={localSettings.receiptWidthMm}
                    onChange={(e) =>
                      setLocalSettings((prev) => ({
                        ...prev,
                        receiptWidthMm: Number(e.target.value),
                      }))
                    }
                    style={{ flex: 1 }}
                  />
                  <NumberInput
                    min={40}
                    max={120}
                    value={localSettings.receiptWidthMm}
                    onChange={(n) =>
                      setLocalSettings((prev) => ({
                        ...prev,
                        receiptWidthMm: n,
                      }))
                    }
                    className="form-input form-input-sm"
                    style={{ width: 70, textAlign: "center" }}
                  />
                  <span style={{ fontSize: 12, color: "#94a3b8" }}>мм</span>
                </div>
                <p className="settings-hint">
                  Стандарт: 58мм (узкий) или 80мм (широкий)
                </p>
              </div>
              <div className="settings-field">
                <label className="settings-label">Размер шрифта (px)</label>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <input
                    type="range"
                    min={8}
                    max={24}
                    step={1}
                    value={localSettings.receiptFontSize}
                    onChange={(e) =>
                      setLocalSettings((prev) => ({
                        ...prev,
                        receiptFontSize: Number(e.target.value),
                      }))
                    }
                    style={{ flex: 1 }}
                  />
                  <NumberInput
                    min={8}
                    max={24}
                    value={localSettings.receiptFontSize}
                    onChange={(n) =>
                      setLocalSettings((prev) => ({
                        ...prev,
                        receiptFontSize: n,
                      }))
                    }
                    className="form-input form-input-sm"
                    style={{ width: 70, textAlign: "center" }}
                  />
                  <span style={{ fontSize: 12, color: "#94a3b8" }}>px</span>
                </div>
              </div>
              <div className="settings-field">
                <label className="settings-label">Отступы (мм)</label>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <input
                    type="range"
                    min={0}
                    max={15}
                    step={1}
                    value={localSettings.receiptPaddingMm}
                    onChange={(e) =>
                      setLocalSettings((prev) => ({
                        ...prev,
                        receiptPaddingMm: Number(e.target.value),
                      }))
                    }
                    style={{ flex: 1 }}
                  />
                  <NumberInput
                    min={0}
                    max={15}
                    value={localSettings.receiptPaddingMm}
                    onChange={(n) =>
                      setLocalSettings((prev) => ({
                        ...prev,
                        receiptPaddingMm: n,
                      }))
                    }
                    className="form-input form-input-sm"
                    style={{ width: 70, textAlign: "center" }}
                  />
                  <span style={{ fontSize: 12, color: "#94a3b8" }}>мм</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Принтеры — раздельная маршрутизация чеков и кухни */}
        {canAccessAllSettings && (
          <div className="settings-section">
            <h3 className="settings-section-title">
              <Printer size={18} />
              Принтеры
            </h3>
            <div className="settings-fields">
              <p className="settings-hint" style={{ marginTop: -4 }}>
                Назначьте разные принтеры для чеков и кухни — тогда заказы не
                будут пересекаться.
                {availablePrinters.length === 0 &&
                  " (Список принтеров пуст — нажмите «Обновить»)"}
              </p>
              <div className="settings-field">
                <label className="settings-label">
                  <Printer size={14} style={{ marginRight: 6 }} />
                  Принтер для чеков и пречеков
                </label>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <select
                    value={localSettings.receiptPrinterName}
                    onChange={(e) =>
                      setLocalSettings((prev) => ({
                        ...prev,
                        receiptPrinterName: e.target.value,
                      }))
                    }
                    className="form-select"
                    style={{ flex: 1 }}
                  >
                    <option value="">Принтер по умолчанию</option>
                    {availablePrinters.map((p) => (
                      <option key={p.name} value={p.name}>
                        {p.displayName || p.name}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() =>
                      handleTestPrint(
                        localSettings.receiptPrinterName,
                        "receipt",
                      )
                    }
                    className="btn btn-ghost"
                    style={{
                      padding: "6px 12px",
                      fontSize: 12,
                      whiteSpace: "nowrap",
                    }}
                  >
                    <Printer size={14} /> Тест
                  </button>
                </div>
              </div>
              <div className="settings-field">
                <label className="settings-label">
                  <ChefHat size={14} style={{ marginRight: 6 }} />
                  Кухонный принтер (xprinter)
                </label>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <select
                    value={localSettings.kitchenPrinterName}
                    onChange={(e) =>
                      setLocalSettings((prev) => ({
                        ...prev,
                        kitchenPrinterName: e.target.value,
                      }))
                    }
                    className="form-select"
                    style={{ flex: 1 }}
                  >
                    <option value="">Принтер по умолчанию</option>
                    {availablePrinters.map((p) => (
                      <option key={p.name} value={p.name}>
                        {p.displayName || p.name}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() =>
                      handleTestPrint(
                        localSettings.kitchenPrinterName,
                        "kitchen",
                      )
                    }
                    className="btn btn-ghost"
                    style={{
                      padding: "6px 12px",
                      fontSize: 12,
                      whiteSpace: "nowrap",
                    }}
                  >
                    <ChefHat size={14} /> Тест
                  </button>
                </div>
              </div>
              {localSettings.receiptPrinterName &&
                localSettings.kitchenPrinterName &&
                localSettings.receiptPrinterName ===
                  localSettings.kitchenPrinterName && (
                  <p className="settings-hint" style={{ color: "#f59e0b" }}>
                    ⚠ Для чеков и кухни выбран один и тот же принтер — заказы
                    будут пересекаться.
                  </p>
                )}
              <button
                onClick={loadPrinters}
                className="btn btn-ghost"
                style={{ alignSelf: "flex-start", fontSize: 13 }}
              >
                <RefreshCw size={15} /> Обновить список принтеров
              </button>
            </div>
          </div>
        )}

        {/* Данные — только разработчик */}
        {isDeveloper && (
          <div className="settings-section">
            <h3 className="settings-section-title">
              <Trash2 size={18} />
              Данные
            </h3>
            <div className="settings-fields">
              <div className="settings-info">
                <p>
                  Записей в истории: <strong>{sessionHistory.length}</strong>
                </p>
                <p>
                  Полный сброс вернёт приложение к значениям по умолчанию при
                  следующем старте.
                </p>
                {!canDeleteData && (
                  <p>
                    Удаление данных доступно только администратору или
                    разработчику.
                  </p>
                )}
              </div>
              <button
                onClick={handleFactoryReset}
                className="btn btn-danger"
                disabled={!canDeleteData}
              >
                <Trash2 size={16} />
                Сбросить приложение
              </button>
            </div>
          </div>
        )}

        {/* Резервное копирование — только разработчик */}
        {isDeveloper && (
          <div className="settings-section settings-section-full">
            <h3 className="settings-section-title">
              <Shield size={18} />
              Резервное копирование
            </h3>

            {backupStatus && (
              <p
                style={{
                  fontSize: 13,
                  marginBottom: 10,
                  color: backupStatus.startsWith("✅")
                    ? "#22c55e"
                    : backupStatus.startsWith("❌")
                      ? "#ef4444"
                      : "#94a3b8",
                }}
              >
                {backupStatus}
              </p>
            )}

            <div
              style={{
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
                marginBottom: 12,
              }}
            >
              <button
                onClick={handleExportData}
                className="btn btn-primary"
                disabled={backupLoading}
                style={{ fontSize: 13 }}
              >
                <Download size={15} />
                Экспорт данных
              </button>
              <button
                onClick={handleImportData}
                className="btn btn-ghost"
                disabled={backupLoading}
                style={{ fontSize: 13 }}
              >
                <Upload size={15} />
                Импорт из файла
              </button>
              <button
                onClick={handleCreateBackup}
                className="btn btn-ghost"
                disabled={backupLoading}
                style={{ fontSize: 13 }}
              >
                <FolderArchive size={15} />
                Создать бэкап сейчас
              </button>
              <button
                onClick={() => {
                  setShowBackupList(!showBackupList);
                  if (!showBackupList) loadBackupList();
                }}
                className="btn btn-ghost"
                disabled={backupLoading}
                style={{ fontSize: 13 }}
              >
                <History size={15} />
                {showBackupList ? "Скрыть бэкапы" : "Показать бэкапы"}
              </button>
            </div>

            <div className="settings-info" style={{ marginBottom: 10 }}>
              <p style={{ fontSize: 12, color: "#64748b" }}>
                💾 Данные автоматически сохраняются каждые 30 сек, создаётся 5
                ротационных бэкапов каждую минуту, ежедневные снапшоты хранятся
                30 дней. При закрытии окна данные принудительно записываются на
                диск.
              </p>
            </div>

            {showBackupList && (
              <div style={{ marginTop: 8 }}>
                {backupLoading ? (
                  <p style={{ fontSize: 12, color: "#94a3b8" }}>
                    Загрузка списка бэкапов...
                  </p>
                ) : backupList.length === 0 ? (
                  <p style={{ fontSize: 12, color: "#94a3b8" }}>
                    Нет доступных бэкапов
                  </p>
                ) : (
                  <div
                    style={{
                      maxHeight: 300,
                      overflowY: "auto",
                      border: "1px solid rgba(148,163,184,0.15)",
                      borderRadius: 8,
                      padding: 6,
                    }}
                  >
                    {backupList.map((bp, idx) => (
                      <div
                        key={idx}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "6px 10px",
                          borderBottom:
                            idx < backupList.length - 1
                              ? "1px solid rgba(148,163,184,0.1)"
                              : "none",
                          gap: 8,
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              fontSize: 13,
                              fontWeight: 500,
                              color: bp.valid ? "#e2e8f0" : "#ef4444",
                            }}
                          >
                            {bp.type === "daily"
                              ? "📅"
                              : bp.type === "emergency"
                                ? "🚨"
                                : "🔄"}{" "}
                            {bp.name}
                            {!bp.valid && " (повреждён)"}
                          </div>
                          <div style={{ fontSize: 11, color: "#64748b" }}>
                            {new Date(bp.date).toLocaleString("ru-RU")} ·{" "}
                            {(bp.size / 1024).toFixed(1)} КБ
                          </div>
                        </div>
                        <button
                          onClick={() =>
                            handleRestoreFromBackup(bp.path, bp.name)
                          }
                          className="btn btn-ghost"
                          disabled={!bp.valid || backupLoading}
                          style={{
                            padding: "3px 8px",
                            fontSize: 11,
                            whiteSpace: "nowrap",
                          }}
                        >
                          <RotateCcw size={12} />
                          Восстановить
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Порт устройства / контроллер — только разработчик */}
        {isDeveloper && (
          <div className="settings-section settings-section-full">
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <h3 className="settings-section-title" style={{ margin: 0 }}>
                <Usb size={16} />
                {t("settings.section_controller")}
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 400,
                    marginLeft: 8,
                    color: isArduinoConnected ? "#22c55e" : "#ef4444",
                  }}
                >
                  {isArduinoConnected ? "● подключено" : "● не подключено"}
                </span>
                {localSettings.savedPortPath && (
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 400,
                      marginLeft: 8,
                      color: "#64748b",
                    }}
                  >
                    ({localSettings.savedPortPath})
                  </span>
                )}
              </h3>
              <div
                style={{
                  display: "flex",
                  gap: 6,
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                <button
                  onClick={handleAutoSearch}
                  className="btn btn-ghost"
                  disabled={portLoading}
                  style={{ padding: "4px 10px", fontSize: 12 }}
                >
                  <Search size={13} />
                  Автопоиск
                </button>
                <button
                  onClick={loadAllPorts}
                  className="btn btn-ghost"
                  disabled={portLoading}
                  style={{ padding: "4px 10px", fontSize: 12 }}
                >
                  <RefreshCw
                    size={13}
                    className={portLoading ? "animate-spin" : ""}
                  />
                  Обновить
                </button>
                <select
                  value={relayTestMode}
                  onChange={(e) =>
                    setRelayTestMode(
                      e.target.value as "ultra" | "fast" | "medium" | "slow",
                    )
                  }
                  className="form-input"
                  disabled={isRelayTestRunning || portLoading}
                  style={{ padding: "4px 8px", fontSize: 12, minWidth: 150 }}
                >
                  <option value="ultra">Ультра быстрый</option>
                  <option value="fast">Быстрый</option>
                  <option value="medium">Средний</option>
                  <option value="slow">Медленный</option>
                </select>
                <button
                  onClick={handleRelayMusicTest}
                  className="btn btn-ghost"
                  disabled={
                    !isArduinoConnected || isRelayTestRunning || portLoading
                  }
                  style={{ padding: "4px 10px", fontSize: 12 }}
                >
                  <Cpu size={13} />
                  {isRelayTestRunning ? "Тест..." : "Тест реле"}
                </button>
                {isArduinoConnected && (
                  <button
                    onClick={handleDisconnect}
                    className="btn btn-danger"
                    style={{ padding: "4px 10px", fontSize: 12 }}
                  >
                    <Unplug size={13} />
                    Отключить
                  </button>
                )}
                {localSettings.savedPortPath && (
                  <button
                    onClick={handleResetPort}
                    className="btn btn-ghost"
                    style={{ padding: "4px 10px", fontSize: 12 }}
                  >
                    <RotateCcw size={13} />
                    Сброс
                  </button>
                )}
              </div>
            </div>

            {portStatus && (
              <p
                style={{
                  fontSize: 12,
                  marginTop: 8,
                  color: portStatus.startsWith("✅")
                    ? "#22c55e"
                    : portStatus.startsWith("❌")
                      ? "#ef4444"
                      : "#94a3b8",
                }}
              >
                {portStatus}
              </p>
            )}

            {allPorts.length > 0 ? (
              <div
                style={{
                  marginTop: 10,
                  display: "flex",
                  gap: 6,
                  flexWrap: "wrap",
                  alignItems: "center",
                }}
              >
                <select
                  value={selectedPortPath || ""}
                  onChange={(e) => setSelectedPortPath(e.target.value || null)}
                  className="form-input"
                  style={{
                    flex: 1,
                    minWidth: 180,
                    maxWidth: 360,
                    fontSize: 13,
                    padding: "6px 10px",
                  }}
                >
                  <option value="">— выберите порт —</option>
                  {allPorts.map((port) => {
                    const hint = [
                      port.manufacturer,
                      port.product,
                      port.friendlyName,
                    ]
                      .filter(Boolean)
                      .join(" · ");
                    const isJtag =
                      (port.product || "").toLowerCase().includes("jtag") ||
                      (port.friendlyName || "").toLowerCase().includes("jtag");
                    const isBiliardo = (port.manufacturer || "")
                      .toLowerCase()
                      .includes("biliardo");
                    const tag = isBiliardo
                      ? " ★ Biliardo"
                      : isJtag
                        ? " ★ Контроллер"
                        : "";
                    return (
                      <option key={port.path} value={port.path}>
                        {port.path}
                        {hint ? ` (${hint})` : ""}
                        {tag}
                      </option>
                    );
                  })}
                </select>
                <button
                  onClick={handleConnectToPort}
                  className="btn btn-primary"
                  disabled={!selectedPortPath || portLoading}
                  style={{ padding: "6px 12px", fontSize: 12 }}
                >
                  <Plug size={13} />
                  Подключить
                </button>
                <button
                  onClick={handleSavePort}
                  className="btn btn-ghost"
                  disabled={!selectedPortPath}
                  style={{ padding: "6px 12px", fontSize: 12 }}
                >
                  <Save size={13} />
                  Сохранить
                </button>
              </div>
            ) : (
              <p style={{ color: "#64748b", fontSize: 12, marginTop: 8 }}>
                {portLoading
                  ? "Поиск..."
                  : "Нет портов. Подключите контроллер."}
              </p>
            )}
          </div>
        )}

        {/* Облачная синхронизация (biliardo.kz) — только разработчик */}
        {isDeveloper && <CloudSyncSection />}

        {/* Telegram-бот — только разработчик */}
        {isDeveloper && <TelegramSection />}

        {/* Обновления — только разработчик */}
        {isDeveloper && (
          <div className="settings-section">
            <h3 className="settings-section-title">
              <RefreshCw size={18} />
              Обновления
            </h3>
            <div className="settings-fields">
              <div
                style={{
                  display: "flex",
                  gap: 12,
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                <button
                  onClick={handleCheckForUpdates}
                  className="btn btn-primary"
                  disabled={updateChecking}
                  style={{ padding: "8px 16px" }}
                >
                  <RefreshCw
                    size={16}
                    className={updateChecking ? "animate-spin" : ""}
                  />
                  {updateChecking ? "Проверка..." : "Проверить обновления"}
                </button>
                {updateStatus && (
                  <span
                    style={{
                      fontSize: 13,
                      color: updateStatus.startsWith("✅")
                        ? "#22c55e"
                        : updateStatus.startsWith("❌")
                          ? "#ef4444"
                          : "#94a3b8",
                    }}
                  >
                    {updateStatus}
                  </span>
                )}
              </div>
              <p style={{ fontSize: 12, color: "#64748b", marginTop: 8 }}>
                Ручная проверка наличия новых версий приложения
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SettingsPage;
