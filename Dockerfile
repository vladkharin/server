# Этап сборки
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate --schema=./prisma && npx nest build

# ========= ФИНАЛЬНЫЙ ОБРАЗ (легковесный для запуска) =========
FROM gcr.io/distroless/nodejs22-debian12

WORKDIR /app

# Копируем только production-зависимости и результат сборки
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --from=builder /app/prisma ./prisma

EXPOSE 3001
CMD ["dist/main.js"]

