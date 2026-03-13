let SerialPort = null;
let ReadlineParser = null;

try {
  ({ SerialPort } = require('serialport'));
  ({ ReadlineParser } = require('@serialport/parser-readline'));
} catch (error) {
  console.error('[Arduino] Serial modules are unavailable:', error.message);
}

class ArduinoService {
  constructor() {
    this.serialAvailable = Boolean(SerialPort && ReadlineParser);
    this.port = null;
    this.parser = null;
    this.isConnected = false;
    this.isConnecting = false;
    this.connectPromise = null;
    this.connectedPortPath = null;
    this.relayStates = [false, false, false, false];
    this.relayInfo = null; // { count, relays: [{ number, pin, state }] }
    this.eventHandlers = {};
    this._infoResolve = null;
  }

  // Получить ВСЕ Serial порты без фильтрации
  async listAllPorts() {
    if (!this.serialAvailable) {
      return [];
    }
    try {
      const ports = await SerialPort.list();
      return ports;
    } catch (error) {
      console.error('Ошибка получения списка портов:', error);
      return [];
    }
  }

  // Найти доступные Serial порты
  async listPorts() {
    if (!this.serialAvailable) {
      return [];
    }

    try {
      const ports = await SerialPort.list();
      console.log('Все найденные порты:', ports);

      const filtered = ports.filter((port) => {
        const manufacturer = (port.manufacturer || '').toLowerCase();
        const product = (port.product || '').toLowerCase();
        const pathName = (port.path || '').toLowerCase();
        const vendorId = (port.vendorId || '').toLowerCase();
        const productId = (port.productId || '').toLowerCase();
        const pnpId = (port.pnpId || '').toLowerCase();

        // Проверяем Biliardo (ESP32 реле) с новыми USB параметрами
        const isBiliardoDevice = manufacturer.includes('biliardo') || product.includes('biliardo-automatic');

        const isUsbPortName =
          /usb(modem|serial)/i.test(pathName) ||
          /^com\d+$/i.test(pathName) ||
          pathName.includes('ttyusb') ||
          pathName.includes('ttyacm');

        const isKnownManufacturer =
          manufacturer.includes('arduino') ||
          manufacturer.includes('esp') ||
          manufacturer.includes('espressif') ||
          manufacturer.includes('ch340') ||
          manufacturer.includes('cp210') ||
          manufacturer.includes('silicon labs') ||
          manufacturer.includes('wch') ||
          manufacturer.includes('ftdi');

        const isKnownVendor = ['2341', '2a03', '1a86', '10c4', '0403', '303a'].includes(vendorId);
        const isKnownProduct = ['ea60', '7523', '6001'].includes(productId);
        const isKnownPnpId =
          pnpId.includes('vid_2341') ||
          pnpId.includes('vid_2a03') ||
          pnpId.includes('vid_1a86') ||
          pnpId.includes('vid_10c4') ||
          pnpId.includes('vid_0403') ||
          pnpId.includes('vid_303a');

        return isBiliardoDevice || isUsbPortName || isKnownManufacturer || isKnownVendor || isKnownProduct || isKnownPnpId;
      });

      console.log('Отфильтрованные порты:', filtered);
      return filtered.length > 0 ? filtered : ports;
    } catch (error) {
      console.error('Ошибка получения списка портов:', error);
      return [];
    }
  }

  // Подключиться к Arduino
  async connect(portPath) {
    if (!this.serialAvailable) {
      throw new Error('SerialPort модуль недоступен в этой сборке');
    }

    try {
      if (this.isConnected && this.connectedPortPath === portPath) {
        return;
      }

      if (this.isConnecting && this.connectPromise) {
        return this.connectPromise;
      }

      if (this.isConnected) {
        await this.disconnect();
      }

      console.log(`Попытка подключения к порту: ${portPath}`);

      this.isConnecting = true;
      this.connectPromise = new Promise((resolve, reject) => {
        this.port = new SerialPort({
          path: portPath,
          baudRate: 115200,
          autoOpen: false
        });

        this.parser = this.port.pipe(new ReadlineParser({ delimiter: '\n' }));

        this.port.open((err) => {
          if (err) {
            console.error(`Ошибка открытия порта ${portPath}:`, err);
            this.port = null;
            this.parser = null;
            reject(new Error(`Ошибка открытия порта: ${err.message}`));
            return;
          }

          this.isConnected = true;
          this.connectedPortPath = portPath;
          console.log(`✅ Подключено к Arduino на ${portPath}`);

          // Обработка входящих данных
          this.parser.on('data', (data) => {
            const message = data.toString().trim();
            console.log('Arduino → PC:', message);
            this.handleArduinoMessage(message);
          });

          // Обработка ошибок
          this.port.on('error', (err) => {
            console.error('Ошибка Serial порта:', err);
            this.emit('error', err);
          });

          // Обработка отключения
          this.port.on('close', () => {
            console.log('🔌 Arduino отключено');
            this.isConnected = false;
            this.emit('disconnect');
          });

          // Запросить текущий статус и информацию о реле через 2 секунды
          setTimeout(() => {
            console.log('Запрос статуса реле...');
            this.sendCommand('STATUS');
            // Запросить INFO для определения количества реле
            setTimeout(() => {
              console.log('Запрос INFO...');
              this.getInfo().then((info) => {
                console.log('Arduino INFO:', info);
                this.emit('info', info);
              }).catch((err) => {
                console.log('INFO не поддерживается:', err.message);
              });
            }, 1000);
          }, 2000);

          resolve();
        });
      });

      return await this.connectPromise;
    } catch (error) {
      console.error('Ошибка подключения к Arduino:', error);
      throw new Error(`Ошибка подключения к Arduino: ${error.message}`);
    } finally {
      this.isConnecting = false;
      this.connectPromise = null;
    }
  }

