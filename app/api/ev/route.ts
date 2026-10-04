// Прием событий аналитики с клиента (задача analitika, этап 2). Адрес /api/ev, а не track/analytics:
// такие адреса режут блокировщики рекламы.
// Пользователь только из сессии (без нее 204 и ничего не пишем), user_id из тела не принимаем.
// Событие только из списка (lib/analytics/events.ts), props через санитайзер, время ставит база.
// Не больше 50 событий за запрос и 300 в минуту на человека (счетчик в памяти процесса).

import { NextRequest } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/generation/db'
import { sanitizeEvent } from '@/lib/analytics/sanitize'

const MAX_PER_REQUEST = 50
const MAX_PER_MINUTE = 300
const buckets = new Map<string, { start: number; n: number }>()

function allow(userId: string, n: number): number {
  const now = Date.now()
  const b = buckets.get(userId)
  if (!b || now - b.start > 60000) { buckets.set(userId, { start: now, n }); return Math.min(n, MAX_PER_MINUTE) }
  const left = Math.max(0, MAX_PER_MINUTE - b.n)
  b.n += n
  if (buckets.size > 5000) for (const [k, v] of buckets) if (now - v.start > 60000) buckets.delete(k)
  return Math.min(n, left)
}

const empty = () => new Response(null, { status: 204 })

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser()
    if (!user) return empty()
    let body: any
    try { body = await req.json() } catch { return empty() }
    const raw: unknown[] = Array.isArray(body?.events) ? body.events.slice(0, MAX_PER_REQUEST) : []
    let rows = raw.map(sanitizeEvent).filter((e): e is NonNullable<typeof e> => !!e)
    rows = rows.slice(0, allow(user.id, rows.length))
    if (!rows.length) return empty()
    const db = getSupabaseAdmin()
    // signup_source один раз на человека
    if (rows.some(r => r.event === 'signup_source')) {
      const had = await db.from('events').select('id').eq('user_id', user.id).eq('event', 'signup_source').limit(1)
      if (!had.error && had.data?.length) rows = rows.filter(r => r.event !== 'signup_source')
    }
    if (!rows.length) return empty()
    const { error } = await db.from('events').insert(rows.map(r => ({ ...r, user_id: user.id })))
    if (error) console.warn('api/ev insert:', error.code || error.message)
  } catch (e) {
    console.warn('api/ev:', (e as Error)?.message)
  }
  return empty()
}
