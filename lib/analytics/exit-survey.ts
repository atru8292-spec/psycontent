// Опрос при уходе (аналитика 2, 24.10): коды причин и правило показа. Чистые функции, тесты без базы
// (scripts/test-exit-survey.ts). Тексты причин в lib/analytics/exit-copy.ts (copywriter-psycont).
//
// Где спрашиваем: cooling = карточка сверху главной тем, кто «Остывает» или «Ушла» (статус по прошлому визиту, без
// текущей сессии: иначе app_open этого захода тут же делает «Ушла» активной, product-kritik 24.10); delete = экран
// перед удалением аккаунта (удаления в продукте пока нет); cancel = отмена подписки (оплаты нет, тип заложен, нигде
// не показывается; подключить в будущем экране отмены через ExitSurveyCard place="cancel", см. CLAUDE.md).

import { computeRisk, statusOf, type PersonFacts, type Status } from './definitions'

export type ExitPlace = 'delete' | 'cooling' | 'cancel'
// pause это не причина ухода: «все в порядке, просто была пауза», в кабинете считается отдельно
export const EXIT_REASONS = ['not_me', 'same', 'no_clients', 'hard', 'no_format', 'broken', 'no_time', 'self', 'expensive', 'other'] as const
export type ExitReason = typeof EXIT_REASONS[number] | 'pause'
// «дорого» показываем, только когда будет оплата
export const visibleReasons = (paymentsOn: boolean) => EXIT_REASONS.filter(r => r !== 'expensive' || paymentsOn)
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
  if (i.shows >= SURVEY_MAX_SHOWS) return { show: false, status: null, why: 'уже показывали 3 раза' }
  if (i.lastShownAt && now.getTime() - Date.parse(i.lastShownAt) < SURVEY_PAUSE_DAYS * DAY) return { show: false, status: null, why: 'пауза 60 дней' }
  if (i.answeredRecently) return { show: false, status: null, why: 'уже отвечала' }
  const facts = { ...i.facts, last_visit_at: i.prevVisitAt }
  const status = statusOf(facts, computeRisk(facts, now), now)
  return { show: SURVEY_STATUSES.includes(status), status, why: `статус ${status}` }
}

// ответ от клиента: только известные коды, свой текст до OTHER_MAX символов
export function cleanAnswer(body: any, paymentsOn: boolean): { reasons: ExitReason[]; other: string | null; contact: boolean } {
  const allowed = new Set<string>([...visibleReasons(paymentsOn), 'pause'])
  const reasons = [...new Set((Array.isArray(body?.reasons) ? body.reasons : []).filter((r: unknown) => typeof r === 'string' && allowed.has(r)))] as ExitReason[]
  const other = typeof body?.other === 'string' ? [...body.other.trim()].slice(0, OTHER_MAX).join('') || null : null
  return { reasons, other, contact: body?.contact === true }
}
