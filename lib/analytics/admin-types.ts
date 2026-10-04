// Формы ответов SQL-функций кабинета (миграция 20261005100000_events_admin.sql). Тексты постов сюда не попадают.
import type { PersonFacts, RiskReason, RiskLevel, Status } from './definitions'

export type Churn = { facts: PersonFacts; score: number; level: RiskLevel; reasons: RiskReason[]; rhythm_days: number; status: Status }

export type PersonRow = {
  user_id: string; email: string; full_name: string | null; registered_at: string
  plan_code: string | null; plan_name: string | null; plan_price: number | null; src: string | null
  onb_last_step: number | null; onb_done: boolean
  first_make_at: string | null; first_material_at: string | null; first_take_at: string | null; second_take_at: string | null
  first_paywall_at: string | null; paying: boolean
  last_visit_at: string | null; sessions_7: number; visit_days_30: number
  materials: number; materials_taken: number; cost_rub_30: number; cost_rub_all: number
  limit_hit_ever: boolean; limit_hit_7: boolean; error_7: boolean
  churn: Churn
}

export type Overview = {
  took_7: number; active_today: number; active_7: number; new_7: number; registered_all: number; activated_all: number
  cost_today_rub: number; cost_30_rub: number; limit_7: number
}

export type FunnelKey = 'registered' | 'onboarded' | 'first_make' | 'first_material' | 'first_take' | 'second_take' | 'saw_paywall' | 'paying'
export type FunnelStep = { key: FunnelKey; n: number; median_hours_from_prev: number | null; users: string[] }
export const FUNNEL_RU: Record<FunnelKey, string> = {
  registered: 'Регистрация', onboarded: 'Онбординг пройден', first_make: 'Первый запуск «Сделать»',
  first_material: 'Первый готовый материал', first_take: 'Первый взятый текст', second_take: 'Вернулась и взяла второй',
  saw_paywall: 'Видела тарифы', paying: 'Платит',
}

export type OnbStep = { step: number; viewed: number; done: number; median_ms: number | null; dropped: number; dropped_users: string[] }
export type Onboarding = { intro: number; finished: number; steps: OnbStep[] }

export type MakeStats = {
  starts: number; done: number; errors: number; median_ms: number | null; materials: number; taken: number
  by_format: { format: string; started: number; materials: number; taken: number }[]
  by_mode: { mode: string; n: number }[]
  errors_by_code: { code: string; n: number }[]
}

export type Features = {
  features: { feature: string; users_7: number; users_30: number; times_30: number }[]
  screens: { screen: string; users_7: number; users_30: number; times_30: number }[]
  formats: { format: string; made_30: number; taken_30: number; users_30: number }[]
  carousel_styles: { style: string; carousels: number; exports: number }[]
}

export type Costs = {
  by_day: { day: string; rub: number }[]
  by_operation: { operation: string; rub: number; calls: number }[]
  by_model: { model: string; rub: number; calls: number }[]
  top_users: { user_id: string; email: string; rub: number }[]
  total_rub: number; materials: number; taken: number
  over_plan: { user_id: string; email: string; plan_code: string; plan_price: number; rub_30: number }[]
  economy: { paying: number; mrr: number; churned_paying_30: number; ai_rub_30_paying: number; plans: { code: string; name: string; price: number; users: number; ai_rub_30: number }[] }
  sources: { src: string; users: number; activated: number; paying: number }[]
}

export type TimelineItem =
  | { at: string; type: 'event'; event: string; props: Record<string, string | number | boolean> }
  | { at: string; type: 'material'; format: string; group_id: string | null; status: string | null }
  | { at: string; type: 'published'; format: string }
  | { at: string; type: 'export'; method: string | null; style: string | null; count: number | null }
  | { at: string; type: 'voice'; kind: string; change_ratio: number | null }

export type PersonDetail = {
  user_id: string; email: string; full_name: string | null; registered_at: string
  plan_code: string | null; plan_name: string | null; plan_price: number | null; src: string | null; last_visit_at: string | null
  churn: Churn
  // шаги массивом, отметки входа, финала и микрофона на верхнем уровне (так отдает analytics_person)
  onboarding: { step: number; viewed_at: string | null; done_at: string | null; ms: number | null }[]
  intro_at: string | null; done_at: string | null; mic_denied: boolean
  timeline: TimelineItem[]
  features: { feature: string; n: number }[]
  formats: { format: string; made: number; taken: number }[]
  voice: { by_kind: { kind: string; n: number }[]; weeks: { week: string; copied_clean: number; edited: number; avg_change_ratio: number | null; not_like: number; mine: number }[] }
  money: { rub_30: number; rub_all: number; by_operation_30: { operation: string; rub: number; calls: number }[]; by_model_30: { model: string; rub: number; calls: number }[]; by_operation_all: { operation: string; rub: number; calls: number }[] }
  text_usage: { period: string | null; count: number; cap: number | null }
}

export type Period = '7' | '30' | 'all'
export type AdminOpts = { includeInternal: boolean; period: Period; demo: boolean }
