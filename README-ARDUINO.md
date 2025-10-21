# Billiard Control System

Система управления бильярдным столом с интеграцией Arduino ESP32-C3 для управления 4 реле.

## 🚀 Возможности

- **Управление Arduino ESP32-C3**: Подключение и управление 4 реле через Serial порт
- **Графический интерфейс**: Современный интерфейс на React + Tailwind CSS
- **Real-time обновления**: Мгновенное отображение изменений состояния реле
- **Кнопки на Arduino**: Поддержка физических кнопок на плате Arduino
- **Логирование**: Отображение всех команд и статусов в реальном времени
- **Electron приложение**: Десктопное приложение для Windows/macOS/Linux

## 🛠 Установка и запуск

### Требования
- Node.js 16+ 
- npm или yarn
- Arduino ESP32-C3 с загруженной прошивкой
- macOS/Windows/Linux

### Установка зависимостей
```bash
npm install
```

### Запуск в режиме разработки
```bash
npm run start
```
Это запустит одновременно:
- Vite dev server на http://localhost:5173
- Electron приложение

### Только веб версия
```bash
npm run dev
```

### Сборка для production
```bash
npm run build
```

## 🔌 Arduino ESP32-C3 Setup

### Схема подключения
- **Реле 1**: GPIO 3
- **Реле 2**: GPIO 4  
- **Реле 3**: GPIO 5
- **Реле 4**: GPIO 7
- **Кнопка 1**: GPIO 10
- **Кнопка 2**: GPIO 9
- **Кнопка 3**: GPIO 6
- **Кнопка 4**: GPIO 8

### Прошивка Arduino
Загрузите прилагаемый код Arduino на ESP32-C3:
- Скорость порта: 115200 baud
- Поддерживает команды: `RELAY1_ON`, `RELAY1_OFF`, ... `RELAY4_OFF`, `STATUS`

### Поддерживаемые команды
```
RELAY1_ON   - Включить реле 1
RELAY1_OFF  - Выключить реле 1
RELAY2_ON   - Включить реле 2
RELAY2_OFF  - Выключить реле 2
RELAY3_ON   - Включить реле 3
RELAY3_OFF  - Выключить реле 3
RELAY4_ON   - Включить реле 4
RELAY4_OFF  - Выключить реле 4
STATUS      - Получить статус всех реле
```

## 📱 Использование

1. **Подключение Arduino**:
   - Подключите ESP32-C3 к компьютеру через USB
   - Запустите приложение
   - Выберите соответствующий Serial порт
   - Нажмите "Подключить"

2. **Управление реле**:
   - Используйте кнопки ВКЛ/ВЫКЛ для каждого реле
   - Состояние отображается цветными индикаторами
   - Все изменения логируются в реальном времени

3. **Физические кнопки**:
   - Кнопки на Arduino работают параллельно с интерфейсом
   - Нажатия кнопок отображаются в логе

## 🏗 Архитектура проекта

```
billiard-client/
├── electron/
│   ├── main.cjs           # Главный процесс Electron
│   ├── preload.cjs        # Preload скрипт с Arduino API
│   └── arduino-service.cjs # Сервис для работы с Arduino
├── src/
│   ├── components/
│   │   └── ArduinoControl.tsx # Компонент управления Arduino
│   ├── types/
│   │   └── arduino.ts     # TypeScript типы для Arduino API
│   ├── App.tsx           # Главный компонент приложения
│   └── main.tsx          # Точка входа React
├── package.json
└── vite.config.ts
```

## 🔧 API Reference

### Arduino Service API

```typescript
// Подключение
await window.electronAPI.arduino.connect(portPath);

// Управление реле
await window.electronAPI.arduino.setRelay(1, true);  // Включить реле 1
await window.electronAPI.arduino.setRelay(2, false); // Выключить реле 2

// Получить статус
await window.electronAPI.arduino.getStatus();

// События
window.electronAPI.arduino.onRelayChanged((data) => {
  console.log(`Реле ${data.relay} ${data.state ? 'включено' : 'выключено'}`);
});
```

## 🎯 Будущие возможности

- [ ] Управление освещением стола
- [ ] Счетчик очков игры  
- [ ] Таймер раундов
- [ ] Статистика игр
- [ ] Профили игроков
- [ ] Сохранение настроек

## 🛠 Технологии

- **Frontend**: React 19, TypeScript, Tailwind CSS
- **Desktop**: Electron 
- **Build**: Vite
- **Arduino**: ESP32-C3, Serial Communication
- **Hardware**: 4-канальный модуль реле

## 📄 Лицензия

MIT License - свободное использование для личных и коммерческих проектов.

## 🤝 Поддержка

При возникновении проблем:
1. Проверьте подключение Arduino
2. Убедитесь что порт не занят другим приложением  
3. Проверьте правильность загрузки прошивки
4. Просмотрите логи в приложении для диагностики