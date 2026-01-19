# Этап сборки
FROM node:20-alpine AS builder

WORKDIR /app

# Копируем package.json и package-lock.json
COPY package*.json ./

# Устанавливаем ВСЕ зависимости (включая dev) — необходимо для компиляции TypeScript
RUN npm ci

# Копируем весь исходный код
COPY . .

# Генерируем Prisma Client и собираем NestJS приложение
RUN npx prisma generate --schema=./prisma && \
    npx nest build

# ========= ФИНАЛЬНЫЙ ОБРАЗ (легковесный для запуска) =========
FROM node:20-alpine

# Устанавливаем psql для отладки (опционально)
RUN apk add --no-cache postgresql-client

WORKDIR /app

# Устанавливаем ТОЛЬКО production-зависимости
COPY package*.json ./
RUN npm ci --only=production

# Копируем собранный код и необходимые файлы Prisma
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client

# 🔥 Копируем схему Prisma — без неё миграции не работают!
COPY --from=builder /app/prisma ./prisma

EXPOSE 3001

CMD ["node", "dist/main.js"]