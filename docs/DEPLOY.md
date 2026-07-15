# Деплой на Hostland

## Окружение

| Параметр | Значение |
|----------|----------|
| Домен | https://padel.ballaball.xyz/ |
| PHP | 8.2, mod_php (Apache) |
| MySQL | 8.0 |
| Хост БД | `mysql80.hostland.ru:3308` |

## 1. Загрузка файлов

Загрузите содержимое репозитория на хостинг (Git или SFTP).

**Рекомендуется:** указать document root домена на папку `public/`.

Если document root — корень репозитория, сработает корневой `.htaccess`.

## 2. Конфигурация `.env`

В корне проекта (рядом с `config/`) создайте `.env`:

```env
APP_URL=https://padel.ballaball.xyz
APP_ENV=production
APP_DEBUG=false

DB_HOST=mysql80.hostland.ru
DB_PORT=3308
DB_NAME=host1708875_padelbd
DB_USER=host1708875_upadel
DB_PASSWORD=ваш_пароль

APP_SECRET=случайная_строка_не_короче_32_символов
```

Файл `.env` не хранится в git.

## 3. База данных

Для новой базы выполните `sql/schema.sql`.

Если старая схема уже установлена, выполните миграцию
`sql/migrations/002_round_schedule_status.sql`.

## 4. Проверка

Откройте в браузере:

- https://padel.ballaball.xyz/ — главный экран
- https://padel.ballaball.xyz/api/health — статус API и подключения к БД

Ожидаемый ответ health:

```json
{"status":"ok","db":true,"php":"8.2.x"}
```

## 5. Права доступа

- PHP должен иметь доступ на чтение `.env` и всех файлов проекта
- Запись на диск не требуется (кроме логов хостинга)

## 6. Обязательные production-проверки

1. Включите бесплатный TLS-сертификат для домена в панели Hostland.
2. Настройте перенаправление HTTP → HTTPS в панели хостинга.
3. Убедитесь, что `APP_DEBUG=false`.
4. Вызовите защищённый API из приложения и убедитесь, что Apache передаёт
   заголовок `Authorization` в PHP (правило уже добавлено в `public/.htaccess`).
5. Не публикуйте `.env` и не размещайте корень проекта внутри document root.
