// УСТАРЕЛО 18.11: утреннюю сводку шлет бот поддержки (lib/bot/report.ts buildSummary, lib/bot/deps.ts collectSummary,
// /api/cron/bot-summary). Файл оставлен для scripts/digest.ts --dry/--print и test-digest; нового сюда не добавлять.
// Утренняя сводка Арине в Telegram (аналитика 2, 24.10). Чистая функция: из готовых цифр текст. Сбор цифр и
// отправка в scripts/digest.ts. Telegram зарубежный сервис: в тексте НЕТ почт, текстов постов и своих слов из опроса,
// люди только именем из профиля и коротким номером (последние 4 знака id).
import { REASON_RU } from './exit-copy'
import type { ExitReason } from './exit-survey'
import { plural } from './definitions'

export type DigestPerson = { id: string; name: string | null; score?: number }
export type DigestData = {
  day: string                 // «23 октября»
  registered: number; onboarded: number; firstTake: number; active7: number
  stuck: { n: number; latest: DigestPerson[] }
  cooling: { n: number; risk60: number; top: DigestPerson[] }
  aiRubDay: number; aiRubMonth: number
  genErrors: number
  exitReasons: Partial<Record<ExitReason, number>>; exitAnswers: number
  stuckReasons?: Partial<Record<ExitReason, number>>; stuckAnswers?: number
}

export const shortId = (id: string) => (id || '').replace(/-/g, '').slice(-4)
const who = (p: DigestPerson) => `${(p.name || 'без имени').trim().split(/\s+/)[0]} #${shortId(p.id)}${p.score != null ? ` (${p.score})` : ''}`
const rub = (n: number) => `${Math.round(n).toLocaleString('ru-RU')} ₽`

export function buildDigest(d: DigestData): string {
  const lines = [
    `Доброе утро. Вчера, ${d.day}:`,
    '',
    `Новых: ${d.registered}, прошли знакомство: ${d.onboarded}, впервые взяли текст: ${d.firstTake}`,
    `Активных за 7 дней: ${d.active7}`,
    `Застряли: ${d.stuck.n}${d.stuck.latest.length ? ` (свежие: ${d.stuck.latest.map(who).join(', ')})` : ''}`,
    `Остывают: ${d.cooling.n}, риск 60+: ${d.cooling.risk60}${d.cooling.top.length ? ` (выше всех: ${d.cooling.top.map(who).join(', ')})` : ''}`,
    `ИИ: вчера ${rub(d.aiRubDay)}, за месяц ${rub(d.aiRubMonth)}`,
    `Ошибки генерации: ${d.genErrors}`,
  ]
  const reasons = Object.entries(d.exitReasons).filter(([, n]) => (n || 0) > 0).sort((a, b) => (b[1] || 0) - (a[1] || 0))
  if (d.exitAnswers) {
    lines.push(`Опрос при уходе: ${d.exitAnswers} ${plural(d.exitAnswers, 'ответ', 'ответа', 'ответов')}`)
    for (const [k, n] of reasons) lines.push(`  ${REASON_RU[k as ExitReason] || k}: ${n}`)
  } else lines.push('Опрос при уходе: новых ответов нет')
  if (d.stuckAnswers) {
    lines.push(`Где застряли: ${d.stuckAnswers} ${plural(d.stuckAnswers, 'ответ', 'ответа', 'ответов')}`)
    for (const [k, n] of Object.entries(d.stuckReasons || {}).filter(([, n]) => (n || 0) > 0).sort((a, b) => (b[1] || 0) - (a[1] || 0))) lines.push(`  ${REASON_RU[k as ExitReason] || k}: ${n}`)
  }
  return lines.join('\n')
}

// демо для --dry и тестов
export function demoDigest(): DigestData {
  return {
    day: '23 октября', registered: 4, onboarded: 3, firstTake: 2, active7: 11,
    stuck: { n: 3, latest: [{ id: '0000a1b2-0000', name: 'Марина Ершова' }, { id: '0000c3d4-0000', name: 'Егор' }, { id: '0000e5f6-0000', name: null }] },
    cooling: { n: 5, risk60: 2, top: [{ id: '00001111-0000', name: 'Вера Соколова', score: 75 }, { id: '00002222-0000', name: 'Лилия', score: 64 }, { id: '00003333-0000', name: 'Ольга', score: 52 }] },
    aiRubDay: 186.4, aiRubMonth: 3120,
    genErrors: 1,
    exitReasons: { not_me: 1, no_clients: 1, pause: 1 }, exitAnswers: 3,
  }
}

// ---------- сбор из ответов функций кабинета (общий для --dry на демо и для настоящего запуска) ----------
import type { PersonRow, Overview } from './admin-types'

// вчера в поясе tz: границы в UTC и подпись «23 октября»
export function yesterdayIn(tz: string, now = new Date()): { from: Date; to: Date; label: string } {
  const local = new Date(now.toLocaleString('en-US', { timeZone: tz }))
  const offset = local.getTime() - now.getTime()
  const today0 = new Date(local.getFullYear(), local.getMonth(), local.getDate())
  const to = new Date(today0.getTime() - offset), from = new Date(to.getTime() - 86400000)
  const label = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', timeZone: tz }).format(new Date(from.getTime() + 12 * 3600000))
  return { from, to, label }
}

export function digestFrom(i: {
  label: string; from: Date; to: Date; people: PersonRow[]; overview: Overview
  aiRubDay: number; aiRubMonth: number; onboarded: number; genErrors: number
  exits: { reasons: string[]; place?: string }[]
}): DigestData {
  const inDay = (iso: string | null) => !!iso && Date.parse(iso) >= i.from.getTime() && Date.parse(iso) < i.to.getTime()
  const stuck = i.people.filter(p => p.churn?.status === 'stuck').sort((a, b) => Date.parse(b.registered_at) - Date.parse(a.registered_at))
  const cooling = i.people.filter(p => p.churn?.status === 'cooling')
  const risky = i.people.filter(p => (p.churn?.score ?? 0) >= 60 && p.churn?.status !== 'gone').sort((a, b) => (b.churn?.score ?? 0) - (a.churn?.score ?? 0))
  const reasons: Partial<Record<ExitReason, number>> = {}, stuckReasons: Partial<Record<ExitReason, number>> = {}
  const leave = i.exits.filter(e => e.place !== 'stuck'), stuckEx = i.exits.filter(e => e.place === 'stuck')
  for (const e of leave) for (const r of e.reasons) reasons[r as ExitReason] = (reasons[r as ExitReason] || 0) + 1
  for (const e of stuckEx) for (const r of e.reasons) stuckReasons[r as ExitReason] = (stuckReasons[r as ExitReason] || 0) + 1
  return {
    day: i.label,
    registered: i.people.filter(p => inDay(p.registered_at)).length,
    onboarded: i.onboarded,
    firstTake: i.people.filter(p => inDay(p.first_take_at)).length,
    active7: i.overview.active_7,
    stuck: { n: stuck.length, latest: stuck.slice(0, 3).map(p => ({ id: p.user_id, name: p.full_name })) },
    cooling: { n: cooling.length, risk60: risky.length, top: risky.slice(0, 3).map(p => ({ id: p.user_id, name: p.full_name, score: p.churn.score })) },
    aiRubDay: i.aiRubDay, aiRubMonth: i.aiRubMonth, genErrors: i.genErrors,
    exitReasons: reasons, exitAnswers: leave.length, stuckReasons, stuckAnswers: stuckEx.length,
  }
}
