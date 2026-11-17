// Логика оплаты PsyCont (17.11, feat/oplata). Чистая: база, ЮKassa, письма и часы приходят зависимостями,
// поэтому все сценарии проверяет scripts/test-oplata.ts без базы и без ЮKassa. Боевые зависимости в lib/billing/deps.ts.
//
// Главные правила (оферта /offer, задача Арины 17.11, ревью 17.11):
// - тариф включает только подтвержденный платеж: вебхук или сверка по таймеру, и всегда по ответу GET /payments/{id};
// - включение тарифа повторяемо и не ломается от сбоя посередине: окно платежа считается один раз и записывается
//   в строку платежа (period_start пустой -> заполнен), подписка ставится по этому окну (повтор дает то же самое),
//   и только потом платеж переводится в succeeded. Упало посередине: вебхук получит 500, ЮKassa повторит, сверка
//   таймером тоже подхватит (платеж все еще pending);
// - автопродление только с отдельным согласием (галочка не стоит заранее) и только если ЮKassa сохранила способ оплаты;
// - продление в день окончания окна, только после письма «за 3 дня»; неудача: повторы через 1 и 3 дня, потом конец;
// - «Отключить автопродление» и «Удалить карту» срабатывают сразу, доступ остается до конца оплаченного окна;
// - вторая оплата поверх живого окна не сжигает дни: окно складывается, платеж помечается для возврата в /admin;
// - возврат за оставшиеся дни (lib/billing/period.ts), тариф выключается в день возврата.
import { rub, methodTitle, type YkClient, type YkPayment } from './yookassa'
import { addMonthAnchored, anchorDayOf, refundByDays } from './period'
import { isYooKassaIp } from './ip'
import { PAID_PLANS, isPaidCode, consentText, type PaidCode } from './plans'
import { methodPhrase } from './mail-texts'

export { PAID_PLANS, isPaidCode, consentText, type PaidCode }

// Повторы продления: первая попытка в день окончания окна, потом через 1 день и еще через 2 (то есть на 3-й день)
export const RETRY_AFTER_HOURS = [24, 48]
export const REMIND_BEFORE_HOURS = 72
export const CREATE_LIMIT = { count: 5, minutes: 10 }  // переходов к оплате у одного человека
export const REUSE_PENDING_MIN = 15                     // свежий неоплаченный платеж отдаем снова, а не создаем новый
export const RENEW_STALE_HOURS = 20                     // ключ ЮKassa живет сутки: старше этого платеж не пересоздаем
export const CONSENT_KEEP_DAYS = 3 * 365 + 1             // согласия удаленных аккаунтов (решение Арины 17.11)
const H = 3600000
// причины, при которых повторять списание бессмысленно (документация ЮKassa, cancellation_details.reason)
const HOPELESS = ['permission_revoked', 'card_expired', 'payment_method_restricted']

export type SubRow = {
  user_id: string; plan_code: string; status: 'trial' | 'active' | 'past_due' | 'canceled' | 'expired'
  period_start: string | null; period_end: string | null; auto_renew: boolean; payment_method_id: string | null
  next_charge_at: string | null; retry_count: number; reminder_sent_for: string | null; billing_anchor_day: number | null
  next_plan_code?: string | null
}
export type PaymentRow = {
  id: string; user_id: string | null; email: string | null; yk_payment_id: string | null; kind: 'first' | 'renewal'; plan_code: string
  amount: number; status: 'pending' | 'waiting_for_capture' | 'succeeded' | 'canceled'; save_requested: boolean
  idempotence_key: string; attempt: number; period_start: string | null; period_end: string | null; created_at: string
  payment_method_id: string | null; receipt_status: string; confirmation_url?: string | null; note?: string | null
}
export type MethodRow = { id: string; user_id: string; yk_method_id: string; type: string; title: string; deleted_at: string | null; card_last4?: string | null }

