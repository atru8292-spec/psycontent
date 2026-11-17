// Чистые функции бота (18.11, ветка feat/bot): карточка обращения, сводка, срочные сигналы и антиспам.
// Без базы и сети: данные приходят готовыми (lib/bot/deps.ts собирает их из базы), тест scripts/test-bot.ts.
// В карточку и сводку не попадают тексты материалов, темы и мысли: в CardData для них просто нет полей.
import { CARD, SUMMARY, INCIDENT_RU, SIGNAL, SIGNAL_KEY_RU } from './texts'

export const BOT_TZ = 'Europe/Moscow'

// ── время ──
export function fmtTime(iso: string | Date, tz = BOT_TZ, withYear = false): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  if (isNaN(d.getTime())) return '?'
  const p = new Intl.DateTimeFormat('ru-RU', { timeZone: tz, day: '2-digit', month: '2-digit', ...(withYear ? { year: 'numeric' } : {}), hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d)
  const g = (t: string) => p.find(x => x.type === t)?.value || ''
  return `${g('day')}.${g('month')}${withYear ? '.' + g('year') : ''} ${g('hour')}:${g('minute')}`
}

// сутки по tz: «вчера» (утренняя сводка) или «сегодня с 00:00» (/svodka). Границы в UTC
export function dayRange(tz: string, which: 'yesterday' | 'today', now = new Date()): { from: Date; to: Date; label: string } {
  const local = new Date(now.toLocaleString('en-US', { timeZone: tz }))
  const offset = local.getTime() - now.getTime()
  const today0 = new Date(local.getFullYear(), local.getMonth(), local.getDate()).getTime() - offset
  const from = which === 'today' ? new Date(today0) : new Date(today0 - 86400000)
  const to = which === 'today' ? now : new Date(today0)
  const label = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', timeZone: tz }).format(new Date(from.getTime() + 12 * 3600000))
  return { from, to, label }
}

export function monthStart(tz: string, now = new Date()): Date {
  const local = new Date(now.toLocaleString('en-US', { timeZone: tz }))
  const offset = local.getTime() - now.getTime()
  return new Date(new Date(local.getFullYear(), local.getMonth(), 1).getTime() - offset)
}

// ── карточка обращения ──
export type CardAccount = {
  userId: string
  email: string | null        // полностью, решение Арины 18.11 (в сводке почт нет)
  planName: string
  materials: { remaining: number; cap: number } | 'unlimited' | null
  registeredAt: string | null
  actions: { at: string; text: string }[]   // последние 5, уже человеческими словами (коды событий, без текстов)
  errors: { at: string; text: string }[]    // последние 3
}
export type CardInput = {
  isNew: boolean
  kind: string
  tgFirstName: string | null
  account: CardAccount | null
  siteUrl: string
  tz?: string
  head?: string               // своя первая строка (карточка по /chelovek)
}

export function buildCard(c: CardInput): string {
  const tz = c.tz || BOT_TZ
  const kind = CARD.kind[c.kind] || CARD.kind.other
  const name = (c.tgFirstName || '').replace(/\s+/g, ' ').trim().slice(0, 64)
  const head = c.head || `${c.isNew ? CARD.newTicket : CARD.more} (${kind})`
  const a = c.account
  if (!c.isNew) {
    // внутри обращения короткая строка: кто пишет, без повторной карточки
    return [head, a?.email ? `${CARD.email}: ${a.email}` : name ? `${CARD.tgName}: ${name}` : CARD.noAccount].join('\n')
  }
  const lines = [head]
  if (name) lines.push(`${CARD.tgName}: ${name}`)
  if (!a) { lines.push(CARD.noAccount); return lines.join('\n') }
  lines.push(`${CARD.email}: ${a.email || '?'}`)
  lines.push(`${CARD.plan}: ${a.planName}`)
  const left = a.materials === 'unlimited' ? CARD.leftUnlimited : a.materials ? `${a.materials.remaining} из ${a.materials.cap}` : CARD.leftUnknown
  lines.push(`${CARD.left}: ${left}`)
  if (a.registeredAt) lines.push(`${CARD.registered}: ${fmtTime(a.registeredAt, tz, true).split(' ')[0]}`)
  lines.push(`${CARD.actions}:`)
  if (a.actions.length) for (const x of a.actions.slice(0, 5)) lines.push(`  ${fmtTime(x.at, tz)} ${x.text}`)
  else lines.push(`  ${CARD.none}`)
  lines.push(`${CARD.errors}:`)
  if (a.errors.length) for (const x of a.errors.slice(0, 3)) lines.push(`  ${fmtTime(x.at, tz)} ${x.text}`)
  else lines.push(`  ${CARD.none}`)
  lines.push(`${CARD.open}: ${c.siteUrl.replace(/\/$/, '')}/admin/people/${a.userId}`)
  return lines.join('\n')
}

