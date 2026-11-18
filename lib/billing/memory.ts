// Заглушки для проверки оплаты без базы и без ЮKassa (17.11): репозиторий в памяти и фальшивая ЮKassa,
// которая отвечает объектами в формате API v3 (документация «Платежи», «Автоплатежи», «Возвраты»).
// Используются в scripts/test-oplata.ts и в локальном стенде (scripts/oplata-stend.ts). В боевой код не входят.
import type { Repo, SubRow, PaymentRow, MethodRow } from './core'
import type { YkClient, YkPayment, YkRefund } from './yookassa'

let seq = 0
const uid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`

export function memoryRepo(emails: Record<string, string> = {}, clock: () => Date = () => new Date()) {
  const clockIso = () => clock().toISOString()
  const subs = new Map<string, SubRow>()
  const payments: PaymentRow[] = []
  const methods: MethodRow[] = []
  const consents: any[] = []
  const events = new Map<string, { processed: boolean; result?: string }>()
  const refunds: any[] = []
  const mailq: any[] = []
  const fail = { applySub: false }
  const repo: Repo = {
    async getSub(u) { return subs.get(u) ? { ...subs.get(u)! } : null },
    async updateSub(u, patch) {
      if (fail.applySub && 'period_start' in patch) throw Object.assign(new Error('db'), { code: 'db_sub_update_test' })
      const cur = subs.get(u) || { user_id: u, plan_code: 'free', status: 'trial', period_start: null, period_end: null, auto_renew: false, payment_method_id: null, next_charge_at: null, retry_count: 0, reminder_sent_for: null, billing_anchor_day: null } as SubRow
      subs.set(u, { ...cur, ...patch } as SubRow)
    },
    async upsertSub(u, patch) { await repo.updateSub(u, patch) },
    async setWindowOnce(id, patch) { const p = payments.find(x => x.id === id); if (!p || p.period_start) return null; Object.assign(p, patch); return { ...p } },
    async recentPayments(u, since) { return payments.filter(p => p.user_id === u && p.created_at >= since).map(p => ({ ...p })) },
    async markReminded(u, at) { const s = subs.get(u); if (!s || s.reminder_sent_for === at) return false; s.reminder_sent_for = at; return true },
    async getRefundByPayment(pid) { const r = refunds.find(x => x.payment_id === pid); return r ? { ...r } : null },
    async insertPayment(row) {
      if (payments.some(p => p.idempotence_key === row.idempotence_key)) throw new Error('unique')
      const p: PaymentRow = { ...row, id: uid(), created_at: clockIso(), yk_payment_id: null, status: 'pending', period_start: null, period_end: null, payment_method_id: null, receipt_status: 'none', confirmation_url: null }
      payments.push(p); return { ...p }
    },
    async getPaymentByKey(k) { const p = payments.find(x => x.idempotence_key === k); return p ? { ...p } : null },
    async getPayment(id) { const p = payments.find(x => x.id === id); return p ? { ...p } : null },
    async getPaymentByYk(y) { const p = payments.find(x => x.yk_payment_id === y); return p ? { ...p } : null },
    async updatePayment(id, patch, onlyFrom) {
      const p = payments.find(x => x.id === id)
      if (!p || (onlyFrom && !onlyFrom.includes(p.status))) return null
      Object.assign(p, patch); return { ...p }
    },
    async upsertMethod(u, yk, type, title, last4) {
      let m = methods.find(x => x.yk_method_id === yk)
      if (!m) { m = { id: uid(), user_id: u, yk_method_id: yk, type, title, deleted_at: null, card_last4: last4 }; methods.push(m) }
      return { ...m }
    },
    async getMethod(id) { const m = methods.find(x => x.id === id); return m ? { ...m } : null },
    async deleteMethods(u) {
      // как в базе: строка стирается, ссылки обнуляются (on delete set null)
      const gone = new Set(methods.filter(m => m.user_id === u).map(m => m.id))
      for (let i = methods.length - 1; i >= 0; i--) if (gone.has(methods[i].id)) methods.splice(i, 1)
      for (const p of payments) if (p.payment_method_id && gone.has(p.payment_method_id)) p.payment_method_id = null
      for (const s of subs.values()) if (s.payment_method_id && gone.has(s.payment_method_id)) s.payment_method_id = null
    },
    async insertConsent(row) { consents.push({ ...row, created_at: clockIso() }) },
    async purgeOrphanConsents(before) { const n = consents.length; for (let i = consents.length - 1; i >= 0; i--) if (consents[i].user_id === null && consents[i].created_at < before) consents.splice(i, 1); return n - consents.length },
    async claimEvent(k) { const e = events.get(k); if (e?.processed) return false; events.set(k, { processed: false }); return true },
    async finishEvent(k, result) { events.set(k, { processed: true, result }) },
    async subsToRemind(now, until) { return [...subs.values()].filter(s => s.auto_renew && s.status === 'active' && s.next_charge_at && s.next_charge_at > now && s.next_charge_at <= until).map(s => ({ ...s })) },
    async subsToCharge(now) { return [...subs.values()].filter(s => s.auto_renew && ['active', 'past_due'].includes(s.status) && s.next_charge_at && s.next_charge_at <= now).map(s => ({ ...s })) },
    async subsToExpire(now, all) { return [...subs.values()].filter(s => ['active', 'canceled', 'past_due'].includes(s.status) && s.period_end && s.period_end <= now && (all || !(s.auto_renew && s.next_charge_at))).map(s => ({ ...s })) },
    async subsEnding(now, until) { return [...subs.values()].filter(s => ['active', 'canceled', 'past_due'].includes(s.status) && s.period_end && s.period_end > now && s.period_end <= until).map(s => ({ ...s })) },
    async subsEnded(from, to) { return [...subs.values()].filter(s => s.period_end && s.period_end >= from && s.period_end <= to).map(s => ({ ...s })) },
    async stalePayments(older, newer) { return payments.filter(p => p.status === 'pending' && p.created_at <= older && p.created_at >= newer).map(p => ({ ...p })) },
    async lastPaid(u) { const p = [...payments].reverse().find(x => x.user_id === u && x.status === 'succeeded'); return p ? { ...p } : null },
    async insertRefund(row) { if (refunds.some(r => r.idempotence_key === row.idempotence_key)) throw new Error('unique'); const r = { ...row, id: uid(), status: 'pending', yk_refund_id: null }; refunds.push(r); return { id: r.id } },
    async updateRefund(id, patch) { Object.assign(refunds.find(r => r.id === id) || {}, patch) },
    async getRefundByYk(y) { const r = refunds.find(x => x.yk_refund_id === y); return r ? { id: r.id, payment_id: r.payment_id, status: r.status } : null },
    async userEmail(u) { return emails[u] ?? null },
    async queueMail(row) { mailq.push({ ...row, id: uid(), sent_at: null }) },
    async dueMails(now) { return mailq.filter(q => !q.sent_at && q.send_after <= now).map(q => ({ id: q.id, user_id: q.user_id, kind: q.kind, data: q.data })) },
    async mailSent(id, at) { const q = mailq.find(x => x.id === id); if (q) q.sent_at = at },
    async mailDelay(id, until) { const q = mailq.find(x => x.id === id); if (q) q.send_after = until },
  }
  return { repo, subs, payments, methods, consents, events, refunds, fail, mailq }
}

// Фальшивая ЮKassa. mode управляет исходом: чем закончится платеж на странице оплаты и автоплатеж
export function fakeYooKassa() {
  const store = new Map<string, YkPayment>()
  const byKey = new Map<string, string>()
  const refunds = new Map<string, YkRefund>()
  const calls: { method: string; body?: any; key?: string }[] = []
  const state = { autopay: 'succeeded' as 'succeeded' | 'canceled', autopayReason: 'insufficient_funds', fail: false, recurringForbidden: false, refundFail: false, sbpUnavailable: false }
  let n = 0
  const pid = () => `2f${Date.now().toString(16)}-000f-5000-8000-${String(++n).padStart(12, '0')}`
  const yk: YkClient = {
    async createPayment(body, key) {
      calls.push({ method: 'createPayment', body, key })
      if (state.fail) throw Object.assign(new Error('x'), { code: 'yookassa_500' })
      // магазину не включены автоплатежи: так ответил тестовый магазин 1532988 17.11 на save_payment_method
      if (state.recurringForbidden && body.save_payment_method) throw Object.assign(new Error('x'), { code: 'yookassa_403_forbidden' })
      if (state.sbpUnavailable && (body.payment_method_data as any)?.type === 'sbp') throw Object.assign(new Error('x'), { code: 'yookassa_400_invalid_request' })
      if (byKey.has(key)) return { ...store.get(byKey.get(key)!)! }
      const id = pid()
      const auto = !!body.payment_method_id
      const p: YkPayment = auto
        ? { id, status: state.autopay, paid: state.autopay === 'succeeded', amount: body.amount as any, metadata: body.metadata as any,
            payment_method: { type: 'bank_card', id: String(body.payment_method_id), saved: true, card: { last4: '4444', card_type: 'MasterCard' } },
            ...(state.autopay === 'canceled' ? { cancellation_details: { party: 'payment_network', reason: state.autopayReason } } : {}) }
        : { id, status: 'pending', paid: false, amount: body.amount as any, metadata: body.metadata as any,
            confirmation: { type: 'redirect', confirmation_url: `https://yoomoney.ru/checkout/payments/v2/contract?orderId=${id}` } }
      store.set(id, p); byKey.set(key, id)
      return { ...p }
    },
    async getPayment(id) { calls.push({ method: 'getPayment' }); const p = store.get(id); if (!p) throw Object.assign(new Error('x'), { code: 'yookassa_404' }); return JSON.parse(JSON.stringify(p)) },
    async createRefund(body, key) {
      calls.push({ method: 'createRefund', body, key })
      if (state.fail || state.refundFail) throw Object.assign(new Error('x'), { code: 'yookassa_500' })
      const r: YkRefund = { id: `rf-${++n}`, payment_id: String(body.payment_id), status: 'succeeded', amount: body.amount as any }
      refunds.set(r.id, r); return { ...r }
    },
    async getRefund(id) { const r = refunds.get(id); if (!r) throw new Error('404'); return { ...r } },
  }
  // человек на странице ЮKassa: заплатил (карта или СБП, сохранив способ или нет) или отказался
  const finish = (id: string, how: { ok: boolean; type?: 'bank_card' | 'sbp'; save?: boolean; reason?: string }) => {
    const p = store.get(id)!
    if (how.ok) Object.assign(p, { status: 'succeeded', paid: true, payment_method: how.type === 'sbp'
      ? { type: 'sbp', id: `pm-${id}`, saved: !!how.save, sbp_operation_id: '1027088AE4CB48CB81287833347A8777' }
      : { type: 'bank_card', id: `pm-${id}`, saved: !!how.save, card: { last4: '1234', card_type: 'Visa' } } })
    else Object.assign(p, { status: 'canceled', paid: false, cancellation_details: { party: 'yoo_money', reason: how.reason || 'expired_on_confirmation' } })
    return p
  }
  return { yk, store, calls, state, finish, refunds }
}
