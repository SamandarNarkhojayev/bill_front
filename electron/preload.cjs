// Preload скрипт выполняется до загрузки веб-страницы
// Он имеет доступ к Node.js API и используется для
// безопасного взаимодействия между main процессом и renderer

const { contextBridge, ipcRenderer } = require('electron');

// Предоставляем безопасный API для renderer процесса
contextBridge.exposeInMainWorld('electronAPI', {
  // Arduino API
  arduino: {
    // Получить список доступных портов
    listPorts: () => ipcRenderer.invoke('arduino:list-ports'),
    
    // Подключиться к Arduino
    connect: (portPath) => ipcRenderer.invoke('arduino:connect', portPath),
    
    // Отключиться от Arduino
    disconnect: () => ipcRenderer.invoke('arduino:disconnect'),
    
    // Управление реле
    setRelay: (relayNumber, state) => ipcRenderer.invoke('arduino:set-relay', relayNumber, state),
    
    // Получить статус всех реле
    getStatus: () => ipcRenderer.invoke('arduino:get-status'),
    
    // Проверить подключение
    isConnected: () => ipcRenderer.invoke('arduino:is-connected'),
    
    // Получить текущие состояния реле
    getRelayStates: () => ipcRenderer.invoke('arduino:get-relay-states'),
    
    // Получить INFO (количество реле, пины)
    getInfo: () => ipcRenderer.invoke('arduino:get-info'),
    
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
    // Печать чека
    printReceipt: (receiptHTML) => ipcRenderer.invoke('print:receipt', receiptHTML),
    
    // Получить список принтеров
    getPrinters: () => ipcRenderer.invoke('print:get-printers')
  }
});

console.log('Preload script loaded with Arduino API');