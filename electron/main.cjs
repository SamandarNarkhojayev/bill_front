const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');
const ArduinoService = require('./arduino-service.cjs');

// Создаем экземпляр Arduino сервиса
const arduino = new ArduinoService();
let autoConnectInProgress = false;
let autoConnectRetryTimer = null;

// ===== Сохранённый порт (файл в userData) =====
function getSavedPortFile() {
  return path.join(app.getPath('userData'), 'saved-port.json');
}

function loadSavedPort() {
  try {
    const data = JSON.parse(fs.readFileSync(getSavedPortFile(), 'utf8'));
    return data.portPath || null;
  } catch {
    return null;
  }
}

function persistSavedPort(portPath) {
  try {
    fs.writeFileSync(getSavedPortFile(), JSON.stringify({ portPath }), 'utf8');
  } catch (err) {
    console.error('[Arduino] Failed to save port:', err.message);
  }
}

let updaterInitialized = false;
let updaterState = {
  status: 'idle',
  message: 'Ожидание проверки обновлений',
  currentVersion: app.getVersion(),
  availableVersion: null,
  percent: null,
};

function broadcastUpdaterState() {
  const windows = BrowserWindow.getAllWindows();
  windows.forEach((win) => {
    if (!win.isDestroyed()) {
      win.webContents.send('updater:status', updaterState);
    }
  });
}

function setUpdaterState(partial) {
  updaterState = {
    ...updaterState,
    ...partial,
    currentVersion: app.getVersion(),
  };
  broadcastUpdaterState();
}

function getUpdaterRepoConfig() {
  // 1) Явная конфигурация через env (приоритет)
  if (process.env.UPDATE_REPO_OWNER && process.env.UPDATE_REPO_NAME) {
    return {
      owner: process.env.UPDATE_REPO_OWNER,
      repo: process.env.UPDATE_REPO_NAME,
    };
  }

  // 2) Авто-определение из package.json -> repository
  try {
    const pkg = require(path.join(app.getAppPath(), 'package.json'));
    const repositoryField = pkg?.repository;
    const rawRepo = typeof repositoryField === 'string'
      ? repositoryField
      : repositoryField?.url;

    if (!rawRepo) return null;

    const normalized = String(rawRepo).trim();
    const match = normalized.match(/github\.com[/:]([^/]+)\/([^/.]+)(?:\.git)?$/i);
    if (!match) return null;

    return { owner: match[1], repo: match[2] };
  } catch {
    return null;
  }
}

function isUpdaterConfigured() {
  return !!getUpdaterRepoConfig();
}

function isTrue(value) {
  return String(value).toLowerCase() === 'true';
}

function getGenericUpdateUrl(repoConfig) {
  if (!repoConfig) return null;
  if (process.env.UPDATE_GENERIC_URL) {
    return process.env.UPDATE_GENERIC_URL;
  }
  return `https://github.com/${repoConfig.owner}/${repoConfig.repo}/releases/latest/download`;
}

