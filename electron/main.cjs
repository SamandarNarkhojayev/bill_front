const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const ArduinoService = require('./arduino-service.cjs');

// Создаем экземпляр Arduino сервиса
const arduino = new ArduinoService();

function createWindow() {
  // Создаём окно браузера
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs')
    }
  });

  // В режиме разработки загружаем из Vite dev server
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
    // DevTools открываются по F12 или Cmd+Option+I
    // mainWindow.webContents.openDevTools();
  } else {
    // В production загружаем собранные файлы
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

// Этот метод будет вызван когда Electron закончит
// инициализацию и будет готов создавать окна браузера
app.whenReady().then(createWindow);

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

// === Arduino IPC обработчики ===

// Получить список доступных Serial портов
ipcMain.handle('arduino:list-ports', async () => {
  try {
    return await arduino.listPorts();
  } catch (error) {
    throw new Error(`Ошибка получения портов: ${error.message}`);
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

// Закрытие приложения - отключаемся от Arduino
app.on('before-quit', async () => {
  if (arduino.isArduinoConnected()) {
    await arduino.disconnect();
  }
});