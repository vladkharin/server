import { ulid } from 'ulid';

/**
 * Генерирует уникальный ULID с опциональным префиксом.
 * Примеры:
 *   generateId()          → "01H9ZQY7WVJ8K2P3R4S5T6U7V8"
 *   generateId('msg')     → "msg_01H9ZQY7WVJ8K2P3R4S5T6U7V8"
 *   generateId('req')     → "req_01H9ZQY7WVJ8K2P3R4S5T6U7V8"
 */

export function generateId(prefix?: string): string {
  const id = ulid();
  return prefix ? `${prefix}_${id}` : id;
}
