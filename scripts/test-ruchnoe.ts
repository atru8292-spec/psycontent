// Ручное продление без автоплатежей (19.11): флаг AUTOPAY_ENABLED выключен, человек платит месяц сам.
// Продление заранее прибавляет месяц к концу, после конца месяц с даты оплаты, смена тарифа с пересчетом остатка,
// письма за 3 дня, в последние сутки и после конца уходят по одному разу, ни одного списания по сохраненному способу.
// Без базы и без ЮKassa: npx tsx scripts/test-ruchnoe.ts
import assert from 'node:assert/strict'
import { memoryRepo, fakeYooKassa } from '../lib/billing/memory'
import * as B from '../lib/billing/core'
import { manualWindow, monthSegmentStart, addMonthAnchored } from '../lib/billing/period'
import { PAID_NEXT_MANUAL } from '../lib/billing/mail-texts'
import { days } from '../lib/billing/pay-texts'

const U = 'u-1'
const YK_IP = '185.71.76.10'
const H = 3600000
function setup(start = '2026-11-20T09:00:00Z', autopay = false) {
  const clock = { t: new Date(start) }
  const m = memoryRepo({ [U]: 'anna@example.invalid' }, () => new Date(clock.t))
  const f = fakeYooKassa()
  const mails: { kind: string; data: any; at: string }[] = []
  const smtp = { down: false }
  const d: B.Deps = { now: () => new Date(clock.t), repo: m.repo, yk: f.yk, siteUrl: 'https://psycont.ru', offerVersion: '2026-11-18', autopay,
    mail: async (kind, _to, data) => { if (smtp.down) return false; mails.push({ kind, data, at: clock.t.toISOString() }); return true } }
  const at = (iso: string) => { clock.t = new Date(iso) }
  // оплатить на странице ЮKassa и получить вебхук
  const pay = async (plan: 'start' | 'practice', type: 'bank_card' | 'sbp' = 'bank_card') => {
    const r = await B.startCheckout(d, { userId: U, email: 'anna@example.invalid', plan, autoRenew: true, via: type === 'sbp' ? 'sbp' : 'any', ip: '1.2.3.4' })
    assert.ok(r.ok, JSON.stringify(r))
    const row = m.payments.at(-1)!
    f.finish(row.yk_payment_id!, { ok: true, type, save: true }) // даже если банк готов сохранить, мы не просили
    return (await B.handleWebhook(d, YK_IP, { event: 'payment.succeeded', object: { id: row.yk_payment_id, status: 'succeeded' } })).result
  }
  const autoCalls = () => f.calls.filter(c => c.method === 'createPayment' && c.body?.payment_method_id).length
  return { m, f, d, clock, mails, smtp, at, pay, autoCalls }
}

