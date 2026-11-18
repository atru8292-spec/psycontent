// Боевые зависимости оплаты: база через service_role, ЮKassa по HTTP, письма через SMTP. Только сервер.
// Код тарифа в логике (plan_code) хранится в user_subscription как plan_id: переводим через таблицу plans.
import { getSupabaseAdmin } from '@/lib/generation/db'
import { serverTrack } from '@/lib/track-server'
import { OFFER_VERSION } from '@/lib/rekvizity'
import { httpYk } from './yookassa'
import { sendPayMail } from './mailer'
import { autopayEnabled } from './ready'
import type { Deps, Repo, SubRow, PaymentRow, MethodRow } from './core'

const SITE = (process.env.SITE_PUBLIC_URL || 'https://psycont.ru').replace(/\/$/, '')

function db() { return getSupabaseAdmin() }
const must = <T,>(r: { data: T; error: any }, what: string): T => { if (r.error) throw Object.assign(new Error(what), { code: `db_${what}_${r.error.code || 'err'}` }); return r.data }

let planIds: Map<string, string> | null = null
async function planIdMap(): Promise<Map<string, string>> {
  if (planIds) return planIds
  const rows = must(await db().from('plans').select('id, code'), 'plans') as { id: string; code: string }[]
  planIds = new Map(rows.map(r => [r.code, r.id]))
  return planIds
}

const SUB_COLS = 'user_id, status, period_start, period_end, auto_renew, payment_method_id, next_charge_at, retry_count, reminder_sent_for, billing_anchor_day, next_plan_code, plans(code)'
const toSub = (r: any): SubRow => ({ ...r, plan_code: r.plans?.code || 'free', plans: undefined })
const PAY_COLS = 'id, user_id, email, yk_payment_id, kind, plan_code, amount, status, save_requested, idempotence_key, attempt, period_start, period_end, created_at, payment_method_id, receipt_status, confirmation_url, note'
const toPay = (r: any): PaymentRow => ({ ...r, amount: Number(r.amount) })

async function subRow(patch: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { plan_code, ...rest } = patch as any
  const row: Record<string, unknown> = { ...rest, updated_at: new Date().toISOString() }
  if (plan_code) { const id = (await planIdMap()).get(plan_code); if (!id) throw Object.assign(new Error('plan'), { code: 'db_no_plan' }); row.plan_id = id }
  return row
}