export interface Repo {
  getSub(userId: string): Promise<SubRow | null>
  updateSub(userId: string, patch: Partial<SubRow>): Promise<void>
  // подписка по оплате: создает строку, если ее нет (триггер регистрации мог не отработать)
  upsertSub(userId: string, patch: Partial<SubRow>): Promise<void>
  insertPayment(row: Omit<PaymentRow, 'id' | 'created_at' | 'yk_payment_id' | 'status' | 'period_start' | 'period_end' | 'payment_method_id' | 'receipt_status'>): Promise<PaymentRow>
  getPaymentByKey(idempotenceKey: string): Promise<PaymentRow | null>
  getPayment(id: string): Promise<PaymentRow | null>
  getPaymentByYk(ykId: string): Promise<PaymentRow | null>
  // условное обновление: меняет строку, только если ее статус в onlyFrom; иначе null
  updatePayment(id: string, patch: Record<string, unknown>, onlyFrom?: PaymentRow['status'][]): Promise<PaymentRow | null>
  // окно платежа пишется один раз: только если period_start еще пустой; иначе null
  setWindowOnce(id: string, patch: Record<string, unknown>): Promise<PaymentRow | null>
  recentPayments(userId: string, sinceIso: string): Promise<PaymentRow[]>
  upsertMethod(userId: string, ykId: string, type: string, title: string, last4: string | null): Promise<MethodRow>
  getMethod(id: string): Promise<MethodRow | null>
  deleteMethods(userId: string): Promise<void>  // стирает строки с токеном (не пометка)
  insertConsent(row: { user_id: string; plan_code: string; amount: number; consent_text: string; offer_version: string; ip: string | null; payment_id: string | null }): Promise<void>
  // согласия удаленных аккаунтов старше срока (3 года) удаляются; возвращает, сколько удалено
  purgeOrphanConsents(beforeIso: string): Promise<number>
  claimEvent(key: string, event: string, objectId: string): Promise<boolean>   // false: уже обработано
  finishEvent(key: string, result: string): Promise<void>
  subsToRemind(nowIso: string, untilIso: string): Promise<SubRow[]>
  // письмо «за 3 дня» отмечается условно: второй параллельный прогон его не повторит
  markReminded(userId: string, chargeAt: string): Promise<boolean>
  subsToCharge(nowIso: string): Promise<SubRow[]>
  subsToExpire(nowIso: string): Promise<SubRow[]>
  stalePayments(olderThanIso: string, newerThanIso: string): Promise<PaymentRow[]>
  lastPaid(userId: string): Promise<PaymentRow | null>
  insertRefund(row: { payment_id: string; user_id: string | null; amount: number; days_left: number; days_total: number; idempotence_key: string }): Promise<{ id: string }>
  getRefundByPayment(paymentId: string): Promise<{ id: string; status: string; yk_refund_id: string | null; amount: number; days_left: number; days_total: number } | null>
  updateRefund(id: string, patch: Record<string, unknown>): Promise<void>
  getRefundByYk(ykId: string): Promise<{ id: string; payment_id: string; status: string } | null>
  userEmail(userId: string): Promise<string | null>
  // очередь писем вне окна 10:00-20:00 по Москве или после неудачной отправки (почта берется в момент отправки)
  queueMail(row: { user_id: string; kind: MailKind; data: Record<string, string>; send_after: string }): Promise<void>
  dueMails(nowIso: string): Promise<{ id: string; user_id: string | null; kind: MailKind; data: Record<string, string> }[]>
  mailSent(id: string, atIso: string): Promise<void>
  mailDelay(id: string, untilIso: string): Promise<void>
}

export type MailKind = 'paid' | 'reminder' | 'charge_failed' | 'charge_failed_final' | 'autorenew_off' | 'refund' | 'receipt'
export interface Deps {
  now(): Date
  repo: Repo
  yk: YkClient
  // true, если письмо ушло; продление ждет отправленного письма «за 3 дня»
  mail(kind: MailKind, to: string, data: Record<string, string>): Promise<boolean | void>
  track?(userId: string | null, event: string, props: Record<string, unknown>): void
  log?(msg: string): void
  siteUrl: string
  offerVersion: string
}

const iso = (d: Date) => d.toISOString()
const money = (n: number) => `${n.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).replace(/\s/g, ' ')} ₽`
const dateRu = (d: string | Date) => new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', timeZone: 'Europe/Moscow' })
const planName = (code: string) => (isPaidCode(code) ? PAID_PLANS[code].name : code)
const sent = async (p: Promise<boolean | void>) => { try { return (await p) !== false } catch { return false } }

// Письма про продление (напоминание, неудачное списание) только с 10:00 до 20:00 по Москве (решение Арины 17.11):
// таймер работает круглые сутки, ночное письмо ждет утра в очереди, а списание ждет письма «за 3 дня», как и раньше
export const MAIL_WINDOW = { from: 10, to: 20 }
const WINDOW_KINDS: MailKind[] = ['reminder', 'charge_failed', 'charge_failed_final']
const mskHour = (d: Date) => new Date(d.getTime() + 3 * H).getUTCHours()
export const inMailWindow = (d: Date) => { const h = mskHour(d); return h >= MAIL_WINDOW.from && h < MAIL_WINDOW.to }
// ближайшее начало окна (10:00 по Москве) не раньше d
export function nextMailWindow(d: Date): Date {
  if (inMailWindow(d)) return d
  const msk = new Date(d.getTime() + 3 * H)
  const day = Date.UTC(msk.getUTCFullYear(), msk.getUTCMonth(), msk.getUTCDate() + (mskHour(d) >= MAIL_WINDOW.to ? 1 : 0), MAIL_WINDOW.from)
  return new Date(day - 3 * H)
}
// письмо с учетом окна: в окне шлем сразу, иначе (или если не ушло) в очередь
async function deliver(d: Deps, userId: string, kind: MailKind, data: Record<string, string>, to: string | null): Promise<void> {
  const now = d.now()
  if (to && (!WINDOW_KINDS.includes(kind) || inMailWindow(now)) && await sent(d.mail(kind, to, data))) return
  const after = WINDOW_KINDS.includes(kind) && !inMailWindow(now) ? nextMailWindow(now) : new Date(now.getTime() + H)
  await d.repo.queueMail({ user_id: userId, kind, data, send_after: iso(after) }).catch(() => d.log?.('pay mail: письмо не поставлено в очередь'))
}
async function methodOf(d: Deps, methodId: string | null): Promise<string> {
  if (!methodId) return ''
  const m = await d.repo.getMethod(methodId).catch(() => null)
  return m && !m.deleted_at ? methodPhrase(m.type, m.card_last4) : ''
}

