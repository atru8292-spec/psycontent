// Определения аналитики в одном месте (задача analitika, этап 4): что считаем «взяла текст», активацией,
// привычкой, статусы человека и риск ухода. Арина может поменять константы здесь.
//
// ВАЖНО: риск ухода и статус считает SQL-функция public.analytics_churn (миграция 20261005100000_events_admin.sql)
// на лету при открытии кабинета, ее же потом позовут сообщения удержания. Этот файл ее близнец на TypeScript:
// на нем работают тесты (scripts/test-analytics.ts) и демо-данные. Меняешь вес или правило здесь, поменяй и в SQL.

// ---------- взяла текст ----------
// Взяла текст: событие material_take любого вида или generated_posts.published_at.
export const TAKE_EVENT = 'material_take'

// Активация: взяла хотя бы один текст в первые 3 дня после регистрации
export const ACTIVATION_DAYS = 3
// Активная на неделе: взяла текст за последние 7 дней (главная цифра кабинета)
export const ACTIVE_DAYS = 7
// Привычка: брала тексты в двух разных неделях из последних трех (недели это 7-дневные окна назад от сегодня)
export const HABIT_WEEKS = 3
export const HABIT_MIN_WEEKS = 2

// ---------- статусы ----------
export const NEW_DAYS = 3          // Новая: меньше 3 дней и еще не брала текст
export const STUCK_AFTER_DAYS = 1  // Застряла: больше суток, а онбординг не пройден или нет материалов
export const GONE_MIN_DAYS = 14    // Ушла: без визита 14+ дней и дольше четырех ее обычных перерывов
export const GONE_RHYTHMS = 4

export type Status = 'new' | 'stuck' | 'active' | 'cooling' | 'gone' | 'trying'
// «Пробует» в задании нет: так назван человек, который сделал материалы, но ни одного не взял и уже не новый.
// Иначе он не попадает ни в один статус.
export const STATUS_RU: Record<Status, string> = {
  new: 'Новая', stuck: 'Застряла', active: 'Активная', cooling: 'Остывает', gone: 'Ушла', trying: 'Пробует',
}

// ---------- риск ухода ----------
// Стартовые веса, пересчитать по данным, когда наберется 50 ушедших.
export const RISK = {
  RHYTHM_DEFAULT_DAYS: 7,   // ритм, если взятых дней меньше трех
  RHYTHM_MIN_DAYS: 1,
  RHYTHM_LAST_TAKES: 8,     // ритм по последним 8 дням со взятием
  RECENCY_2: 25,            // тишина дольше двух ее ритмов
  RECENCY_3: 40,            // тишина дольше трех ее ритмов (вместо 25)
  DECLINE: 20,              // взятий за 14 дней меньше половины от прошлых 14 (а там было 2+)
  EMPTY_LAST3: 20,          // три последних готовых материала не взяты
  UNHAPPY: 15,              // за 7 дней 2+ «не похоже» или 3+ сильные правки (change_ratio >= 0.5)
  UNHAPPY_NOT_LIKE: 2,
  UNHAPPY_STRONG_EDITS: 3,
  STRONG_EDIT_RATIO: 0.5,
  ERRORS: 15,               // за 7 дней 2+ make_error или error_shown
  ERRORS_MIN: 2,
  LIMIT_NO_RETURN: 15,      // уперлась в лимит, и 3 дня после этого ни визита, ни plan_click
  LIMIT_NO_RETURN_DAYS: 3,
  NO_VOICE: 10,             // 7 дней с регистрации, а слепка голоса нет
  NO_VOICE_DAYS: 7,
  HABIT: -15,               // привычка; работает, только пока она в своем ритме (тишина не дольше двух ритмов),
                            // иначе ежедневная пишущая на 4-й день тишины выходила бы «нормой»
  PUBLISHED_14: -10,        // отмечала «опубликовала» за 14 дней
  ATTENTION: 30,            // 30-59 внимание
  HIGH: 60,                 // 60+ риск
} as const

export type RiskLevel = 'norm' | 'attention' | 'high'
export const RISK_LEVEL_RU: Record<RiskLevel, string> = { norm: 'норма', attention: 'внимание', high: 'риск' }

