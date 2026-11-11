// Проверка живости для внешнего мониторинга (UptimeRobot, 11.11): сайт на немецком сервере делает маленький запрос
// в базу (db.psycont.ru) тем же путем, что и страницы, ролью anon: код одного тарифа из публичной таблицы plans.
// Наружу только «ok» 200 или «fail» 503: без данных, без ключей, без входа. Ловит разрыв связи Германия → Москва,
// которого не видят проверки самого сайта (psycont.ru) и самой базы (db.psycont.ru/health).
// Результат держится 10 секунд, чтобы частые запросы к адресу не превращались в запросы к базе.
// В журнал пишется только код ошибки Supabase, без личного.
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const ttlMs = () => Number(process.env.HEALTH_TTL_MS ?? 10_000)
const TIMEOUT_MS = 5_000
let last: { ok: boolean; at: number } | null = null

async function check(): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return false
  const db = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) }) },
  })
  try {
    const { error } = await db.from('plans').select('code').limit(1)
    if (error) console.warn('api/health: база ответила ошибкой', error.code || 'без кода')
    return !error
  } catch (e: any) {
    console.warn('api/health: база не ответила', e?.name || 'ошибка')
    return false
  }
}

export async function GET() {
  if (!last || Date.now() - last.at >= ttlMs()) last = { ok: await check(), at: Date.now() }
  return new NextResponse(last.ok ? 'ok' : 'fail', {
    status: last.ok ? 200 : 503,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}

export const HEAD = GET
