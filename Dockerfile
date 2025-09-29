# Этап сборки
FROM node:20-alpine AS builder

WORKDIR /app

# Копируем package.json и package-lock.json для кэширования зависимостей
COPY package*.json ./

# Устанавливаем зависимости (без dev)
RUN npm install --omit=dev

# Копируем весь исходный код
COPY . .

# Генерируем Prisma Client и собираем NestJS приложение
RUN npx prisma generate --schema=./prisma && npx nest build

# (Опционально) Проверяем структуру — полезно при отладке
RUN ls -la /app/dist
RUN ls -la /app/node_modules/@prisma/client/
RUN ls -la /app/node_modules/.prisma/client/


# ========= ФИНАЛЬНЫЙ ОБРАЗ (легковесный для запуска) =========
FROM node:20-alpine

# Устанавливаем psql для отладки (опционально)
RUN apk add --no-cache postgresql-client

WORKDIR /app

COPY --from=builder /app/package*.json ./
RUN npm install --omit=dev --production

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client

# 🔥 Копируем схему Prisma — без неё миграции не работают!
COPY --from=builder /app/prisma ./prisma

EXPOSE 3000

CMD ["node", "dist/src/main.js"]