  // Отключиться от Arduino
  async disconnect() {
    if (this.port && this.port.isOpen) {
      return new Promise((resolve) => {
        this.port.close(() => {
          this.isConnected = false;
          this.isConnecting = false;
          this.connectedPortPath = null;
          this.port = null;
          this.parser = null;
          console.log('🔌 Отключено от Arduino');
          resolve();
        });
      });
    }

    this.isConnected = false;
    this.isConnecting = false;
    this.connectedPortPath = null;
    this.port = null;
    this.parser = null;
  }

  // Отправить команду Arduino
  sendCommand(command) {
    if (!this.isConnected || !this.port) {
      throw new Error('Arduino не подключено');
    }

    console.log('PC → Arduino:', command);
    this.port.write(command + '\n');
  }

  // Управление реле
  setRelay(relayNumber, state) {
    const maxRelay = this.relayInfo ? this.relayInfo.count : 16;
    if (relayNumber < 1 || relayNumber > maxRelay) {
      throw new Error(`Номер реле должен быть от 1 до ${maxRelay}`);
    }

    const command = `RELAY${relayNumber}_${state ? 'ON' : 'OFF'}`;
    this.sendCommand(command);
  }

  // Запросить INFO (количество реле, пины, состояния)
  getInfo() {
    return new Promise((resolve, reject) => {
      if (!this.isConnected || !this.port) {
        reject(new Error('Arduino не подключено'));
        return;
      }
      this._infoResolve = resolve;
      this._infoLines = [];
      this._infoExpectedCount = null;
      this.sendCommand('INFO');
      // Таймаут 3 секунды
      this._infoTimeout = setTimeout(() => {
        this._infoResolve = null;
        this._infoLines = [];
        reject(new Error('INFO timeout'));
      }, 3000);
    });
  }

  // Получить статус всех реле
  getStatus() {
    this.sendCommand('STATUS');
  }

  // Обработка сообщений от Arduino
  handleArduinoMessage(message) {
    // Обработка подтверждений команд
    if (message.startsWith('OK RELAY')) {
      const match = message.match(/OK RELAY(\d) (ON|OFF)/);
      if (match) {
        const relayIndex = parseInt(match[1]) - 1;
        const state = match[2] === 'ON';
        this.relayStates[relayIndex] = state;
        this.emit('relayChanged', { relay: relayIndex + 1, state });
      }
    }
    
    // Обработка статуса
    else if (message.startsWith('STATUS:')) {
      const match = message.match(/STATUS: R1=(\w+) R2=(\w+) R3=(\w+) R4=(\w+)/);
      if (match) {
        for (let i = 0; i < 4; i++) {
          this.relayStates[i] = match[i + 1] === 'ON';
        }
        this.emit('statusUpdate', this.relayStates);
      }
    }
    
    // Обработка нажатий кнопок на Arduino
    else if (message.includes('🔘 BUTTON')) {
      const match = message.match(/🔘 BUTTON RELAY(\d) (ON|OFF)/);
      if (match) {
        const relayIndex = parseInt(match[1]) - 1;
        const state = match[2] === 'ON';
        this.relayStates[relayIndex] = state;
        this.emit('buttonPressed', { relay: relayIndex + 1, state });
        this.emit('relayChanged', { relay: relayIndex + 1, state });
      }
    }
    
    // Обработка INFO ответа
    else if (message.startsWith('RELAYS:')) {
      const count = parseInt(message.replace('RELAYS:', '').trim());
      if (this._infoResolve) {
        this._infoExpectedCount = count;
        this._infoLines = [];
      }
    }
    else if (message.startsWith('RELAY') && message.includes('PIN=') && this._infoResolve) {
      // Формат: RELAY1 PIN=3 STATE=OFF
      const match = message.match(/RELAY(\d+)\s+PIN=(\d+)\s+STATE=(ON|OFF)/);
      if (match) {
        this._infoLines.push({
          number: parseInt(match[1]),
          pin: parseInt(match[2]),
          state: match[3] === 'ON'
        });
        // Если собрали все реле — резолвим
        if (this._infoExpectedCount && this._infoLines.length >= this._infoExpectedCount) {
          clearTimeout(this._infoTimeout);
          const info = {
            count: this._infoExpectedCount,
            relays: [...this._infoLines]
          };
          this.relayInfo = info;
          // Обновляем relayStates под новое количество
          this.relayStates = info.relays.map(r => r.state);
          const resolve = this._infoResolve;
          this._infoResolve = null;
          this._infoLines = [];
          resolve(info);
        }
      }
    }
    
    // Обработка ошибок
    else if (message.startsWith('❌')) {
      this.emit('error', new Error(message));
    }

    // Все сообщения передаем в интерфейс
    this.emit('message', message);
  }

  // Подписка на события
  on(event, handler) {
    if (!this.eventHandlers[event]) {
      this.eventHandlers[event] = [];
    }
    this.eventHandlers[event].push(handler);
  }

  // Отправка событий
  emit(event, data) {
    if (this.eventHandlers[event]) {
      this.eventHandlers[event].forEach(handler => handler(data));
    }
  }

  // Получить текущее состояние
  getRelayStates() {
    return [...this.relayStates];
  }

  // Проверить подключение
  isArduinoConnected() {
    return this.isConnected;
  }
}

module.exports = ArduinoService;