export type RiskCode = 'recency' | 'decline' | 'empty_last3' | 'unhappy' | 'errors' | 'limit_no_return' | 'no_voice' | 'habit' | 'published'
export type RiskReason = { code: RiskCode; points: number }
export type Risk = { score: number; level: RiskLevel; reasons: RiskReason[]; rhythm_days: number }

// Факты о человеке, из которых считаются статус и риск. Ровно эти поля отдает SQL (analytics_people).
export type PersonFacts = {
  registered_at: string
  onboarded: boolean
  materials: number            // сделано материалов
  take_days: string[]          // даты (YYYY-MM-DD в ADMIN_TZ) дней со взятием, по убыванию, все
  last_visit_at: string | null
  last_take_at: string | null
  takes_14: number             // взятий за последние 14 дней
  takes_prev_14: number        // взятий за 14 дней до этого
  last3_taken: number | null   // сколько из трех последних материалов взято (null, если материалов меньше трех)
  not_like_7: number
  strong_edits_7: number
  errors_7: number
  limit_no_return: boolean
  voice_core_empty: boolean
  published_14: boolean
}

const DAY = 86400000
const dayDiff = (a: string, b: string) => Math.round((Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z')) / DAY)

// Личный ритм: медиана перерывов между днями со взятием по последним 8 таким дням; меньше трех дней, значит 7
export function rhythmDays(takeDays: string[]): number {
  const days = [...new Set(takeDays)].sort().reverse().slice(0, RISK.RHYTHM_LAST_TAKES)
  if (days.length < 3) return RISK.RHYTHM_DEFAULT_DAYS
  const gaps = days.slice(0, -1).map((d, i) => dayDiff(d, days[i + 1])).sort((a, b) => a - b)
  const mid = gaps.length / 2
  const med = gaps.length % 2 ? gaps[Math.floor(mid)] : (gaps[mid - 1] + gaps[mid]) / 2
  return Math.max(RISK.RHYTHM_MIN_DAYS, med)
}

export function habitOf(takeDays: string[], today: string): boolean {
  const weeks = new Set<number>()
  for (const d of takeDays) {
    const ago = dayDiff(today, d)
    if (ago >= 0 && ago < HABIT_WEEKS * 7) weeks.add(Math.floor(ago / 7))
  }
  return weeks.size >= HABIT_MIN_WEEKS
}

export function computeRisk(f: PersonFacts, now: Date): Risk | null {
  if (!f.take_days.length || !f.last_take_at) return null // риск только у тех, кто хоть раз брал текст
  const today = now.toISOString().slice(0, 10)
  const rhythm = rhythmDays(f.take_days)
  const reasons: RiskReason[] = []
  const silent = (now.getTime() - Date.parse(f.last_take_at)) / DAY
  const ratio = silent / rhythm
  if (ratio > 3) reasons.push({ code: 'recency', points: RISK.RECENCY_3 })
  else if (ratio > 2) reasons.push({ code: 'recency', points: RISK.RECENCY_2 })
  if (f.takes_prev_14 >= 2 && f.takes_14 < f.takes_prev_14 / 2) reasons.push({ code: 'decline', points: RISK.DECLINE })
  if (f.last3_taken === 0) reasons.push({ code: 'empty_last3', points: RISK.EMPTY_LAST3 })
  if (f.not_like_7 >= RISK.UNHAPPY_NOT_LIKE || f.strong_edits_7 >= RISK.UNHAPPY_STRONG_EDITS) reasons.push({ code: 'unhappy', points: RISK.UNHAPPY })
  if (f.errors_7 >= RISK.ERRORS_MIN) reasons.push({ code: 'errors', points: RISK.ERRORS })
  if (f.limit_no_return) reasons.push({ code: 'limit_no_return', points: RISK.LIMIT_NO_RETURN })
  if (f.voice_core_empty && (now.getTime() - Date.parse(f.registered_at)) / DAY >= RISK.NO_VOICE_DAYS) reasons.push({ code: 'no_voice', points: RISK.NO_VOICE })
  if (habitOf(f.take_days, today) && ratio <= 2) reasons.push({ code: 'habit', points: RISK.HABIT })
  if (f.published_14) reasons.push({ code: 'published', points: RISK.PUBLISHED_14 })
  const score = Math.max(0, Math.min(100, reasons.reduce((s, r) => s + r.points, 0)))
  return { score, level: levelOf(score), reasons, rhythm_days: rhythm }
}

export const levelOf = (score: number): RiskLevel => (score >= RISK.HIGH ? 'high' : score >= RISK.ATTENTION ? 'attention' : 'norm')

export function statusOf(f: PersonFacts, risk: Risk | null, now: Date): Status {
  const age = (now.getTime() - Date.parse(f.registered_at)) / DAY
  const rhythm = risk?.rhythm_days ?? RISK.RHYTHM_DEFAULT_DAYS
  const sinceVisit = f.last_visit_at ? (now.getTime() - Date.parse(f.last_visit_at)) / DAY : age
  if (sinceVisit >= Math.max(GONE_MIN_DAYS, GONE_RHYTHMS * rhythm)) return 'gone'
  const tookRecently = !!f.last_take_at && (now.getTime() - Date.parse(f.last_take_at)) / DAY <= ACTIVE_DAYS
  if (tookRecently) return 'active'
  if (risk && risk.score >= RISK.ATTENTION) return 'cooling'
  if (age > STUCK_AFTER_DAYS && (!f.onboarded || f.materials === 0)) return 'stuck'
  if (age < NEW_DAYS && !f.take_days.length) return 'new'
  return 'trying'
}

// Причины человеческими словами для «Требуют внимания» и карточки
export function reasonText(r: RiskReason, f: PersonFacts, risk: Risk, now: Date): string {
  const rhythm = risk.rhythm_days
  const silent = f.last_take_at ? Math.floor((now.getTime() - Date.parse(f.last_take_at)) / DAY) : 0
  switch (r.code) {
    case 'recency': return `не брала текст ${silent} ${plural(silent, 'день', 'дня', 'дней')}, обычно берет ${rhythm <= 1 ? 'каждый день' : `раз в ${fmtNum(rhythm)} ${plural(Math.round(rhythm), 'день', 'дня', 'дней')}`}`
    case 'decline': return `за 14 дней взяла ${f.takes_14}, за 14 дней до этого ${f.takes_prev_14}`
    case 'empty_last3': return 'три последних текста не взяла'
    case 'unhappy': return f.not_like_7 >= RISK.UNHAPPY_NOT_LIKE ? `${f.not_like_7} «не похоже» за неделю` : `${f.strong_edits_7} сильных правки за неделю`
    case 'errors': return `${f.errors_7} ошибки за неделю`
    case 'limit_no_return': return 'уперлась в лимит и не вернулась'
    case 'no_voice': return 'голос не настроен'
    case 'habit': return 'берет текст почти каждую неделю'
    case 'published': return 'отмечает «опубликовала»'
  }
}

// ---------- экономика (Арина поправит) ----------
export const PAYMENT_FEE = 0.035          // комиссия оплаты
export const TAX = 0.06                   // налог
export const RATIO_GOAL = 8               // выручка к тратам на ИИ: цель 8 к 1 и выше
export const RATIO_WARN = 5               // ниже 5 к 1 подсвечиваем
export const COST_OVER_PLAN_SHARE = 0.15  // дороже тарифа: себестоимость за 30 дней больше 15% цены тарифа
// курс USD_TO_RUB_DRAFT берется из lib/energy.ts

// ---------- мелочи вывода ----------
export function plural(n: number, one: string, few: string, many: string): string {
  const a = Math.abs(n) % 10, b = Math.abs(n) % 100
  return a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many
}
export const fmtNum = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ','))
// Доля при знаменателе меньше 20 показывается «3 из 7», а не процентом
// В таблице формат один на всю колонку: проценты, только если самый большой знаменатель колонки от 20
export const shareCol = (a: number, b: number, colMax: number) => (b <= 0 ? '0' : colMax < 20 ? `${a} из ${b}` : `${Math.round((a / b) * 100)}%`)
export const share = (a: number, b: number) => (b <= 0 ? '0' : b < 20 ? `${a} из ${b}` : `${Math.round((a / b) * 100)}%`)
