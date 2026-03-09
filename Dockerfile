# Этап сборки
FROM node:22-alpine AS builder

# Устанавливаем зависимости для сборки mediasoup
RUN apk add --no-cache \
    python3 py3-pip make g++ bash \
    linux-headers

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .
RUN npx prisma generate --schema=./prisma && npx nest build

# ========= ФИНАЛЬНЫЙ ОБРАЗ =========
FROM gcr.io/distroless/nodejs22-debian12

WORKDIR /app

# Копируем всё необходимое из builder
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules   
COPY --from=builder /app/generated ./generated 
COPY --from=builder /app/prisma ./prisma

EXPOSE 3001
CMD ["dist/main.js"]