function initUpdater() {
  if (updaterInitialized) return;
  updaterInitialized = true;

  if (!app.isPackaged) {
    setUpdaterState({
      status: 'unsupported',
      message: 'Обновления доступны только в установленной версии приложения',
    });
    return;
  }

  if (!isUpdaterConfigured()) {
    setUpdaterState({
      status: 'error',
      message: 'Обновления не настроены (нужны UPDATE_REPO_OWNER и UPDATE_REPO_NAME)',
    });
    return;
  }

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  const repoConfig = getUpdaterRepoConfig();
  if (!repoConfig) {
    setUpdaterState({
      status: 'error',
      message: 'Не удалось определить GitHub-репозиторий для обновлений',
    });
    return;
  }

  const isPrivateRepo = isTrue(process.env.UPDATE_REPO_PRIVATE);
  const updateToken = process.env.UPDATE_REPO_TOKEN || process.env.GH_TOKEN || process.env.GITHUB_TOKEN;

  if (isPrivateRepo) {
    autoUpdater.setFeedURL({
      provider: 'github',
      owner: repoConfig.owner,
      repo: repoConfig.repo,
      private: true,
      token: updateToken,
    });
  } else {
    autoUpdater.setFeedURL({
      provider: 'generic',
      url: getGenericUpdateUrl(repoConfig),
    });
  }

  autoUpdater.on('checking-for-update', () => {
    setUpdaterState({ status: 'checking', message: 'Проверка обновлений...' });
  });

  autoUpdater.on('update-available', (info) => {
    setUpdaterState({
      status: 'available',
      message: `Доступна версия ${info.version}`,
      availableVersion: info.version,
      percent: 0,
    });
  });

  autoUpdater.on('update-not-available', () => {
    setUpdaterState({
      status: 'not-available',
      message: 'У вас установлена последняя версия',
      availableVersion: null,
      percent: null,
    });
  });

  autoUpdater.on('download-progress', (progress) => {
    setUpdaterState({
      status: 'downloading',
      message: `Загрузка обновления: ${Math.round(progress.percent)}%`,
      percent: progress.percent,
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    setUpdaterState({
      status: 'downloaded',
      message: `Обновление ${info.version} загружено. Нажмите «Установить».`,
      availableVersion: info.version,
      percent: 100,
    });
  });

  autoUpdater.on('error', (error) => {
    const rawMessage = String(error?.message || 'unknown error');
    const isGithub404 = rawMessage.includes('releases.atom') && rawMessage.includes('404');
    const isGithub406 = rawMessage.includes('releases/latest') && rawMessage.includes('406');
    const message = isGithub404
      ? 'Ошибка обновления: GitHub вернул 404 для releases.atom. Проверьте, что репозиторий публичный, либо задайте UPDATE_REPO_PRIVATE=true и UPDATE_REPO_TOKEN.'
      : isGithub406
        ? 'Ошибка обновления: GitHub provider вернул 406 при поиске latest release. Для public-репозитория используйте generic provider через releases/latest/download.'
        : `Ошибка обновления: ${rawMessage}`;

    setUpdaterState({
      status: 'error',
      message,
      percent: null,
    });
  });
}

function isLikelyArduinoPort(port) {
  const manufacturer = (port.manufacturer || '').toLowerCase();
  const product = (port.product || '').toLowerCase();
  const pathName = (port.path || '').toLowerCase();
  const vendorId = (port.vendorId || '').toLowerCase();
  const productId = (port.productId || '').toLowerCase();
  const pnpId = (port.pnpId || '').toLowerCase();
  const friendlyName = (port.friendlyName || '').toLowerCase();

  // Проверяем новые Biliardo USB параметры
  if (manufacturer.includes('biliardo') || product.includes('biliardo-automatic')) {
    return true;
  }

  // ESP32 на Windows отображается как "USB JTAG/serial debug unit"
  if (
    friendlyName.includes('usb jtag') ||
    friendlyName.includes('serial debug unit') ||
    product.includes('usb jtag') ||
    product.includes('serial debug unit') ||
    pnpId.includes('usb jtag') ||
    (manufacturer.includes('espressif') && product.includes('jtag'))
  ) {
    return true;
  }

  const knownVendors = new Set(['2341', '2a03', '1a86', '10c4', '0403', '303a']);
  const knownProducts = new Set(['ea60', '7523', '6001']);

  return (
    manufacturer.includes('arduino') ||
    manufacturer.includes('espressif') ||
    manufacturer.includes('silicon') ||
    manufacturer.includes('wch') ||
    manufacturer.includes('ch340') ||
    manufacturer.includes('cp210') ||
    knownVendors.has(vendorId) ||
    knownProducts.has(productId) ||
    pnpId.includes('vid_2341') ||
    pnpId.includes('vid_2a03') ||
    pnpId.includes('vid_1a86') ||
    pnpId.includes('vid_10c4') ||
    pnpId.includes('vid_0403') ||
    pnpId.includes('vid_303a') ||
    pathName.includes('usbserial') ||
    pathName.includes('usbmodem') ||
    /^com\d+$/i.test(pathName)
  );
}

function scheduleAutoConnectRetry(ms) {
  if (autoConnectRetryTimer) return;
  autoConnectRetryTimer = setTimeout(() => {
    autoConnectRetryTimer = null;
    autoConnectArduino();
  }, ms);
}

function createWindow() {
  // Создаём окно браузера
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs')
    }
  });

  if (process.platform !== 'darwin') {
    mainWindow.setMenuBarVisibility(false);
    Menu.setApplicationMenu(null);
  }

  // В режиме разработки загружаем из Vite dev server
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
    // DevTools открываются по F12 или Cmd+Option+I
    // mainWindow.webContents.openDevTools();
  } else {
    // В production загружаем собранные файлы
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.webContents.once('did-finish-load', () => {
    mainWindow.webContents.send('updater:status', updaterState);
  });
}