// Подписка платная, пока окно не кончилось (и после «Отключить автопродление»). Пока идут повторы списания
// (past_due, до 3 дней), тариф тоже работает (решение Арины 17.11); все попытки не прошли: expired, тариф выключен.
export function paidAccess(sub: SubRow | null, now: Date): boolean {
  if (!sub || sub.plan_code === 'free' || sub.status === 'expired') return false
  if (sub.status === 'past_due' && sub.auto_renew && sub.next_charge_at) return true
  return !!sub.period_end && new Date(sub.period_end) > now
}

// ── 1. Переход к оплате ──
export type CheckoutError = 'bad_plan' | 'already_paid' | 'yookassa' | 'too_many'
export async function startCheckout(d: Deps, a: { userId: string; email: string | null; plan: string; autoRenew: boolean; via: 'sbp' | 'any'; ip: string | null }):
  Promise<{ ok: true; url: string; paymentId: string; saveDropped?: boolean } | { ok: false; error: CheckoutError }> {
  if (!isPaidCode(a.plan)) return { ok: false, error: 'bad_plan' }
  const plan = PAID_PLANS[a.plan]
  const now = d.now()
  const sub = await d.repo.getSub(a.userId)
  // окно еще оплачено: новая оплата не нужна (вторую оплату поверх окна processPayment все равно сложит, ревью 17.11)
  if (paidAccess(sub, now) && sub!.status !== 'past_due') return { ok: false, error: 'already_paid' }
  const recent = await d.repo.recentPayments(a.userId, iso(new Date(now.getTime() - Math.max(CREATE_LIMIT.minutes, REUSE_PENDING_MIN) * 60000)))
  // тот же тариф, тот же выбор, платеж еще ждет оплаты: отдаем его, а не создаем второй (две вкладки, двойной клик)
  const fresh = recent.find(p => p.kind === 'first' && p.status === 'pending' && p.plan_code === plan.code && p.save_requested === a.autoRenew
    && p.confirmation_url && now.getTime() - new Date(p.created_at).getTime() < REUSE_PENDING_MIN * 60000 && (p.note || '').includes(`via:${a.via}`))
  if (fresh?.confirmation_url) return { ok: true, url: fresh.confirmation_url, paymentId: fresh.id }
  if (recent.filter(p => now.getTime() - new Date(p.created_at).getTime() < CREATE_LIMIT.minutes * 60000).length >= CREATE_LIMIT.count) return { ok: false, error: 'too_many' }
  // продление на повторах, а человек платит сам: повторы останавливаем, чтобы таймер не списал второй раз
  if (sub && sub.status === 'past_due') await d.repo.updateSub(a.userId, { next_charge_at: null, auto_renew: false, status: 'expired', plan_code: 'free' })

  const key = `first:${a.userId}:${crypto.randomUUID()}`
  const row = await d.repo.insertPayment({ user_id: a.userId, email: a.email, kind: 'first', plan_code: plan.code, amount: plan.price, save_requested: a.autoRenew, idempotence_key: key, attempt: 1, note: `via:${a.via}` })
  if (a.autoRenew) await d.repo.insertConsent({ user_id: a.userId, plan_code: plan.code, amount: plan.price, consent_text: consentText(plan), offer_version: d.offerVersion, ip: a.ip, payment_id: row.id })
  const body = (save: boolean, sbp = a.via === 'sbp') => ({
    amount: rub(plan.price),
    capture: true,
    confirmation: { type: 'redirect', return_url: `${d.siteUrl}/dashboard/oplata/itog?p=${row.id}` },
    description: `PsyCont, тариф «${plan.name}», месяц доступа`,
    metadata: { payment_row: row.id },
    ...(save ? { save_payment_method: true } : {}),
    ...(sbp ? { payment_method_data: { type: 'sbp' } } : {}),
  })
  try {
    let p: YkPayment
    let saveDropped = false
    // СБП у магазина недоступна (400 «Payment method is not available», так отвечал тестовый магазин 17.11):
    // уводим на общую страницу ЮKassa со всеми способами, а не показываем ошибку
    const create = async (save: boolean, k: string): Promise<YkPayment> => {
      try { return await d.yk.createPayment(body(save), k) }
      catch (e: any) {
        if (a.via !== 'sbp' || !/^yookassa_400/.test(String(e?.code || ''))) throw e
        d.log?.('pay create: СБП недоступна, общая страница оплаты')
        return d.yk.createPayment(body(save, false), `${k}:any`)
      }
    }
    try { p = await create(a.autoRenew, key) }
    catch (e: any) {
      // магазину не включены автоплатежи (403 forbidden «can't make recurring payments», тестовый магазин 17.11):
      // оплата без сохранения способа, автопродление не включится, экран итога скажет об этом честно
      if (!a.autoRenew || !/^yookassa_403/.test(String(e?.code || ''))) throw e
      d.log?.('pay create: recurring forbidden, без сохранения способа')
      p = await create(false, `${key}:nosave`)
      saveDropped = true
    }
    const url = p.confirmation?.confirmation_url
    await d.repo.updatePayment(row.id, { yk_payment_id: p.id, confirmation_url: url || null, ...(saveDropped ? { note: `via:${a.via},nosave` } : {}), updated_at: iso(now) })
    if (!url || !/^https:\/\//.test(url)) return { ok: false, error: 'yookassa' }
    d.track?.(a.userId, 'pay_start', { plan: plan.code, auto: a.autoRenew && !saveDropped, via: a.via })
    return { ok: true, url, paymentId: row.id, ...(saveDropped ? { saveDropped } : {}) }
  } catch {
    await d.repo.updatePayment(row.id, { status: 'canceled', cancellation_reason: 'create_failed', updated_at: iso(now) }, ['pending'])
    return { ok: false, error: 'yookassa' }
  }
}

// Окно оплаты. Продление: с конца прошлого окна (повторы идут до 3 дней, тариф в это время работает). Первая оплата поверх
// живого окна (две вкладки, СБП прошла позже карты): складываем с концом окна и помечаем двойную оплату.
// Иначе с момента оплаты, и якорь дня тоже от момента оплаты (иначе после позднего повтора месяц был бы короче, ревью 17.11).
function windowFor(row: PaymentRow, sub: SubRow | null, now: Date): { start: Date; end: Date; anchor: number; double: boolean } {
  const prevEnd = sub?.period_end && sub.status !== 'expired' ? new Date(sub.period_end) : null
  const live = !!(prevEnd && prevEnd > now && sub!.plan_code !== 'free' && sub!.status !== 'past_due')
  if (row.kind === 'first' && live) {
    const anchor = sub!.billing_anchor_day || anchorDayOf(prevEnd!)
    return { start: prevEnd!, end: addMonthAnchored(prevEnd!, anchor), anchor, double: true }
  }
  // продление (в том числе удачный повтор через 1 или 3 дня) продолжает окно с его конца: во время повторов тариф работал
  if (row.kind === 'renewal' && prevEnd && prevEnd.getTime() >= now.getTime() - (RETRY_AFTER_HOURS.reduce((a, b) => a + b, 0) + 24) * H) {
    const anchor = sub!.billing_anchor_day || anchorDayOf(prevEnd)
    return { start: prevEnd, end: addMonthAnchored(prevEnd, anchor), anchor, double: false }
  }
  const anchor = anchorDayOf(now)
  return { start: now, end: addMonthAnchored(now, anchor), anchor, double: false }
}

// Подписка по окну платежа. Повторяемо: то же окно дает то же состояние. Окно старее текущего не применяется.
async function applyWindow(d: Deps, row: PaymentRow, methodId: string | null): Promise<void> {
  const sub = await d.repo.getSub(row.user_id!)
  const end = new Date(row.period_end!)
  if (sub?.period_end && new Date(sub.period_end) > end && sub.status !== 'expired') return // уже применено окно новее
  const double = (row.note || '').includes('double')
  if (double && sub) {
    // двойная оплата: окно продлевается, начало и счетчик материалов прежние, способ оплаты прежний
    await d.repo.updateSub(row.user_id!, { period_end: row.period_end, ...(sub.auto_renew ? { next_charge_at: row.period_end } : {}) })
    return
  }
  const autoRenew = row.kind === 'first' ? !!methodId : !!(sub?.auto_renew && methodId)
  await d.repo.upsertSub(row.user_id!, {
    plan_code: row.plan_code, status: 'active', period_start: row.period_start, period_end: row.period_end,
    billing_anchor_day: Number((row.note || '').match(/anchor:(\d+)/)?.[1]) || sub?.billing_anchor_day || null,
    auto_renew: autoRenew, payment_method_id: methodId ?? (row.kind === 'first' ? null : sub?.payment_method_id ?? null),
    next_charge_at: autoRenew ? row.period_end : null, retry_count: 0,
    // тариф продления стал текущим: отложенная смена выполнена
    ...(row.kind === 'renewal' && sub?.next_plan_code === row.plan_code ? { next_plan_code: null } : {}),
    ...(row.kind === 'first' ? { next_plan_code: null } : {}),
  })
}

// ── 2. Платеж по ответу API (вебхук, сверка, продление) ──
export async function processPayment(d: Deps, api: YkPayment): Promise<string> {
  let row = (await d.repo.getPaymentByYk(api.id)) || (api.metadata?.payment_row ? await d.repo.getPayment(api.metadata.payment_row) : null)
  if (!row) return 'unknown_payment'
  if (Number(api.amount?.value) !== Number(row.amount) || api.amount?.currency !== 'RUB') return 'amount_mismatch'
  const now = d.now()
  if (api.status === 'succeeded' && api.paid) {
    if (row.status === 'succeeded') return 'already'
    if (row.status === 'canceled') { d.log?.('pay: succeeded после canceled, нужна ручная проверка'); await d.repo.updatePayment(row.id, { note: `${row.note || ''},check` }); return 'needs_check' }
    if (!row.user_id) {
      await d.repo.updatePayment(row.id, { status: 'succeeded', paid_at: iso(now), method_type: api.payment_method?.type || null, receipt_status: 'need', note: `${row.note || ''},refund_due` }, ['pending', 'waiting_for_capture'])
      return 'no_user' // аккаунт удален, пока платеж шел: вернуть из /admin (строка «вернуть»)
    }
    // 1) окно считается и пишется в платеж один раз
    if (!row.period_start) {
      const sub = await d.repo.getSub(row.user_id)
      const w = windowFor(row, sub, now)
      const note = `${row.note || ''},anchor:${w.anchor}${w.double ? ',double,refund_due' : ''}`
      row = (await d.repo.setWindowOnce(row.id, { period_start: iso(w.start), period_end: iso(w.end), note })) || (await d.repo.getPayment(row.id))!
    }
    // 2) способ оплаты (повторяемо: upsert по id способа в ЮKassa)
    let methodId: string | null = null
    if (row.kind === 'first' && row.save_requested && api.payment_method?.saved && api.payment_method.id && !(row.note || '').includes('double')) {
      methodId = (await d.repo.upsertMethod(row.user_id!, api.payment_method.id, api.payment_method.type, methodTitle(api.payment_method), api.payment_method.card?.last4 || null)).id
    } else if (row.kind === 'renewal') methodId = row.payment_method_id
    // 3) подписка по окну (повторяемо)
    await applyWindow(d, row, methodId)
    // 4) только теперь платеж оплачен; письмо и событие один раз, у того, кто перевел статус
    const won = await d.repo.updatePayment(row.id, { status: 'succeeded', paid_at: iso(now), method_type: api.payment_method?.type || null, yk_payment_id: api.id, payment_method_id: methodId, receipt_status: 'need', updated_at: iso(now) }, ['pending', 'waiting_for_capture'])
    if (!won) return 'already'
    const sub = await d.repo.getSub(row.user_id!)
    const to = row.email || await d.repo.userEmail(row.user_id!)
    const auto = !!sub?.auto_renew
    const paidSent = !!to && await sent(d.mail('paid', to, { plan: planName(row.plan_code), amount: money(row.amount), until: dateRu(sub?.period_end || row.period_end!), next: auto && sub?.next_charge_at ? `Следующее списание ${dateRu(sub.next_charge_at)}, ${money(row.amount)}.` : 'Автопродление выключено.', method: methodPhrase(api.payment_method?.type, api.payment_method?.card?.last4) }))
    if (!paidSent) d.log?.(`pay mail: письмо об оплате не ушло, платеж ${row.id}`)
    d.track?.(row.user_id, 'pay_done', { plan: row.plan_code, kind: row.kind, via: api.payment_method?.type || 'unknown' })
    if ((won.note || '').includes('double')) d.log?.('pay: двойная оплата, окно сложено, предложить возврат')
    return row.kind === 'first' ? 'activated' : 'renewed'
  }
  if (api.status === 'canceled') {
    const reason = String(api.cancellation_details?.reason || 'unknown').replace(/[^a-z_]/gi, '').slice(0, 40)
    const won = await d.repo.updatePayment(row.id, { status: 'canceled', cancellation_reason: reason, yk_payment_id: api.id, updated_at: iso(now) }, ['pending', 'waiting_for_capture'])
    if (!won && row.status !== 'canceled') return 'already'
    if (won) d.track?.(row.user_id, 'pay_failed', { kind: row.kind, reason })
    // повторяемо: renewalFailed сам проверяет, не учтена ли уже эта попытка
    if (row.kind === 'renewal' && row.user_id) return renewalFailed(d, { ...row, status: 'canceled' }, reason)
    return won ? 'canceled' : 'already'
  }
  return 'pending'
}

async function renewalFailed(d: Deps, row: PaymentRow, reason: string): Promise<string> {
  const now = d.now()
  const sub = await d.repo.getSub(row.user_id!)
  if (!sub) return 'no_sub'
  const tries = sub.retry_count || 0
  if (tries >= row.attempt) return 'already' // эта попытка уже учтена (повтор вебхука или таймера)
  const to = row.email || await d.repo.userEmail(row.user_id!)
  if (tries < RETRY_AFTER_HOURS.length && !HOPELESS.includes(reason) && sub.auto_renew) {
    const next = new Date(now.getTime() + RETRY_AFTER_HOURS[tries] * H)
    await d.repo.updateSub(row.user_id!, { status: 'past_due', retry_count: row.attempt, next_charge_at: iso(next) })
    await deliver(d, row.user_id!, 'charge_failed', { plan: planName(row.plan_code), amount: money(row.amount), retry: dateRu(next), method: await methodOf(d, row.payment_method_id) }, to)
    return 'retry_scheduled'
  }
  await d.repo.updateSub(row.user_id!, { status: 'expired', plan_code: 'free', auto_renew: false, next_charge_at: null, retry_count: row.attempt })
  await deliver(d, row.user_id!, 'charge_failed_final', { plan: planName(row.plan_code), amount: money(row.amount) }, to)
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
    // событие не отмечаем обработанным: ЮKassa повторит уведомление, обработка повторяема
    return { status: 500, result: 'error' }
  }
  await d.repo.finishEvent(key, result)
  return { status: 200, result }
}

