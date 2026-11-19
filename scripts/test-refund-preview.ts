// Тест текста возврата в /admin/oplata (19.11): refundPreview совпадает с расчетом refundPayment. npx tsx scripts/test-refund-preview.ts
import assert from 'node:assert/strict'
import { refundPreview } from '../lib/billing/refund-preview'
import { refundByDays } from '../lib/billing/period'

const now = new Date('2026-11-19T12:20:00Z')
const base = { user_id: 'u', status: 'succeeded', amount: 1290, note: null as string | null }
// продление заранее: целиком, тариф остается до начала окна
const f = refundPreview({ ...base, period_start: '2026-12-17T15:58:30Z', period_end: '2027-01-17T15:58:30Z' }, { status: 'canceled', period_end: '2027-01-17T15:58:30Z' }, now)
assert.ok(f.can && f.effect === 'future' && f.full && f.amount === 1290 && f.keepUntil === '2026-12-17T15:58:30Z')
// текущий месяц: по дням, как refundByDays, тариф выключается
const c = refundPreview({ ...base, amount: 2490, period_start: '2026-11-09T09:10:00Z', period_end: '2026-12-09T09:10:00Z' }, { status: 'canceled', period_end: '2026-12-09T09:10:00Z' }, now)
const exp = refundByDays(2490, new Date('2026-11-09T09:10:00Z'), new Date('2026-12-09T09:10:00Z'), now)
assert.ok(c.can && c.effect === 'off_now' && !c.full && c.amount === exp.amount && c.daysLeft === exp.daysLeft)
// bonus-дни смены тарифа не входят
const b = refundPreview({ ...base, note: 'bonus:10', period_start: '2026-11-09T09:10:00Z', period_end: '2026-12-19T09:10:00Z' }, { status: 'active', period_end: '2026-12-19T09:10:00Z' }, now)
assert.ok(b.can && b.amount === refundByDays(1290, new Date('2026-11-09T09:10:00Z'), new Date('2026-12-09T09:10:00Z'), now).amount)
// удаленный аккаунт: целиком
const n = refundPreview({ ...base, user_id: null, period_start: null, period_end: null }, null, now)
assert.ok(n.can && n.effect === 'no_account' && n.amount === 1290)
// не последний платеж, уже возвращен, не оплачен, дни кончились
assert.deepEqual(refundPreview({ ...base, period_start: '2026-11-09T09:10:00Z', period_end: '2026-12-09T09:10:00Z' }, { status: 'canceled', period_end: '2027-01-09T09:10:00Z' }, now), { can: false, why: 'not_latest' })
assert.deepEqual(refundPreview({ ...base, note: ',refunded:1290', period_start: null, period_end: null }, null, now), { can: false, why: 'refunded' })
assert.deepEqual(refundPreview({ ...base, status: 'canceled', period_start: null, period_end: null }, null, now), { can: false, why: 'not_paid' })
assert.deepEqual(refundPreview({ ...base, period_start: '2026-10-19T09:10:00Z', period_end: '2026-11-19T15:10:00Z' }, { status: 'canceled', period_end: '2026-11-19T15:10:00Z' }, now), { can: false, why: 'nothing_left' })
console.log('refund-preview: 8 проверок прошли')
