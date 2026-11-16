// Логика оплаты PsyCont (17.11, feat/oplata). Чистая: база, ЮKassa, письма и часы приходят зависимостями,
// поэтому все сценарии проверяет scripts/test-oplata.ts без базы и без ЮKassa. Боевые зависимости в lib/billing/deps.ts.
//
// Главные правила (оферта /offer и задача Арины 17.11):
// - тариф включает только подтвержденный платеж: вебхук или сверка по таймеру, и всегда по ответу GET /payments/{id};
// - каждый платеж обрабатывается один раз: статус меняется условным update (только из pending), второй вызов ничего не делает;
// - автопродление только с отдельным согласием (галочка не стоит заранее) и только если ЮKassa сохранила способ оплаты;
// - продление в день окончания окна; неудача: письмо, повторы через 1 и через 3 дня, потом тариф не продлевается;
// - «Отключить автопродление» и «Удалить карту» срабатывают сразу, доступ остается до конца оплаченного окна;
// - возврат за оставшиеся дни (lib/billing/period.ts), тариф выключается в день возврата.
import { rub, methodTitle, type YkClient, type YkPayment } from './yookassa'
import { addMonthAnchored, anchorDayOf, refundByDays } from './period'
import { isYooKassaIp } from './ip'

export const PAID_PLANS = { start: { code: 'start', name: 'Спокойный ритм', price: 1290 }, practice: { code: 'practice', name: 'Каждый день', price: 2490 } } as const
export type PaidCode = keyof typeof PAID_PLANS
export const isPaidCode = (v: unknown): v is PaidCode => v === 'start' || v === 'practice'

// Повторы продления: первая попытка в день окончания окна, потом через 1 день и еще через 2 (то есть на 3-й день)
export const RETRY_AFTER_HOURS = [24, 48]
export const REMIND_BEFORE_HOURS = 72
const H = 3600000

export type SubRow = {
  user_id: string; plan_code: string; status: 'trial' | 'active' | 'past_due' | 'canceled' | 'expired'
  period_start: string | null; period_end: string | null; auto_renew: boolean; payment_method_id: string | null
  next_charge_at: string | null; retry_count: number; reminder_sent_for: string | null; billing_anchor_day: number | null
}
export type PaymentRow = {
  id: string; user_id: string | null; email: string | null; yk_payment_id: string | null; kind: 'first' | 'renewal'; plan_code: string
  amount: number; status: 'pending' | 'waiting_for_capture' | 'succeeded' | 'canceled'; save_requested: boolean
  idempotence_key: string; attempt: number; period_start: string | null; period_end: string | null; created_at: string
  payment_method_id: string | null; receipt_status: string
}
export type MethodRow = { id: string; user_id: string; yk_method_id: string; type: string; title: string; deleted_at: string | null }

export interface Repo {
  getSub(userId: string): Promise<SubRow | null>
  updateSub(userId: string, patch: Partial<SubRow>): Promise<void>
  insertPayment(row: Omit<PaymentRow, 'id' | 'created_at' | 'yk_payment_id' | 'status' | 'period_start' | 'period_end' | 'payment_method_id' | 'receipt_status'>): Promise<PaymentRow>
  getPaymentByKey(idempotenceKey: string): Promise<PaymentRow | null>
  getPayment(id: string): Promise<PaymentRow | null>
  getPaymentByYk(ykId: string): Promise<PaymentRow | null>
  // условное обновление: меняет строку, только если ее статус в onlyFrom; иначе null (уже обработано)
  updatePayment(id: string, patch: Record<string, unknown>, onlyFrom?: PaymentRow['status'][]): Promise<PaymentRow | null>
  upsertMethod(userId: string, ykId: string, type: string, title: string, last4: string | null): Promise<MethodRow>
  getMethod(id: string): Promise<MethodRow | null>
  deleteMethods(userId: string, at: string): Promise<void>
  insertConsent(row: { user_id: string; plan_code: string; amount: number; consent_text: string; offer_version: string; ip: string | null; payment_id: string }): Promise<void>
  claimEvent(key: string, event: string, objectId: string): Promise<boolean>   // false: уже обработано
  finishEvent(key: string, result: string): Promise<void>
  subsToRemind(nowIso: string, untilIso: string): Promise<SubRow[]>
  subsToCharge(nowIso: string): Promise<SubRow[]>
  subsToExpire(nowIso: string): Promise<SubRow[]>
  stalePayments(olderThanIso: string, newerThanIso: string): Promise<PaymentRow[]>
  lastPaid(userId: string): Promise<PaymentRow | null>
  insertRefund(row: { payment_id: string; user_id: string | null; amount: number; days_left: number; days_total: number; idempotence_key: string }): Promise<{ id: string }>
  updateRefund(id: string, patch: Record<string, unknown>): Promise<void>
  getRefundByYk(ykId: string): Promise<{ id: string; payment_id: string; status: string } | null>
  userEmail(userId: string): Promise<string | null>
}

