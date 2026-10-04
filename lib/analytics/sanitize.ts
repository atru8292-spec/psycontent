// Санитайзер событий аналитики. Пропускает только известные события и только их ключи из EVENTS,
// значения: конечное число, true/false или строка до 40 знаков из [a-z0-9_,.:-]. Пробелы, кириллица,
// заглавные, длинные строки, вложенные объекты и массивы выкидываются. Так текст поста, тема или имя
// физически не попадут в таблицу events (152-ФЗ). Покрыто тестом: scripts/test-analytics.ts.

import { EVENTS, isEventName, type EventName } from './events'

export type CleanProps = Record<string, string | number | boolean>

const VALUE_RE = /^[a-z0-9_,.:-]{1,40}$/

export function cleanValue(v: unknown): string | number | boolean | undefined {
  if (typeof v === 'boolean') return v
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v * 1000) / 1000 : undefined
  if (typeof v === 'string' && VALUE_RE.test(v)) return v
  return undefined
}

export function sanitizeProps(event: EventName, props: unknown): CleanProps {
  const out: CleanProps = {}
  if (!props || typeof props !== 'object' || Array.isArray(props)) return out
  const allowed = EVENTS[event] as readonly string[]
  for (const key of allowed) {
    const v = cleanValue((props as Record<string, unknown>)[key])
    if (v !== undefined) out[key] = v
  }
  return out
}

// Путь без query и hash, id (uuid, длинные числа и хеши) заменены на :id, не длиннее 120
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function cleanPath(path: unknown): string | null {
  if (typeof path !== 'string' || !path.startsWith('/')) return null
  const p = path.split(/[?#]/)[0]
  const parts = p.split('/').map(seg => (UUID_RE.test(seg) || /^\d{3,}$/.test(seg) || /^[0-9a-f]{16,}$/i.test(seg) ? ':id' : seg))
  const out = parts.join('/').replace(/[^a-zA-Z0-9/_:.-]/g, '').slice(0, 120)
  return out || '/'
}

export const cleanSession = (s: unknown): string | null => (typeof s === 'string' && /^[a-z0-9-]{8,40}$/i.test(s) ? s : null)

export type CleanEvent = { event: EventName; props: CleanProps; path: string | null; session_id: string | null }

export function sanitizeEvent(raw: unknown): CleanEvent | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (!isEventName(r.event)) return null
  return { event: r.event, props: sanitizeProps(r.event, r.props), path: cleanPath(r.path), session_id: cleanSession(r.session_id) }
}
