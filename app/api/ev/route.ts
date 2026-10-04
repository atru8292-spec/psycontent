// Прием событий аналитики с клиента (задача analitika, этап 2). Адрес /api/ev, а не track/analytics:
// такие адреса режут блокировщики рекламы.
// Пользователь только из сессии, user_id из тела не принимаем. Без входа принимаются только события
// лендинга land_* (с пустым user_id), остальные отбрасываются (lib/analytics/ingest.ts).
// Событие только из списка (lib/analytics/events.ts), props через санитайзер, время ставит база.
// С входом: до 50 событий за запрос, 300 в минуту на человека. Без входа: тело до 32 КБ, до 10 событий
// за запрос, 60 в минуту на IP и не больше 1000 в минуту на все анонимные запросы процесса, так что даже
// с подделанным адресом таблица растет предсказуемо. IP берется только из x-real-ip (его ставит nginx,
// затирая присланный клиентом) и нигде не сохраняется: только ключ счетчика в памяти процесса.

import { NextRequest } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/generation/db'
import { cleanBatch, MinuteLimiter, MAX_PER_MINUTE_USER, MAX_PER_MINUTE_ANON, MAX_PER_REQUEST_ANON, MAX_PER_MINUTE_ANON_TOTAL, MAX_BODY_ANON } from '@/lib/analytics/ingest'

const perUser = new MinuteLimiter(MAX_PER_MINUTE_USER)
const perIp = new MinuteLimiter(MAX_PER_MINUTE_ANON)
const anonTotal = new MinuteLimiter(MAX_PER_MINUTE_ANON_TOTAL)

const empty = () => new Response(null, { status: 204 })

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser()
    if (!user && Number(req.headers.get('content-length') || 0) > MAX_BODY_ANON) return empty()
    let body: any
    try { body = await req.json() } catch { return empty() }
    const raw: unknown[] = Array.isArray(body?.events) ? body.events : []
    let rows = cleanBatch(user ? raw : raw.slice(0, MAX_PER_REQUEST_ANON), !!user)
    if (user) rows = rows.slice(0, perUser.allow(user.id, rows.length))
    else {
      const ip = (req.headers.get('x-real-ip') || 'unknown').trim()
      rows = rows.slice(0, perIp.allow(ip, rows.length))
      rows = rows.slice(0, anonTotal.allow('all', rows.length))
    }
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
