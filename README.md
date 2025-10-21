# 🎱 Billiard Control System

Система управления бильярдным столом с интеграцией Arduino ESP32-C3 для управления 4 реле.

![Status](https://img.shields.io/badge/status-working-brightgreen) ![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-blue) ![License](https://img.shields.io/badge/license-MIT-green)

## 🚀 Возможности

- **🎛 Управление Arduino ESP32-C3**: Подключение и управление 4 реле через Serial порт
- **🖥 Графический интерфейс**: Современный интерфейс на React + Tailwind CSS  
- **⚡ Real-time обновления**: Мгновенное отображение изменений состояния реле
- **🔘 Физические кнопки**: Поддержка кнопок на плате Arduino параллельно с ПО
- **📝 Логирование**: Отображение всех команд и статусов в реальном времени
- **💻 Electron приложение**: Десктопное приложение для всех платформ

## 📖 Документация

| Документ | Описание |
|----------|----------|
| [📋 DOCUMENTATION.md](./DOCUMENTATION.md) | **Полная техническая документация** |
| [🎮 USER-GUIDE.md](./USER-GUIDE.md) | **Краткое руководство пользователя** |
| [🔧 API-REFERENCE.md](./API-REFERENCE.md) | **Справочник API и протоколов** |

## ⚡ Быстрый старт

### 1. Установка
```bash
git clone <repository>
cd billiard-client
npm install
```

### 2. Подготовка Arduino
- Загрузите прошивку из `arduino-firmware.ino` на ESP32-C3
- Подключите реле к GPIO: 3, 4, 5, 7
- Подключите кнопки к GPIO: 10, 9, 6, 8 (к GND)

### 3. Запуск
```bash
npm run start
```

### 4. Подключение
1. Выберите порт Arduino (например `/dev/cu.usbmodem1201`)
2. Нажмите "Подключить"
3. Управляйте реле через интерфейс или физические кнопки

## 🔌 Схема подключения

```
ESP32-C3 → Реле модуль → Нагрузка
GPIO 3   → IN1        → Реле 1
GPIO 4   → IN2        → Реле 2  
GPIO 5   → IN3        → Реле 3
GPIO 7   → IN4        → Реле 4

GPIO 10  → Кнопка 1 → GND
GPIO 9   → Кнопка 2 → GND
GPIO 6   → Кнопка 3 → GND
GPIO 8   → Кнопка 4 → GND
```

## 🛠 Команды разработки

```bash
npm run dev          # Только веб-версия (Vite dev server)
npm run start        # Electron + веб-сервер (разработка)
npm run build        # Сборка для production
npm run electron     # Запуск Electron в production режиме
```

## 🏗 Архитектура

```
┌─────────────────┐    Serial/USB    ┌──────────────────┐
│   Electron App  │ ◄──────────────► │   Arduino ESP32  │
│                 │                  │                  │
│  React Frontend │                  │  4x Relay Module │
│  Arduino API    │                  │  4x Push Buttons │
│  SerialPort     │                  │  USB Interface   │
└─────────────────┘                  └──────────────────┘
```

## 📁 Структура проекта

```
billiard-client/
├── electron/                    # Electron main процесс
│   ├── main.cjs                 # Главный процесс
│   ├── preload.cjs             # Preload скрипт  
│   └── arduino-service.cjs     # Arduino сервис
├── src/                        # React приложение
│   ├── components/
│   │   └── ArduinoControl.tsx  # Компонент управления
│   ├── types/arduino.ts        # TypeScript типы
│   └── App.tsx                 # Главный компонент
├── arduino-firmware.ino        # Прошивка для Arduino
├── DOCUMENTATION.md           # Полная документация
├── USER-GUIDE.md             # Руководство пользователя
└── API-REFERENCE.md          # Справочник API
```

## 🎯 Примеры использования

### Управление через код
```typescript
// Подключение
await window.electronAPI.arduino.connect('/dev/cu.usbmodem1201');

// Включить реле 1
await window.electronAPI.arduino.setRelay(1, true);

// Отслеживание событий
window.electronAPI.arduino.onRelayChanged((data) => {
  console.log(`Реле ${data.relay} ${data.state ? 'включено' : 'выключено'}`);
});
```

### Протокол команд
```
PC → Arduino: RELAY1_ON
Arduino → PC: OK RELAY1 ON

PC → Arduino: STATUS  
Arduino → PC: STATUS: R1=ON R2=OFF R3=OFF R4=OFF
```

## 🛠 Технологии

- **Frontend**: React 19, TypeScript, Tailwind CSS
- **Desktop**: Electron
- **Build**: Vite  
- **Hardware**: ESP32-C3, 4-канальный модуль реле
- **Protocol**: Serial USB, 115200 baud

## 🔧 Решение проблем

| Проблема | Решение |
|----------|---------|
| Порт не найден | Проверьте USB кабель и драйвера CH340/CP210x |
| Не подключается | Закройте Arduino IDE, порт может быть занят |
| Реле не работают | Проверьте подключение к GPIO 3,4,5,7 и питание 5V |

## 🎯 Roadmap

- [ ] **Веб-интерфейс** - доступ через браузер
- [ ] **Таймеры** - автоматическое выключение реле  
- [ ] **Сценарии** - программируемые последовательности
- [ ] **MQTT** - интеграция с умным домом
- [ ] **База данных** - логирование событий
- [ ] **API сервер** - REST API для интеграций

## 📄 Лицензия

MIT License - свободное использование для личных и коммерческих проектов.

## 🤝 Поддержка

- 📖 Читайте [полную документацию](./DOCUMENTATION.md)
- 🎮 Изучите [руководство пользователя](./USER-GUIDE.md)  
- 🔧 Смотрите [справочник API](./API-REFERENCE.md)
- 💬 Создавайте Issues для вопросов и предложений

---

**✅ Протестировано и работает с Arduino ESP32-C3 DevKit на macOS** 🚀