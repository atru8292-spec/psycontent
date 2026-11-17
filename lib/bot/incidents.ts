// Журнал сбоев для сигналов Арине (18.11, ветка feat/bot): таблица bot_incidents, только вид и код.
// Никогда не бросает и не задерживает ответ (зовется без await).
// Пишет ТОЛЬКО при BOT_INCIDENTS=1 (ставится только на сервере сайта): .env.local смотрит на боевую базу, и локальные
// eval и real-test на ответах 401/429 иначе записали бы инциденты в прод и разбудили Арину (ревью 18.11).
// Тексты ошибок, ответы модели и токены сюда не идут: код чистится до [A-Za-z0-9_.:-] и 60 знаков.
import { getSupabaseAdmin } from '@/lib/generation/db'
import { isGenFailure } from './report'

export type IncidentKind = 'gen' | 'openai' | 'pay_webhook' | 'billing' | 'bot' | 'db'

export const cleanCode = (c: unknown) => String(c ?? '').replace(/[^A-Za-z0-9_.:-]/g, '').slice(0, 60) || 'unknown'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const incidentsOn = () =>
  process.env.BOT_INCIDENTS === '1' && !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY

export function logIncident(kind: IncidentKind, code: unknown, userId?: string | null): void {
  try {
    if (!incidentsOn()) return
    const row = { kind, code: cleanCode(code), user_id: userId && UUID.test(userId) ? userId : null }
    getSupabaseAdmin().from('bot_incidents').insert(row).then(({ error }) => {
      if (error) console.warn('incident:', kind, error.code || 'err') // таблицы нет (миграция не применена): одной строкой
    }, () => console.warn('incident:', kind, 'net'))
  } catch {}
}

// make_error из serverTrack: в журнал только сбои сервиса, ошибки человека (лимит, закрытый канал) не пишем
export function noteMakeError(userId: string | null | undefined, code: unknown): void {
  if (isGenFailure(code)) logIncident('gen', code, userId)
}

// ответ OpenAI с ошибкой: в журнал только то, что требует Арины (ключ, деньги, частота)
export function noteOpenAiError(e: { code?: unknown; status?: unknown } | null | undefined, userId?: string | null): void {
  const status = Number(e?.status)
  if (status === 401 || status === 403 || status === 429) logIncident('openai', e?.code || `openai_${status}`, userId)
}
