// Опрос при уходе (аналитика 2, 24.10): коды причин и правило показа. Чистые функции, тесты без базы
// (scripts/test-exit-survey.ts). Тексты причин в lib/analytics/exit-copy.ts (copywriter-psycont).
//
// Где спрашиваем: cooling = карточка сверху главной тем, кто «Остывает» или «Ушла» (статус по прошлому визиту, без
// текущей сессии: иначе app_open этого захода тут же делает «Ушла» активной, product-kritik 24.10); delete = экран
// перед удалением аккаунта (удаления в продукте пока нет); cancel = отмена подписки (оплаты нет, тип заложен, нигде
// не показывается; подключить в будущем экране отмены через ExitSurveyCard place="cancel", см. CLAUDE.md).

import { computeRisk, statusOf, type PersonFacts, type Status } from './definitions'

// stuck: «Где застряла?» тем, кто зарегистрировался 3+ дня назад и ни разу не взял текст (решение Арины 24.10)
export type ExitPlace = 'delete' | 'cooling' | 'cancel' | 'stuck'
// pause это не причина ухода: «все в порядке, просто была пауза», в кабинете считается отдельно
// «Другое» убрано (Арина 24.10): поле своих слов видно всегда
export const EXIT_REASONS = ['not_me', 'same', 'no_clients', 'hard', 'no_format', 'broken', 'no_time', 'self', 'expensive'] as const
export const STUCK_REASONS = ['start', 'first_bad', 'profile_long', 'busy'] as const
export type ExitReason = typeof EXIT_REASONS[number] | typeof STUCK_REASONS[number] | 'pause'
// «дорого» показываем, только когда будет оплата
export const visibleReasons = (paymentsOn: boolean, place: ExitPlace = 'cooling'): ExitReason[] =>
  place === 'stuck' ? [...STUCK_REASONS] : EXIT_REASONS.filter(r => r !== 'expensive' || paymentsOn)
export const STUCK_AFTER_DAYS = 3 // «застряла»: 3 дня и больше с регистрации, ни одного взятого текста
export const OTHER_MAX = 300

export const SURVEY_PAUSE_DAYS = 60   // после показа или «Не сейчас» 60 дней тишины
export const SURVEY_MAX_SHOWS = 3     // и не больше трех показов за все время
export const SESSION_MIN = 30         // визит этой сессии не считаем (как сессия в lib/track.ts)
const DAY = 86400000

// статусы, которым показываем карточку
export const SURVEY_STATUSES: Status[] = ['cooling', 'gone']

export type SurveyInput = {
  facts: PersonFacts                       // из analytics_churn
  prevVisitAt: string | null               // последний визит до текущей сессии (события старше SESSION_MIN минут)
  lastShownAt: string | null; shows: number // показы карточки (события exit_survey_shown)
  answeredRecently: boolean                // отвечала за SURVEY_PAUSE_DAYS
  tookThisSession: boolean                 // в этом заходе уже взяла или сделала материал: не дергаем
}
export type SurveyDecision = { show: boolean; status: Status | null; why: string }

export function decideSurvey(i: SurveyInput, now = new Date()): SurveyDecision {
  if (i.tookThisSession) return { show: false, status: null, why: 'работает в этом заходе' }
  // кто ни разу не брал текст, тому вопрос «Где застряла?» (decideStuck), не этот
  if (!i.facts.take_days.length && !i.facts.last_take_at) return { show: false, status: null, why: 'ни разу не брала текст' }
  if (i.shows >= SURVEY_MAX_SHOWS) return { show: false, status: null, why: 'уже показывали 3 раза' }
  if (i.lastShownAt && now.getTime() - Date.parse(i.lastShownAt) < SURVEY_PAUSE_DAYS * DAY) return { show: false, status: null, why: 'пауза 60 дней' }
  if (i.answeredRecently) return { show: false, status: null, why: 'уже отвечала' }
  const facts = { ...i.facts, last_visit_at: i.prevVisitAt }
  const status = statusOf(facts, computeRisk(facts, now), now)
  return { show: SURVEY_STATUSES.includes(status), status, why: `статус ${status}` }
}

// ответ от клиента: только известные коды, свой текст до OTHER_MAX символов
export function cleanAnswer(body: any, paymentsOn: boolean, place: ExitPlace = 'cooling'): { reasons: ExitReason[]; other: string | null; contact: boolean } {
  const allowed = new Set<string>([...visibleReasons(paymentsOn, place), ...(place === 'stuck' ? [] : ['pause'])])
  const reasons = [...new Set((Array.isArray(body?.reasons) ? body.reasons : []).filter((r: unknown) => typeof r === 'string' && allowed.has(r)))] as ExitReason[]
  const other = typeof body?.other === 'string' ? [...body.other.trim()].slice(0, OTHER_MAX).join('') || null : null
  return { reasons, other, contact: body?.contact === true }
}

// «Где застряла?»: один раз за все время, только тем, кто 3+ дня с регистрации и ни разу не взял текст.
// Вместе с опросом при уходе не показываем: кто ни разу не брал текст, тот получает этот вопрос, а не «что поправить».
export type StuckInput = { facts: PersonFacts; stuckShown: boolean; stuckAnswered: boolean; tookThisSession: boolean }
export function decideStuck(i: StuckInput, now = new Date()): { show: boolean; why: string } {
  if (i.stuckShown || i.stuckAnswered) return { show: false, why: 'уже спрашивали' }
  if (i.tookThisSession) return { show: false, why: 'работает в этом заходе' }
  if (i.facts.take_days.length || i.facts.last_take_at) return { show: false, why: 'уже брала текст' }
  const age = (now.getTime() - Date.parse(i.facts.registered_at)) / DAY
  if (age < STUCK_AFTER_DAYS) return { show: false, why: 'меньше 3 дней' }
  return { show: true, why: 'застряла' }
}
