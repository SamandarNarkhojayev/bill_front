# 📋 Билиардная система управления Arduino ESP32-C3

Полная документация проекта системы управления 4-канальным реле через Arduino ESP32-C3 с графическим интерфейсом на Electron + React.

## 📖 Содержание
1. [Обзор проекта](#обзор-проекта)
2. [Архитектура системы](#архитектура-системы)
3. [Установка и настройка](#установка-и-настройка)
4. [Схема подключения Arduino](#схема-подключения-arduino)
5. [Код Arduino (прошивка)](#код-arduino-прошивка)
6. [Структура Electron приложения](#структура-electron-приложения)
7. [API документация](#api-документация)
8. [Пользовательский интерфейс](#пользовательский-интерфейс)
9. [Протокол связи](#протокол-связи)
10. [Решение проблем](#решение-проблем)
11. [Расширение функционала](#расширение-функционала)

---

## 🎯 Обзор проекта

### Назначение
Система предназначена для управления бильярдным столом или другим оборудованием через 4 реле, подключенных к Arduino ESP32-C3. Обеспечивает как программное управление через графический интерфейс, так и физическое управление кнопками на плате Arduino.

### Ключевые возможности
- ✅ **Двойное управление**: Программное (через приложение) + физическое (кнопки на Arduino)
- ✅ **Real-time синхронизация**: Мгновенное отображение изменений состояния
- ✅ **Безопасная связь**: Протокол команд с подтверждениями
- ✅ **Логирование**: Полная история всех операций
- ✅ **Автоопределение портов**: Автоматический поиск Arduino устройств
- ✅ **Кроссплатформенность**: Windows, macOS, Linux

---

## 🏗 Архитектура системы

```
┌─────────────────┐    USB/Serial    ┌──────────────────┐
│   Electron App  │ ◄──────────────► │   Arduino ESP32  │
│                 │                  │                  │
│  ┌─────────────┐│                  │  ┌─────────────┐ │
│  │   React UI  ││                  │  │  4x Реле    │ │
│  └─────────────┘│                  │  │  4x Кнопки  │ │
│  ┌─────────────┐│                  │  └─────────────┘ │
│  │ Arduino API ││                  │                  │
│  └─────────────┘│                  │                  │
│  ┌─────────────┐│                  │                  │
│  │SerialPort   ││                  │                  │
│  │Service      ││                  │                  │
│  └─────────────┘│                  │                  │
└─────────────────┘                  └──────────────────┘
```

### Компоненты системы

1. **Arduino ESP32-C3** - микроконтроллер с прошивкой
2. **Electron App** - десктопное приложение
3. **React Frontend** - пользовательский интерфейс
4. **Arduino Service** - сервис связи с Arduino
5. **Serial Communication** - протокол обмена данными

---

## 🛠 Установка и настройка

### Системные требования
- **OS**: macOS 10.14+, Windows 10+, Ubuntu 18+
- **Node.js**: 16.0+
- **Arduino IDE**: 2.0+ (для прошивки)
- **USB порт** для подключения Arduino

### Установка проекта

1. **Клонирование/скачивание проекта**
```bash
# Если у вас есть git репозиторий
git clone <repository-url>
cd billiard-client

# Или распакуйте архив в папку billiard-client
```

2. **Установка зависимостей**
```bash
npm install
```

3. **Запуск в режиме разработки**
```bash
npm run start
```

4. **Сборка для production**
```bash
npm run build
npm run electron
```

### Доступные команды

| Команда | Описание |
|---------|----------|
| `npm run dev` | Запуск только веб-версии (Vite dev server) |
| `npm run start` | Запуск Electron + веб-сервер (режим разработки) |
| `npm run build` | Сборка веб-приложения для production |
| `npm run electron` | Запуск Electron в production режиме |
| `npm run electron:dev` | Запуск только Electron (после запуска веб-сервера) |

---

## ⚡ Схема подключения Arduino

### Распиновка ESP32-C3

```
ESP32-C3 DevKit:

┌─────────────────┐
│     ESP32-C3    │
│                 │
│ GPIO 3  ──────  │ ───► Реле 1 (IN1)
│ GPIO 4  ──────  │ ───► Реле 2 (IN2)
│ GPIO 5  ──────  │ ───► Реле 3 (IN3)
│ GPIO 7  ──────  │ ───► Реле 4 (IN4)
│                 │
│ GPIO 10 ──────  │ ───► Кнопка 1 (к GND)
│ GPIO 9  ──────  │ ───► Кнопка 2 (к GND)
│ GPIO 6  ──────  │ ───► Кнопка 3 (к GND)
│ GPIO 8  ──────  │ ───► Кнопка 4 (к GND)
│                 │
│ 5V      ──────  │ ───► Питание реле модуля
│ GND     ──────  │ ───► Общий GND
└─────────────────┘
```

### Подключение реле модуля

```
4-Channel Relay Module:

┌─────────────────┐
│  VCC ←─── 5V    │ (Питание от ESP32)
│  GND ←─── GND   │ (Общий GND)
│                 │
│  IN1 ←─── GPIO3 │ (Управление реле 1)
│  IN2 ←─── GPIO4 │ (Управление реле 2)
│  IN3 ←─── GPIO5 │ (Управление реле 3)
│  IN4 ←─── GPIO7 │ (Управление реле 4)
│                 │
│  NO1 ─────────  │ ───► Нагрузка 1
│  COM1 ──────────│ ───► Общий провод
│  NO2 ─────────  │ ───► Нагрузка 2
│  COM2 ──────────│ ───► Общий провод
│  ...            │
└─────────────────┘
```

### Подключение кнопок

```
Каждая кнопка подключается между GPIO и GND:

Кнопка 1: GPIO 10 ←──[Кнопка]──→ GND
Кнопка 2: GPIO 9  ←──[Кнопка]──→ GND  
Кнопка 3: GPIO 6  ←──[Кнопка]──→ GND
Кнопка 4: GPIO 8  ←──[Кнопка]──→ GND

(INPUT_PULLUP включен в коде, внешние резисторы не нужны)
```

---

## 💾 Код Arduino (прошивка)

### Основной файл: `arduino-firmware.ino`

```cpp
#include <Arduino.h>

// === КОНФИГУРАЦИЯ ПИНОВ ===
const int relayPins[4] = {3, 4, 5, 7};    // GPIO пины для реле
const int buttonPins[4] = {10, 9, 6, 8};  // GPIO пины для кнопок

// === НАСТРОЙКИ РЕЛЕ ===
// true = реле активно по LOW (LOW = ON, HIGH = OFF)
// false = реле активно по HIGH (HIGH = ON, LOW = OFF)
const bool ACTIVE_LOW = false;

// === ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ===
bool relayState[4] = {false, false, false, false}; // Логическое состояние реле
bool lastButtonState[4] = {HIGH, HIGH, HIGH, HIGH}; // Предыдущее состояние кнопок

// === ФУНКЦИИ ===

void setRelayPhysical(int i, bool on) {
  // Устанавливает физический уровень на пине реле
  if (ACTIVE_LOW) {
    digitalWrite(relayPins[i], on ? LOW : HIGH);
  } else {
    digitalWrite(relayPins[i], on ? HIGH : LOW);
  }
}

void setRelay(int i, bool on) {
  // Устанавливает состояние реле и выводит сообщение
  relayState[i] = on;
  setRelayPhysical(i, on);
  Serial.printf("RELAY%d -> %s\n", i + 1, on ? "ON" : "OFF");
}

void toggleRelay(int i) {
  // Переключает состояние реле (для кнопок)
  setRelay(i, !relayState[i]);
  Serial.printf("🔘 BUTTON RELAY%d %s\n", i + 1, relayState[i] ? "ON" : "OFF");
}

void setup() {
  // === ИНИЦИАЛИЗАЦИЯ ===
  Serial.begin(115200);
  delay(1500);
  Serial.println("✅ ESP32-C3 4-Relay USB Control Ready");

  // Настройка пинов
  for (int i = 0; i < 4; i++) {
    pinMode(relayPins[i], OUTPUT);
    pinMode(buttonPins[i], INPUT_PULLUP); // Кнопки с подтяжкой к VCC
  }

  // Инициализация всех реле в состояние OFF
  for (int i = 0; i < 4; i++) {
    setRelayPhysical(i, false);
    relayState[i] = false;
  }

  // Вывод справочной информации
  Serial.println("Use commands: RELAY1_ON / RELAY1_OFF ... RELAY4_ON / RELAY4_OFF");
  Serial.printf("ACTIVE_LOW=%s\n", ACTIVE_LOW ? "true (LOW = ON)" : "false (HIGH = ON)");
}

void loop() {
  // === ОБРАБОТКА КНОПОК ===
  for (int i = 0; i < 4; i++) {
    bool currentState = digitalRead(buttonPins[i]);
    // Обнаружение нажатия (переход HIGH → LOW)
    if (currentState == LOW && lastButtonState[i] == HIGH) {
      delay(50); // Антидребезг
      if (digitalRead(buttonPins[i]) == LOW) {
        toggleRelay(i);
      }
    }
    lastButtonState[i] = currentState;
  }

  // === ОБРАБОТКА SERIAL КОМАНД ===
  if (Serial.available()) {
    String cmd = Serial.readStringUntil('\n');
    cmd.trim();

    // Команды управления реле
    if (cmd == "RELAY1_ON")       { setRelay(0, true);  Serial.println("OK RELAY1 ON"); }
    else if (cmd == "RELAY1_OFF") { setRelay(0, false); Serial.println("OK RELAY1 OFF"); }
    else if (cmd == "RELAY2_ON")  { setRelay(1, true);  Serial.println("OK RELAY2 ON"); }
    else if (cmd == "RELAY2_OFF") { setRelay(1, false); Serial.println("OK RELAY2 OFF"); }
    else if (cmd == "RELAY3_ON")  { setRelay(2, true);  Serial.println("OK RELAY3 ON"); }
    else if (cmd == "RELAY3_OFF") { setRelay(2, false); Serial.println("OK RELAY3 OFF"); }
    else if (cmd == "RELAY4_ON")  { setRelay(3, true);  Serial.println("OK RELAY4 ON"); }
    else if (cmd == "RELAY4_OFF") { setRelay(3, false); Serial.println("OK RELAY4 OFF"); }
    
    // Команда получения статуса
    else if (cmd == "STATUS") {
      Serial.printf("STATUS: R1=%s R2=%s R3=%s R4=%s\n",
                    relayState[0] ? "ON" : "OFF",
                    relayState[1] ? "ON" : "OFF",
                    relayState[2] ? "ON" : "OFF",
                    relayState[3] ? "ON" : "OFF");
    }
    
    // Обработка неизвестных команд
    else if (cmd.length() > 0) {
      Serial.print("❌ UNKNOWN COMMAND: ");
      Serial.println(cmd);
    }
  }
}
```

### Загрузка прошивки

1. **Откройте Arduino IDE**
2. **Установите поддержку ESP32**:
   - File → Preferences
   - Additional Board Manager URLs: `https://dl.espressif.com/dl/package_esp32_index.json`
   - Tools → Board → Boards Manager → поиск "ESP32" → Install
3. **Настройте плату**:
   - Tools → Board → ESP32 Arduino → ESP32C3 Dev Module
   - Tools → Port → выберите порт Arduino
4. **Скопируйте код** из файла `arduino-firmware.ino`
5. **Загрузите прошивку** (Ctrl+U или кнопка →)

---

## 🖥 Структура Electron приложения

### Файловая структура

```
billiard-client/
├── electron/
│   ├── main.cjs                 # Главный процесс Electron
│   ├── preload.cjs             # Preload скрипт с Arduino API
│   └── arduino-service.cjs     # Сервис для работы с Arduino
├── src/
│   ├── components/
│   │   └── ArduinoControl.tsx  # React компонент управления
│   ├── types/
│   │   └── arduino.ts          # TypeScript типы
│   ├── App.tsx                 # Главный компонент приложения  
│   ├── App.css                 # Стили приложения
│   ├── index.css               # Глобальные стили + Tailwind
│   └── main.tsx                # Точка входа React
├── public/
├── package.json                # Зависимости и скрипты
├── vite.config.ts             # Конфигурация Vite
├── tailwind.config.cjs        # Конфигурация Tailwind CSS
├── arduino-firmware.ino       # Прошивка для Arduino
└── README-ARDUINO.md          # Документация
```

### Ключевые файлы

#### `electron/main.cjs` - Главный процесс
```javascript
// Управляет жизненным циклом приложения
// Создает окна браузера
// Обрабатывает IPC коммуникацию с renderer процессом
// Инициализирует Arduino сервис
```

#### `electron/preload.cjs` - Preload скрипт  
```javascript
// Предоставляет безопасный API для renderer процесса
// Мост между main и renderer процессами
// Экспортирует window.electronAPI.arduino
```

#### `electron/arduino-service.cjs` - Arduino сервис
```javascript
// Управление Serial портом
// Обработка команд и ответов Arduino
// Event-driven архитектура для уведомлений
```

#### `src/components/ArduinoControl.tsx` - UI компонент
```typescript
// React компонент с интерфейсом управления
// Подключение к Arduino
// Управление реле  
// Отображение логов и статуса
```

---

## 📡 API документация

### Arduino Service API

#### Методы подключения

```typescript
// Получить список доступных портов
await window.electronAPI.arduino.listPorts(): Promise<SerialPort[]>

// Подключиться к Arduino
await window.electronAPI.arduino.connect(portPath: string): Promise<{success: boolean}>

// Отключиться от Arduino  
await window.electronAPI.arduino.disconnect(): Promise<{success: boolean}>

// Проверить состояние подключения
await window.electronAPI.arduino.isConnected(): Promise<boolean>
```

#### Методы управления

```typescript
// Установить состояние реле (1-4, true/false)
await window.electronAPI.arduino.setRelay(relayNumber: number, state: boolean): Promise<{success: boolean}>

// Запросить статус всех реле
await window.electronAPI.arduino.getStatus(): Promise<{success: boolean}>

// Получить текущие состояния реле
await window.electronAPI.arduino.getRelayStates(): Promise<boolean[]>
```

#### События (подписка)

```typescript
// Изменение состояния реле
window.electronAPI.arduino.onRelayChanged((data: {relay: number, state: boolean}) => void)

// Обновление статуса всех реле
window.electronAPI.arduino.onStatusUpdate((states: boolean[]) => void)

// Нажатие кнопки на Arduino
window.electronAPI.arduino.onButtonPressed((data: {relay: number, state: boolean}) => void)

// Сообщения от Arduino
window.electronAPI.arduino.onMessage((message: string) => void)

// Ошибки
window.electronAPI.arduino.onError((error: string) => void)

// Отключение Arduino
window.electronAPI.arduino.onDisconnected(() => void)
```

#### Отписка от событий

```typescript
// Отписаться от конкретного типа событий
window.electronAPI.arduino.removeAllListeners(channel: string)
```

### TypeScript типы

```typescript
interface SerialPort {
  path: string;           // Путь к порту (/dev/cu.usbmodem1201)
  manufacturer?: string;  // Производитель устройства
  serialNumber?: string;  // Серийный номер
  pnpId?: string;        // PnP идентификатор
  locationId?: string;   // ID расположения
  vendorId?: string;     // ID производителя
  productId?: string;    // ID продукта
}

interface RelayChangeEvent {
  relay: number;    // Номер реле (1-4)
  state: boolean;   // Состояние (true=ON, false=OFF)
}

interface ButtonPressEvent {
  relay: number;    // Номер кнопки/реле (1-4)  
  state: boolean;   // Новое состояние после нажатия
}
```

---

## 🎨 Пользовательский интерфейс

### Главное окно приложения

```
┌─────────────────── Billiard Control System ───────────────────┐
│                                                                │
│  [Arduino]  [Бильярд]                                        │
│                                                                │
├──────────────────── Подключение ─────────────────────────────┤
│                                                                │
│  [Выберите порт... ▼] [🔄] [Подключить]                       │
│  Статус: Подключено • Порт: /dev/cu.usbmodem1201             │
│                                                                │
├─────────────────── Управление реле ──────────────────────────┤
│                                                                │
│  ● Реле 1  [ВКЛ]   [ВКЛ] [ВЫКЛ]    ● Реле 2  [ВЫКЛ] [ВКЛ] [ВЫКЛ] │
│  ● Реле 3  [ВЫКЛ] [ВКЛ] [ВЫКЛ]    ● Реле 4  [ВЫКЛ] [ВКЛ] [ВЫКЛ] │
│                                                                │
├──────────────────── Лог сообщений ───────────────────────────┤
│                                                                │
│  14:30:15: Подключено к /dev/cu.usbmodem1201                 │
│  14:30:16: Arduino: ✅ ESP32-C3 4-Relay USB Control Ready    │
│  14:30:17: Статус обновлен                                   │
│  14:30:20: Реле 1 включено                                   │
│  14:30:25: 🔘 Кнопка 2 нажата (ВКЛ)                         │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

### Элементы интерфейса

#### Секция подключения
- **Выпадающий список портов**: Автоматически фильтрует Arduino/ESP32 устройства
- **Кнопка обновления 🔄**: Пересканирует доступные порты
- **Кнопка подключения**: Управляет соединением с Arduino
- **Индикатор статуса**: Показывает состояние подключения

#### Секция управления реле  
- **Индикаторы состояния**: Цветные точки (🟢 = ВКЛ, ⚪ = ВЫКЛ)
- **Бейджи состояния**: Текстовые индикаторы с цветовым кодированием
- **Кнопки управления**: Отдельные кнопки ВКЛ/ВЫКЛ для каждого реле
- **Блокировка**: Кнопки неактивны при отсутствии соединения

#### Лог сообщений
- **Real-time обновления**: Мгновенное отображение событий
- **Временные метки**: Точное время каждого события
- **Цветовое кодирование**: Различные типы сообщений
- **Автопрокрутка**: Показывает последние 10 сообщений

### Цветовая схема

| Элемент | Цвет | Описание |
|---------|------|----------|
| Реле ВКЛ | 🟢 Зеленый | Активное состояние |
| Реле ВЫКЛ | ⚪ Серый | Неактивное состояние |  
| Подключено | 🟢 Зеленый фон | Успешное соединение |
| Отключено | ⚪ Серый фон | Нет соединения |
| Ошибка | 🔴 Красный фон | Состояние ошибки |
| Предупреждение | 🟡 Желтый фон | Важная информация |

---

## 📞 Протокол связи

### Формат команд (PC → Arduino)

| Команда | Описание | Ответ Arduino |
|---------|----------|---------------|
| `RELAY1_ON` | Включить реле 1 | `OK RELAY1 ON` |
| `RELAY1_OFF` | Выключить реле 1 | `OK RELAY1 OFF` |
| `RELAY2_ON` | Включить реле 2 | `OK RELAY2 ON` |
| `RELAY2_OFF` | Выключить реле 2 | `OK RELAY2 OFF` |
| `RELAY3_ON` | Включить реле 3 | `OK RELAY3 ON` |
| `RELAY3_OFF` | Выключить реле 3 | `OK RELAY3 OFF` |
| `RELAY4_ON` | Включить реле 4 | `OK RELAY4 ON` |
| `RELAY4_OFF` | Выключить реле 4 | `OK RELAY4 OFF` |
| `STATUS` | Запросить статус | `STATUS: R1=ON R2=OFF R3=OFF R4=ON` |

### Сообщения от Arduino (Arduino → PC)

| Тип сообщения | Формат | Описание |
|---------------|--------|----------|
| Инициализация | `✅ ESP32-C3 4-Relay USB Control Ready` | Arduino готов к работе |
| Справка | `Use commands: RELAY1_ON / RELAY1_OFF ...` | Список доступных команд |
| Конфигурация | `ACTIVE_LOW=false (HIGH = ON)` | Настройка типа реле |
| Подтверждение | `OK RELAY1 ON` | Подтверждение выполнения команды |
| Кнопка | `🔘 BUTTON RELAY1 ON` | Нажатие физической кнопки |
| Статус | `STATUS: R1=ON R2=OFF R3=OFF R4=ON` | Текущее состояние всех реле |
| Ошибка | `❌ UNKNOWN COMMAND: xyz` | Неизвестная команда |

### Параметры соединения

- **Скорость**: 115200 baud
- **Биты данных**: 8
- **Стоп-биты**: 1  
- **Четность**: None
- **Контроль потока**: None
- **Разделитель**: `\n` (перевод строки)

### Последовательность подключения

```
1. PC → Arduino: Открытие Serial порта
2. Arduino → PC: "✅ ESP32-C3 4-Relay USB Control Ready"
3. Arduino → PC: "Use commands: RELAY1_ON / RELAY1_OFF ..."
4. Arduino → PC: "ACTIVE_LOW=false (HIGH = ON)"
5. PC → Arduino: "STATUS"
6. Arduino → PC: "STATUS: R1=OFF R2=OFF R3=OFF R4=OFF"
```

---

## 🔧 Решение проблем

### Проблемы подключения

#### Порт не найден
**Симптомы**: В списке портов нет Arduino устройства
**Решения**:
- Проверьте USB кабель (должен поддерживать передачу данных)
- Убедитесь что Arduino включен и светится индикатор питания
- Установите драйвера CH340 или CP210x для вашей ОС
- Попробуйте другой USB порт
- Перезагрузите Arduino (отключите и подключите USB)

#### Ошибка подключения к порту
**Симптомы**: "Ошибка открытия порта" или "Access denied"
**Решения**:
- Закройте Arduino IDE и другие программы, использующие порт
- Проверьте права доступа к порту (на Linux может потребоваться `sudo`)
- Перезапустите приложение
- Отключите и подключите Arduino

#### Подключение установлено, но нет ответа
**Симптомы**: Статус "Подключено", но команды не работают
**Решения**:
- Проверьте правильность загруженной прошивки  
- Убедитесь что скорость порта 115200 baud
- Проверьте Serial монитор Arduino IDE для диагностики
- Перезагрузите Arduino

### Проблемы с реле

#### Реле не переключается
**Симптомы**: Команды отправляются, но реле не реагирует
**Решения**:
- Проверьте подключение проводов к GPIO пинам
- Убедитесь что модуль реле получает питание (5V)
- Проверьте настройку `ACTIVE_LOW` в коде Arduino
- Измерьте напряжение на выходах GPIO (должно быть 3.3V или 0V)

#### Реле работает наоборот
**Симптомы**: При команде ON реле выключается и наоборот
**Решения**:
- Измените `ACTIVE_LOW = true` в коде Arduino
- Перезагрузите прошивку

#### Физические кнопки не работают
**Симптомы**: Кнопки на Arduino не переключают реле
**Решения**:
- Проверьте подключение кнопок к GPIO пинам
- Убедитесь что кнопки замыкают на GND
- Проверьте что `INPUT_PULLUP` включен в коде

### Проблемы приложения

#### Приложение не запускается
**Симптомы**: Ошибки при `npm run start`
**Решения**:
```bash
# Очистка кэша и переустановка
rm -rf node_modules package-lock.json
npm install

# Обновление зависимостей  
npm update

# Проверка версии Node.js
node --version  # должно быть 16+
```

#### Интерфейс не отображается
**Симптомы**: Electron окно пустое или белое
**Решения**:
- Проверьте что Vite dev server запущен на порту 5173
- Откройте DevTools (F12) и посмотрите ошибки в консоли
- Попробуйте `npm run dev` отдельно для диагностики веб-части

#### Ошибки TypeScript
**Симптомы**: Ошибки компиляции в терминале
**Решения**:
- Убедитесь что все файлы типов существуют
- Проверьте импорты в `ArduinoControl.tsx`
- Очистите кэш TypeScript: `npx tsc --build --clean`

### Диагностика

#### Включить детальное логирование
В файле `electron/arduino-service.cjs` раскомментируйте:
```javascript
console.log('Все найденные порты:', ports);
console.log('Отфильтрованные порты:', filtered);
```

#### Проверка через Arduino IDE
1. Откройте Serial Monitor (Tools → Serial Monitor)
2. Установите скорость 115200 baud
3. Отправьте команду `STATUS`
4. Должен прийти ответ вида `STATUS: R1=OFF R2=OFF R3=OFF R4=OFF`

#### Проверка через терминал (macOS/Linux)
```bash
# Проверить доступные порты
ls /dev/cu.* | grep usb

# Подключиться через screen
screen /dev/cu.usbmodem1201 115200

# Отправить команды (после подключения)
STATUS
RELAY1_ON
RELAY1_OFF

# Выйти: Ctrl+A, затем K, затем Y
```

---

## 🚀 Расширение функционала

### Добавление новых реле

#### В Arduino коде:
```cpp
// Увеличить количество реле
const int RELAY_COUNT = 8;  // Было 4
const int relayPins[RELAY_COUNT] = {3, 4, 5, 7, 8, 9, 10, 11};
const int buttonPins[RELAY_COUNT] = {12, 13, 14, 15, 16, 17, 18, 19};

// Обновить массивы состояний
bool relayState[RELAY_COUNT] = {false};
bool lastButtonState[RELAY_COUNT] = {HIGH};
```

#### В приложении:
```typescript
// В ArduinoControl.tsx увеличить количество реле
const [relayStates, setRelayStates] = useState<boolean[]>(
  new Array(8).fill(false)
);

// Обновить рендеринг
{relayStates.map((state, index) => (
  <RelayControl
    key={index}
    relayNumber={index + 1}
    state={state}
    onToggle={handleRelayToggle}
    disabled={!isConnected}
  />
))}
```

### Добавление таймеров

#### Arduino код:
```cpp
unsigned long relayTimers[4] = {0, 0, 0, 0};
bool relayTimerActive[4] = {false, false, false, false};

// В loop()
for (int i = 0; i < 4; i++) {
  if (relayTimerActive[i] && millis() > relayTimers[i]) {
    setRelay(i, false);
    relayTimerActive[i] = false;
    Serial.printf("TIMER RELAY%d OFF\n", i + 1);
  }
}

// Новая команда
else if (cmd.startsWith("RELAY") && cmd.endsWith("_TIMER")) {
  // Парсинг: RELAY1_TIMER_5000 (включить на 5 секунд)
  // Реализация...
}
```

#### Приложение:
```typescript
// Добавить в интерфейс поля для времени
const [timerValues, setTimerValues] = useState<number[]>([0, 0, 0, 0]);

// Новый метод API
setRelayTimer: (relayNumber: number, seconds: number) => 
  ipcRenderer.invoke('arduino:set-relay-timer', relayNumber, seconds),
```

### Добавление сценариев

#### Создать компонент `ScenarioControl.tsx`:
```typescript
interface Scenario {
  id: string;
  name: string;
  steps: Array<{
    relay: number;
    state: boolean;
    delay: number;
  }>;
}

const ScenarioControl: React.FC = () => {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  
  const runScenario = async (scenario: Scenario) => {
    for (const step of scenario.steps) {
      await window.electronAPI.arduino.setRelay(step.relay, step.state);
      if (step.delay > 0) {
        await new Promise(resolve => setTimeout(resolve, step.delay));
      }
    }
  };
  
  // UI для создания и запуска сценариев
};
```

### Добавление веб-интерфейса

#### Создать Express сервер в Electron:
```javascript
const express = require('express');
const app = express();

app.use(express.static('dist'));

app.get('/api/relays', (req, res) => {
  res.json(arduino.getRelayStates());
});

app.post('/api/relays/:id', (req, res) => {
  const relayId = parseInt(req.params.id);
  const state = req.body.state;
  arduino.setRelay(relayId, state);
  res.json({success: true});
});

app.listen(3000, () => {
  console.log('Web interface: http://localhost:3000');
});
```

### Добавление MQTT

#### Arduino код с WiFi:
```cpp
#include <WiFi.h>
#include <PubSubClient.h>

WiFiClient wifiClient;
PubSubClient mqttClient(wifiClient);

void setup() {
  // ... существующий код ...
  
  WiFi.begin("your_wifi", "password");
  mqttClient.setServer("mqtt_broker", 1883);
  mqttClient.setCallback(onMqttMessage);
}

void onMqttMessage(char* topic, byte* payload, unsigned int length) {
  String command = String((char*)payload).substring(0, length);
  // Обработка MQTT команд
}
```

### Добавление базы данных

#### Логирование событий:
```typescript
import sqlite3 from 'sqlite3';

class EventLogger {
  private db: sqlite3.Database;
  
  constructor() {
    this.db = new sqlite3.Database('events.db');
    this.db.run(`CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      relay INTEGER,
      state BOOLEAN,
      source TEXT
    )`);
  }
  
  logEvent(relay: number, state: boolean, source: 'app' | 'button') {
    this.db.run(
      'INSERT INTO events (relay, state, source) VALUES (?, ?, ?)',
      [relay, state, source]
    );
  }
}
```

---

## 📋 Заключение

Данная система обеспечивает надежное и удобное управление реле через Arduino ESP32-C3 с современным графическим интерфейсом. Модульная архитектура позволяет легко расширять функционал под конкретные задачи.

### Ключевые преимущества:
- ✅ **Простота использования** - интуитивный интерфейс
- ✅ **Надежность** - проверенные протоколы связи
- ✅ **Гибкость** - легко адаптируется под новые требования  
- ✅ **Безопасность** - изолированная архитектура Electron
- ✅ **Масштабируемость** - поддержка расширения до 8+ реле

### Возможности развития:
- 🔄 **Автоматизация** - сценарии и таймеры
- 🌐 **Удаленный доступ** - веб-интерфейс и MQTT
- 📊 **Аналитика** - логирование и статистика
- 🔗 **Интеграция** - подключение к системам умного дома

Проект готов к использованию и дальнейшему развитию! 🚀