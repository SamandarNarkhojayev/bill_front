const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');

class ArduinoService {
  constructor() {
    this.port = null;
    this.parser = null;
    this.isConnected = false;
    this.relayStates = [false, false, false, false];
    this.eventHandlers = {};
  }

  // Найти доступные Serial порты
  async listPorts() {
    try {
      const ports = await SerialPort.list();
      console.log('Все найденные порты:', ports);
      
      // Фильтрация портов - ищем Arduino/ESP32 устройства
      const filtered = ports.filter(port => {
        // Проверяем по имени порта (usbmodem, usbserial, wchusbserial)
        const isUsbPort = /usb(modem|serial)/i.test(port.path);
        
        // Проверяем по производителю
        const isArduinoManufacturer = port.manufacturer && 
          (port.manufacturer.includes('Arduino') || 
           port.manufacturer.includes('ESP') ||
           port.manufacturer.includes('CH340') ||
           port.manufacturer.includes('CP210') ||
           port.manufacturer.includes('Silicon Labs') ||
           port.manufacturer.includes('FTDI'));
        
        return isUsbPort || isArduinoManufacturer;
      });
      
      console.log('Отфильтрованные порты:', filtered);
      return filtered.length > 0 ? filtered : ports; // Если ничего не найдено, возвращаем все
    } catch (error) {
      console.error('Ошибка получения списка портов:', error);
      return [];
    }
  }

  // Подключиться к Arduino
  async connect(portPath) {
    try {
      if (this.isConnected) {
        await this.disconnect();
      }

      console.log(`Попытка подключения к порту: ${portPath}`);

      this.port = new SerialPort({
        path: portPath,
        baudRate: 115200,
        autoOpen: false
      });

      this.parser = this.port.pipe(new ReadlineParser({ delimiter: '\n' }));

      return new Promise((resolve, reject) => {
        this.port.open((err) => {
          if (err) {
            console.error(`Ошибка открытия порта ${portPath}:`, err);
            reject(new Error(`Ошибка открытия порта: ${err.message}`));
            return;
          }

          this.isConnected = true;
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

          // Запросить текущий статус реле через 2 секунды
          setTimeout(() => {
            console.log('Запрос статуса реле...');
            this.sendCommand('STATUS');
          }, 2000);

          resolve();
        });
      });
    } catch (error) {
      console.error('Ошибка подключения к Arduino:', error);
      throw new Error(`Ошибка подключения к Arduino: ${error.message}`);
    }
  }

  // Отключиться от Arduino
  async disconnect() {
    if (this.port && this.port.isOpen) {
      return new Promise((resolve) => {
        this.port.close(() => {
          this.isConnected = false;
          console.log('🔌 Отключено от Arduino');
          resolve();
        });
      });
    }
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
    if (relayNumber < 1 || relayNumber > 4) {
      throw new Error('Номер реле должен быть от 1 до 4');
    }

    const command = `RELAY${relayNumber}_${state ? 'ON' : 'OFF'}`;
    this.sendCommand(command);
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