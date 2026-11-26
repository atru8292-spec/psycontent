import { serverTrack } from './track-server'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { errTag } from './safe-error'
import { LIMIT_REFUSAL } from './limit-texts'
import { monthSegmentStart } from './billing/period'

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
export const USD_TO_RUB_DRAFT = 95

// ⚠️ ЦЕНЫ GPT-5.4 — СТАРТОВЫЕ из обзоров, СВЕРИТЬ ПО ЛИЧНОМУ КАБИНЕТУ OpenAI.
// $ за 1 миллион токенов. Кешированный вход дешевле (точное число уточнить).
const PRICE_INPUT_PER_M = 2.5
const PRICE_OUTPUT_PER_M = 15
const PRICE_CACHED_INPUT_PER_M = 0.25
// Цены по моделям ($ за 1 млн токенов: вход, кешированный вход, выход), с официальных страниц
// developers.openai.com на 30.09.2026. Нет в списке: считаем по ценам gpt-5.4 выше.
export const MODEL_PRICES: Record<string, [number, number, number]> = {
  'gpt-5.4': [2.5, 0.25, 15],
  'gpt-6.1-sol': [2, 0.1, 10],
  'gpt-6-astra': [10, 1, 50],
  'gpt-6-luna': [0.1, 0.01, 0.5],
}

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
  // резерв текстов (20261120100000_text_reserve): id резерва и ключ счетчика, под который он взят
  reserveId?: string
  reserveUser?: string
  period?: string
}

interface PlanRow {
  id: string
  code: string
  name: string
  is_unlimited: boolean
  energy_per_month: number
  fair_use_text_cap: number | null
  deep_analysis: boolean
}

// windowKey (17.11, оплата): у оплаченной подписки лимит считается по окну [period_start, period_end), ключ счетчика
// 'wYYYY-MM-DD' (день начала окна по Москве), а не по календарному месяцу. Пробные (ключи 'YYYY-MM') в окно не входят,
// поэтому не съедают первый платный месяц. Окно кончилось или подписка expired: тариф снова free, даже если таймер
// оплаты еще не успел переключить plan_id. Подписки без period_end (тариф выдан руками, «Тест») живут как раньше.
type PlanCtx = PlanRow & { windowKey: string | null }
export function windowKeyOf(periodStart: string | Date): string {
  const msk = new Date(new Date(periodStart).getTime() + 3 * 3600000)
  return `w${msk.toISOString().slice(0, 10)}`
}

