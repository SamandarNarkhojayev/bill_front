# Biliardo - Автоматизация для бильярдного клуба

Приложение для управления бильярдным клубом с поддержкой Arduino устройств.

## Сборка

### Требования
- Node.js 18+
- npm или yarn

### Установка зависимостей
```bash
npm install
```

### Разработка
```bash
npm run start
```

### Сборка для production
```bash
npm run build
npm run dist        # Сборка для всех платформ
npm run dist:mac    # Только macOS
npm run dist:win    # Только Windows
npm run dist:linux  # Только Linux
```

## Code Signing для macOS

Для production сборки на macOS требуется сертификат разработчика Apple.

### Настройка Code Signing

1. Получите сертификат "Developer ID Application" от Apple Developer Program
2. Установите сертификат в Keychain
3. Обновите `package.json`:

```json
"mac": {
  "identity": "Developer ID Application: Your Name (TEAM_ID)",
  "notarize": {
    "teamId": "YOUR_TEAM_ID"
  }
}
```

### Переменные окружения для Notarization

Установите переменные окружения для автоматической notarization:

```bash
export APPLE_ID="your-apple-id@example.com"
export APPLE_APP_SPECIFIC_PASSWORD="your-app-specific-password"
export APPLE_TEAM_ID="YOUR_TEAM_ID"
```

Или используйте API Key:

```bash
export APPLE_API_KEY="your-api-key"
export APPLE_API_KEY_ID="your-key-id"
export APPLE_API_ISSUER="your-issuer-id"
```

### Релиз

```bash
npm run release -- patch  # patch версия
npm run release -- minor  # minor версия
npm run release -- major  # major версия
```

## Лицензия

MIT
