// Правила приема событий в /api/ev, отдельно от роута, чтобы их проверял тест (scripts/test-analytics.ts).
// С входом принимаем все известные события. Без входа только события лендинга land_* (user_id пустой,
// session_id от track), остальное отбрасываем. Счетчики в памяти процесса: на человека 300 в минуту,
// без входа 60 в минуту на IP. IP только ключ счетчика в памяти: в базу и в лог не попадает.

import { sanitizeEvent, type CleanEvent } from './sanitize'
import { isLandingEvent } from './events'

export const MAX_PER_REQUEST = 50
export const MAX_PER_MINUTE_USER = 300
export const MAX_PER_MINUTE_ANON = 60

export function cleanBatch(raw: unknown[], hasUser: boolean): CleanEvent[] {
  return raw.slice(0, MAX_PER_REQUEST)
    .map(sanitizeEvent)
    .filter((e): e is CleanEvent => !!e && (hasUser || isLandingEvent(e.event)))
}

export class MinuteLimiter {
  private buckets = new Map<string, { start: number; n: number }>()
  constructor(private max: number) {}
  // Сколько из n событий можно принять сейчас по ключу
  allow(key: string, n: number, now = Date.now()): number {
    const b = this.buckets.get(key)
    if (!b || now - b.start > 60000) { this.buckets.set(key, { start: now, n }); return Math.min(n, this.max) }
    const left = Math.max(0, this.max - b.n)
    b.n += n
    if (this.buckets.size > 5000) for (const [k, v] of this.buckets) if (now - v.start > 60000) this.buckets.delete(k)
    return Math.min(n, left)
  }
}