// ── 4. Таймер: сверка зависших, письма за 3 дня, продления, окончание окна ──
export async function runBilling(d: Deps): Promise<Record<string, number>> {
  const now = d.now()
  const out = { reconciled: 0, reminded: 0, charged: 0, failed: 0, postponed: 0, expired: 0, purged: 0, mailed: 0, errors: 0 }
  // 4.1 платежи без ответа дольше 10 минут (вебхук потерялся): сверяем по API
  for (const p of await d.repo.stalePayments(iso(new Date(now.getTime() - 10 * 60000)), iso(new Date(now.getTime() - 3 * 24 * H)))) {
    if (!p.yk_payment_id) continue
    try { const r = await processPayment(d, await d.yk.getPayment(p.yk_payment_id)); if (r !== 'pending') out.reconciled++ } catch { out.errors++ }
  }
  // 4.0 очередь писем: ночные и неотправленные (в окне 10:00-20:00 по Москве для писем о продлении)
  for (const q of await d.repo.dueMails(iso(now)).catch(() => [])) {
    if (WINDOW_KINDS.includes(q.kind) && !inMailWindow(now)) continue
    const to = q.user_id ? await d.repo.userEmail(q.user_id).catch(() => null) : null
    if (!to) { await d.repo.mailSent(q.id, iso(now)); continue } // аккаунта нет: письмо некому слать
    if (await sent(d.mail(q.kind, to, q.data))) { await d.repo.mailSent(q.id, iso(now)); out.mailed++ }
    else await d.repo.mailDelay(q.id, iso(new Date(now.getTime() + H)))
  }
  // 4.2 письмо за 3 дня до списания (один раз на дату списания)
  for (const s of await d.repo.subsToRemind(iso(now), iso(new Date(now.getTime() + REMIND_BEFORE_HOURS * H)))) {
    if (!s.next_charge_at || s.reminder_sent_for === s.next_charge_at) continue
    if (await remind(d, s, s.next_charge_at)) out.reminded++
  }
  // 4.3 продления по сохраненному способу
  for (const s0 of await d.repo.subsToCharge(iso(now))) {
    try {
      // перечитываем: человек мог отключить автопродление, пока таймер шел по списку (ревью 17.11)
      const s = await d.repo.getSub(s0.user_id)
      if (!s || !s.auto_renew || !s.next_charge_at || new Date(s.next_charge_at) > now || !['active', 'past_due'].includes(s.status)) continue
      // смена тарифа: со следующего списания новый тариф и его цена (согласие на нее дано в окне смены)
      const code = s.next_plan_code && isPaidCode(s.next_plan_code) ? s.next_plan_code : s.plan_code
      const plan = isPaidCode(code) ? PAID_PLANS[code] : null
      const m = s.payment_method_id ? await d.repo.getMethod(s.payment_method_id) : null
      if (!plan || !m || m.deleted_at) { await d.repo.updateSub(s.user_id, { auto_renew: false, next_charge_at: null }); continue }
      // первая попытка только после письма «за 3 дня» (оферта): письма не было (простой сервера), шлем и ждем 3 дня
      if (s.status === 'active' && s.reminder_sent_for !== s.next_charge_at) {
        const later = iso(new Date(now.getTime() + REMIND_BEFORE_HOURS * H))
        await d.repo.updateSub(s.user_id, { next_charge_at: later })
        await remind(d, { ...s, next_charge_at: later }, later)
        out.postponed++; continue
      }
      const attempt = (s.retry_count || 0) + 1
      const key = `renew:${s.user_id}:${s.period_end}:${attempt}`
      let row = await d.repo.getPaymentByKey(key)
      if (row) {
        // попытка уже была: завершаем ее по факту, второй раз не списываем
        if (row.status === 'succeeded') { await applyWindow(d, row, row.payment_method_id); continue }
        if (row.status === 'canceled') { await renewalFailed(d, row, 'unknown'); continue }
        if (row.yk_payment_id) { await processPayment(d, await d.yk.getPayment(row.yk_payment_id)); continue }
        // ответа на создание не было, а ключ ЮKassa живет сутки: старше 20 часов не пересоздаем, нужна ручная проверка
        if (now.getTime() - new Date(row.created_at).getTime() > RENEW_STALE_HOURS * H) { await d.repo.updatePayment(row.id, { note: `${row.note || ''},check` }); d.log?.('renew: попытка без ответа старше суток, нужна ручная проверка'); continue }
      } else {
        row = await d.repo.insertPayment({ user_id: s.user_id, email: await d.repo.userEmail(s.user_id), kind: 'renewal', plan_code: plan.code, amount: plan.price, save_requested: true, idempotence_key: key, attempt, note: null })
      }
      await d.repo.updatePayment(row.id, { payment_method_id: m.id })
      row.payment_method_id = m.id
      const p = await d.yk.createPayment({ amount: rub(plan.price), capture: true, payment_method_id: m.yk_method_id, description: `PsyCont, тариф «${plan.name}», продление на месяц`, metadata: { payment_row: row.id } }, key)
      await d.repo.updatePayment(row.id, { yk_payment_id: p.id })
      const r = await processPayment(d, p)
      if (r === 'renewed') out.charged++; else if (r !== 'pending') out.failed++
    } catch { out.errors++ }
  }
  // 4.5 согласия удаленных аккаунтов храним 3 года, потом удаляем (/privacy раздел 9)
  try { out.purged = await d.repo.purgeOrphanConsents(iso(new Date(now.getTime() - CONSENT_KEEP_DAYS * 24 * H))) } catch { out.errors++ }
  // 4.4 окно кончилось, продления нет (автопродление выключено или нет способа): тариф снова пробный
  for (const s of await d.repo.subsToExpire(iso(now))) {
    await d.repo.updateSub(s.user_id, { status: 'expired', plan_code: 'free', auto_renew: false, next_charge_at: null })
    out.expired++
  }
  return out
}

