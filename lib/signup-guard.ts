// Защита регистрации по почте от ботов (16.11, блок 1 запуска). Без Cloudflare и без западных сервисов (152-ФЗ).
// Слои: 1) ловушка (скрытое поле, человек его не видит и не заполняет); 2) слишком быстрая отправка формы;
// 3) предел регистраций с одного адреса и общий предел; 4) Яндекс SmartCaptcha, если на сервере есть
// SMARTCAPTCHA_SERVER_KEY (без ключа слой молча выключен, остальные работают).
// Счетчики в памяти процесса (один процесс pm2 psycont): после перезапуска обнуляются, для защиты от ботов этого хватает.
// IP только ключ счетчика, никуда не пишется (как в lib/analytics/ingest.ts).

export const MIN_FORM_MS = 2500           // быстрее человек форму не заполнит
export const PER_IP_HOUR = 5               // регистраций с одного адреса за час
export const PER_IP_DAY = 15               // и за сутки
export const ALL_HOUR = 60                 // всех регистраций за час (запас для запуска)

type Hits = Map<string, number[]>
const ipHits: Hits = new Map()
let allHits: number[] = []

function prune(list: number[], now: number, windowMs: number) { return list.filter(t => now - t < windowMs) }

export type GuardInput = { ip: string; honeypot?: unknown; formMs?: unknown; now?: number }
export type GuardResult = { ok: true } | { ok: false; reason: 'honeypot' | 'too_fast' | 'ip_limit' | 'all_limit' }

// Проверка без записи; запись попытки отдельно (recordSignup), только после того, как прошли все слои
export function checkSignup(inp: GuardInput, store: { ip: Hits; all: number[] } = { ip: ipHits, all: allHits }): GuardResult {
  const now = inp.now ?? Date.now()
  if (typeof inp.honeypot === 'string' && inp.honeypot.trim()) return { ok: false, reason: 'honeypot' }
  const ms = Number(inp.formMs)
  if (!Number.isFinite(ms) || ms < MIN_FORM_MS) return { ok: false, reason: 'too_fast' }
  const mine = prune(store.ip.get(inp.ip) || [], now, 24 * 3600e3)
  if (mine.filter(t => now - t < 3600e3).length >= PER_IP_HOUR || mine.length >= PER_IP_DAY) return { ok: false, reason: 'ip_limit' }
  if (prune(store.all, now, 3600e3).length >= ALL_HOUR) return { ok: false, reason: 'all_limit' }
  return { ok: true }
}

export function recordSignup(ip: string, now = Date.now(), store: { ip: Hits; all: number[] } = { ip: ipHits, all: allHits }) {
  const mine = prune(store.ip.get(ip) || [], now, 24 * 3600e3)
  mine.push(now)
  store.ip.set(ip, mine)
  const all = prune(store.all, now, 3600e3); all.push(now)
  if (store.all === allHits) allHits = all; else { store.all.length = 0; store.all.push(...all) }
  // память не растет: старые адреса выкидываем
  if (store.ip.size > 5000) for (const [k, v] of store.ip) if (!v.some(t => now - t < 24 * 3600e3)) store.ip.delete(k)
}

// Адрес клиента: nginx ставит X-Real-IP; запасной вариант первый адрес X-Forwarded-For
export function clientIp(h: Headers): string {
  return (h.get('x-real-ip') || h.get('x-forwarded-for')?.split(',')[0] || 'unknown').trim().slice(0, 64)
}

// Яндекс SmartCaptcha: https://smartcaptcha.yandexcloud.net/validate (POST secret, token, ip). Ответ { status: 'ok' }.
// Сбой самого сервиса капчи не закрывает регистрацию (как советует Яндекс): человек важнее, остальные слои работают.
export async function captchaOk(token: unknown, ip: string, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  const secret = process.env.SMARTCAPTCHA_SERVER_KEY
  if (!secret) return true
  if (typeof token !== 'string' || !token || token.length > 4000) return false
  try {
    const r = await fetchImpl('https://smartcaptcha.yandexcloud.net/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret, token, ip }).toString(),
      signal: AbortSignal.timeout(5000),
    })
    if (!r.ok) return true
    const j = await r.json().catch(() => null)
    return j?.status === 'ok'
  } catch { return true }
}