;(async () => {
  // ── флаг: по умолчанию выключен, включен только при 1 ──
  const env = process.env.AUTOPAY_ENABLED
  for (const [v, want] of [[undefined, false], ['0', false], ['true', false], ['1', true]] as const) {
    if (v === undefined) delete process.env.AUTOPAY_ENABLED; else process.env.AUTOPAY_ENABLED = v
    assert.equal(B.autopayOn({}), want, `AUTOPAY_ENABLED=${v}`)
  }
  if (env === undefined) delete process.env.AUTOPAY_ENABLED; else process.env.AUTOPAY_ENABLED = env
  assert.equal(B.autopayOn({ autopay: false }), false); assert.equal(B.autopayOn({ autopay: true }), true)
  assert.deepEqual([1, 2, 5, 11, 21, 22, 25].map(days), ['1 день', '2 дня', '5 дней', '11 дней', '21 день', '22 дня', '25 дней'])

  // ── 1. первая оплата: без сохранения способа и согласия, месяц с даты оплаты, письмо без строки о списании ──
  {
    const t = setup()
    assert.equal(await t.pay('start'), 'activated')
    const body = t.f.calls[0].body
    assert.ok(!('save_payment_method' in body), 'save_payment_method не уходит в ЮKassa')
    assert.equal(t.m.consents.length, 0, 'согласия на автосписания нет')
    assert.ok((t.m.payments[0].note || '').includes('manual'))
    const s = (await t.m.repo.getSub(U))!
    assert.equal(s.status, 'active'); assert.equal(s.auto_renew, false); assert.equal(s.next_charge_at, null); assert.equal(s.payment_method_id, null)
    assert.equal(s.period_start, '2026-11-20T09:00:00.000Z'); assert.equal(s.period_end, '2026-12-20T09:00:00.000Z')
    assert.equal(t.m.methods.length, 0, 'способ оплаты не сохранен, хотя банк был готов')
    const paid = t.mails.find(x => x.kind === 'paid')!
    assert.equal(paid.data.next, PAID_NEXT_MANUAL); assert.equal(paid.data.until, '20 декабря')

    // ── 2. продление заранее (за 5 дней): месяц прибавляется к концу, начало окна прежнее ──
    t.at('2026-12-15T12:00:00Z')
    assert.equal(await t.pay('start', 'sbp'), 'activated')
    const s2 = (await t.m.repo.getSub(U))!
    assert.equal(s2.period_end, '2027-01-20T09:00:00.000Z', 'к 20 декабря добавился месяц, а не к 15')
    assert.equal(s2.period_start, '2026-11-20T09:00:00.000Z', 'начало прежнее')
    assert.equal(s2.plan_code, 'start'); assert.equal(s2.auto_renew, false)
    assert.ok((t.m.payments[1].note || '').includes('extend') && !(t.m.payments[1].note || '').includes('refund_due'), 'не двойная оплата')
    assert.equal(t.mails.filter(x => x.kind === 'paid').at(-1)!.data.until, '20 января')
    // лимит текстов: свой счетчик на каждый месяц окна
    assert.equal(monthSegmentStart(new Date(s2.period_start!), s2.billing_anchor_day, new Date('2026-12-15T12:00:00Z')).toISOString(), '2026-11-20T09:00:00.000Z')
    assert.equal(monthSegmentStart(new Date(s2.period_start!), s2.billing_anchor_day, new Date('2026-12-21T12:00:00Z')).toISOString(), '2026-12-20T09:00:00.000Z', 'второй месяц со своим счетчиком')
    // еще одно продление заранее складывается дальше
    assert.equal(await t.pay('start'), 'activated')
    assert.equal((await t.m.repo.getSub(U))!.period_end, '2027-02-20T09:00:00.000Z')
    assert.equal(t.autoCalls(), 0)
  }

  // ── 3. после конца срока: тариф выключается, новая оплата дает месяц с даты оплаты ──
  {
    const t = setup()
    await t.pay('start')
    t.at('2026-12-20T09:30:00Z')
    const r = await B.runBilling(t.d)
    assert.equal(r.expired, 1)
    const s = (await t.m.repo.getSub(U))!
    assert.equal(s.status, 'expired'); assert.equal(s.plan_code, 'free')
    assert.equal(B.paidAccess(s, t.d.now()), false)
    t.at('2026-12-27T15:00:00Z')
    assert.equal(await t.pay('practice'), 'activated')
    const s2 = (await t.m.repo.getSub(U))!
    assert.equal(s2.plan_code, 'practice'); assert.equal(s2.period_start, '2026-12-27T15:00:00.000Z'); assert.equal(s2.period_end, '2027-01-27T15:00:00.000Z', 'с даты оплаты')
  }

  // ── 4. смена тарифа при оплаченном: новый сразу, остаток старого пересчитан по цене в дни нового ──
  {
    const t = setup()
    await t.pay('start')               // 1 290 ₽ до 20 декабря
    t.at('2026-12-08T09:00:00Z')       // осталось 12 дней
    assert.equal(await t.pay('practice'), 'activated')
    const s = (await t.m.repo.getSub(U))!
    // 12 дней * 1290 / 2490 = 6,2 -> 7 дней в пользу человека; месяц с 8 декабря до 8 января + 7 дней = 15 января
    assert.equal(s.plan_code, 'practice'); assert.equal(s.period_start, '2026-12-08T09:00:00.000Z'); assert.equal(s.period_end, '2027-01-15T09:00:00.000Z')
    assert.ok((t.m.payments[1].note || '').includes('switch'))
    const w = manualWindow(new Date('2026-12-08T09:00:00Z'), { planCode: 'start', price: 1290, end: new Date('2026-12-20T09:00:00Z'), anchor: 20 }, { code: 'practice', price: 2490 })
    assert.deepEqual([w.mode, w.daysLeft, w.bonusDays, w.end.toISOString()], ['switch', 12, 7, '2027-01-15T09:00:00.000Z'], 'экран оплаты показывает то же, что посчитал сервер')
    // обратно на дешевый: дней больше
    const w2 = manualWindow(new Date('2026-12-08T09:00:00Z'), { planCode: 'practice', price: 2490, end: new Date('2026-12-20T09:00:00Z'), anchor: 20 }, { code: 'start', price: 1290 })
    assert.equal(w2.bonusDays, 24, '12 дней * 2490 / 1290 = 23,2 -> 24')
    // без оплаченного: месяц с сегодня
    assert.equal(manualWindow(new Date('2026-12-08T09:00:00Z'), null, { code: 'start', price: 1290 }).end.toISOString(), '2027-01-08T09:00:00.000Z')
  }

  // ── 5. письма: за 3 дня, в последние сутки и после конца, каждое один раз, только с 10 до 20 по Москве ──
  {
    const t = setup()
    await t.pay('start')
    t.mails.length = 0
    // таймер раз в час с 15 декабря до 24 декабря; на одном прогоне почта лежит
    let hour = 0
    for (let ms = Date.parse('2026-12-15T00:00:00Z'); ms <= Date.parse('2026-12-24T00:00:00Z'); ms += H) {
      t.at(new Date(ms).toISOString())
      t.smtp.down = new Date(ms).toISOString() === '2026-12-17T09:00:00.000Z' // первая попытка письма за 3 дня не ушла
      await B.runBilling(t.d); hour++
    }
    const kinds = t.mails.map(x => x.kind)
    assert.deepEqual(kinds, ['end_soon', 'end_today', 'ended'], `по одному: ${kinds}`)
    const [soon, today, ended] = t.mails
    assert.equal(soon.at, '2026-12-17T10:00:00.000Z', 'за 3 дня; почта лежала, повтор через час')
    assert.equal(today.at, '2026-12-19T09:00:00.000Z', 'последние сутки'); assert.equal(today.data.day, 'Завтра')
    assert.equal(ended.at, '2026-12-21T07:00:00.000Z', 'на следующий день, в 10:00 по Москве')
    for (const x of t.mails) { assert.equal(x.data.code, 'start'); assert.equal(x.data.date, '20 декабря'); const h = (new Date(x.at).getUTCHours() + 3) % 24; assert.ok(h >= 10 && h < 20, `окно писем ${x.at}`) }
    assert.equal(t.autoCalls(), 0, 'ни одного списания')
    assert.ok(hour > 200)
  }

  // ── 6. продлил после письма за 3 дня: старый конец больше не пишет, новый получит свои письма ──
  {
    const t = setup()
    await t.pay('start')
    t.at('2026-12-17T09:00:00Z'); await B.runBilling(t.d)
    assert.equal(t.mails.at(-1)!.kind, 'end_soon')
    await t.pay('start')
    t.mails.length = 0
    for (let ms = Date.parse('2026-12-17T10:00:00Z'); ms <= Date.parse('2026-12-23T00:00:00Z'); ms += H) { t.at(new Date(ms).toISOString()); await B.runBilling(t.d) }
    assert.equal(t.mails.length, 0, 'после продления писем про 20 декабря нет')
    t.at('2027-01-17T09:00:00Z'); await B.runBilling(t.d)
    assert.deepEqual(t.mails.map(x => [x.kind, x.data.date]), [['end_soon', '20 января']])
  }

  // ── 7. в последний день утром: «Сегодня» ──
  {
    const t = setup('2026-11-20T15:00:00Z') // конец 20 декабря 18:00 по Москве
    await t.pay('start'); t.mails.length = 0
    t.at('2026-12-19T16:30:00Z'); await B.runBilling(t.d) // 19:30 по Москве, осталось меньше суток, письма за 3 дня не было
    assert.deepEqual(t.mails.map(x => [x.kind, x.data.day]), [['end_today', 'Завтра']])
    const t2 = setup('2026-11-20T15:00:00Z'); await t2.pay('start'); t2.mails.length = 0
    t2.at('2026-12-20T07:00:00Z'); await B.runBilling(t2.d)
    assert.deepEqual(t2.mails.map(x => [x.kind, x.data.day]), [['end_today', 'Сегодня']])
  }

  // ── 8. при выключенном флаге старая подписка с картой и автопродлением не списывается, просто кончается ──
  {
    const t = setup('2026-11-20T09:00:00Z', true)
    await t.pay('start') // включено: карта сохранена, автопродление
    let s = (await t.m.repo.getSub(U))!
    assert.ok(s.auto_renew && s.payment_method_id && s.next_charge_at)
    await t.m.repo.queueMail({ user_id: U, kind: 'charge_failed', data: { plan: 'x' }, send_after: '2026-12-01T00:00:00.000Z' })
    t.d.autopay = false; t.mails.length = 0
    const before = t.f.calls.length
    for (let ms = Date.parse('2026-12-14T00:00:00Z'); ms <= Date.parse('2026-12-23T00:00:00Z'); ms += H) { t.at(new Date(ms).toISOString()); await B.runBilling(t.d) }
    assert.equal(t.f.calls.slice(before).filter(c => c.method === 'createPayment').length, 0, 'ни одного createPayment за все прогоны')
    assert.equal(t.autoCalls(), 0)
    assert.ok(!t.mails.some(x => ['reminder', 'charge_failed', 'charge_failed_final'].includes(x.kind)), 'писем о списаниях нет')
    assert.ok(t.m.mailq.every(q => q.sent_at), 'старое письмо о неудаче из очереди закрыто без отправки')
    s = (await t.m.repo.getSub(U))!
    assert.equal(s.status, 'expired'); assert.equal(s.auto_renew, false); assert.equal(s.next_charge_at, null)
    assert.deepEqual(t.mails.map(x => x.kind), ['end_soon', 'end_today', 'ended'])
    // новая оплата при выключенном флаге: галочка с экрана игнорируется
    t.d.autopay = false
    const r = await B.startCheckout(t.d, { userId: U, email: null, plan: 'start', autoRenew: true, via: 'any', ip: null })
    assert.ok(r.ok); assert.ok(!('save_payment_method' in t.f.calls.at(-1)!.body)); assert.equal(t.m.payments.at(-1)!.save_requested, false)
  }

  // ── 9. включенный флаг: как раньше (второй раз купить нельзя, ручных писем нет) ──
  {
    const t = setup('2026-11-20T09:00:00Z', true)
    await t.pay('start')
    assert.deepEqual(await B.startCheckout(t.d, { userId: U, email: null, plan: 'start', autoRenew: false, via: 'any', ip: null }), { ok: false, error: 'already_paid' })
    t.mails.length = 0
    t.at('2026-12-17T09:00:00Z'); await B.runBilling(t.d)
    assert.deepEqual(t.mails.map(x => x.kind), ['reminder'])
  }

  // ── 10. возврат за продление, которое еще не началось: текущий месяц остается ──
  {
    const t = setup()
    await t.pay('start')
    t.at('2026-12-15T12:00:00Z'); await t.pay('start')
    const r = await B.refundPayment(t.d, t.m.payments[1].id)
    assert.ok(r.ok && r.amount === 1290, JSON.stringify(r))
    const s = (await t.m.repo.getSub(U))!
    assert.equal(s.period_end, '2026-12-20T09:00:00.000Z', 'оплаченное до 20 декабря работает'); assert.equal(s.plan_code, 'start')
    assert.equal(B.paidAccess(s, t.d.now()), true)
  }

  // ── 11. тариф выключила Арина: письма «закончился» нет; возврат: тоже нет ──
  {
    const t = setup()
    await t.pay('start'); t.mails.length = 0
    t.at('2026-12-01T09:00:00Z'); await B.adminDisable(t.d, U)
    for (let ms = Date.parse('2026-12-01T10:00:00Z'); ms <= Date.parse('2026-12-04T00:00:00Z'); ms += H) { t.at(new Date(ms).toISOString()); await B.runBilling(t.d) }
    assert.equal(t.mails.length, 0)
    const t2 = setup()
    await t2.pay('start'); t2.mails.length = 0
    t2.at('2026-12-01T09:00:00Z'); await B.refundRemaining(t2.d, U)
    for (let ms = Date.parse('2026-12-01T10:00:00Z'); ms <= Date.parse('2026-12-04T00:00:00Z'); ms += H) { t2.at(new Date(ms).toISOString()); await B.runBilling(t2.d) }
    assert.deepEqual(t2.mails.map(x => x.kind), ['refund'])
  }

  // ── 12 (ревью). Смена на дорогой тариф при оплате вперед больше двух месяцев: тариф меняется, конец по пересчету ──
  {
    const t = setup()
    await t.pay('start'); await t.pay('start'); await t.pay('start') // до 20 февраля, осталось ~92 дня
    const before = (await t.m.repo.getSub(U))!
    assert.equal(before.period_end, '2027-02-20T09:00:00.000Z')
    t.at('2026-11-21T09:00:00Z')
    assert.equal(await t.pay('practice'), 'activated')
    const s = (await t.m.repo.getSub(U))!
    // 91 день * 1290 / 2490 = 47,1 -> 48 дней; месяц до 21 декабря + 48 дней = 7 февраля
    assert.equal(s.plan_code, 'practice', 'тариф сменился, хотя новый конец раньше прежнего')
    assert.equal(s.period_end, '2027-02-07T09:00:00.000Z')
    // повтор вебхука и сверки ничего не меняет
    assert.equal(await B.processPayment(t.d, await t.f.yk.getPayment(t.m.payments.at(-1)!.yk_payment_id!)), 'already')
    assert.equal((await t.m.repo.getSub(U))!.period_end, '2027-02-07T09:00:00.000Z')
    assert.ok((t.m.payments.at(-1)!.note || '').includes('bonus:48'))
  }

  // ── 13 (ревью). Возврат не последнего продления не трогает оплаченные после него месяцы ──
  {
    const t = setup()
    await t.pay('start')
    t.at('2026-12-10T09:00:00Z'); await t.pay('start'); await t.pay('start') // E1 [20.12-20.01], E2 [20.01-20.02]
    assert.equal((await B.refundPayment(t.d, t.m.payments[1].id) as any).error, 'not_latest')
    assert.equal((await t.m.repo.getSub(U))!.period_end, '2027-02-20T09:00:00.000Z', 'ничего не обрезано')
    assert.equal((await B.refundPayment(t.d, t.m.payments[0].id) as any).error, 'not_latest', 'текущий месяц при оплаченных продлениях тоже только руками')
    const r = await B.refundPayment(t.d, t.m.payments[2].id)
    assert.ok(r.ok && r.amount === 1290)
    assert.equal((await t.m.repo.getSub(U))!.period_end, '2027-01-20T09:00:00.000Z', 'последнее продление вернули целиком')
  }

  // ── 14 (ревью). Возврат после смены тарифа: цена делится на дни месяца, пересчитанные дни не входят ──
  {
    const t = setup()
    await t.pay('start')
    t.at('2026-12-08T09:00:00Z'); await t.pay('practice') // 8.12-8.01 + 7 дней
    t.at('2026-12-18T12:00:00Z')
    const r = await B.refundRemaining(t.d, U) as any
    assert.ok(r.ok); assert.equal(r.daysTotal, 31, 'месяц 8.12-8.01 без 7 пересчитанных дней'); assert.equal(r.daysLeft, 20)
    assert.equal(r.amount, Math.floor(2490 * 20 / 31 * 100) / 100)
  }

  // ── 15 (ревью). Сбой посередине: окно записано, подписка нет, таймер успел выключить тариф; повтор возвращает доступ ──
  {
    const t = setup()
    await t.pay('start')
    t.at('2026-12-20T08:55:00Z')
    const co = await B.startCheckout(t.d, { userId: U, email: null, plan: 'start', autoRenew: false, via: 'any', ip: null })
    assert.ok(co.ok)
    const row = t.m.payments.at(-1)!
    t.f.finish(row.yk_payment_id!, { ok: true, type: 'bank_card' })
    t.m.fail.applySub = true // upsertSub с period_start падает; updateSub (продление) тоже не дойдет
    const realUpdate = t.m.repo.updateSub; t.m.repo.updateSub = async () => { throw new Error('db') }
    await B.processPayment(t.d, await t.f.yk.getPayment(row.yk_payment_id!)).catch(() => 'fail')
    t.m.repo.updateSub = realUpdate; t.m.fail.applySub = false
    t.at('2026-12-20T09:03:00Z'); assert.equal((await B.runBilling(t.d)).expired, 1) // таймер: сверка зависшего еще рано (меньше 10 минут), окно кончилось
    assert.equal((await t.m.repo.getSub(U))!.plan_code, 'free')
    t.at('2026-12-20T09:40:00Z')
    assert.equal(await B.processPayment(t.d, await t.f.yk.getPayment(row.yk_payment_id!)), 'activated')
    const s = (await t.m.repo.getSub(U))!
    assert.equal(s.plan_code, 'start'); assert.equal(s.status, 'active'); assert.equal(s.period_end, '2027-01-20T09:00:00.000Z')
    assert.equal(B.paidAccess(s, t.d.now()), true, 'оплатил, доступ есть')
  }

  // ── 16 (ревью). Две вкладки, два разных платежа за продление, вебхуки подряд до записи подписки: два месяца ──
  {
    const t = setup()
    await t.pay('start')
    t.at('2026-12-15T12:00:00Z')
    const a = await B.startCheckout(t.d, { userId: U, email: null, plan: 'start', autoRenew: false, via: 'any', ip: null })
    const b = await B.startCheckout(t.d, { userId: U, email: null, plan: 'start', autoRenew: false, via: 'sbp', ip: null })
    assert.ok(a.ok && b.ok)
    const [ra, rb] = t.m.payments.slice(-2)
    t.f.finish(ra.yk_payment_id!, { ok: true }); t.f.finish(rb.yk_payment_id!, { ok: true, type: 'sbp' })
    await B.processPayment(t.d, await t.f.yk.getPayment(ra.yk_payment_id!))
    await B.processPayment(t.d, await t.f.yk.getPayment(rb.yk_payment_id!))
    assert.equal((await t.m.repo.getSub(U))!.period_end, '2027-02-20T09:00:00.000Z', 'оплачено два месяца, выдано два')
    assert.ok((t.m.payments.at(-1)!.note || '').includes('check'), 'вторая оплата за 15 минут помечена для /admin')
  }

  // ── 17 (ревью). Продление, начатое при включенном флаге, отменилось после выключения: ни повтора, ни письма о неудаче ──
  {
    const t = setup('2026-11-20T09:00:00Z', true)
    await t.pay('start')
    t.at('2026-12-17T09:00:00Z'); await B.runBilling(t.d) // письмо за 3 дня
    // списание ушло при включенном флаге, ответ «отменено» пришел уже после выключения
    t.f.state.autopay = 'canceled'
    const row2 = await t.m.repo.insertPayment({ user_id: U, email: null, kind: 'renewal', plan_code: 'start', amount: 1290, save_requested: true, idempotence_key: 'renew-test', attempt: 1, note: null })
    const p2 = await t.f.yk.createPayment({ amount: { value: '1290.00', currency: 'RUB' }, capture: true, payment_method_id: 'pm-x', metadata: { payment_row: row2.id } }, 'renew-test')
    await t.m.repo.updatePayment(row2.id, { yk_payment_id: p2.id })
    t.d.autopay = false; t.mails.length = 0
    t.at('2026-12-20T09:05:00Z')
    assert.equal(await B.processPayment(t.d, p2), 'autopay_off')
    let s = (await t.m.repo.getSub(U))!
    assert.equal(s.next_charge_at, null); assert.equal(s.auto_renew, false)
    for (let ms = Date.parse('2026-12-20T10:00:00Z'); ms <= Date.parse('2026-12-23T00:00:00Z'); ms += H) { t.at(new Date(ms).toISOString()); await B.runBilling(t.d) }
    assert.ok(!t.mails.some(x => x.kind.startsWith('charge_failed') || x.kind === 'reminder'), 'писем о неудаче и повторе нет')
    s = (await t.m.repo.getSub(U))!
    assert.equal(s.status, 'expired')
    assert.deepEqual(t.mails.map(x => x.kind), ['ended'])
  }

  // якорь 31 числа при продлении заранее не съезжает
  assert.equal(manualWindow(new Date('2027-01-20T09:00:00Z'), { planCode: 'start', price: 1290, end: new Date('2027-01-31T09:00:00Z'), anchor: 31 }, { code: 'start', price: 1290 }).end.toISOString(), addMonthAnchored(new Date('2027-01-31T09:00:00Z'), 31).toISOString())

  console.log('test-ruchnoe: все сценарии прошли')
})().catch(e => { console.error(e); process.exit(1) })
