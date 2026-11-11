// Проверка живости для внешнего мониторинга (UptimeRobot, 11.11): сайт на немецком сервере делает маленький запрос
// в базу (db.psycont.ru) тем же путем, что и страницы, ролью anon: код одного тарифа из публичной таблицы plans.
// Наружу только «ok» 200 или «fail» 503: без данных, без ключей, без входа. Ловит разрыв связи Германия → Москва,
// которого не видят проверки самого сайта (psycont.ru) и самой базы (db.psycont.ru/health).
// Результат держится 10 секунд, а одновременные запросы ждут один и тот же поход в базу (inflight), чтобы частые
// обращения к адресу, в том числе во время сбоя, не превращались в запросы к базе. В журнал только код и начало
// текста ошибки Supabase (там тип сетевой ошибки), без личного.
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const ttlMs = () => { const n = Number(process.env.HEALTH_TTL_MS ?? 10_000); return Number.isFinite(n) ? n : 10_000 }
const TIMEOUT_MS = 5_000
let last: { ok: boolean; at: number } | null = null
let inflight: Promise<boolean> | null = null

async function check(): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return false
  try {
    const db = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) }) },
    })
    const { error } = await db.from('plans').select('code').limit(1)
    if (error) console.warn('api/health: база ответила ошибкой', error.code || 'без кода', String(error.message || '').slice(0, 80))
    return !error
  } catch (e: any) {
    console.warn('api/health: база не ответила', e?.name || 'ошибка')
    return false
  }
}

export async function GET() {
  if (!last || Date.now() - last.at >= ttlMs()) {
    inflight ??= check().finally(() => { inflight = null })
    const ok = await inflight
    last = { ok, at: Date.now() }
  }
  return new NextResponse(last.ok ? 'ok' : 'fail', {
    status: last.ok ? 200 : 503,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}

export const HEAD = GET
