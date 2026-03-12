const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');
const ArduinoService = require('./arduino-service.cjs');

// Создаем экземпляр Arduino сервиса
const arduino = new ArduinoService();
let autoConnectInProgress = false;
let autoConnectRetryTimer = null;

function isLikelyArduinoPort(port) {
  const manufacturer = (port.manufacturer || '').toLowerCase();
  const product = (port.product || '').toLowerCase();
  const pathName = (port.path || '').toLowerCase();
  const vendorId = (port.vendorId || '').toLowerCase();
  const productId = (port.productId || '').toLowerCase();
  const pnpId = (port.pnpId || '').toLowerCase();

  // Проверяем новые Biliardo USB параметры
  if (manufacturer.includes('biliardo') || product.includes('biliardo-automatic')) {
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
}

// Этот метод будет вызван когда Electron закончит
// инициализацию и будет готов создавать окна браузера
app.whenReady().then(() => {
  createWindow();
  // Авто-подключение Arduino
  autoConnectArduino();
});

// Авто-подключение Arduino при запуске
async function autoConnectArduino() {
  if (autoConnectInProgress || arduino.isArduinoConnected()) {
    return;
  }

  autoConnectInProgress = true;
  try {
    const ports = await arduino.listPorts();
    const arduinoPort = ports.find((p) => isLikelyArduinoPort(p));

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
ipcMain.handle('print:receipt', async (event, receiptHTML) => {
  try {
    // Создаем невидимое окно для печати
    const printWindow = new BrowserWindow({
      width: 300,
      height: 600,
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    });

    // Загружаем HTML чека
    await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(receiptHTML)}`);

    // Даём время на рендеринг
    await new Promise(resolve => setTimeout(resolve, 200));

    // Печатаем
    printWindow.webContents.print(
      {
        silent: false, // Показать диалог выбора принтера
        printBackground: true,
        margins: { marginType: 'none' }
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

// Закрытие приложения - отключаемся от Arduino
app.on('before-quit', async () => {
  if (arduino.isArduinoConnected()) {
    await arduino.disconnect();
  }
});