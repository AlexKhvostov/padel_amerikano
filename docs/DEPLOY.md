# Деплой на Hostland

## Окружение

| Параметр | Значение |
|----------|----------|
| Домен | http://padel.ballaball.xyz/ |
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
APP_URL=http://padel.ballaball.xyz
APP_ENV=production
APP_DEBUG=false

DB_HOST=mysql80.hostland.ru
DB_PORT=3308
DB_NAME=host1708875_padelbd
DB_USER=host1708875_upadel
DB_PASSWORD=ваш_пароль

APP_SECRET=случайная_длинная_строка
```

Файл `.env` не хранится в git.

## 3. База данных

В phpMyAdmin (Hostland) выполните скрипт `sql/schema.sql` в базе `host1708875_padelbd`.

## 4. Проверка

Откройте в браузере:

- http://padel.ballaball.xyz/ — главный экран
- http://padel.ballaball.xyz/api/health — статус API и подключения к БД

Ожидаемый ответ health:

```json
{"status":"ok","db":true,"php":"8.2.x"}
```

## 5. Права доступа

- PHP должен иметь доступ на чтение `.env` и всех файлов проекта
- Запись на диск не требуется (кроме логов хостинга)
