# Blik

Система заявок на техническое обслуживание для колледжа.

Заявитель (сотрудник/преподаватель) указывает кабинет и описывает проблему; системные администраторы
(с тремя уровнями доступа — главный сисадмин, сисадмин, практикант) берут заявку в работу, классифицируют
её (категория/приоритет), ведут переписку с заявителем и закрывают заявку. Вход — через Active Directory
(LDAP), плюс локальный breakglass-аккаунт на случай недоступности AD.

Подробный план архитектуры и этапов реализации: см. историю обсуждения в чате/плане проекта.

## Структура репозитория

```
apps/
  backend/   — NestJS API (auth, tickets, sla, notifications, ...)
  frontend/  — React (Vite) SPA
infra/
  docker-compose.yml — postgres + backend + frontend + nginx
```

## Быстрый старт (разработка)

```bash
npm install                       # установит зависимости во всех workspaces
cp infra/.env.example infra/.env  # заполнить переменные окружения (LDAP, JWT, master-аккаунт)

npm run prisma:migrate            # применить миграции БД (нужен запущенный Postgres)
npm run prisma:seed               # создать master-аккаунт из env

npm run dev:backend               # http://localhost:3000 (Swagger: /api/docs)
npm run dev:frontend              # http://localhost:5173
```

Полный стек через Docker:

```bash
docker compose -f infra/docker-compose.yml up --build
```