async function remind(d: Deps, s: SubRow, chargeAt: string): Promise<boolean> {
  if (!inMailWindow(d.now())) return false // ночью не шлем: утренний прогон отправит, списание ждет письма
  if (!(await d.repo.markReminded(s.user_id, chargeAt))) return false // другой прогон уже отправил
  const to = await d.repo.userEmail(s.user_id)
  const code = s.next_plan_code && isPaidCode(s.next_plan_code) ? s.next_plan_code : s.plan_code
  const plan = isPaidCode(code) ? PAID_PLANS[code] : null
  const ok = !!to && !!plan && await sent(d.mail('reminder', to, { plan: plan!.name, amount: money(plan!.price), date: dateRu(chargeAt), method: await methodOf(d, s.payment_method_id) }))
  if (!ok) {
    // письмо не ушло (SMTP, нет почты): снимаем отметку, следующий прогон пошлет снова; списание ждет письма (оферта)
    await d.repo.updateSub(s.user_id, { reminder_sent_for: null })
    d.log?.('pay mail: напоминание не ушло, повтор на следующем прогоне')
    return false
  }
  return true
}

// ── 5. Профиль: сразу, без писем в поддержку ──
export async function disableAutoRenew(d: Deps, userId: string): Promise<'ok' | 'nothing'> {
  const sub = await d.repo.getSub(userId)
  if (!sub || !sub.auto_renew) return 'nothing'
  await d.repo.updateSub(userId, { auto_renew: false, next_charge_at: null, next_plan_code: null, status: sub.status === 'past_due' ? 'expired' : 'canceled', ...(sub.status === 'past_due' ? { plan_code: 'free' } : {}) })
  const to = await d.repo.userEmail(userId)
  // письмо только если окно еще идет: при past_due дата уже прошла, тариф выключается сразу
  if (to && sub.period_end && sub.status !== 'past_due' && new Date(sub.period_end) > d.now()) await sent(d.mail('autorenew_off', to, { until: dateRu(sub.period_end) }))
  d.track?.(userId, 'pay_autorenew_off', {})
  return 'ok'
}

