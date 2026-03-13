# Инструкция по обновлению приложения

Этот документ описывает, как выпускать новую версию так, чтобы встроенное обновление в приложении работало корректно.

## Как это работает

Приложение проверяет релизы в GitHub и сравнивает текущую версию с новой.
Если версия новее, пользователь в разделе «Настройки → Обновление приложения» может:
1. Проверить обновления
2. Скачать обновление
3. Установить и перезапустить

> Важно: автообновление работает только в установленной (production) версии, не в dev-режиме.

---

## Перед выпуском (один раз)

Проверьте, что настроено:

- Репозиторий GitHub с релизами открыт (public) — для текущей схемы автообновления это рекомендуемый вариант.
- Для public-репозитория приложение использует `generic`-канал обновлений через `releases/latest/download`.
- В [package.json](package.json) есть `repository` с GitHub URL репозитория.
- В workflow [build.yml](.github/workflows/build.yml) в релиз попадают:
  - установщики (`.exe`, `.dmg`, `.zip`, `.AppImage`, `.deb`)
  - файлы обновления (`*.yml`, `*.blockmap`)
- У GitHub Actions есть права `contents: write`.

---

## Пошаговый выпуск обновления

### Быстрый способ (автоматически)

Теперь можно выпустить релиз одной командой:

```bash
npm run release -- patch
```

Или:

```bash
npm run release -- minor
npm run release -- major
npm run release -- 1.0.7
```

Скрипт автоматически:
- обновляет версию в `package.json` и `package-lock.json`;
- запускает `npx tsc --noEmit`;
- коммитит текущие изменения;
- создаёт тег `v<version>`;
- пушит ветку и тег в `origin`.

> Перед запуском убедитесь, что в рабочем дереве только те изменения, которые должны попасть в релиз.

Если хотите всё делать вручную — используйте шаги ниже.

### 1) Обновить версию

Увеличьте версию в [package.json](package.json), например:
- `1.0.1` → `1.0.2`

Можно через команду:

```bash
npm version patch --no-git-tag-version
```

(или `minor`/`major` при необходимости)

### 2) Сделать коммит

```bash
git add .
git commit -m "release: v1.0.5"
```

### 3) Создать и отправить тег

```bash
git tag v1.0.5
git push origin main
git push origin v1.0.5
```

> Тег обязательно должен быть в формате `v*`, иначе workflow релиза не запустится.

### 4) Дождаться GitHub Actions

Откройте Actions и дождитесь успешного завершения `Build & Release`.

### 5) Проверить релиз в GitHub

В релизе должны быть файлы:

- Windows: `.exe` + `.yml` + `.blockmap`
- macOS: `.dmg` + `.zip` + `.yml` + `.blockmap`
- Linux: `.AppImage`/`.deb` + `.yml` + `.blockmap`

---

## Проверка обновления на клиенте

1. Установите старую версию приложения.
2. Выпустите новую версию по шагам выше.
3. В приложении откройте: «Настройки → Обновление приложения».
4. Нажмите:
   - «Проверить обновления»
   - «Скачать обновление»
   - «Установить и перезапустить»

---

## Частые проблемы

### Не находит обновление

Проверьте:
- Новая версия действительно больше текущей.
- В релизе есть `latest*.yml` и `.blockmap`.
- Релиз не `draft`.
- Тег не переиспользован (не перезаписывайте старый тег).

### Ошибка в Actions при создании релиза

Проверьте permissions в workflow:

```yaml
permissions:
  contents: write
  packages: write
```

### Ошибка `Not Found` при загрузке asset в Release

Типичная причина в этом проекте: сборочные job (`win/mac/linux`) пытаются публиковать файлы через `electron-builder`,
а затем `release` job повторно загружает те же ассеты. Из-за этого возникают конфликты и ошибка API по asset.

Правильная схема:
- в build-job только **собирать** и **загружать artifacts**;
- публикацию в GitHub Release делать только в отдельном `release` job.

В workflow для build-шагов используйте:

```bash
npm run dist:win -- --publish never
npm run dist:mac -- --publish never
npm run dist:linux -- --publish never
```

A в шаге релиза оставьте одну точку публикации и используйте загрузку с перезаписью (`gh release upload --repo ... --clobber`):

```bash
gh release upload "$TAG" "$FILE" --repo "$GITHUB_REPOSITORY" --clobber
```

### Ошибка проверки обновлений: `404 ... releases.atom`

Если в приложении ошибка вида:

`GET https://github.com/<owner>/<repo>/releases.atom -> 404`

значит обычно одно из двух:

1. Репозиторий с релизами приватный (для анонимного доступа GitHub отдаёт 404).
2. Неверный `owner/repo` в `repository` (или в `UPDATE_REPO_OWNER/UPDATE_REPO_NAME`).

Решения:

- Рекомендуемо для клиентских обновлений: сделать репозиторий релизов **public**. Если репозиторий публичный, дополнительные токены приложению не нужны.
- Если репозиторий должен быть private — задайте при запуске приложения:

```bash
UPDATE_REPO_PRIVATE=true
UPDATE_REPO_TOKEN=<github_token_with_repo_read>
```

И убедитесь, что токен имеет доступ к релизам.

### Ошибка проверки обновлений: `406 ... releases/latest`

Если `electron-updater` использует GitHub provider, он может нестабильно обращаться к страницам GitHub Releases (`releases.atom`, `releases/latest`).

Для public-репозитория в этом проекте используется более стабильная схема:

- `provider: generic`
- URL: `https://github.com/SamandarNarkhojayev/bill_front/releases/latest/download`

Тогда updater читает напрямую `latest.yml` / `latest-mac.yml`, без парсинга HTML/Atom GitHub Releases.

### Ошибка `validateConfiguration` (app-builder-lib)

Проверьте `build` в [package.json](package.json):
- не должно быть неизвестных полей внутри платформенных блоков (`build.win`, `build.mac`, `build.linux`);
- в этом проекте поле `author` должно быть в корне `package.json`, а не внутри `build.linux`.

Для детальной диагностики локально:

```bash
npx electron-builder --debug
```

### Проверка не работает в dev

Это нормально. В dev-режиме updater отключён.

---

## Рекомендованный порядок версий

- Любой фикс: `patch` (`1.0.1` → `1.0.2`)
- Новая функциональность без ломания API: `minor`
- Ломающие изменения: `major`

---

## Важно

Никогда не публикуйте новую сборку под старым тегом. Для каждого обновления создавайте новый тег и новую версию.
