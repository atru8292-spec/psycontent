// Прием событий аналитики с клиента (задача analitika, этап 2). Адрес /api/ev, а не track/analytics:
// такие адреса режут блокировщики рекламы.
// Пользователь только из сессии, user_id из тела не принимаем. Без входа принимаются только события
// лендинга land_* (с пустым user_id), остальные отбрасываются (lib/analytics/ingest.ts).
// Событие только из списка (lib/analytics/events.ts), props через санитайзер, время ставит база.
// Не больше 50 событий за запрос, 300 в минуту на человека, без входа 60 в минуту на IP.
// IP нигде не сохраняется: только ключ счетчика в памяти процесса.

import { NextRequest } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/generation/db'
import { cleanBatch, MinuteLimiter, MAX_PER_MINUTE_USER, MAX_PER_MINUTE_ANON } from '@/lib/analytics/ingest'

const perUser = new MinuteLimiter(MAX_PER_MINUTE_USER)
const perIp = new MinuteLimiter(MAX_PER_MINUTE_ANON)

const empty = () => new Response(null, { status: 204 })

// За nginx адрес в x-real-ip или первым в x-forwarded-for; без них общий ключ
const ipKey = (req: NextRequest) =>
  (req.headers.get('x-real-ip') || (req.headers.get('x-forwarded-for') || '').split(',')[0] || 'unknown').trim()

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser()
    let body: any
    try { body = await req.json() } catch { return empty() }
    const raw: unknown[] = Array.isArray(body?.events) ? body.events : []
    let rows = cleanBatch(raw, !!user)
    rows = rows.slice(0, user ? perUser.allow(user.id, rows.length) : perIp.allow(ipKey(req), rows.length))
    if (!rows.length) return empty()
    const db = getSupabaseAdmin()
    // signup_source один раз на человека
    if (user && rows.some(r => r.event === 'signup_source')) {
      const had = await db.from('events').select('id').eq('user_id', user.id).eq('event', 'signup_source').limit(1)
      if (!had.error && had.data?.length) rows = rows.filter(r => r.event !== 'signup_source')
    }
    if (!rows.length) return empty()
    const { error } = await db.from('events').insert(rows.map(r => ({ ...r, user_id: user ? user.id : null })))
    if (error) console.warn('api/ev insert:', error.code || error.message)
  } catch (e) {
    console.warn('api/ev:', (e as Error)?.message)
  }
  return empty()
}
