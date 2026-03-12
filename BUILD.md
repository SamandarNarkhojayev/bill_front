# Сборка приложения «Бильярдный Клуб»

## Требования

- **Node.js** >= 18.x — [скачать](https://nodejs.org)
- **npm** >= 9.x (идёт вместе с Node.js)
- **Git** (опционально)

---

## Подготовка

```bash
# Клонировать или скопировать проект, затем:
npm install
```

---

## Режим разработки (без сборки)

```bash
npm run start
```

Запускает Vite dev-сервер + Electron одновременно. Изменения в коде применяются горячо.

---

## macOS (.dmg)

### Требования
- Компьютер на macOS 11+
- Xcode Command Line Tools:
  ```bash
  xcode-select --install
  sudo xcodebuild -license accept
  ```

### Сборка

```bash
npm run dist:mac
```

### Результат

| Файл | Назначение |
|------|------------|
| `release/Бильярдный Клуб-1.0.0-arm64.dmg` | Apple Silicon (M1/M2/M3/M4) |
| `release/Бильярдный Клуб-1.0.0.dmg` | Intel Mac |

### Установка
Открыть `.dmg` → перетащить приложение в папку `Applications`.

---

## Windows (.exe)

### Требования
- Компьютер на Windows 10/11 (x64)
- Node.js установлен
- Visual Studio Build Tools или полный Visual Studio с компонентом **«Desktop development with C++»**:
  ```
  npm install --global windows-build-tools
  ```
  > Либо установить вручную: https://visualstudio.microsoft.com/visual-cpp-build-tools/

### Сборка

```bash
npm run dist:win
```

### Результат

| Файл | Назначение |
|------|------------|
| `release/Бильярдный Клуб Setup 1.0.0.exe` | Установщик NSIS (x64) |

### Установка
Запустить `.exe` → следовать инструкциям установщика.  
При установке создаётся ярлык на рабочем столе и в меню «Пуск».

---

## Linux (.AppImage / .deb)

### Требования
- Ubuntu 20.04+ / Debian / любой дистрибутив с glibc >= 2.31
- Пакеты для сборки нативных модулей:
  ```bash
  sudo apt-get install build-essential python3
  ```

### Сборка

```bash
npm run dist:linux
```

### Результат

| Файл | Назначение |
|------|------------|
| `release/Бильярдный Клуб-1.0.0.AppImage` | Универсальный (без установки) |
| `release/бильярдный-клуб_1.0.0_amd64.deb` | Debian/Ubuntu (с установкой) |

### Установка AppImage
```bash
chmod +x "Бильярдный Клуб-1.0.0.AppImage"
./"Бильярдный Клуб-1.0.0.AppImage"
```

### Установка .deb
```bash
sudo dpkg -i бильярдный-клуб_1.0.0_amd64.deb
```

---

## Сборка всех платформ сразу

```bash
npm run dist
```

> ⚠️ Кросс-платформенная сборка работает только частично:
> - На **macOS** можно собрать `mac` + `linux`
> - На **Windows** — только `win`
> - На **Linux** — только `linux`
>
> Для полной кросс-сборки используйте CI/CD (GitHub Actions, GitLab CI).

---

## Решение проблем

### `permission denied` при скачивании Electron (macOS)
```bash
sudo rm -rf ~/Library/Caches/electron
mkdir -p ~/Library/Caches/electron
chmod 755 ~/Library/Caches/electron
```

### `node-gyp` ошибки при сборке serialport (macOS)
```bash
sudo xcodebuild -license accept
```

### `node-gyp` ошибки (Windows)
```bash
npm install --global windows-build-tools
# или установить Visual Studio Build Tools вручную
```

### Иконка слишком маленькая
Иконка `public/icon.png` должна быть **минимум 512×512 пикселей**.
```bash
# macOS — масштабировать встроенным инструментом:
sips -z 512 512 public/icon.png --out public/icon.png
```

---

## Структура релиза

```
release/
├── Бильярдный Клуб-1.0.0.dmg           ← macOS Intel
├── Бильярдный Клуб-1.0.0-arm64.dmg     ← macOS Apple Silicon
├── Бильярдный Клуб Setup 1.0.0.exe     ← Windows
├── Бильярдный Клуб-1.0.0.AppImage      ← Linux AppImage
└── builder-effective-config.yaml        ← конфиг сборки (авто)
```

---

## Версия приложения

Версия задаётся в `package.json`:
```json
{
  "version": "1.0.0"
}
```

Измените перед сборкой релиза.