// Смена тарифа (решение Арины 17.11): новый тариф со следующего списания, доплаты нет. Нужно автопродление со способом
// оплаты (иначе следующего списания нет) и согласие на новую сумму: оно пишется так же, как при первой оплате.
// Выбор текущего тарифа отменяет отложенную смену.
export async function changePlan(d: Deps, a: { userId: string; plan: string; consent: boolean; ip: string | null }): Promise<{ ok: true; from: string | null } | { ok: false; error: 'bad_plan' | 'no_autorenew' | 'no_consent' }> {
  if (!isPaidCode(a.plan)) return { ok: false, error: 'bad_plan' }
  const sub = await d.repo.getSub(a.userId)
  if (!sub || !sub.auto_renew || !sub.payment_method_id || !sub.next_charge_at || !['active', 'past_due'].includes(sub.status)) return { ok: false, error: 'no_autorenew' }
  if (a.plan === sub.plan_code) {
    await d.repo.updateSub(a.userId, { next_plan_code: null })
    d.track?.(a.userId, 'pay_plan_change', { plan: a.plan, cancel: true })
    return { ok: true, from: null }
  }
  if (!a.consent) return { ok: false, error: 'no_consent' }
  const plan = PAID_PLANS[a.plan]
  await d.repo.insertConsent({ user_id: a.userId, plan_code: plan.code, amount: plan.price, consent_text: consentText(plan), offer_version: d.offerVersion, ip: a.ip, payment_id: null })
  await d.repo.updateSub(a.userId, { next_plan_code: plan.code, reminder_sent_for: null })
  d.track?.(a.userId, 'pay_plan_change', { plan: plan.code, cancel: false })
  return { ok: true, from: sub.next_charge_at }
}

