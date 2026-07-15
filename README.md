# Падел Американо

Веб-сервис для проведения любительских турниров по системе «Американо» в падел-теннисе.

**Продакшен:** https://padel.ballaball.xyz/

## Стек

| Слой | Технология |
|------|------------|
| Frontend | Vanilla JS, HTML5, CSS3 (mobile-first) |
| Backend | PHP 8.2 (mod_php) |
| База данных | MySQL 8.0 (Hostland) |

## Структура проекта

```
├── config/          # env.php, database.php
├── public/          # document root (index.php, assets, api)
├── sql/schema.sql   # схема БД
├── src/             # PHP-сервисы и auth
└── docs/DEPLOY.md   # инструкция деплоя
```

## Быстрый старт (локально / сервер)

1. Скопируйте `config/.env.example` → `.env`, заполните реквизиты
2. Для новой базы выполните `sql/schema.sql`. Для существующей базы последовательно примените миграции `002` → `003` → `004` → `005` → `006`
3. Настройте Apache document root на `public/`
4. Откройте `/api/health` для проверки

## API

| Метод | Endpoint |
|-------|----------|
| GET | `/api/health` |
| GET | `/api/tournaments?date=YYYY-MM-DD` |
| GET | `/api/companies/search?q=` |
| POST | `/api/companies` |
| POST | `/api/companies/login` |
| GET | `/api/viewer/{view_key}` — вход зрителя по slug или старому токену |
| GET | `/api/companies/{id}` — данные компании |
| PUT | `/api/companies/{id}` — переименование |
| DELETE | `/api/companies/{id}` — логическое удаление |
| GET | `/api/companies/{id}/players` |
| POST | `/api/companies/{id}/players` |
| PUT | `/api/players/{id}` |
| DELETE | `/api/players/{id}` |
| GET | `/api/companies/{id}/rounds` |
| GET | `/api/companies/{id}/schedule` |
| POST | `/api/companies/{id}/rounds` |
| PUT | `/api/matches/{id}/score` |
| GET | `/api/companies/{id}/rating` |
| PUT | `/api/companies/{id}/settings` |
| DELETE | `/api/companies/{id}/reset` |

Авторизация: заголовок `Authorization: Bearer <token>`. Административный
токен разрешает изменения, токен зрителя — только GET-запросы просмотра.
Короткая публичная ссылка имеет вид `/v/{12-символьный-slug}`.

## Безопасность

- Названия активных компаний уникальны без учёта регистра. После логического удаления название освобождается.
- Код администратора хранится только как bcrypt-хеш.
- После 3 ошибок для сочетания IP и компании вход блокируется на 10 минут.
- После 20 ошибок с одного IP по разным компаниям вход с этого IP блокируется на 10 минут.
- В production обязательны HTTPS, `APP_DEBUG=false` и `APP_SECRET` длиной не менее 32 символов.
- Если сервис работает за reverse proxy, его IP необходимо добавить в `TRUSTED_PROXIES`; иначе значение оставляют пустым.

## Тесты

```bash
composer install
composer test
```

Тесты проверяют полную ротацию партнёров, ограничения кортов и скамейки
для составов до 36 игроков, а также все правила ввода счёта.

## Документация

- [ТЗ_padel_amerikano.md](ТЗ_padel_amerikano.md)
- [docs/DEPLOY.md](docs/DEPLOY.md)