// ── сводка ──
export type SummaryData = {
  mode: 'morning' | 'today'
  label: string
  registered: number
  firstText: number
  copies: number
  trialEnd: number
  payFirst: number
  payRenewal: number
  payFailed: number
  refunds: number
  autoOff: number
  texts: number
  incidents: Record<string, number>
  aiRubDay: number
  aiRubMonth: number
  unanswered: number
  mskNote?: boolean           // пояс кабинета не МСК: приписать «по МСК» к тратам
}

const rub = (n: number) => `${Math.round(n).toLocaleString('ru-RU').replace(/ /g, ' ')} ₽`

export function buildSummary(d: SummaryData): string {
  const lines = [d.mode === 'morning' ? SUMMARY.morning(d.label) : SUMMARY.today(d.label), '']
  const add = (label: string, n: number, always = false) => { if (always || n > 0) lines.push(`${label}: ${n}`) }
  add(SUMMARY.registered, d.registered, true)
  add(SUMMARY.firstText, d.firstText)
  add(SUMMARY.copies, d.copies)
  add(SUMMARY.trialEnd, d.trialEnd)
  add(SUMMARY.payFirst, d.payFirst)
  add(SUMMARY.payRenewal, d.payRenewal)
  add(SUMMARY.payFailed, d.payFailed)
  add(SUMMARY.refunds, d.refunds)
  add(SUMMARY.autoOff, d.autoOff)
  add(SUMMARY.texts, d.texts)
  const inc = Object.entries(d.incidents).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1])
  if (inc.length) lines.push(`${SUMMARY.incidents}: ${inc.map(([k, n]) => `${INCIDENT_RU[k] || k} ${n}`).join(', ')}`)
  const tzMark = d.mskNote ? ` ${SUMMARY.msk}` : ''
  if (Math.round(d.aiRubDay) > 0) lines.push(`${SUMMARY.aiDay}${tzMark}: ${rub(d.aiRubDay)}`)
  if (Math.round(d.aiRubMonth) > 0) lines.push(`${SUMMARY.aiMonth}${tzMark}: ${rub(d.aiRubMonth)}`)
  add(SUMMARY.unanswered, d.unanswered)
  return lines.join('\n')
}

// ── сбои ──
// make_error, который считается сбоем сервиса. Ошибки человека (лимит, закрытый канал, плохая ссылка) не сбой.
export function isGenFailure(code: unknown): boolean {
  return typeof code === 'string' && /^(server|format_failed|http_5\d\d|openai.*)$/.test(code)
}

// сколько сбоев генерации подряд с конца (события новые первыми). Ошибки человека пропускаем, успех обрывает серию
export function genStreak(events: { event: string; code?: unknown }[]): number {
  let n = 0
  for (const e of events) {
    if (e.event === 'make_done') break
    if (e.event === 'make_error') { if (isGenFailure(e.code)) n++ }
  }
  return n
}

// код OpenAI -> ключ сигнала (null: не срочно)
export function openAiSignalKey(code: string): 'openai_401' | 'openai_quota' | 'openai_429' | null {
  if (/^openai_40[13]/.test(code)) return 'openai_401'
  if (/insufficient_quota|billing/.test(code)) return 'openai_quota'
  if (/^openai_429/.test(code)) return 'openai_429'
  return null
}