export async function deletePaymentMethod(d: Deps, userId: string): Promise<'ok'> {
  await disableAutoRenew(d, userId)
  await d.repo.deleteMethods(userId) // ссылку в подписке обнуляет внешний ключ (on delete set null)
  d.track?.(userId, 'pay_method_delete', {})
  return 'ok'
}

// ── 6. /admin: возврат за оставшиеся дни (по платежу), отключить автопродление, продлить, выключить ──
export type RefundResult = { ok: true; amount: number; daysLeft: number; daysTotal: number; status: string } | { ok: false; error: 'no_payment' | 'nothing_left' | 'yookassa' | 'already_refunded' }
export async function refundPayment(d: Deps, paymentId: string): Promise<RefundResult> {
  const now = d.now()
  const p = await d.repo.getPayment(paymentId)
  if (!p || p.status !== 'succeeded' || !p.yk_payment_id) return { ok: false, error: 'no_payment' }
  // окно платежа (у платежа удаленного человека окна нет: возвращаем всю сумму)
  const calc = p.period_start && p.period_end
    ? refundByDays(Number(p.amount), new Date(p.period_start), new Date(p.period_end), now)
    : { amount: Number(p.amount), daysLeft: 0, daysTotal: 0 }
  if (calc.amount <= 0) return { ok: false, error: 'nothing_left' }
  const key = `refund:${p.id}`
  // один возврат на платеж; сорвавшийся у ЮKassa (нет yk_refund_id) повторяется с тем же ключом
  let ref = await d.repo.getRefundByPayment(p.id)
  if (ref && (ref.yk_refund_id || ref.status === 'succeeded')) return { ok: false, error: 'already_refunded' }
  if (!ref) {
    try { ref = { ...(await d.repo.insertRefund({ payment_id: p.id, user_id: p.user_id, amount: calc.amount, days_left: calc.daysLeft, days_total: calc.daysTotal, idempotence_key: key })), status: 'pending', yk_refund_id: null, amount: calc.amount, days_left: calc.daysLeft, days_total: calc.daysTotal } }
    catch { return { ok: false, error: 'already_refunded' } }
  }
  let r
  try {
    r = await d.yk.createRefund({ payment_id: p.yk_payment_id, amount: rub(ref.amount), description: ref.days_total ? `Возврат за ${ref.days_left} из ${ref.days_total} дней` : 'Возврат оплаты' }, key)
  } catch {
    await d.repo.updateRefund(ref.id, { status: 'canceled', updated_at: iso(now) }).catch(() => {})
    return { ok: false, error: 'yookassa' }
  }
  // деньги ЮKassa приняла: дальше ничего не пишем как «не вышло», каждый шаг сам по себе (ревью 17.11)
  const step = async (f: () => Promise<unknown>, what: string) => { try { await f() } catch { d.log?.(`refund: шаг ${what} не записан, деньги уже возвращаются`) } }
  await step(() => d.repo.updateRefund(ref!.id, { yk_refund_id: r.id, status: r.status, updated_at: iso(now) }), 'refund')
  if (p.user_id) await step(() => d.repo.updateSub(p.user_id!, { status: 'expired', plan_code: 'free', auto_renew: false, next_charge_at: null, period_end: iso(now) }), 'sub')
  // чек уже выбит: аннулировать и выбить новый на остаток; еще не выбит: выбить сразу на остаток (пометка refunded:сумма)
  await step(() => d.repo.updatePayment(p.id, { receipt_status: p.receipt_status === 'done' ? 'annul_need' : p.receipt_status, note: `${(p.note || '').replace(/,?refund_due/g, '')},refunded:${ref!.amount}` }), 'payment')
  const to = p.email || (p.user_id ? await d.repo.userEmail(p.user_id).catch(() => null) : null)
  if (to) await sent(d.mail('refund', to, { amount: money(ref.amount), days: String(ref.days_left) }))
  return { ok: true, amount: ref.amount, daysLeft: ref.days_left, daysTotal: ref.days_total, status: r.status }
}

// возврат по человеку: последний оплаченный платеж
export async function refundRemaining(d: Deps, userId: string): Promise<RefundResult> {
  const p = await d.repo.lastPaid(userId)
  if (!p) return { ok: false, error: 'no_payment' }
  return refundPayment(d, p.id)
}

export async function adminExtend(d: Deps, userId: string, days: number, plan: string): Promise<'ok' | 'bad'> {
  if (!Number.isInteger(days) || days < 1 || days > 62 || !isPaidCode(plan)) return 'bad'
  const now = d.now()
  const sub = await d.repo.getSub(userId)
  const live = !!sub && paidAccess(sub, now)
  const end = new Date((live ? new Date(sub!.period_end!) : now).getTime() + days * 24 * H)
  await d.repo.upsertSub(userId, { plan_code: plan, status: sub?.auto_renew && live ? 'active' : 'canceled', period_start: live ? sub!.period_start : iso(now), period_end: iso(end), ...(sub?.auto_renew && live ? { next_charge_at: iso(end) } : { auto_renew: false, next_charge_at: null }) })
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
  await d.repo.deleteMethods(userId)
}