export type MailKind = 'paid' | 'reminder' | 'charge_failed' | 'charge_failed_final' | 'autorenew_off' | 'refund'
export interface Deps {
  now(): Date
  repo: Repo
  yk: YkClient
  mail(kind: MailKind, to: string, data: Record<string, string>): Promise<void>
  track?(userId: string | null, event: string, props: Record<string, unknown>): void
  siteUrl: string
  offerVersion: string
}

// Текст согласия на автопродление: показывается у галочки и пишется в базу дословно (autopay_consents.consent_text)
export function consentText(plan: { name: string; price: number }): string {
  const p = plan.price.toLocaleString('ru-RU').replace(/\s/g, ' ')
  return `Даю согласие на автопродление тарифа «${plan.name}»: каждый месяц в день первой оплаты с сохраненного способа оплаты будет списываться ${p} ₽, пока я не отключу автопродление. За 3 дня до списания придет письмо. Отключить автопродление или удалить способ оплаты можно в «Профиле» в любой момент, это срабатывает сразу.`
}

const iso = (d: Date) => d.toISOString()
const money = (n: number) => `${n.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).replace(/\s/g, ' ')} ₽`
const dateRu = (d: string | Date) => new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', timeZone: 'Europe/Moscow' })

// Подписка считается платной, пока окно не кончилось: и после «Отключить автопродление», и во время повторов нет
export function paidAccess(sub: SubRow | null, now: Date): boolean {
  return !!sub && sub.plan_code !== 'free' && sub.status !== 'expired' && !!sub.period_end && new Date(sub.period_end) > now
}