// Этот метод будет вызван когда Electron закончит
// инициализацию и будет готов создавать окна браузера
app.whenReady().then(() => {
  // Инициализация надёжного хранилища (in-memory кэш + бэкапы)
  initStorage();
  initUpdater();
  createWindow();
  // Авто-подключение Arduino
  autoConnectArduino();
});

// === Updater IPC обработчики ===
ipcMain.handle('updater:get-state', () => updaterState);

ipcMain.handle('updater:check', async () => {
  if (!app.isPackaged) {
    setUpdaterState({
      status: 'unsupported',
      message: 'Проверка обновлений доступна только в установленной версии приложения',
    });
    return { success: false, reason: 'not-packaged' };
  }

  if (!isUpdaterConfigured()) {
    setUpdaterState({
      status: 'error',
      message: 'Обновления не настроены (нужны UPDATE_REPO_OWNER и UPDATE_REPO_NAME)',
    });
    return { success: false, reason: 'not-configured' };
  }

  try {
    await autoUpdater.checkForUpdates();
    return { success: true };
  } catch (error) {
    setUpdaterState({
      status: 'error',
      message: `Ошибка проверки обновлений: ${error?.message || 'unknown error'}`,
    });
    return { success: false, reason: 'check-failed' };
  }
});

ipcMain.handle('updater:download', async () => {
  try {
    await autoUpdater.downloadUpdate();
    return { success: true };
  } catch (error) {
    setUpdaterState({
      status: 'error',
      message: `Ошибка загрузки обновления: ${error?.message || 'unknown error'}`,
    });
    return { success: false };
  }
});

ipcMain.handle('updater:install', () => {
  setTimeout(() => autoUpdater.quitAndInstall(), 200);
  return { success: true };
});

// Сохранённый порт (загружается из файла в userData при старте)
let savedPortPath = loadSavedPort();
console.log('[Arduino] Loaded saved port:', savedPortPath);