async function getPlanForUser(db: SupabaseClient, userId: string): Promise<PlanCtx> {
  let { data: sub, error: subErr } = await db.from('user_subscription').select('plan_id, status, period_start, period_end, billing_anchor_day').eq('user_id', userId).maybeSingle()
  // колонки status еще нет (код выкатили раньше миграции оплаты): читаем по-старому, без окна (ревью 17.11)
  if (subErr && /42703|status|column/i.test(`${subErr.code} ${subErr.message}`)) {
    const old = await db.from('user_subscription').select('plan_id, period_start, period_end').eq('user_id', userId).maybeSingle()
    sub = old.data ? { ...old.data, status: 'trial' } as any : null
  }
  let plan: PlanRow | null = null
  let windowKey: string | null = null
  if (sub?.plan_id) {
    const { data } = await db.from('plans').select('*').eq('id', sub.plan_id).maybeSingle()
    plan = (data as PlanRow) ?? null
    if (plan && plan.code !== 'free' && !plan.is_unlimited && sub.period_end) {
      // пока идут повторы списания (past_due), тариф работает (решение Арины 17.11); expired: выключен
      const over = sub.status === 'expired' || (sub.status !== 'past_due' && new Date(sub.period_end) <= new Date())
      if (over) plan = null
      // окно длиннее месяца (продление заранее, смена тарифа с пересчетом, 19.11): счетчик свой на каждый месяц окна
      else if (sub.period_start) windowKey = windowKeyOf(monthSegmentStart(new Date(sub.period_start), (sub as any).billing_anchor_day ?? null, new Date()))
    }
  }
  if (!plan) {
    const { data } = await db.from('plans').select('*').eq('code', 'free').maybeSingle()
    plan = data as PlanRow
  }
  // тариф не прочитался (сбой базы): бросаем, как раньше; иначе пустой объект без предела пустил бы мимо лимита
  if (!plan) throw Object.assign(new Error('plan'), { code: 'plan_read_failed' })
  return { ...plan, windowKey }
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

// месяц по Москве явно (26.11): раньше брался пояс сервера, он совпадал с Москвой только по настройке машины
export function periodKey(now: Date = new Date()): string {
  return new Date(now.getTime() + 3 * 3600000).toISOString().slice(0, 7)
}


// Сколько материалов засчитано против лимита тарифа (fix/tarify, 12.11). У бесплатного пробные «без срока»
// (витрина lib/pricing.ts: 10 материалов без срока): складываем счетчик за все месяцы. У платных лимит месячный
// по календарю: только текущий месяц. Сам счетчик пишется по месяцам как раньше (incrementText), таблица та же.
// Ошибка чтения бросается: иначе при сбое базы сумма 0 и лимит молча открыт (ревью 12.11); canConsume отказывает.
export async function usedForLimit(db: SupabaseClient, userId: string, planCode: string, windowKey?: string | null): Promise<number> {
  let q = db.from('text_usage_counter').select('count').eq('user_id', userId)
  // пробный: все календарные месяцы, без окон оплаченных подписок (иначе после конца подписки ее материалы съели бы пробные)
  if (planCode === 'free') q = q.not('period', 'like', 'w%')
  else q = q.eq('period', windowKey || periodKey())
  const { data, error } = await q
  if (error) throw new Error(`text_usage_counter: ${error.code || 'read_failed'}`)
  return (data || []).reduce((s: number, r: any) => s + (Number(r?.count) || 0), 0)
}

// Атомарный +1 к счетчику материалов (12.11): SQL-функция increment_text_usage (миграция 20261112100100) делает
// insert ... on conflict do update set count = count + 1 одной операцией, параллельные списания не теряются.
// Выкатка кода раньше миграции ничего не ломает: если функции нет (PGRST202 у PostgREST, 42883 у Postgres),
// идем запасным путем (чтение и upsert, как было до 12.11; гонка там остается).
// Запасной путь: сбой чтения не превращается в «было 0», иначе upsert записал бы 1 поверх настоящего счетчика
// и обнулил лимит (ревью 12.11), запись пропускается. Никогда не бросает: текст уже отдан. В журнал только код.
const NO_FUNCTION_CODES = new Set(['PGRST202', '42883'])
export function isMissingFunction(err: any): boolean {
  if (!err) return false
  if (NO_FUNCTION_CODES.has(String(err.code || ''))) return true
  // старые PostgREST отдают 404 без кода с текстом про schema cache
  return /could not find the function|function .* does not exist/i.test(String(err.message || ''))
}

export async function incrementText(db: SupabaseClient, userId: string, period: string = periodKey()): Promise<void> {
  try {
    const { error } = await db.rpc('increment_text_usage', { p_user_id: userId, p_period: period })
    if (!error) return
    if (!isMissingFunction(error)) { console.warn('incrementText: счетчик не записан', error.code || 'без кода'); return }
  } catch (e: any) {
    console.warn('incrementText: rpc упал', String(e?.code || e?.name || 'без кода').slice(0, 40)); return
  }
  try {
    const { data, error } = await db.from('text_usage_counter').select('count').eq('user_id', userId).eq('period', period).maybeSingle()
    if (error) { console.warn('incrementText: счетчик не прочитан, запись пропущена', error.code || 'без кода'); return }
    const { error: upErr } = await db.from('text_usage_counter').upsert(
      { user_id: userId, period, count: (data?.count ?? 0) + 1 },
      { onConflict: 'user_id,period' }
    )
    if (upErr) console.warn('incrementText: счетчик не записан', upErr.code || 'без кода')
  } catch (e: any) {
    console.warn('incrementText: запасной путь упал', String(e?.code || e?.name || 'без кода').slice(0, 40))
  }
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

export interface OpenAIUsage {
  prompt_tokens?: number
  completion_tokens?: number
  prompt_tokens_details?: { cached_tokens?: number }
}

// Запись РЕАЛЬНОГО расхода токенов и себестоимости (по факту из ответа OpenAI).
// Токены — точные; цена за токен — стартовая константа (см. PRICE_* выше).
export async function logAiUsage(userId: string, operation: string, model: string, usage?: OpenAIUsage): Promise<void> {
  if (!userId || !usage) return
  const prompt = usage.prompt_tokens ?? 0
  const completion = usage.completion_tokens ?? 0
  const cached = usage.prompt_tokens_details?.cached_tokens ?? 0
  const nonCached = Math.max(0, prompt - cached)
  const [pIn, pCached, pOut] = MODEL_PRICES[model] || [PRICE_INPUT_PER_M, PRICE_CACHED_INPUT_PER_M, PRICE_OUTPUT_PER_M]
  const usd =
    (nonCached / 1e6) * pIn +
    (cached / 1e6) * pCached +
    (completion / 1e6) * pOut
  await admin().from('usage_log').insert({
    user_id: userId,
    operation,
    model,
    prompt_tokens: prompt,
    completion_tokens: completion,
    cached_tokens: cached,
    real_cost_usd: Math.round(usd * 1e6) / 1e6,
    real_cost_rub: Math.round(usd * USD_TO_RUB_DRAFT * 10000) / 10000,
    energy_charged: 0,
    would_charge: 0,
  })
}

// ───────────────────────────────────────────────────────────────────────────
// canConsume — РЕШЕНИЕ «можно ли», БЕЗ списания (вызывать ДО работы).
// ───────────────────────────────────────────────────────────────────────────
// units: сколько текстов сразу (набор форматов из одной мысли, 04.10). По умолчанию 1, поведение прежнее.
export async function canConsume(userId: string, operation: string, units = 1): Promise<Decision> {
  return canConsumeWith(admin(), userId, operation, units)
}

// Отказ по лимиту текстов: одни и те же тексты для резерва и старого пути
function textLimitRefusal(planCode: string, cap: number, used: number, operation: string): Decision {
  if (used >= cap) {
    // у бесплатного «пробные» (витрина: 10 без срока), у платных лимит месячный по календарю (periodKey). Тексты copywriter-psycont 11.11:
    // их же показывает новый «Сделать» (MakeFlow friendly), поэтому без глаголов от первого лица и без рода
    const message = planCode === 'free' ? LIMIT_REFUSAL.trial(cap) : LIMIT_REFUSAL.month
    return { ok: false, mode: 'text', operation, cost: 0, reason: 'text_limit', message }
  }
  // число показываем только на бесплатном (там «N из 10» и так видно); у платных потолок скрытый
  const left = cap - used
  const message = planCode === 'free'
    ? `Пробных хватит еще на ${left} ${left % 10 === 1 && left % 100 !== 11 ? 'текст' : left % 10 >= 2 && left % 10 <= 4 && (left % 100 < 12 || left % 100 > 14) ? 'текста' : 'текстов'}, а форматов выбрано больше. Убери лишние и нажми еще раз.`
    : 'На столько форматов текстов в этом месяце не хватит. Убери лишние и нажми еще раз.'
  return { ok: false, mode: 'text', operation, cost: 0, reason: 'text_limit_partial', message }
}

const TEXT_READ_FAILED = 'Не получилось проверить остаток текстов. Попробуй еще раз через минуту.'

// Резерв текстов (20.11): проверка и бронь одной SQL-функцией под замком пользователя, поэтому две вкладки
// при остатке 1 не проходят обе. null: функции еще нет (код раньше миграции), тогда старый путь.
async function reserveText(db: SupabaseClient, userId: string, plan: PlanCtx, cap: number, units: number, operation: string): Promise<Decision | null> {
  const period = plan.code === 'free' ? periodKey() : (plan.windowKey || periodKey())
  let data: any, error: any
  try {
    ({ data, error } = await db.rpc('reserve_text_usage', { p_user_id: userId, p_period: period, p_cap: cap, p_units: units, p_free: plan.code === 'free' }))
  } catch (e: any) {
    error = e
  }
  if (error && isMissingFunction(error)) return null
  const used = Number(data?.used)
  if (error || !data || typeof data.ok !== 'boolean' || !Number.isFinite(used)) {
    // сбой резерва: не пускаем молча мимо лимита, как при сбое чтения счетчика
    console.warn('canConsume: резерв материалов не взят', errTag(error || { code: 'bad_reply' }))
    return { ok: false, mode: 'text', operation, cost: 0, reason: 'server_error', message: TEXT_READ_FAILED }
  }
  if (!data.ok) return textLimitRefusal(plan.code, cap, used, operation)
  return { ok: true, mode: 'text', operation, cost: 0, reserveId: String(data.id), reserveUser: userId, period }
}

// То же с подменяемым клиентом базы (тесты без сети: scripts/test-limit-reserve.ts)
export async function canConsumeWith(db: SupabaseClient, userId: string, operation: string, units = 1): Promise<Decision> {
  const op = OPERATIONS[operation]
  if (!op) return { ok: false, mode: 'blocked', operation, cost: 0, reason: 'unknown_operation', message: 'Неизвестная операция' }

  const plan = await getPlanForUser(db, userId)
  // limit_hit в каждой ветке отказа: без await, запись событий не задерживает решение
  const refuse = (d: Decision): Decision => { serverTrack(userId, 'limit_hit', { reason: d.reason || 'limit', plan: plan.code, op: operation }); return d }

  if (op.kind === 'text') {
    const cap = plan.fair_use_text_cap
    if (cap === null || cap === undefined) return { ok: true, mode: 'text', operation, cost: 0 }
    const n = Math.max(1, Math.floor(Number(units) || 1))
    const reserved = await reserveText(db, userId, plan, cap, n, operation)
    if (reserved) return reserved.ok || reserved.reason === 'server_error' ? reserved : refuse(reserved)
    // запасной путь (миграции резерва еще нет): чтение счетчика без брони, гонка двух вкладок тут остается
    let count: number
    try {
      count = await usedForLimit(db, userId, plan.code, plan.windowKey)
    } catch (e: any) {
      // счетчик не прочитался (сбой базы): не пускаем молча мимо лимита; новый «Сделать» покажет свой текст о сбое
      console.warn('canConsume: счетчик материалов не прочитан', errTag(e))
      return { ok: false, mode: 'text', operation, cost: 0, reason: 'server_error', message: TEXT_READ_FAILED }
    }
    if (count + n > cap) return refuse(textLimitRefusal(plan.code, cap, count, operation))
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
      ? 'Пробный разбор конкурента уже был. Глубокий разбор есть на платном тарифе.'
      : 'Глубокий разбор конкурента в твой тариф не входит. Он есть на тарифе выше.'
    return refuse({ ok: false, mode: 'blocked', operation, cost, reason: 'no_access', message })
  }

  if (trialLeft) return { ok: true, mode: 'trial', operation, cost }

  const balance = await getBalance(userId)
  if (balance < cost) {
    const message = plan.code === 'free'
      ? 'Пробный разбор конкурента уже был. Глубокий разбор есть на платном тарифе.'
      : 'На разбор конкурента не хватает остатка на этот месяц. Он обновится в начале месяца, а еще можно перейти на тариф выше.'
    return refuse({ ok: false, mode: 'blocked', operation, cost, reason: 'insufficient', message, balance })
  }
  return { ok: true, mode: 'charge', operation, cost, balance }
}

// ───────────────────────────────────────────────────────────────────────────
// commitConsume — ПРИМЕНИТЬ списание/пробу (вызывать ТОЛЬКО при успехе работы).
// ───────────────────────────────────────────────────────────────────────────
export async function commitConsume(userId: string, operation: string, decision: Decision): Promise<{ ok: boolean; balance?: number }> {
  return commitConsumeWith(admin(), userId, operation, decision)
}

// Списание одного материала из резерва: +1 к счетчику и -1 от брони одной SQL-функцией. Никогда не бросает:
// текст уже отдан. Набор форматов зовет commitConsume на каждый записанный формат с тем же decision.
// Ошибка не про отсутствие функции (сеть, таймаут, занятая база): бронь НЕ отпускаем (место держится, пока она не
// истечет через 15 минут, лимит не обходится) и пробуем еще раз. Ошибка вызова в Postgres откатывает всю функцию,
// поэтому повтор после ошибки не дает двойного +1; двойной счет возможен только если ответ потерялся после успеха.
async function commitTextReserve(db: SupabaseClient, userId: string, decision: Decision): Promise<void> {
  const args = { p_id: decision.reserveId, p_user_id: userId, p_period: decision.period || periodKey(), p_units: 1 }
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const { error } = await db.rpc('commit_text_reserve', args)
      if (!error) return
      // функцию откатили, а резерв остался от прошлой версии: считаем старым способом, чтобы материал не потерялся
      if (isMissingFunction(error)) { await incrementText(db, userId, decision.period || periodKey()); return }
      console.warn(`commitConsume: материал из резерва не записан, попытка ${attempt}`, errTag(error))
    } catch (e: any) {
      console.warn(`commitConsume: rpc резерва упал, попытка ${attempt}`, errTag(e))
    }
  }
}

