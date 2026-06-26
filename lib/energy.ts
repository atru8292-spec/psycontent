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
// ЧЕРНОВЫЕ цены операций. Калибруем на шаге перехода на OpenAI по реальной
// себестоимости. kind: 'text' — энергию не тратит (только скрытый счётчик);
// 'energy' — списывает energyCost. realCostUsd — справочная себестоимость для
// usage_log (тоже черновая).
// ───────────────────────────────────────────────────────────────────────────
const USD_TO_RUB_DRAFT = 95 // черновой курс для журнала себестоимости

type OpKind = 'text' | 'energy'
interface OpSpec { kind: OpKind; energyCost?: number; realCostUsd?: number }

export const OPERATIONS: Record<string, OpSpec> = {
  // ── текстовые (энергию не тратят) ──
  generate_post:            { kind: 'text', realCostUsd: 0.003 },
  generate_carousel:        { kind: 'text', realCostUsd: 0.004 },
  generate_carousel_topics: { kind: 'text', realCostUsd: 0.002 },
  generate_hooks:           { kind: 'text', realCostUsd: 0.002 },
  generate_reels:           { kind: 'text', realCostUsd: 0.003 },
  rewrite_post:             { kind: 'text', realCostUsd: 0.003 },
  generate_content_plan:    { kind: 'text', realCostUsd: 0.006 },
  generate_passport:        { kind: 'text', realCostUsd: 0.01 },
  research_topics:          { kind: 'text', realCostUsd: 0.01 },
  // ── дорогие (метрятся энергией) ── ЧЕРНОВЫЕ числа
  transcription:            { kind: 'energy', energyCost: 20, realCostUsd: 0.05 },
  competitor_deep:          { kind: 'energy', energyCost: 50, realCostUsd: 0.15 },
  carousel_image:           { kind: 'energy', energyCost: 25, realCostUsd: 0.08 },
}

export interface ConsumeResult {
  ok: boolean
  reason?: 'text_limit' | 'insufficient' | 'no_wallet' | 'unknown_operation' | 'bad_amount'
  balance?: number
  message?: string
}

interface PlanRow {
  id: string
  code: string
  is_unlimited: boolean
  energy_per_month: number
  fair_use_text_cap: number | null
}

// Тариф пользователя (нет подписки → считаем Free).
async function getPlanForUser(db: SupabaseClient, userId: string): Promise<PlanRow> {
  const { data: sub } = await db
    .from('user_subscription')
    .select('plan_id')
    .eq('user_id', userId)
    .maybeSingle()

  let plan: PlanRow | null = null
  if (sub?.plan_id) {
    const { data } = await db.from('plans').select('*').eq('id', sub.plan_id).maybeSingle()
    plan = (data as PlanRow) ?? null
  }
  if (!plan) {
    const { data } = await db.from('plans').select('*').eq('code', 'free').maybeSingle()
    plan = (data as PlanRow)
  }
  return plan
}

export async function getBalance(userId: string): Promise<number> {
  const db = admin()
  const { data } = await db.from('energy_wallet').select('balance').eq('user_id', userId).maybeSingle()
  return data?.balance ?? 0
}

// Месячное пополнение (Вариант A: энергия по тарифу СГОРАЕТ).
// При наступлении нового периода баланс становится равен месячной норме плана.
// (Докупленную энергию — когда появится оплата — будем хранить отдельно и НЕ
// сбрасывать; сейчас докупки нет.)
async function refillIfDue(db: SupabaseClient, userId: string, plan: PlanRow): Promise<void> {
  const { data: wallet } = await db
    .from('energy_wallet')
    .select('next_refill')
    .eq('user_id', userId)
    .maybeSingle()
  if (!wallet) return
  if (wallet.next_refill && new Date(wallet.next_refill) > new Date()) return // ещё не время

  const next = new Date()
  next.setMonth(next.getMonth() + 1)
  await db
    .from('energy_wallet')
    .update({
      balance: plan.energy_per_month,
      monthly_allowance: plan.energy_per_month,
      next_refill: next.toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
}

// usage_log пишется ВСЕГДА, во всех ветках.
async function logUsage(
  db: SupabaseClient,
  userId: string,
  operation: string,
  energyCharged: number,
  wouldCharge: number,
  realCostUsd: number
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

// Скрытый счётчик текста (fair-use). Возвращает true, если в пределах потолка.
async function checkAndIncrementText(db: SupabaseClient, userId: string, plan: PlanRow): Promise<boolean> {
  const cap = plan.fair_use_text_cap
  const now = new Date()
  const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  const { data: row } = await db
    .from('text_usage_counter')
    .select('count')
    .eq('user_id', userId)
    .eq('period', period)
    .maybeSingle()
  const current = row?.count ?? 0

  if (cap !== null && cap !== undefined && current >= cap) {
    return false // потолок исчерпан
  }
  await db
    .from('text_usage_counter')
    .upsert({ user_id: userId, period, count: current + 1 }, { onConflict: 'user_id,period' })
  return true
}

// ───────────────────────────────────────────────────────────────────────────
// ГЛАВНЫЙ «ВАХТЁР»: можно ли выполнить операцию и что списать.
// Вызывается сервером ПЕРЕД дорогой операцией (подключение — Часть 2).
// ───────────────────────────────────────────────────────────────────────────
export async function checkAndConsume(userId: string, operation: string): Promise<ConsumeResult> {
  const db = admin()
  const op = OPERATIONS[operation]
  if (!op) return { ok: false, reason: 'unknown_operation' }

  const plan = await getPlanForUser(db, userId)
  await refillIfDue(db, userId, plan)

  const realCostUsd = op.realCostUsd ?? 0

  // Тариф «Тест»: ничего не списываем, но пишем would_charge (реальная себестоимость).
  if (plan.is_unlimited) {
    await logUsage(db, userId, operation, 0, op.energyCost ?? 0, realCostUsd)
    return { ok: true, balance: await getBalance(userId) }
  }

  // Текст: энергию не трогаем, считаем в скрытый счётчик.
  if (op.kind === 'text') {
    const within = await checkAndIncrementText(db, userId, plan)
    await logUsage(db, userId, operation, 0, 0, realCostUsd)
    if (within) return { ok: true }
    return {
      ok: false,
      reason: 'text_limit',
      message: 'На сегодня достигнут предел генераций. Он обновится в начале месяца.',
    }
  }

  // Дорогое: атомарно списываем энергию.
  const amount = op.energyCost ?? 0
  const { data, error } = await db.rpc('consume_energy', {
    p_user_id: userId,
    p_amount: amount,
    p_reason: operation,
    p_operation: operation,
  })
  const res = (data ?? {}) as { ok?: boolean; reason?: string; balance?: number }
  const charged = res.ok ? amount : 0
  await logUsage(db, userId, operation, charged, amount, realCostUsd)

  if (error) return { ok: false, reason: 'unknown_operation', message: 'Ошибка списания энергии' }
  if (res.ok) return { ok: true, balance: res.balance }
  if (res.reason === 'insufficient') {
    return {
      ok: false,
      reason: 'insufficient',
      balance: res.balance,
      message: 'Не хватает энергии. Пополните баланс или перейдите на тариф выше.',
    }
  }
  return { ok: false, reason: (res.reason as ConsumeResult['reason']) ?? 'no_wallet', balance: res.balance }
}
