# syntax=docker/dockerfile:1
FROM node:24-alpine AS build
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --legacy-peer-deps

COPY . .
RUN npm run prisma:generate && npm run build

FROM node:24-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
# Клиент уже сгенерирован в build-стадии и копируется ниже — при `npm install` не нужно
# заново запускать `prisma generate` через postinstall (там ещё и schema.prisma не скопирована).
ENV PRISMA_SKIP_POSTINSTALL_GENERATE=true

COPY package.json package-lock.json* ./
RUN npm install --omit=dev --legacy-peer-deps

COPY --from=build /app/dist ./dist
COPY --from=build /app/generated ./generated
COPY --from=build /app/src/prisma/schema.prisma ./src/prisma/schema.prisma

RUN mkdir -p /app/uploads
VOLUME ["/app/uploads"]

EXPOSE 3000

# Применяем миграции и стартуем сервер. Сид master-аккаунта — отдельная ручная команда
# (npm run prisma:seed), не выполняется автоматически при каждом старте контейнера.
CMD ["sh", "-c", "npx prisma migrate deploy --schema=src/prisma/schema.prisma && node dist/main.js"]
