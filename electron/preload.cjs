// Preload скрипт выполняется до загрузки веб-страницы
// Он имеет доступ к Node.js API и используется для
// безопасного взаимодействия между main процессом и renderer

const { contextBridge, ipcRenderer } = require('electron');

function normalizeArduinoErrorMessage(error) {
  const rawMessage = error instanceof Error ? error.message : String(error || 'Неизвестная ошибка');
  const cleanedMessage = rawMessage
    .replace(/^Error invoking remote method '[^']+':\s*/i, '')
    .replace(/^Error:\s*/i, '');

  if (/cannot lock port|resource temporarily unavailable/i.test(cleanedMessage)) {
    return 'Порт занят другим приложением или другим экземпляром Biliardo. Закройте Arduino IDE, Serial Monitor, PlatformIO или второе окно приложения и попробуйте снова.';
  }

  return cleanedMessage;
}

async function invokeArduino(channel, ...args) {
  try {
    return await ipcRenderer.invoke(channel, ...args);
  } catch (error) {
    throw new Error(normalizeArduinoErrorMessage(error));
  }
}

// Предоставляем безопасный API для renderer процесса
contextBridge.exposeInMainWorld('electronAPI', {
  // Arduino API
  arduino: {
    // Получить список доступных портов (отфильтрованные)
    listPorts: () => invokeArduino('arduino:list-ports'),
    
    // Получить ВСЕ порты (для ручного выбора в настройках)
    listAllPorts: () => invokeArduino('arduino:list-all-ports'),
    
    // Сохранить выбранный порт
    savePort: (portPath) => invokeArduino('arduino:save-port', portPath),
    
    // Получить сохранённый порт
    getSavedPort: () => invokeArduino('arduino:get-saved-port'),
    
    // Переподключиться (используя сохранённый порт)
    reconnect: () => invokeArduino('arduino:reconnect'),
    
    // Подключиться к Arduino
    connect: (portPath) => invokeArduino('arduino:connect', portPath),
    
    // Отключиться от Arduino
    disconnect: () => invokeArduino('arduino:disconnect'),
    
    // Управление реле
    setRelay: (relayNumber, state) => invokeArduino('arduino:set-relay', relayNumber, state),
    
    // Получить статус всех реле
    getStatus: () => invokeArduino('arduino:get-status'),
    
    // Проверить подключение
    isConnected: () => invokeArduino('arduino:is-connected'),
    
    // Получить текущие состояния реле
    getRelayStates: () => invokeArduino('arduino:get-relay-states'),
    
    // Получить INFO (количество реле, пины)
    getInfo: () => invokeArduino('arduino:get-info'),
    
    // Подписка на события
    onRelayChanged: (callback) => {
      ipcRenderer.on('arduino:relay-changed', (event, data) => callback(data));
    },
    
    onStatusUpdate: (callback) => {
      ipcRenderer.on('arduino:status-update', (event, states) => callback(states));
    },
    
    onButtonPressed: (callback) => {
      ipcRenderer.on('arduino:button-pressed', (event, data) => callback(data));
    },
    
    onMessage: (callback) => {
      ipcRenderer.on('arduino:message', (event, message) => callback(message));
    },
    
    onInfo: (callback) => {
      ipcRenderer.on('arduino:info', (event, info) => callback(info));
    },
    
    onError: (callback) => {
      ipcRenderer.on('arduino:error', (event, error) => callback(error));
    },
    
    onDisconnected: (callback) => {
      ipcRenderer.on('arduino:disconnected', () => callback());
    },
    
    // Отписка от событий
    removeAllListeners: (channel) => {
      ipcRenderer.removeAllListeners(`arduino:${channel}`);
    }
  },

  // Printer API
  printer: {
    // Печать чека (receiptHTML — строка HTML, widthMm — ширина в мм)
    printReceipt: (receiptHTML, widthMm, silent) => ipcRenderer.invoke('print:receipt', receiptHTML, widthMm, silent),
    
    // Получить список принтеров
    getPrinters: () => ipcRenderer.invoke('print:get-printers')
  },

  // App Updater API
  updater: {
    getState: () => ipcRenderer.invoke('updater:get-state'),
    checkForUpdates: () => ipcRenderer.invoke('updater:check'),
    downloadUpdate: () => ipcRenderer.invoke('updater:download'),
    installUpdate: () => ipcRenderer.invoke('updater:install'),
    onStatus: (callback) => {
      ipcRenderer.on('updater:status', (event, payload) => callback(payload));
    },
    removeAllListeners: () => {
      ipcRenderer.removeAllListeners('updater:status');
    }
  },

  // Persistent Storage API (файловое хранилище через main-процесс)
  store: {
    get: (key) => ipcRenderer.invoke('store:get', key),
    set: (key, value) => ipcRenderer.invoke('store:set', key, value),
    remove: (key) => ipcRenderer.invoke('store:remove', key),
    flush: () => ipcRenderer.invoke('store:flush'),
  },

  app: {
    onBeforeClose: (callback) => {
      const listener = () => callback();
      ipcRenderer.on('app:before-close', listener);
      return () => {
        ipcRenderer.removeListener('app:before-close', listener);
      };
    },
    confirmCloseReady: () => ipcRenderer.invoke('app:confirm-close-ready'),
  },

  // Backup & Recovery API
  backup: {
    list: () => ipcRenderer.invoke('backup:list'),
    restore: (backupPath) => ipcRenderer.invoke('backup:restore', backupPath),
    exportData: () => ipcRenderer.invoke('backup:export'),
    importData: () => ipcRenderer.invoke('backup:import'),
    createNow: () => ipcRenderer.invoke('backup:create-now'),
    getStoragePaths: () => ipcRenderer.invoke('backup:get-storage-path'),
  }
});

console.log('Preload script loaded with Arduino API');