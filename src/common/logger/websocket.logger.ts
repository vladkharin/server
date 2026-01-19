// src/common/logger/websocket.logger.ts
import * as winston from 'winston';
import 'winston-daily-rotate-file';

const { combine, timestamp, printf } = winston.format;

const websocketLogFormat = printf(({ level, message, timestamp }) => {
  return `${timestamp} [WEBSOCKET] ${level.toUpperCase()}: ${message}`;
});

// Транспорт в файл с ежедневной ротацией
const fileTransport = new winston.transports.DailyRotateFile({
  filename: 'logs/websocket-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  zippedArchive: true,
  maxSize: '20m',
  maxFiles: '14d', // хранить 14 дней
});

export const websocketLogger = winston.createLogger({
  level: 'info',
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    websocketLogFormat,
  ),
  transports: [
    fileTransport,
    // Опционально: вывод в консоль
    new winston.transports.Console({
      format: combine(winston.format.colorize(), websocketLogFormat),
    }),
  ],
});