// ── 1. Переход к оплате ──
export async function startCheckout(d: Deps, a: { userId: string; email: string | null; plan: string; autoRenew: boolean; via: 'sbp' | 'any'; ip: string | null }):
  Promise<{ ok: true; url: string; paymentId: string } | { ok: false; error: 'bad_plan' | 'already_paid' | 'yookassa' }> {
  if (!isPaidCode(a.plan)) return { ok: false, error: 'bad_plan' }
  const plan = PAID_PLANS[a.plan]
  const now = d.now()
  const sub = await d.repo.getSub(a.userId)
  if (paidAccess(sub, now) && sub!.status === 'active') return { ok: false, error: 'already_paid' }
  const key = `first:${a.userId}:${crypto.randomUUID()}`
  const row = await d.repo.insertPayment({ user_id: a.userId, email: a.email, kind: 'first', plan_code: plan.code, amount: plan.price, save_requested: a.autoRenew, idempotence_key: key, attempt: 1 })
  if (a.autoRenew) await d.repo.insertConsent({ user_id: a.userId, plan_code: plan.code, amount: plan.price, consent_text: consentText(plan), offer_version: d.offerVersion, ip: a.ip, payment_id: row.id })
  try {
    const p = await d.yk.createPayment({
      amount: rub(plan.price),
      capture: true,
      confirmation: { type: 'redirect', return_url: `${d.siteUrl}/dashboard/oplata/itog?p=${row.id}` },
      description: `PsyCont, тариф «${plan.name}», месяц доступа`,
      metadata: { payment_row: row.id },
      ...(a.autoRenew ? { save_payment_method: true } : {}),
      ...(a.via === 'sbp' ? { payment_method_data: { type: 'sbp' } } : {}),
    }, key)
    await d.repo.updatePayment(row.id, { yk_payment_id: p.id, updated_at: iso(now) })
    const url = p.confirmation?.confirmation_url
    if (!url || !/^https:\/\//.test(url)) return { ok: false, error: 'yookassa' }
    d.track?.(a.userId, 'pay_start', { plan: plan.code, auto: a.autoRenew, via: a.via })
    return { ok: true, url, paymentId: row.id }
  } catch {
    await d.repo.updatePayment(row.id, { status: 'canceled', cancellation_reason: 'create_failed', updated_at: iso(now) }, ['pending'])
    return { ok: false, error: 'yookassa' }
  }
}

// ── 2. Платеж по ответу API (вебхук, сверка, продление). Ровно один раз на платеж ──
export async function processPayment(d: Deps, api: YkPayment): Promise<string> {
  const row = (await d.repo.getPaymentByYk(api.id)) || (api.metadata?.payment_row ? await d.repo.getPayment(api.metadata.payment_row) : null)
  if (!row) return 'unknown_payment'
  if (Number(api.amount?.value) !== Number(row.amount) || api.amount?.currency !== 'RUB') return 'amount_mismatch'
  const now = d.now()
  if (api.status === 'succeeded' && api.paid) {
    const won = await d.repo.updatePayment(row.id, { status: 'succeeded', paid_at: iso(now), method_type: api.payment_method?.type || null, yk_payment_id: api.id, updated_at: iso(now) }, ['pending', 'waiting_for_capture'])
    if (!won) return 'already'
    if (!row.user_id) return 'no_user' // аккаунт удален, пока платеж шел: деньги вернуть руками из /admin
    const sub = await d.repo.getSub(row.user_id)
    // способ оплаты сохраняем, только если человек дал согласие и ЮKassa его сохранила
    let methodId: string | null = null
    if (row.kind === 'first' && row.save_requested && api.payment_method?.saved && api.payment_method.id) {
      const m = await d.repo.upsertMethod(row.user_id, api.payment_method.id, api.payment_method.type, methodTitle(api.payment_method), api.payment_method.card?.last4 || null)
      methodId = m.id
    } else if (row.kind === 'renewal') methodId = row.payment_method_id
    // окно: продление начинается с конца прошлого окна, если оно еще не кончилось; иначе с момента оплаты
    const prevEnd = sub?.period_end ? new Date(sub.period_end) : null
    const start = row.kind === 'renewal' && prevEnd && prevEnd.getTime() >= now.getTime() - 6 * H ? prevEnd : now
    const anchor = row.kind === 'first' || !sub?.billing_anchor_day ? anchorDayOf(start) : sub.billing_anchor_day
    const end = addMonthAnchored(start, anchor)
    const autoRenew = row.kind === 'first' ? !!methodId : !!(sub?.auto_renew && methodId)
    await d.repo.updateSub(row.user_id, {
      plan_code: row.plan_code, status: 'active', period_start: iso(start), period_end: iso(end), billing_anchor_day: anchor,
      auto_renew: autoRenew, payment_method_id: methodId ?? (row.kind === 'first' ? null : sub?.payment_method_id ?? null),
      next_charge_at: autoRenew ? iso(end) : null, retry_count: 0,
    })
    await d.repo.updatePayment(row.id, { period_start: iso(start), period_end: iso(end), payment_method_id: methodId, receipt_status: 'need' })
    const to = row.email || await d.repo.userEmail(row.user_id)
    if (to) await d.mail('paid', to, { plan: PAID_PLANS[row.plan_code as PaidCode]?.name || row.plan_code, amount: money(row.amount), until: dateRu(end), next: autoRenew ? `Следующее списание ${dateRu(end)}, ${money(row.amount)}` : 'Автопродление выключено' }).catch(() => {})
    d.track?.(row.user_id, 'pay_done', { plan: row.plan_code, kind: row.kind, via: api.payment_method?.type || 'unknown' })
    return row.kind === 'first' ? 'activated' : 'renewed'
  }
  if (api.status === 'canceled') {
    const reason = String(api.cancellation_details?.reason || 'unknown').replace(/[^a-z_]/gi, '').slice(0, 40)
    const won = await d.repo.updatePayment(row.id, { status: 'canceled', cancellation_reason: reason, yk_payment_id: api.id, updated_at: iso(now) }, ['pending', 'waiting_for_capture'])
    if (!won) return 'already'
    d.track?.(row.user_id, 'pay_failed', { kind: row.kind, reason })
    if (row.kind === 'renewal' && row.user_id) return renewalFailed(d, row, reason)
    return 'canceled'
  }
  return 'pending'
}

async function renewalFailed(d: Deps, row: PaymentRow, reason: string): Promise<string> {
  const now = d.now()
  const sub = await d.repo.getSub(row.user_id!)
  if (!sub) return 'no_sub'
  const tries = (sub.retry_count || 0)
  const to = row.email || await d.repo.userEmail(row.user_id!)
  const planName = PAID_PLANS[row.plan_code as PaidCode]?.name || row.plan_code
  // способ оплаты больше не работает (человек отозвал разрешение, карта закрыта): повторять бессмысленно
  const hopeless = ['permission_revoked', 'card_expired', 'payment_method_restricted', 'issuer_unavailable_permanently'].includes(reason)
  if (tries < RETRY_AFTER_HOURS.length && !hopeless) {
    const next = new Date(now.getTime() + RETRY_AFTER_HOURS[tries] * H)
    await d.repo.updateSub(row.user_id!, { status: 'past_due', retry_count: tries + 1, next_charge_at: iso(next) })
    if (to) await d.mail('charge_failed', to, { plan: planName, amount: money(row.amount), retry: dateRu(next) }).catch(() => {})
    return 'retry_scheduled'
  }
  await d.repo.updateSub(row.user_id!, { status: 'expired', plan_code: 'free', auto_renew: false, next_charge_at: null, retry_count: tries + 1 })
  if (to) await d.mail('charge_failed_final', to, { plan: planName, amount: money(row.amount) }).catch(() => {})
  return 'expired_after_retries'
}

// ── 3. Вебхук: адрес ЮKassa, событие один раз, объект всегда перезапрашиваем ──
export async function handleWebhook(d: Deps, ip: string, body: any): Promise<{ status: number; result: string }> {
  if (!isYooKassaIp(ip)) return { status: 403, result: 'bad_ip' }
  const event = String(body?.event || '')
  const id = String(body?.object?.id || '')
  if (!/^[a-z_.]{3,40}$/.test(event) || !/^[A-Za-z0-9_-]{8,80}$/.test(id)) return { status: 400, result: 'bad_body' }
  const key = `${event}:${id}:${String(body?.object?.status || '').slice(0, 30)}`
  if (!(await d.repo.claimEvent(key, event, id))) return { status: 200, result: 'duplicate' }
  let result = 'ignored'
  try {
    if (event.startsWith('payment.')) result = await processPayment(d, await d.yk.getPayment(id))
    else if (event === 'refund.succeeded') {
      const r = await d.yk.getRefund(id)
      const ours = await d.repo.getRefundByYk(r.id)
      if (ours) { await d.repo.updateRefund(ours.id, { status: r.status, updated_at: iso(d.now()) }); result = 'refund_' + r.status } else result = 'unknown_refund'
    }
  } catch {
    // событие не отмечаем обработанным: ЮKassa повторит уведомление, обработка идемпотентна
    return { status: 500, result: 'error' }
  }
  await d.repo.finishEvent(key, result)
  return { status: 200, result }
}

// ── 4. Таймер: сверка зависших, письма за 3 дня, продления, окончание окна ──
export async function runBilling(d: Deps): Promise<Record<string, number>> {
  const now = d.now()
  const out = { reconciled: 0, reminded: 0, charged: 0, failed: 0, expired: 0, errors: 0 }
  // 4.1 платежи без ответа дольше 10 минут (вебхук потерялся): сверяем по API, тариф включает только ответ API
  for (const p of await d.repo.stalePayments(iso(new Date(now.getTime() - 10 * 60000)), iso(new Date(now.getTime() - 3 * 24 * H)))) {
    if (!p.yk_payment_id) continue
    try { const r = await processPayment(d, await d.yk.getPayment(p.yk_payment_id)); if (r !== 'pending') out.reconciled++ } catch { out.errors++ }
  }
  // 4.2 письмо за 3 дня до списания (один раз на дату списания)
  for (const s of await d.repo.subsToRemind(iso(now), iso(new Date(now.getTime() + REMIND_BEFORE_HOURS * H)))) {
    if (!s.next_charge_at || s.reminder_sent_for === s.next_charge_at) continue
    const to = await d.repo.userEmail(s.user_id)
    const plan = PAID_PLANS[s.plan_code as PaidCode]
    if (to && plan) await d.mail('reminder', to, { plan: plan.name, amount: money(plan.price), date: dateRu(s.next_charge_at) }).catch(() => {})
    await d.repo.updateSub(s.user_id, { reminder_sent_for: s.next_charge_at })
    out.reminded++
  }
  // 4.3 продления по сохраненному способу
  for (const s of await d.repo.subsToCharge(iso(now))) {
    try {
      const plan = PAID_PLANS[s.plan_code as PaidCode]
      const m = s.payment_method_id ? await d.repo.getMethod(s.payment_method_id) : null
      if (!plan || !m || m.deleted_at || !s.auto_renew) { await d.repo.updateSub(s.user_id, { auto_renew: false, next_charge_at: null }); continue }
      // ключ на попытку: повтор таймера в ту же попытку вернет тот же платеж ЮKassa, второго списания не будет
      const key = `renew:${s.user_id}:${s.period_end}:${(s.retry_count || 0) + 1}`
      let row = await d.repo.getPaymentByKey(key)
      if (!row) row = await d.repo.insertPayment({ user_id: s.user_id, email: await d.repo.userEmail(s.user_id), kind: 'renewal', plan_code: plan.code, amount: plan.price, save_requested: true, idempotence_key: key, attempt: (s.retry_count || 0) + 1 })
      if (row.status !== 'pending') continue
      await d.repo.updatePayment(row.id, { payment_method_id: m.id })
      row.payment_method_id = m.id
      const p = await d.yk.createPayment({ amount: rub(plan.price), capture: true, payment_method_id: m.yk_method_id, description: `PsyCont, тариф «${plan.name}», продление на месяц`, metadata: { payment_row: row.id } }, key)
      await d.repo.updatePayment(row.id, { yk_payment_id: p.id })
      const r = await processPayment(d, p)
      if (r === 'renewed') out.charged++; else if (r !== 'pending') out.failed++
    } catch { out.errors++ }
  }
  // 4.4 окно кончилось, продления нет (автопродление выключено или нет способа): тариф снова пробный
  for (const s of await d.repo.subsToExpire(iso(now))) {
    await d.repo.updateSub(s.user_id, { status: 'expired', plan_code: 'free', auto_renew: false, next_charge_at: null })
    out.expired++
  }
  return out
}

// ── 5. Профиль: сразу, без писем в поддержку ──
export async function disableAutoRenew(d: Deps, userId: string): Promise<'ok' | 'nothing'> {
  const sub = await d.repo.getSub(userId)
  if (!sub || !sub.auto_renew) return 'nothing'
  await d.repo.updateSub(userId, { auto_renew: false, next_charge_at: null, status: sub.status === 'past_due' ? 'expired' : 'canceled', ...(sub.status === 'past_due' ? { plan_code: 'free' } : {}) })
  const to = await d.repo.userEmail(userId)
  if (to && sub.period_end) await d.mail('autorenew_off', to, { until: dateRu(sub.period_end) }).catch(() => {})
  d.track?.(userId, 'pay_autorenew_off', {})
  return 'ok'
}

export async function deletePaymentMethod(d: Deps, userId: string): Promise<'ok'> {
  await disableAutoRenew(d, userId)
  await d.repo.deleteMethods(userId, iso(d.now()))
  await d.repo.updateSub(userId, { payment_method_id: null })
  d.track?.(userId, 'pay_method_delete', {})
  return 'ok'
}

// ── 6. /admin: возврат за оставшиеся дни, продлить, выключить ──
export async function refundRemaining(d: Deps, userId: string): Promise<{ ok: true; amount: number; daysLeft: number; daysTotal: number; status: string } | { ok: false; error: 'no_payment' | 'nothing_left' | 'yookassa' | 'already_refunded' }> {
  const now = d.now()
  const p = await d.repo.lastPaid(userId)
  if (!p || !p.period_start || !p.period_end || new Date(p.period_end) <= now) return { ok: false, error: 'no_payment' }
  const calc = refundByDays(Number(p.amount), new Date(p.period_start), new Date(p.period_end), now)
  if (calc.amount <= 0) return { ok: false, error: 'nothing_left' }
  const key = `refund:${p.id}`
  // один возврат на платеж: ключ уникален в базе, второй раз вставка падает
  let ref: { id: string }
  try { ref = await d.repo.insertRefund({ payment_id: p.id, user_id: userId, amount: calc.amount, days_left: calc.daysLeft, days_total: calc.daysTotal, idempotence_key: key }) }
  catch { return { ok: false, error: 'already_refunded' } }
  try {
    const r = await d.yk.createRefund({ payment_id: p.yk_payment_id, amount: rub(calc.amount), description: `Возврат за ${calc.daysLeft} из ${calc.daysTotal} дней` }, key)
    await d.repo.updateRefund(ref.id, { yk_refund_id: r.id, status: r.status, updated_at: iso(now) })
    // в день возврата тариф выключается (оферта); чек самозанятой аннулирует Арина и выбивает новый на удержанную сумму
    await d.repo.updateSub(userId, { status: 'expired', plan_code: 'free', auto_renew: false, next_charge_at: null, period_end: iso(now) })
    await d.repo.updatePayment(p.id, { receipt_status: 'annul_need' })
    const to = p.email || await d.repo.userEmail(userId)
    if (to) await d.mail('refund', to, { amount: money(calc.amount), days: String(calc.daysLeft) }).catch(() => {})
    return { ok: true, amount: calc.amount, daysLeft: calc.daysLeft, daysTotal: calc.daysTotal, status: r.status }
  } catch {
    await d.repo.updateRefund(ref.id, { status: 'canceled', updated_at: iso(now) })
    return { ok: false, error: 'yookassa' }
  }
}

export async function adminExtend(d: Deps, userId: string, days: number, plan: string): Promise<'ok' | 'bad'> {
  if (!Number.isInteger(days) || days < 1 || days > 62 || !isPaidCode(plan)) return 'bad'
  const now = d.now()
  const sub = await d.repo.getSub(userId)
  const base = sub && paidAccess(sub, now) ? new Date(sub.period_end!) : now
  const end = new Date(base.getTime() + days * 24 * H)
  await d.repo.updateSub(userId, { plan_code: plan, status: sub?.auto_renew ? 'active' : 'canceled', period_start: sub && paidAccess(sub, now) ? sub.period_start : iso(now), period_end: iso(end), ...(sub?.auto_renew ? { next_charge_at: iso(end) } : {}) })
  return 'ok'
}

export async function adminDisable(d: Deps, userId: string): Promise<'ok'> {
  await d.repo.updateSub(userId, { status: 'expired', plan_code: 'free', auto_renew: false, next_charge_at: null, period_end: iso(d.now()) })
  return 'ok'
}

// Удаление аккаунта с подпиской: сначала гасим автопродление и способ оплаты (lib/account-delete.ts)
export async function cancelBillingForDeletion(d: Deps, userId: string): Promise<void> {
  const sub = await d.repo.getSub(userId)
  if (sub?.auto_renew) await d.repo.updateSub(userId, { auto_renew: false, next_charge_at: null })
  await d.repo.deleteMethods(userId, iso(d.now()))
}