// Авто-подключение Arduino при запуске
async function autoConnectArduino() {
  if (autoConnectInProgress || arduino.isArduinoConnected()) {
    return;
  }

  autoConnectInProgress = true;
  try {
    const allPorts = await arduino.listAllPorts();
    let targetPort = null;

    // 1) Приоритет: сохранённый вручную порт
    if (savedPortPath) {
      targetPort = allPorts.find((p) => p.path === savedPortPath);
      if (targetPort) {
        console.log('[Arduino] Using saved port:', savedPortPath);
      } else {
        console.log('[Arduino] Saved port not found:', savedPortPath, '— falling back to auto-detect');
      }
    }

    // 2) Автопоиск: ESP32 "USB JTAG/serial debug unit"
    if (!targetPort) {
      targetPort = allPorts.find((p) => {
        const product = (p.product || '').toLowerCase();
        const friendlyName = (p.friendlyName || '').toLowerCase();
        const pnpId = (p.pnpId || '').toLowerCase();
        return (
          friendlyName.includes('usb jtag') ||
          friendlyName.includes('serial debug unit') ||
          product.includes('usb jtag') ||
          product.includes('serial debug unit') ||
          pnpId.includes('jtag')
        );
      });
      if (targetPort) {
        console.log('[Arduino] Found ESP32 USB JTAG device:', targetPort.path);
      }
    }

    // 3) Стандартный автопоиск по известным производителям
    if (!targetPort) {
      const filtered = await arduino.listPorts();
      targetPort = filtered.find((p) => isLikelyArduinoPort(p));
    }

    const arduinoPort = targetPort;

    if (arduinoPort) {
      await arduino.connect(arduinoPort.path);
      console.log('[Arduino] Auto-connected:', arduinoPort.path);

      // Подписка на события для отправки в renderer
      const win = BrowserWindow.getAllWindows()[0];
      if (win) {
        arduino.on('relayChanged', (data) => win.webContents.send('arduino:relay-changed', data));
        arduino.on('statusUpdate', (states) => win.webContents.send('arduino:status-update', states));
        arduino.on('buttonPressed', (data) => win.webContents.send('arduino:button-pressed', data));
        arduino.on('message', (message) => win.webContents.send('arduino:message', message));
        arduino.on('error', (error) => win.webContents.send('arduino:error', error.message));
        arduino.on('info', (info) => win.webContents.send('arduino:info', info));
        arduino.on('disconnect', () => {
          win.webContents.send('arduino:disconnected');
          // Попытка переподключения через 3 секунды
          scheduleAutoConnectRetry(3000);
        });
      }
    } else {
      console.log('[Arduino] No device found, retrying in 5s...');
      scheduleAutoConnectRetry(5000);
    }
  } catch (err) {
    console.log('[Arduino] Auto-connect error:', err.message);
    scheduleAutoConnectRetry(5000);
  } finally {
    autoConnectInProgress = false;
  }
}