export const supabaseRepo: Repo = {
  async getSub(u) { const r = must(await db().from('user_subscription').select(SUB_COLS).eq('user_id', u).maybeSingle(), 'sub_get'); return r ? toSub(r) : null },
  async updateSub(u, patch) {
    const r = must(await db().from('user_subscription').update(await subRow(patch)).eq('user_id', u).select('user_id'), 'sub_update') as any[]
    // строки подписки нет (триггер регистрации мог не отработать): не молчим, ревью 17.11
    if (!r?.length) throw Object.assign(new Error('sub'), { code: 'db_sub_missing' })
  },
  async upsertSub(u, patch) {
    must(await db().from('user_subscription').upsert({ user_id: u, ...(await subRow(patch)) }, { onConflict: 'user_id' }), 'sub_upsert')
  },
  async setWindowOnce(id, patch) {
    const r = must(await db().from('payments').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id).is('period_start', null).select(PAY_COLS), 'pay_window') as any[]
    return r?.length ? toPay(r[0]) : null
  },
  async recentPayments(u, since) {
    const r = must(await db().from('payments').select(PAY_COLS).eq('user_id', u).gte('created_at', since).order('created_at', { ascending: false }).limit(50), 'pay_recent') as any[]
    return r.map(toPay)
  },
  async markReminded(u, at) {
    const r = must(await db().from('user_subscription').update({ reminder_sent_for: at, updated_at: new Date().toISOString() }).eq('user_id', u).or(`reminder_sent_for.is.null,reminder_sent_for.neq."${at}"`).select('user_id'), 'remind_mark') as any[]
    return !!r?.length
  },
  async getRefundByPayment(pid) {
    const r = must(await db().from('refunds').select('id, status, yk_refund_id, amount, days_left, days_total').eq('payment_id', pid).order('created_at', { ascending: false }).limit(1), 'refund_pay') as any[]
    return r?.length ? { ...r[0], amount: Number(r[0].amount) } : null
  },
  async insertPayment(row) { return toPay(must(await db().from('payments').insert(row).select(PAY_COLS).single(), 'pay_insert')) },
  async getPaymentByKey(k) { const r = must(await db().from('payments').select(PAY_COLS).eq('idempotence_key', k).maybeSingle(), 'pay_key'); return r ? toPay(r) : null },
  async getPayment(id) {
    if (!/^[0-9a-f-]{36}$/.test(id)) return null
    const r = must(await db().from('payments').select(PAY_COLS).eq('id', id).maybeSingle(), 'pay_get'); return r ? toPay(r) : null
  },
  async getPaymentByYk(y) { const r = must(await db().from('payments').select(PAY_COLS).eq('yk_payment_id', y).maybeSingle(), 'pay_yk'); return r ? toPay(r) : null },
  async updatePayment(id, patch, onlyFrom) {
    let q = db().from('payments').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id)
    if (onlyFrom) q = q.in('status', onlyFrom)
    const r = must(await q.select(PAY_COLS), 'pay_update') as any[]
    return r?.length ? toPay(r[0]) : null
  },
  async upsertMethod(u, yk, type, title, last4) {
    const r = must(await db().from('payment_methods').upsert({ user_id: u, yk_method_id: yk, type, title, card_last4: last4, deleted_at: null }, { onConflict: 'yk_method_id' }).select('id, user_id, yk_method_id, type, title, deleted_at, card_last4').single(), 'method_upsert')
    return r as MethodRow
  },
  async getMethod(id) { const r = must(await db().from('payment_methods').select('id, user_id, yk_method_id, type, title, deleted_at, card_last4').eq('id', id).maybeSingle(), 'method_get'); return (r as MethodRow) || null },
  // «Удалить карту» (требование ЮKassa к автоплатежам, 17.11): строка с токеном payment_method_id стирается из базы целиком.
  // Ссылки в payments и user_subscription обнуляются внешним ключом (on delete set null), история платежей остается.
  async deleteMethods(u) { must(await db().from('payment_methods').delete().eq('user_id', u), 'method_delete') },
  async insertConsent(row) { must(await db().from('autopay_consents').insert(row), 'consent') },
  async purgeOrphanConsents(before) {
    const r = must(await db().from('autopay_consents').delete().is('user_id', null).lt('created_at', before).select('id'), 'consent_purge') as any[]
    return r?.length || 0
  },
  async claimEvent(key, event, objectId) {
    const ins = await db().from('payment_events').insert({ event_key: key, event, object_id: objectId })
    if (!ins.error) return true
    if (ins.error.code !== '23505') throw Object.assign(new Error('event'), { code: `db_event_${ins.error.code}` })
    const r = must(await db().from('payment_events').select('processed_at').eq('event_key', key).maybeSingle(), 'event_get') as any
    return !r?.processed_at // упало на прошлой попытке: обрабатываем снова (обработка идемпотентна)
  },
  async finishEvent(key, result) { must(await db().from('payment_events').update({ processed_at: new Date().toISOString(), result: result.slice(0, 60) }).eq('event_key', key), 'event_finish') },
  async subsToRemind(now, until) {
    const r = must(await db().from('user_subscription').select(SUB_COLS).eq('auto_renew', true).eq('status', 'active').gt('next_charge_at', now).lte('next_charge_at', until), 'remind') as any[]
    return r.map(toSub)
  },
  async subsToCharge(now) {
    const r = must(await db().from('user_subscription').select(SUB_COLS).eq('auto_renew', true).in('status', ['active', 'past_due']).lte('next_charge_at', now), 'charge') as any[]
    return r.map(toSub)
  },
  async subsToExpire(now, all) {
    const r = must(await db().from('user_subscription').select(SUB_COLS).in('status', ['active', 'canceled', 'past_due']).lte('period_end', now), 'expire') as any[]
    return r.map(toSub).filter(s => all || !(s.auto_renew && s.next_charge_at))
  },
  async subsEnding(now, until) {
    const r = must(await db().from('user_subscription').select(SUB_COLS).in('status', ['active', 'canceled', 'past_due']).gt('period_end', now).lte('period_end', until).limit(500), 'ending') as any[]
    return r.map(toSub)
  },
  async subsEnded(from, to) {
    const r = must(await db().from('user_subscription').select(SUB_COLS).gte('period_end', from).lte('period_end', to).limit(500), 'ended') as any[]
    return r.map(toSub)
  },
  async stalePayments(older, newer) {
    const r = must(await db().from('payments').select(PAY_COLS).eq('status', 'pending').lte('created_at', older).gte('created_at', newer).not('yk_payment_id', 'is', null).limit(100), 'stale') as any[]
    return r.map(toPay)
  },
  async lastPaid(u) {
    const r = must(await db().from('payments').select(PAY_COLS).eq('user_id', u).eq('status', 'succeeded').order('paid_at', { ascending: false }).limit(1), 'last_paid') as any[]
    return r?.length ? toPay(r[0]) : null
  },
  async insertRefund(row) { return must(await db().from('refunds').insert(row).select('id').single(), 'refund_insert') as { id: string } },
  async updateRefund(id, patch) { must(await db().from('refunds').update(patch).eq('id', id), 'refund_update') },
  async getRefundByYk(y) { return must(await db().from('refunds').select('id, payment_id, status').eq('yk_refund_id', y).maybeSingle(), 'refund_yk') as any },
  async queueMail(row) { must(await db().from('pay_mail_queue').insert(row), 'mailq_insert') },
  async dueMails(now) {
    const r = must(await db().from('pay_mail_queue').select('id, user_id, kind, data').is('sent_at', null).lte('send_after', now).order('send_after').limit(200), 'mailq_due') as any[]
    return r as any
  },
  async mailSent(id, at) { must(await db().from('pay_mail_queue').update({ sent_at: at }).eq('id', id), 'mailq_sent') },
  async mailDelay(id, until) { must(await db().from('pay_mail_queue').update({ send_after: until }).eq('id', id), 'mailq_delay') },
  async userEmail(u) { const r = await db().auth.admin.getUserById(u); return r.data?.user?.email || null },
}

export function billingDeps(): Deps {
  return {
    now: () => new Date(),
    repo: supabaseRepo,
    yk: httpYk(),
    mail: (kind, to, data) => sendPayMail(kind, to, data, SITE),
    log: (m) => console.warn(m),
    track: (u, e, p) => serverTrack(u, e, p),
    siteUrl: SITE,
    offerVersion: OFFER_VERSION,
    autopay: autopayEnabled(),
  }
}