export type SignalInput = {
  streak: number                                   // сбоев генерации подряд
  genHour: number                                  // сбоев генерации за час
  fresh: { kind: string; code: string }[]          // новые записи журнала с прошлой проверки (включая gen)
}
export type Signal = { key: string; text: string; n: number }

export const STREAK_MIN = 3
export const HOUR_MIN = 10

export function evaluateSignals(i: SignalInput): Signal[] {
  const out: Signal[] = []
  const by = (pred: (x: { kind: string; code: string }) => boolean) => i.fresh.filter(pred)
  // серия и «за час» только если есть свежий сбой с прошлой проверки: иначе ночью сигнал повторялся бы по старой
  // проблеме каждые 30 минут. n = число новых сбоев, а не запусков таймера (ревью 18.11)
  const gen = by(x => x.kind === 'gen').length
  if (gen > 0 && i.streak >= STREAK_MIN) out.push({ key: 'gen_streak', text: SIGNAL.genStreak(i.streak), n: gen })
  if (gen > 0 && i.genHour >= HOUR_MIN) out.push({ key: 'gen_hour', text: SIGNAL.genHour(i.genHour), n: gen })
  const o401 = by(x => x.kind === 'openai' && openAiSignalKey(x.code) === 'openai_401')
  const oq = by(x => x.kind === 'openai' && openAiSignalKey(x.code) === 'openai_quota')
  const o429 = by(x => x.kind === 'openai' && openAiSignalKey(x.code) === 'openai_429')
  if (o401.length) out.push({ key: 'openai_401', text: SIGNAL.openai401, n: o401.length })
  if (oq.length) out.push({ key: 'openai_quota', text: SIGNAL.openaiQuota, n: oq.length })
  if (o429.length) out.push({ key: 'openai_429', text: SIGNAL.openai429(o429.length), n: o429.length })
  const pw = by(x => x.kind === 'pay_webhook')
  if (pw.length) out.push({ key: 'pay_webhook', text: SIGNAL.payWebhook(pw.length, [...new Set(pw.map(x => x.code))].slice(0, 4).join(', ')), n: pw.length })
  const bl = by(x => x.kind === 'billing')
  if (bl.length) out.push({ key: 'billing', text: SIGNAL.billing(bl.length), n: bl.length })
  return out
}

// ── антиспам: один и тот же сигнал не чаще раза в 30 минут, повторы копятся и показываются в следующем ──
export const SIGNAL_WINDOW_MS = 30 * 60 * 1000
export type SignalState = { last_sent_at: string; suppressed: number }

export function throttle(state: SignalState | null, now: Date, n = 1, windowMs = SIGNAL_WINDOW_MS):
  { send: boolean; repeats: number; next: SignalState } {
  if (!state || now.getTime() - new Date(state.last_sent_at).getTime() >= windowMs) {
    return { send: true, repeats: state?.suppressed || 0, next: { last_sent_at: now.toISOString(), suppressed: 0 } }
  }
  return { send: false, repeats: 0, next: { last_sent_at: state.last_sent_at, suppressed: (state.suppressed || 0) + Math.max(1, n) } }
}

export function signalText(s: Signal, repeats: number): string {
  return repeats > 0 ? `${s.text}\n${SIGNAL.repeats(repeats)}` : s.text
}

// накопленные повторы, когда полчаса прошли, а нового сбоя нет: короткое «Еще N за полчаса» (ревью 18.11)
export function flushDue(state: SignalState, now: Date, windowMs = SIGNAL_WINDOW_MS): boolean {
  return (state.suppressed || 0) > 0 && now.getTime() - new Date(state.last_sent_at).getTime() >= windowMs
}
export function flushText(key: string, n: number): string {
  return SIGNAL.flush(SIGNAL_KEY_RU[key] || key, n)
}

// строка журнала для /oshibki и карточки
export function incidentLine(x: { kind: string; code: string; created_at: string }, tz = BOT_TZ): string {
  return `${fmtTime(x.created_at, tz)} ${INCIDENT_RU[x.kind] || x.kind}: ${x.code}`
}