// Выходим когда все окна закрыты
app.on('window-all-closed', () => {
  // На macOS приложения и их панель меню остаются активными до тех пор
  // пока пользователь не выйдет явно с помощью Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // На macOS обычно пересоздают окно в приложении когда
  // кликают на иконку в доке и нет других открытых окон
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// === НАДЁЖНОЕ ФАЙЛОВОЕ ХРАНИЛИЩЕ ===
// Атомарная запись + ротация бэкапов + автовосстановление

const BACKUP_COUNT = 5;           // Количество ротационных бэкапов
const BACKUP_INTERVAL = 60000;    // Бэкап каждые 60 секунд
const WRITE_DEBOUNCE = 1000;      // Дебаунс записи 1 секунда

// Пути
function getStorePath() {
  return path.join(app.getPath('userData'), 'app-storage.json');
}

function getBackupDir() {
  const dir = path.join(app.getPath('userData'), 'backups');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function getBackupPath(index) {
  return path.join(getBackupDir(), `app-storage.backup-${index}.json`);
}

function getTempPath() {
  return getStorePath() + '.tmp';
}

// In-memory кэш хранилища — главная копия
let _memoryStore = null;
let _dirty = false;
let _writeTimer = null;
let _backupTimer = null;

/**
 * Атомарная запись на диск:
 * 1) Записать во временный файл
 * 2) fsync (принудительно сбросить буфер ОС на диск)
 * 3) Переименовать (атомарная операция на большинстве FS)
 */
function atomicWriteSync(filePath, data) {
  const tmpPath = filePath + '.tmp';
  const fd = fs.openSync(tmpPath, 'w');
  try {
    fs.writeSync(fd, data, 0, 'utf8');
    fs.fsyncSync(fd); // Принудительно сбрасываем буфер ОС на физический диск
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmpPath, filePath); // Атомарная замена
}

/**
 * Безопасное чтение JSON файла.
 * Возвращает { ok: true, data } или { ok: false }.
 */
function safeReadJSON(filePath) {
  try {
    if (!fs.existsSync(filePath)) return { ok: false };
    const raw = fs.readFileSync(filePath, 'utf8');
    if (!raw || raw.trim().length < 2) return { ok: false }; // Пустой/обрезанный файл
    const data = JSON.parse(raw);
    return { ok: true, data };
  } catch (err) {
    console.error('[Storage] Corrupted file:', filePath, err.message);
    return { ok: false };
  }
}

/**
 * Валидация данных хранилища.
 * Проверяет что JSON имеет ожидаемую структуру.
 */
function isValidStore(store) {
  if (!store || typeof store !== 'object') return false;
  // Должен содержать хотя бы ключ billiard-store (Zustand persist key)
  // Или быть объектом с данными
  return Object.keys(store).length > 0;
}

/**
 * Чтение хранилища с автовосстановлением из бэкапов.
 * Порядок: main → backup-0 → backup-1 → ... → backup-N
 */
function readStorage() {
  // 1. Если есть in-memory кэш — он всегда самый свежий
  if (_memoryStore !== null) {
    return _memoryStore;
  }

  // 2. Читаем основной файл
  const main = safeReadJSON(getStorePath());
  if (main.ok && isValidStore(main.data)) {
    console.log('[Storage] Loaded from main file');
    _memoryStore = main.data;
    return _memoryStore;
  }

  // 3. Основной файл повреждён — ищем рабочий бэкап
  console.warn('[Storage] Main file corrupted/missing, trying backups...');
  for (let i = 0; i < BACKUP_COUNT; i++) {
    const bp = safeReadJSON(getBackupPath(i));
    if (bp.ok && isValidStore(bp.data)) {
      console.log(`[Storage] ✅ Restored from backup-${i}`);
      _memoryStore = bp.data;
      // Сразу сохраняем восстановленные данные в основной файл
      try {
        atomicWriteSync(getStorePath(), JSON.stringify(_memoryStore));
        console.log('[Storage] Restored data saved to main file');
      } catch (err) {
        console.error('[Storage] Failed to save restored data:', err.message);
      }
      return _memoryStore;
    }
  }

  // 4. Ни основной файл, ни бэкапы не помогли
  console.error('[Storage] ❌ No valid storage found, starting fresh');
  _memoryStore = {};
  return _memoryStore;
}

/**
 * Запись хранилища (дебаунс).
 * Данные сразу обновляются в памяти, на диск пишутся с задержкой.
 */
function writeStorage(store) {
  _memoryStore = store;
  _dirty = true;
  scheduleDiskWrite();
}

/**
 * Планирует запись на диск с дебаунсом.
 */
function scheduleDiskWrite() {
  if (_writeTimer) clearTimeout(_writeTimer);
  _writeTimer = setTimeout(() => {
    flushToDisk();
  }, WRITE_DEBOUNCE);
}

/**
 * Немедленная запись на диск (вызывается при дебаунсе и при закрытии).
 */
function flushToDisk() {
  if (!_dirty || _memoryStore === null) return;
  try {
    const json = JSON.stringify(_memoryStore);
    // Дополнительная проверка: не записываем пустые/сломанные данные
    if (!json || json.length < 2) {
      console.error('[Storage] Refusing to write empty/invalid data');
      return;
    }
    atomicWriteSync(getStorePath(), json);
    _dirty = false;
    console.log('[Storage] Flushed to disk:', (json.length / 1024).toFixed(1), 'KB');
  } catch (err) {
    console.error('[Storage] Flush error:', err.message);
  }
}

/**
 * Создание ротационного бэкапа.
 * backup-4 → удаляется
 * backup-3 → backup-4
 * backup-2 → backup-3
 * backup-1 → backup-2
 * backup-0 → backup-1
 * текущий файл → backup-0
 */
function createBackup() {
  try {
    // Сначала сбрасываем текущие данные на диск
    flushToDisk();

    const mainPath = getStorePath();
    if (!fs.existsSync(mainPath)) return;

    // Проверяем что основной файл валиден перед бэкапом
    const mainCheck = safeReadJSON(mainPath);
    if (!mainCheck.ok || !isValidStore(mainCheck.data)) {
      console.warn('[Storage] Skipping backup — main file is invalid');
      return;
    }

    // Ротация: сдвигаем бэкапы
    for (let i = BACKUP_COUNT - 1; i > 0; i--) {
      const src = getBackupPath(i - 1);
      const dst = getBackupPath(i);
      if (fs.existsSync(src)) {
        try { fs.renameSync(src, dst); } catch (e) { /* ignore */ }
      }
    }

    // Копируем основной файл в backup-0
    fs.copyFileSync(mainPath, getBackupPath(0));
    console.log('[Storage] Backup created (rotation complete)');
  } catch (err) {
    console.error('[Storage] Backup error:', err.message);
  }
}

/**
 * Запускает периодическое создание бэкапов.
 */
function startBackupTimer() {
  if (_backupTimer) clearInterval(_backupTimer);
  _backupTimer = setInterval(() => {
    createBackup();
  }, BACKUP_INTERVAL);
}

/**
 * Останавливает таймеры и делает финальный flush.
 */
function shutdownStorage() {
  console.log('[Storage] Shutdown — final flush...');
  if (_writeTimer) { clearTimeout(_writeTimer); _writeTimer = null; }
  if (_backupTimer) { clearInterval(_backupTimer); _backupTimer = null; }
  // Финальный flush + backup
  _dirty = true; // Force flush
  flushToDisk();
  createBackup();
  console.log('[Storage] Shutdown complete');
}

// Инициализация: загружаем данные в память при старте
function initStorage() {
  readStorage(); // Загружает в _memoryStore
  startBackupTimer();
  console.log('[Storage] Initialized, backups dir:', getBackupDir());
}

// IPC обработчики хранилища
ipcMain.handle('store:get', (_event, key) => {
  const store = readStorage();
  return store[key] ?? null;
});

ipcMain.handle('store:set', (_event, key, value) => {
  const store = readStorage();
  store[key] = value;
  writeStorage(store);
});

ipcMain.handle('store:remove', (_event, key) => {
  const store = readStorage();
  delete store[key];
  writeStorage(store);
});

// Принудительный flush (вызывается из renderer)
ipcMain.handle('store:flush', () => {
  flushToDisk();
  return { success: true };
});

// === Arduino IPC обработчики ===

// Получить список доступных Serial портов (отфильтрованные)
ipcMain.handle('arduino:list-ports', async () => {
  try {
    return await arduino.listPorts();
  } catch (error) {
    throw new Error(`Ошибка получения портов: ${error.message}`);
  }
});

// Получить ВСЕ Serial порты (для ручного выбора в настройках)
ipcMain.handle('arduino:list-all-ports', async () => {
  try {
    return await arduino.listAllPorts();
  } catch (error) {
    throw new Error(`Ошибка получения портов: ${error.message}`);
  }
});

// Сохранить выбранный порт
ipcMain.handle('arduino:save-port', (event, portPath) => {
  savedPortPath = portPath;
  persistSavedPort(portPath);
  console.log('[Arduino] Port saved:', portPath);
  return { success: true };
});

// Получить сохранённый порт
ipcMain.handle('arduino:get-saved-port', () => {
  return savedPortPath;
});

// Переподключиться к сохранённому порту
ipcMain.handle('arduino:reconnect', async () => {
  try {
    if (arduino.isArduinoConnected()) {
      await arduino.disconnect();
    }
    // Сбрасываем таймер и запускаем автоподключение заново
    if (autoConnectRetryTimer) {
      clearTimeout(autoConnectRetryTimer);
      autoConnectRetryTimer = null;
    }
    autoConnectInProgress = false;
    await autoConnectArduino();
    return { success: true, connected: arduino.isArduinoConnected() };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Подключиться к Arduino
ipcMain.handle('arduino:connect', async (event, portPath) => {
  try {
    await arduino.connect(portPath);
    
    // Подписываемся на события Arduino
    arduino.on('relayChanged', (data) => {
      event.sender.send('arduino:relay-changed', data);
    });
    
    arduino.on('statusUpdate', (states) => {
      event.sender.send('arduino:status-update', states);
    });
    
    arduino.on('buttonPressed', (data) => {
      event.sender.send('arduino:button-pressed', data);
    });
    
    arduino.on('message', (message) => {
      event.sender.send('arduino:message', message);
    });
    
    arduino.on('error', (error) => {
      event.sender.send('arduino:error', error.message);
    });
    
    arduino.on('disconnect', () => {
      event.sender.send('arduino:disconnected');
    });

    return { success: true };
  } catch (error) {
    throw new Error(`Ошибка подключения: ${error.message}`);
  }
});

// Отключиться от Arduino
ipcMain.handle('arduino:disconnect', async () => {
  try {
    await arduino.disconnect();
    return { success: true };
  } catch (error) {
    throw new Error(`Ошибка отключения: ${error.message}`);
  }
});

// Управление реле
ipcMain.handle('arduino:set-relay', async (event, relayNumber, state) => {
  try {
    arduino.setRelay(relayNumber, state);
    return { success: true };
  } catch (error) {
    throw new Error(`Ошибка управления реле: ${error.message}`);
  }
});

// Получить статус реле
ipcMain.handle('arduino:get-status', async () => {
  try {
    arduino.getStatus();
    return { success: true };
  } catch (error) {
    throw new Error(`Ошибка получения статуса: ${error.message}`);
  }
});

// Проверить подключение
ipcMain.handle('arduino:is-connected', () => {
  return arduino.isArduinoConnected();
});

// Получить текущие состояния реле
ipcMain.handle('arduino:get-relay-states', () => {
  return arduino.getRelayStates();
});

// Получить INFO (количество реле, пины, состояния)
ipcMain.handle('arduino:get-info', async () => {
  try {
    const info = await arduino.getInfo();
    return info;
  } catch (error) {
    throw new Error(`Ошибка получения INFO: ${error.message}`);
  }
});

// === Печать чека ===
ipcMain.handle('print:receipt', async (event, receiptHTML, widthMm, silent) => {
  try {
    const paperWidth = widthMm || 80; // мм, по умолчанию 80
    const isSilent = silent !== false; // по умолчанию true (авто)
    // Создаем невидимое окно для печати
    const printWindow = new BrowserWindow({
      width: Math.max(400, Math.round(paperWidth * 4)),
      height: 900,
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    });

    // Загружаем HTML чека
    await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(receiptHTML)}`);

    // Даём время на рендеринг
    await new Promise(resolve => setTimeout(resolve, 500));

    // Печатаем
    printWindow.webContents.print(
      {
        silent: isSilent,
        printBackground: true,
        margins: { marginType: 'none' },
        pageSize: { width: paperWidth * 1000, height: 297000 }, // ширина в микронах
        scaleFactor: 100,
      },
      (success, failureReason) => {
        printWindow.close();
        if (!success && failureReason !== 'cancelled') {
          console.error('[Print] Failed:', failureReason);
        }
      }
    );

    return { success: true };
  } catch (error) {
    throw new Error(`Ошибка печати: ${error.message}`);
  }
});

// Получить список доступных принтеров
ipcMain.handle('print:get-printers', async () => {
  const win = BrowserWindow.getAllWindows()[0];
  if (win) {
    return await win.webContents.getPrintersAsync();
  }
  return [];
});

// Закрытие приложения — сохраняем данные и отключаемся от Arduino
app.on('before-quit', async () => {
  // КРИТИЧНО: сначала сбрасываем все данные на диск + бэкап
  shutdownStorage();
  if (arduino.isArduinoConnected()) {
    await arduino.disconnect();
  }
});

// Дополнительная страховка — при неожиданном завершении
process.on('SIGINT', () => {
  shutdownStorage();
  process.exit(0);
});
process.on('SIGTERM', () => {
  shutdownStorage();
  process.exit(0);
});
process.on('uncaughtException', (err) => {
  console.error('[CRITICAL] Uncaught exception:', err);
  shutdownStorage();
});