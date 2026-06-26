import { createClient, SupabaseClient } from '@supabase/supabase-js'

// Служебный клиент (service_role): энергией управляет ТОЛЬКО сервер.
function admin(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

// ───────────────────────────────────────────────────────────────────────────
// ЧЕРНОВЫЕ цены операций под GPT-5.4 (дороже gpt-4o). Точную цену за токены из API
// не вытащить — числа ориентировочные, КАЛИБРУЕМ по журналу затрат (usage_log).
// realCostUsd — оценка себестоимости одной операции (для журнала).
// energyCost — сколько энергии списываем у пользователя (продуктовый рычаг).
//   Транскрибация — это Supadata (не GPT), картинки — gpt-image (не GPT-5.4 текст):
//   их себестоимость от смены текстовой модели не зависит.
// kind 'text' — энергию не тратит (скрытый счётчик); 'energy' — списывает energyCost.
// requiresDeepAccess — операция доступна только тарифам с глубоким анализом
//   (Free получает пробу, у остальных без доступа — апгрейд).
// freeTrial — сколько раз «за всё время» бесплатно для тарифа Free.
// ───────────────────────────────────────────────────────────────────────────
const USD_TO_RUB_DRAFT = 95

type OpKind = 'text' | 'energy'
interface OpSpec {
  kind: OpKind
  energyCost?: number
  realCostUsd?: number
  requiresDeepAccess?: boolean
  freeTrial?: number
}

export const OPERATIONS: Record<string, OpSpec> = {
  // текстовые (энергию не тратят) — себест. под GPT-5.4, черновая
  generate_post:            { kind: 'text', realCostUsd: 0.02 },
  generate_carousel:        { kind: 'text', realCostUsd: 0.03 },
  generate_carousel_topics: { kind: 'text', realCostUsd: 0.015 },
  generate_hooks:           { kind: 'text', realCostUsd: 0.015 },
  generate_reels:           { kind: 'text', realCostUsd: 0.02 },
  rewrite_post:             { kind: 'text', realCostUsd: 0.02 },
  generate_content_plan:    { kind: 'text', realCostUsd: 0.05 },
  generate_passport:        { kind: 'text', realCostUsd: 0.08 },
  research_topics:          { kind: 'text', realCostUsd: 0.04 },
  // дорогие (метрятся энергией) — ЧЕРНОВЫЕ числа
  transcription:            { kind: 'energy', energyCost: 20, freeTrial: 1, realCostUsd: 0.05 },
  competitor_deep:          { kind: 'energy', energyCost: 40, requiresDeepAccess: true, freeTrial: 1, realCostUsd: 0.40 },
  carousel_image:           { kind: 'energy', energyCost: 25, freeTrial: 1, realCostUsd: 0.08 },
}

export type DecisionMode = 'text' | 'unlimited' | 'trial' | 'charge' | 'blocked'
export interface Decision {
  ok: boolean
  mode: DecisionMode
  operation: string
  cost: number
  reason?: string
  message?: string
  balance?: number
}

interface PlanRow {
  id: string
  code: string
  is_unlimited: boolean
  energy_per_month: number
  fair_use_text_cap: number | null
  deep_analysis: boolean
}

async function getPlanForUser(db: SupabaseClient, userId: string): Promise<PlanRow> {
  const { data: sub } = await db.from('user_subscription').select('plan_id').eq('user_id', userId).maybeSingle()
  let plan: PlanRow | null = null
  if (sub?.plan_id) {
    const { data } = await db.from('plans').select('*').eq('id', sub.plan_id).maybeSingle()
    plan = (data as PlanRow) ?? null
  }
  if (!plan) {
    const { data } = await db.from('plans').select('*').eq('code', 'free').maybeSingle()
    plan = data as PlanRow
  }
  return plan
}

export async function getBalance(userId: string): Promise<number> {
  const { data } = await admin().from('energy_wallet').select('balance').eq('user_id', userId).maybeSingle()
  return data?.balance ?? 0
}

// Месячное пополнение (Вариант A: энергия по тарифу сгорает → баланс = месячной норме).
async function refillIfDue(db: SupabaseClient, userId: string, plan: PlanRow): Promise<void> {
  const { data: wallet } = await db.from('energy_wallet').select('next_refill').eq('user_id', userId).maybeSingle()
  if (!wallet) return
  if (wallet.next_refill && new Date(wallet.next_refill) > new Date()) return
  const next = new Date(); next.setMonth(next.getMonth() + 1)
  await db.from('energy_wallet').update({
    balance: plan.energy_per_month,
    monthly_allowance: plan.energy_per_month,
    next_refill: next.toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('user_id', userId)
}

function periodKey(): string {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`
}

async function textCount(db: SupabaseClient, userId: string): Promise<number> {
  const { data } = await db.from('text_usage_counter').select('count').eq('user_id', userId).eq('period', periodKey()).maybeSingle()
  return data?.count ?? 0
}

async function incrementText(db: SupabaseClient, userId: string): Promise<void> {
  const current = await textCount(db, userId)
  await db.from('text_usage_counter').upsert(
    { user_id: userId, period: periodKey(), count: current + 1 },
    { onConflict: 'user_id,period' }
  )
}

// Сколько проб этой операции тариф Free уже использовал (метка в истории энергии).
async function trialsUsed(db: SupabaseClient, userId: string, operation: string): Promise<number> {
  const { count } = await db
    .from('energy_transactions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('operation', operation)
    .eq('reason', 'free_trial')
  return count ?? 0
}

// usage_log пишется во всех ветках через эту функцию.
async function logUsage(
  db: SupabaseClient, userId: string, operation: string,
  energyCharged: number, wouldCharge: number, realCostUsd: number
): Promise<void> {
  await db.from('usage_log').insert({
    user_id: userId,
    operation,
    real_cost_usd: realCostUsd,
    real_cost_rub: Math.round(realCostUsd * USD_TO_RUB_DRAFT * 10000) / 10000,
    energy_charged: energyCharged,
    would_charge: wouldCharge,
  })
}

// ───────────────────────────────────────────────────────────────────────────
// canConsume — РЕШЕНИЕ «можно ли», БЕЗ списания (вызывать ДО работы).
// ───────────────────────────────────────────────────────────────────────────
export async function canConsume(userId: string, operation: string): Promise<Decision> {
  const db = admin()
  const op = OPERATIONS[operation]
  if (!op) return { ok: false, mode: 'blocked', operation, cost: 0, reason: 'unknown_operation', message: 'Неизвестная операция' }

  const plan = await getPlanForUser(db, userId)

  if (op.kind === 'text') {
    const cap = plan.fair_use_text_cap
    const count = await textCount(db, userId)
    if (cap !== null && cap !== undefined && count >= cap) {
      return { ok: false, mode: 'text', operation, cost: 0, reason: 'text_limit', message: 'Достигнут предел генераций. Он обновится в начале месяца.' }
    }
    return { ok: true, mode: 'text', operation, cost: 0 }
  }

  // энергетическая операция
  await refillIfDue(db, userId, plan)
  const cost = op.energyCost ?? 0

  if (plan.is_unlimited) return { ok: true, mode: 'unlimited', operation, cost }

  const trialLeft =
    plan.code === 'free' && (op.freeTrial ?? 0) > 0 &&
    (await trialsUsed(db, userId, operation)) < (op.freeTrial ?? 0)

  if (op.requiresDeepAccess && !plan.deep_analysis && !trialLeft) {
    const message = plan.code === 'free'
      ? 'Пробный разбор уже использован. Глубокий анализ доступен на тарифе Практика.'
      : 'Глубокий анализ доступен на тарифе Практика.'
    return { ok: false, mode: 'blocked', operation, cost, reason: 'no_access', message }
  }

  if (trialLeft) return { ok: true, mode: 'trial', operation, cost }

  const balance = await getBalance(userId)
  if (balance < cost) {
    const message = plan.code === 'free'
      ? 'Пробный разбор уже использован. Глубокий анализ доступен на тарифе Практика.'
      : 'Не хватает энергии. Пополните баланс или перейдите на тариф выше.'
    return { ok: false, mode: 'blocked', operation, cost, reason: 'insufficient', message, balance }
  }
  return { ok: true, mode: 'charge', operation, cost, balance }
}

// ───────────────────────────────────────────────────────────────────────────
// commitConsume — ПРИМЕНИТЬ списание/пробу (вызывать ТОЛЬКО при успехе работы).
// ───────────────────────────────────────────────────────────────────────────
export async function commitConsume(userId: string, operation: string, decision: Decision): Promise<{ ok: boolean; balance?: number }> {
  const db = admin()
  const op = OPERATIONS[operation]
  const realCost = op?.realCostUsd ?? 0
  const cost = decision.cost

  if (decision.mode === 'text') {
    await incrementText(db, userId)
    await logUsage(db, userId, operation, 0, 0, realCost)
    return { ok: true }
  }
  if (decision.mode === 'unlimited') {
    // тариф «Тест»: не списываем, но пишем would_charge (реальная себестоимость)
    await logUsage(db, userId, operation, 0, cost, realCost)
    return { ok: true }
  }
  if (decision.mode === 'trial') {
    const balance = await getBalance(userId)
    await db.from('energy_transactions').insert({
      user_id: userId, amount: 0, reason: 'free_trial', operation, balance_after: balance,
    })
    await logUsage(db, userId, operation, 0, cost, realCost)
    return { ok: true, balance }
  }
  // charge — атомарное списание
  const { data } = await db.rpc('consume_energy', { p_user_id: userId, p_amount: cost, p_reason: operation, p_operation: operation })
  const res = (data ?? {}) as { ok?: boolean; balance?: number }
  await logUsage(db, userId, operation, res.ok ? cost : 0, cost, realCost)
  return { ok: !!res.ok, balance: res.balance }
}

// Внешний сервис упал ПОСЛЕ проверки: энергию НЕ берём, но факт фиксируем.
export async function recordFailure(userId: string, operation: string): Promise<void> {
  const op = OPERATIONS[operation]
  await logUsage(admin(), userId, operation, 0, 0, 0)
  void op
}

// Отказ ДО работы (нет энергии/доступа): денег не тратим, факт фиксируем.
export async function recordRefusal(userId: string, operation: string): Promise<void> {
  await logUsage(admin(), userId, operation, 0, 0, 0)
}