export async function commitConsumeWith(db: SupabaseClient, userId: string, operation: string, decision: Decision): Promise<{ ok: boolean; balance?: number }> {
  const op = OPERATIONS[operation]
  const realCost = op?.realCostUsd ?? 0
  const cost = decision.cost

  if (decision.mode === 'text' && decision.reserveId) {
    await commitTextReserve(db, userId, decision)
    await logUsage(db, userId, operation, 0, 0, realCost)
    return { ok: true }
  }
  if (decision.mode === 'text') {
    // ключ счетчика тот же, по которому считался лимит: окно оплаченной подписки или календарный месяц
    const ctx = await getPlanForUser(db, userId).catch(() => null)
    await incrementText(db, userId, ctx?.windowKey || periodKey())
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

// Отпустить остаток резерва текстов (текст не выдан или набор форматов закончился). Звать на любом исходе
// после canConsume: после полного списания резерва уже нет, вызов ничего не делает. Никогда не бросает;
// если не позвали, резерв истечет сам через 15 минут.
export async function releaseConsume(decision: Decision | null | undefined): Promise<void> {
  if (!decision?.reserveId) return
  try { await releaseConsumeWith(admin(), decision) } catch (e: any) { console.warn('releaseConsume:', errTag(e)) }
}

export async function releaseConsumeWith(db: SupabaseClient, decision: Decision | null | undefined): Promise<void> {
  const id = decision?.reserveId
  if (!id || !decision?.reserveUser) return
  try {
    // функция удаляет резерв только с тем же user_id
    const { error } = await db.rpc('release_text_reserve', { p_id: id, p_user_id: decision.reserveUser })
    if (error && !isMissingFunction(error)) console.warn('releaseConsume: резерв не отпущен', errTag(error))
  } catch (e: any) {
    console.warn('releaseConsume: rpc упал', errTag(e))
  }
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

// ───────────────────────────────────────────────────────────────────────────
// getAccountSummary — read-only сводка для интерфейса (тариф + энергия + у Free
// остаток проб текста). СТРОГО ТОЛЬКО ЧТЕНИЕ: ничего не списывает и не пополняет.
// Скрытый счётчик текста у ПЛАТНЫХ и usage_log клиенту НЕ отдаём (по CLAUDE.md).
// ───────────────────────────────────────────────────────────────────────────
export interface AccountSummary {
  plan: { code: string; name: string; isUnlimited: boolean; deepAnalysis: boolean }
  energy: { balance: number; monthlyAllowance: number; nextRefill: string | null } | null
  textTrial: { remaining: number; cap: number } | null
  // Остаток материалов для показа (16.11, блок 1 запуска): пробный «без срока» или месячный у платных.
  // null: тариф без предела (Тест) или счетчик не прочитался (тогда остаток просто не показываем)
  // used: сколько засчитано против лимита (для карточки /admin, 26.11)
  materials: { remaining: number; cap: number; used: number; kind: 'trial' | 'month' } | null
  // счетчик должен был быть, но не прочитался (сбой базы): отличает это от тарифа без предела
  materialsUnread: boolean
}

export async function getAccountSummary(userId: string): Promise<AccountSummary> {
  const db = admin()
  const plan = await getPlanForUser(db, userId)

  // Энергию показываем только тарифам с месячным пулом (платные, не безлимит).
  let energy: AccountSummary['energy'] = null
  if (!plan.is_unlimited && plan.energy_per_month > 0) {
    const { data: w } = await db
      .from('energy_wallet')
      .select('balance, monthly_allowance, next_refill')
      .eq('user_id', userId)
      .maybeSingle()
    // Read-only: если срок пополнения прошёл, показываем месячную норму (пополнение
    // реально произойдёт при следующей операции — здесь ничего не пишем).
    const allowance = w?.monthly_allowance ?? plan.energy_per_month
    const due = w?.next_refill ? new Date(w.next_refill) <= new Date() : false
    energy = {
      balance: due ? allowance : (w?.balance ?? 0),
      monthlyAllowance: allowance,
      nextRefill: w?.next_refill ?? null,
    }
  }

  // Остаток проб текста только для Free (витрина «N из 10»). Платным остаток отдается ниже в materials (kind month),
  // тарифу Тест не показываем.
  let textTrial: AccountSummary['textTrial'] = null
  let trialUsed = 0
  let unread = false
  if (plan.code === 'free' && plan.fair_use_text_cap != null) {
    // сводка не должна падать из-за сбоя чтения счетчика: тогда остаток просто не показываем
    const used = await usedForLimit(db, userId, plan.code, plan.windowKey).catch(() => null)
    if (used !== null) textTrial = { remaining: Math.max(0, plan.fair_use_text_cap - used), cap: plan.fair_use_text_cap }
    if (used !== null) trialUsed = used
    else unread = true
  }

  let materials: AccountSummary['materials'] = null
  if (plan.code === 'free') materials = textTrial ? { ...textTrial, used: trialUsed, kind: 'trial' } : null
  else if (!plan.is_unlimited && plan.fair_use_text_cap != null) {
    const used = await usedForLimit(db, userId, plan.code, plan.windowKey).catch(() => null)
    if (used !== null) materials = { remaining: Math.max(0, plan.fair_use_text_cap - used), cap: plan.fair_use_text_cap, used, kind: 'month' }
    else unread = true
  }

  return {
    plan: { code: plan.code, name: plan.name, isUnlimited: plan.is_unlimited, deepAnalysis: plan.deep_analysis },
    energy,
    textTrial,
    materials,
    materialsUnread: unread,
  }
}
