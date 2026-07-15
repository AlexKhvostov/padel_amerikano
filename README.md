# Падел Американо

Веб-сервис для проведения любительских турниров по системе «Американо» в падел-теннисе.

**Продакшен:** http://padel.ballaball.xyz/

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
2. Выполните `sql/schema.sql` в MySQL
3. Настройте Apache document root на `public/`
4. Откройте `/api/health` для проверки

## API

| Метод | Endpoint |
|-------|----------|
| GET | `/api/health` |
| GET | `/api/companies/search?q=` |
| POST | `/api/companies` |
| POST | `/api/companies/login` |
| GET | `/api/companies/{id}/players` |
| POST | `/api/companies/{id}/players` |
| GET | `/api/companies/{id}/rounds` |
| POST | `/api/companies/{id}/rounds` |
| PUT | `/api/matches/{id}/score` |
| GET | `/api/companies/{id}/rating` |
| PUT | `/api/companies/{id}/settings` |
| DELETE | `/api/companies/{id}/reset` |

Авторизация: заголовок `Authorization: Bearer <token>`.

## Документация

- [ТЗ_padel_amerikano.md](ТЗ_padel_amerikano.md)
- [docs/DEPLOY.md](docs/DEPLOY.md)
