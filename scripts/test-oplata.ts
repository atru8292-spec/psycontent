// Сценарии оплаты на заглушках (17.11): оплата картой и СБП, отказ, вебхук раньше возврата, вебхук дважды,
// вебхук с чужого адреса, продление успешное и неудачное с повторами, отключение автопродления, удаление карты,
// возврат по дням, удаление аккаунта с подпиской, окно лимита и даты. npx tsx scripts/test-oplata.ts
import assert from 'node:assert/strict'
import { memoryRepo, fakeYooKassa } from '../lib/billing/memory'
import * as B from '../lib/billing/core'
import { addMonthAnchored, refundByDays, anchorDayOf } from '../lib/billing/period'
import { isYooKassaIp } from '../lib/billing/ip'

const U = 'u-1', U2 = 'u-2'
const YK_IP = '185.71.76.10', BAD_IP = '8.8.8.8'
function setup(start = '2026-11-17T09:00:00Z') {
  const clock = { t: new Date(start) }
  const m = memoryRepo({ [U]: 'anna@example.invalid', [U2]: 'b@example.invalid' }, () => new Date(clock.t))
  const f = fakeYooKassa()
  const mails: { kind: string; to: string; data: any }[] = []
  const events: string[] = []
  const d: B.Deps = { now: () => new Date(clock.t), repo: m.repo, yk: f.yk, siteUrl: 'https://psycont.ru', offerVersion: '2026-11-14',
    mail: async (kind, to, data) => { mails.push({ kind, to, data }) }, track: (_u, e) => { events.push(e) } }
  const hook = (event: string, id: string, status: string, ip = YK_IP) => B.handleWebhook(d, ip, { type: 'notification', event, object: { id, status } })
  const at = (iso: string) => { clock.t = new Date(iso) }
  return { m, f, d, clock, mails, events, hook, at }
}

;(async () => {
  // ── даты и возврат ──
  assert.equal(addMonthAnchored(new Date('2026-01-31T09:00:00Z'), 31).toISOString(), '2026-02-28T09:00:00.000Z', '31 января -> 28 февраля')
  assert.equal(addMonthAnchored(new Date('2026-02-28T09:00:00Z'), 31).toISOString(), '2026-03-31T09:00:00.000Z', 'якорь возвращает 31 марта')
  assert.equal(addMonthAnchored(new Date('2026-11-17T09:00:00Z'), 17).toISOString(), '2026-12-17T09:00:00.000Z')
  assert.equal(anchorDayOf(new Date('2026-11-17T22:30:00Z')), 18, 'день по Москве')
  const rf = refundByDays(1290, new Date('2026-11-17T09:00:00Z'), new Date('2026-12-17T09:00:00Z'), new Date('2026-11-27T12:00:00Z'))
  assert.deepEqual(rf, { amount: 817, daysLeft: 19, daysTotal: 30 }, '1290/30*19: оплачено 17.11-16.12, после просьбы 27.11 остались 28.11-16.12')
  assert.equal(refundByDays(2490, new Date('2026-11-17T09:00:00Z'), new Date('2026-12-17T09:00:00Z'), new Date('2026-12-16T12:00:00Z')).amount, 0, 'в последний день возвращать нечего')

  // ── адреса ЮKassa ──
  for (const ip of ['185.71.76.0', '185.71.76.31', '185.71.77.5', '77.75.153.127', '77.75.156.11', '77.75.156.35', '77.75.154.200', '2a02:5180::1', '2a02:5180:0:1::5', '::ffff:185.71.76.10']) assert.ok(isYooKassaIp(ip), ip)
  for (const ip of ['185.71.76.32', '77.75.153.128', '77.75.156.12', '8.8.8.8', '2a02:5181::1', '', 'unknown']) assert.ok(!isYooKassaIp(ip), ip)

  // ── 1. оплата картой с автопродлением: вебхук включает тариф, возврат на сайт ничего не включает ──
  {
    const t = setup()
    const r = await B.startCheckout(t.d, { userId: U, email: 'anna@example.invalid', plan: 'start', autoRenew: true, via: 'any', ip: '1.2.3.4' })
    assert.ok(r.ok)
    const body = t.f.calls[0].body
    assert.equal(body.save_payment_method, true); assert.equal(body.amount.value, '1290.00'); assert.equal(body.confirmation.type, 'redirect')
    assert.ok(!body.payment_method_data, 'без выбора способа ЮKassa показывает свою страницу со всеми способами')
    assert.equal(t.m.consents.length, 1, 'согласие записано'); assert.equal(t.m.consents[0].ip, '1.2.3.4'); assert.ok(t.m.consents[0].consent_text.includes('1 290 ₽'))
    assert.equal(await B.paidAccess(await t.m.repo.getSub(U), t.d.now()), false, 'до вебхука тарифа нет')
    const ykId = t.m.payments[0].yk_payment_id!
    t.f.finish(ykId, { ok: true, type: 'bank_card', save: true })
    assert.deepEqual(await t.hook('payment.succeeded', ykId, 'succeeded'), { status: 200, result: 'activated' })
    const s = (await t.m.repo.getSub(U))!
    assert.equal(s.plan_code, 'start'); assert.equal(s.status, 'active'); assert.equal(s.auto_renew, true)
    assert.equal(s.period_end, '2026-12-17T09:00:00.000Z'); assert.equal(s.next_charge_at, s.period_end)
    assert.equal(t.m.methods[0].title, 'Карта Visa ****1234')
    assert.equal(t.m.payments[0].receipt_status, 'need', 'чек ждет Арину')
    assert.equal(t.mails.at(-1)!.kind, 'paid')
    // вебхук дважды: второй ничего не меняет
    assert.deepEqual(await t.hook('payment.succeeded', ykId, 'succeeded'), { status: 200, result: 'duplicate' })
    // та же оплата через сверку таймером: уже обработано
    assert.equal(await B.processPayment(t.d, await t.f.yk.getPayment(ykId)), 'already')
    assert.equal(t.mails.filter(m => m.kind === 'paid').length, 1, 'одно письмо')
    // второй раз купить нельзя, пока окно активно
    assert.deepEqual(await B.startCheckout(t.d, { userId: U, email: null, plan: 'practice', autoRenew: false, via: 'any', ip: null }), { ok: false, error: 'already_paid' })
    // после «Отключить автопродление» окно еще оплачено: новая оплата сожгла бы оставшиеся дни, не пускаем
    await B.disableAutoRenew(t.d, U)
    assert.deepEqual(await B.startCheckout(t.d, { userId: U, email: null, plan: 'start', autoRenew: true, via: 'any', ip: null }), { ok: false, error: 'already_paid' })
  }

  // ── 2. СБП без автопродления: способ не сохраняется, согласия нет ──
  {
    const t = setup()
    const r = await B.startCheckout(t.d, { userId: U, email: null, plan: 'practice', autoRenew: false, via: 'sbp', ip: null })
    assert.ok(r.ok)
    assert.deepEqual(t.f.calls[0].body.payment_method_data, { type: 'sbp' }); assert.ok(!('save_payment_method' in t.f.calls[0].body))
    assert.equal(t.m.consents.length, 0)
    const ykId = t.m.payments[0].yk_payment_id!
    t.f.finish(ykId, { ok: true, type: 'sbp', save: false })
    assert.equal((await t.hook('payment.succeeded', ykId, 'succeeded')).result, 'activated')
    const s = (await t.m.repo.getSub(U))!
    assert.equal(s.auto_renew, false); assert.equal(s.next_charge_at, null); assert.equal(t.m.methods.length, 0)
    // окно кончилось, продления нет: тариф снова пробный
    t.at('2026-12-17T10:00:00Z')
    assert.equal((await B.runBilling(t.d)).expired, 1)
    assert.equal((await t.m.repo.getSub(U))!.plan_code, 'free')
  }

  // ── 3. СБП с согласием, но банк не сохранил способ: оплата есть, автопродления нет ──
  {
    const t = setup()
    await B.startCheckout(t.d, { userId: U, email: null, plan: 'start', autoRenew: true, via: 'sbp', ip: null })
    const ykId = t.m.payments[0].yk_payment_id!
    t.f.finish(ykId, { ok: true, type: 'sbp', save: false })
    await t.hook('payment.succeeded', ykId, 'succeeded')
    assert.equal((await t.m.repo.getSub(U))!.auto_renew, false, 'без сохраненного способа автопродления нет')
  }

  // ── 4. отказ на странице оплаты; вебхук с чужого адреса; вебхук раньше возврата ──
  {
    const t = setup()
    await B.startCheckout(t.d, { userId: U, email: null, plan: 'start', autoRenew: false, via: 'any', ip: null })
    const ykId = t.m.payments[0].yk_payment_id!
    t.f.finish(ykId, { ok: true, type: 'bank_card' })
    assert.deepEqual(await t.hook('payment.succeeded', ykId, 'succeeded', BAD_IP), { status: 403, result: 'bad_ip' })
    assert.equal(t.m.payments[0].status, 'pending', 'чужой адрес ничего не меняет')
    // подделка с правильным адресом, но платеж в API не оплачен: верим только API
    const t2 = setup()
    await B.startCheckout(t2.d, { userId: U, email: null, plan: 'start', autoRenew: false, via: 'any', ip: null })
    const id2 = t2.m.payments[0].yk_payment_id!
    assert.equal((await t2.hook('payment.succeeded', id2, 'succeeded')).result, 'pending', 'в API платеж еще pending')
    assert.equal((await t2.m.repo.getSub(U)), null)
    t2.f.finish(id2, { ok: false, reason: 'expired_on_confirmation' })
    assert.equal((await t2.hook('payment.canceled', id2, 'canceled')).result, 'canceled')
    assert.equal(t2.m.payments[0].status, 'canceled')
    // сумма в ответе не совпала: не включаем
    const t3 = setup()
    await B.startCheckout(t3.d, { userId: U, email: null, plan: 'start', autoRenew: false, via: 'any', ip: null })
    const id3 = t3.m.payments[0].yk_payment_id!
    t3.f.finish(id3, { ok: true }); t3.f.store.get(id3)!.amount = { value: '1.00', currency: 'RUB' }
    assert.equal((await t3.hook('payment.succeeded', id3, 'succeeded')).result, 'amount_mismatch')
  }

  // ── 5. вебхук потерялся: таймер сверяет зависший платеж через 10 минут ──
  {
    const t = setup()
    await B.startCheckout(t.d, { userId: U, email: null, plan: 'start', autoRenew: false, via: 'any', ip: null })
    t.m.payments[0].created_at = '2026-11-17T09:00:00.000Z'
    t.f.finish(t.m.payments[0].yk_payment_id!, { ok: true })
    t.at('2026-11-17T09:05:00Z'); assert.equal((await B.runBilling(t.d)).reconciled, 0, 'рано')
    t.at('2026-11-17T09:15:00Z'); assert.equal((await B.runBilling(t.d)).reconciled, 1)
    assert.equal((await t.m.repo.getSub(U))!.status, 'active')
  }

  // ── 6. продление: письмо за 3 дня, успешное списание, окно от конца прошлого ──
  async function paidWithCard(t: ReturnType<typeof setup>) {
    await B.startCheckout(t.d, { userId: U, email: 'anna@example.invalid', plan: 'start', autoRenew: true, via: 'any', ip: null })
    const ykId = t.m.payments[0].yk_payment_id!
    t.f.finish(ykId, { ok: true, type: 'bank_card', save: true })
    await t.hook('payment.succeeded', ykId, 'succeeded')
  }
  {
    const t = setup(); await paidWithCard(t)
    t.at('2026-12-14T10:00:00Z'); await B.runBilling(t.d)
    assert.equal(t.mails.filter(m => m.kind === 'reminder').length, 1, 'письмо за 3 дня')
    assert.equal(t.mails.at(-1)!.data.amount, '1 290 ₽')
    await B.runBilling(t.d); assert.equal(t.mails.filter(m => m.kind === 'reminder').length, 1, 'одно на дату')
    t.at('2026-12-17T09:30:00Z')
    const r = await B.runBilling(t.d)
    assert.equal(r.charged, 1)
    const renew = t.f.calls.find(c => c.method === 'createPayment' && c.body.payment_method_id)!
    assert.equal(renew.body.payment_method_id, 'pm-' + t.m.payments[0].yk_payment_id); assert.ok(!renew.body.confirmation, 'автоплатеж без подтверждения')
    const s = (await t.m.repo.getSub(U))!
    assert.equal(s.period_start, '2026-12-17T09:00:00.000Z', 'новое окно от конца прошлого'); assert.equal(s.period_end, '2027-01-17T09:00:00.000Z')
    assert.equal(t.m.payments.filter(p => p.kind === 'renewal' && p.status === 'succeeded').length, 1)
    // таймер еще раз в тот же час: второго списания нет
    await B.runBilling(t.d); assert.equal(t.f.calls.filter(c => c.body?.payment_method_id).length, 1)
  }

  // ── 7. продление не прошло: два повтора (через 1 и 3 дня), потом тариф не продлевается ──
  {
    const t = setup(); await paidWithCard(t)
    t.f.state.autopay = 'canceled'
    t.at('2026-12-14T10:00:00Z'); await B.runBilling(t.d)
    t.at('2026-12-17T09:30:00Z'); await B.runBilling(t.d)
    let s = (await t.m.repo.getSub(U))!
    assert.equal(s.status, 'past_due'); assert.equal(s.next_charge_at, '2026-12-18T09:30:00.000Z')
    assert.equal(B.paidAccess(s, t.d.now()), false, 'окно кончилось: доступа нет, пока не оплачено')
    assert.equal(t.mails.at(-1)!.kind, 'charge_failed')
    t.at('2026-12-18T09:40:00Z'); await B.runBilling(t.d)
    s = (await t.m.repo.getSub(U))!; assert.equal(s.next_charge_at, '2026-12-20T09:40:00.000Z', 'второй повтор через 2 дня (3-й день)')
    // на третьей попытке денег хватило: новое окно от момента оплаты
    t.f.state.autopay = 'succeeded'
    t.at('2026-12-20T09:45:00Z'); const r = await B.runBilling(t.d)
    assert.equal(r.charged, 1)
    s = (await t.m.repo.getSub(U))!; assert.equal(s.status, 'active'); assert.equal(s.period_start, '2026-12-20T09:45:00.000Z'); assert.equal(s.retry_count, 0)
    assert.equal(s.period_end, '2027-01-20T09:45:00.000Z', 'после позднего повтора полный месяц от оплаты')
    // и вариант, когда все попытки не прошли
    const t2 = setup(); await paidWithCard(t2); t2.f.state.autopay = 'canceled'
    for (const at of ['2026-12-14T10:00:00Z', '2026-12-17T09:30:00Z', '2026-12-18T09:40:00Z', '2026-12-20T09:50:00Z']) { t2.at(at); await B.runBilling(t2.d) }
    s = (await t2.m.repo.getSub(U))!
    assert.equal(s.status, 'expired'); assert.equal(s.plan_code, 'free'); assert.equal(s.auto_renew, false)
    // отключение во время повторов: тариф выключается, письма с прошедшей датой нет
    const t4 = setup(); await paidWithCard(t4); t4.f.state.autopay = 'canceled'
    t4.at('2026-12-14T10:00:00Z'); await B.runBilling(t4.d)
    t4.at('2026-12-17T09:30:00Z'); await B.runBilling(t4.d)
    const before = t4.mails.length; await B.disableAutoRenew(t4.d, U)
    assert.equal(t4.mails.length, before, 'нет письма «работает до» с прошедшей датой'); assert.equal((await t4.m.repo.getSub(U))!.plan_code, 'free')
    assert.equal(t2.mails.filter(m => m.kind === 'charge_failed').length, 2); assert.equal(t2.mails.at(-1)!.kind, 'charge_failed_final')
    assert.equal(t2.f.calls.filter(c => c.body?.payment_method_id).length, 3, 'три попытки, не больше')
    // отозванное разрешение: без повторов
    const t3 = setup(); await paidWithCard(t3); t3.f.state.autopay = 'canceled'; t3.f.state.autopayReason = 'permission_revoked'
    t3.at('2026-12-14T10:00:00Z'); await B.runBilling(t3.d)
    t3.at('2026-12-17T09:30:00Z'); await B.runBilling(t3.d)
    assert.equal((await t3.m.repo.getSub(U))!.status, 'expired')
  }

  // ── 8. «Отключить автопродление» и «Удалить карту»: сразу, доступ до конца окна ──
  {
    const t = setup(); await paidWithCard(t)
    t.at('2026-11-20T10:00:00Z')
    assert.equal(await B.disableAutoRenew(t.d, U), 'ok')
    let s = (await t.m.repo.getSub(U))!
    assert.equal(s.auto_renew, false); assert.equal(s.next_charge_at, null); assert.equal(s.status, 'canceled')
    assert.equal(B.paidAccess(s, t.d.now()), true, 'до конца окна тариф работает')
    assert.equal(t.mails.at(-1)!.kind, 'autorenew_off')
    t.at('2026-12-17T09:30:00Z'); const r = await B.runBilling(t.d)
    assert.equal(r.charged, 0); assert.equal(r.expired, 1); assert.equal(t.f.calls.filter(c => c.body?.payment_method_id).length, 0, 'не списали')
    const t2 = setup(); await paidWithCard(t2)
    await B.deletePaymentMethod(t2.d, U)
    assert.ok(t2.m.methods[0].deleted_at); s = (await t2.m.repo.getSub(U))!; assert.equal(s.auto_renew, false); assert.equal(s.payment_method_id, null)
    t2.at('2026-12-17T09:30:00Z'); await B.runBilling(t2.d)
    assert.equal(t2.f.calls.filter(c => c.body?.payment_method_id).length, 0, 'с удаленной карты не списываем')
  }

  // ── 9. возврат за оставшиеся дни ──
  {
    const t = setup(); await paidWithCard(t)
    t.at('2026-11-27T12:00:00Z')
    const r = await B.refundRemaining(t.d, U)
    assert.ok(r.ok && r.amount === 817 && r.daysLeft === 19 && r.daysTotal === 30, JSON.stringify(r))
    const rc = t.f.calls.find(c => c.method === 'createRefund')!
    assert.equal(rc.body.amount.value, '817.00'); assert.equal(rc.body.payment_id, t.m.payments[0].yk_payment_id)
    const s = (await t.m.repo.getSub(U))!
    assert.equal(s.plan_code, 'free'); assert.equal(s.auto_renew, false); assert.equal(B.paidAccess(s, t.d.now()), false, 'в день возврата тариф выключен')
    assert.equal(t.m.payments[0].receipt_status, 'need', 'чек еще не выбит: выбить на остаток'); assert.ok((t.m.payments[0].note || '').includes('refunded:817'))
    assert.equal((await B.refundRemaining(t.d, U) as any).error, 'already_refunded', 'второго возврата нет')
  }

  // ── 10. удаление аккаунта с подпиской: автопродление и способ гасятся до удаления ──
  {
    const t = setup(); await paidWithCard(t)
    await B.cancelBillingForDeletion(t.d, U)
    assert.equal((await t.m.repo.getSub(U))!.auto_renew, false); assert.ok(t.m.methods[0].deleted_at)
  }

  // ── 11. /admin: продлить и выключить ──
  {
    const t = setup()
    assert.equal(await B.adminExtend(t.d, U, 7, 'start'), 'ok')
    let s = (await t.m.repo.getSub(U))!; assert.ok(B.paidAccess(s, t.d.now())); assert.equal(s.period_end, '2026-11-24T09:00:00.000Z')
    assert.equal(await B.adminExtend(t.d, U, 0, 'start'), 'bad'); assert.equal(await B.adminExtend(t.d, U, 5, 'free'), 'bad')
    await B.adminDisable(t.d, U); s = (await t.m.repo.getSub(U))!; assert.ok(!B.paidAccess(s, t.d.now()))
  }

  // ── 12. ЮKassa недоступна при переходе к оплате: платеж отменен, человеку понятная ошибка ──
  {
    const t = setup(); t.f.state.fail = true
    assert.deepEqual(await B.startCheckout(t.d, { userId: U, email: null, plan: 'start', autoRenew: true, via: 'any', ip: null }), { ok: false, error: 'yookassa' })
    assert.equal(t.m.payments[0].status, 'canceled')
    assert.deepEqual(await B.startCheckout(t.d, { userId: U, email: null, plan: 'expert', autoRenew: true, via: 'any', ip: null }), { ok: false, error: 'bad_plan' })
  }
  // ── 13. ревью 17.11: блокеры и важное ──
  {
    // 13.1 автоплатежи магазину не включены (403): оплата без сохранения, человек увидит, что автопродление не включилось
    const t = setup(); t.f.state.recurringForbidden = true
    const r = await B.startCheckout(t.d, { userId: U, email: null, plan: 'start', autoRenew: true, via: 'sbp', ip: null })
    assert.ok(r.ok && (r as any).saveDropped, 'оплата открылась без сохранения')
    assert.ok(!t.f.calls.at(-1)!.body.save_payment_method)
    assert.equal(t.m.consents.length, 1, 'согласие записано, человек его дал')
    const ykId = t.m.payments[0].yk_payment_id!
    t.f.finish(ykId, { ok: true, type: 'sbp' }); await t.hook('payment.succeeded', ykId, 'succeeded')
    assert.equal((await t.m.repo.getSub(U))!.auto_renew, false)
  }
  {
    // 13.2 две вкладки: свежий платеж отдается снова; предел 5 переходов за 10 минут
    const t = setup()
    const a1 = await B.startCheckout(t.d, { userId: U, email: null, plan: 'start', autoRenew: false, via: 'any', ip: null })
    const a2 = await B.startCheckout(t.d, { userId: U, email: null, plan: 'start', autoRenew: false, via: 'any', ip: null })
    assert.ok(a1.ok && a2.ok && a1.url === a2.url && t.m.payments.length === 1, 'второй платеж не создан')
    const combos = [['practice', 'sbp', true], ['practice', 'any', true], ['start', 'sbp', true], ['start', 'sbp', false]] as const
    for (const [plan, via, auto] of combos) assert.ok((await B.startCheckout(t.d, { userId: U, email: null, plan, autoRenew: auto, via, ip: null })).ok)
    assert.equal(t.m.payments.length, 5)
    assert.deepEqual(await B.startCheckout(t.d, { userId: U, email: null, plan: 'practice', autoRenew: false, via: 'any', ip: null }), { ok: false, error: 'too_many' })
  }
  {
    // 13.3 двойная оплата (СБП прошла позже карты): окно складывается, ничего не сгорает, пометка «вернуть»
    const t = setup()
    await B.startCheckout(t.d, { userId: U, email: null, plan: 'start', autoRenew: false, via: 'any', ip: null })
    await B.startCheckout(t.d, { userId: U, email: null, plan: 'start', autoRenew: false, via: 'sbp', ip: null })
    const [p1, p2] = t.m.payments
    t.f.finish(p1.yk_payment_id!, { ok: true }); await t.hook('payment.succeeded', p1.yk_payment_id!, 'succeeded')
    t.at('2026-11-17T09:20:00Z')
    t.f.finish(p2.yk_payment_id!, { ok: true, type: 'sbp' }); await t.hook('payment.succeeded', p2.yk_payment_id!, 'succeeded')
    const s = (await t.m.repo.getSub(U))!
    assert.equal(s.period_start, '2026-11-17T09:00:00.000Z', 'начало окна и счетчик прежние'); assert.equal(s.period_end, '2027-01-17T09:00:00.000Z', 'два месяца')
    assert.ok((t.m.payments[1].note || '').includes('double') && (t.m.payments[1].note || '').includes('refund_due'))
  }
  {
    // 13.4 сбой базы посередине включения: платеж остается pending, повтор (вебхук или сверка) доводит до конца
    const t = setup()
    await B.startCheckout(t.d, { userId: U, email: null, plan: 'start', autoRenew: false, via: 'any', ip: null })
    const ykId = t.m.payments[0].yk_payment_id!
    t.f.finish(ykId, { ok: true })
    t.m.fail.applySub = true
    assert.equal((await t.hook('payment.succeeded', ykId, 'succeeded')).status, 500, 'ЮKassa повторит')
    assert.equal(t.m.payments[0].status, 'pending', 'деньги есть, но платеж еще не закрыт')
    t.m.fail.applySub = false
    assert.equal((await t.hook('payment.succeeded', ykId, 'succeeded')).result, 'activated', 'повтор включил тариф')
    assert.equal((await t.m.repo.getSub(U))!.plan_code, 'start')
  }
  {
    // 13.5 человек отключил автопродление, пока таймер шел по списку: списания нет
    const t = setup(); await paidWithCard(t)
    t.at('2026-12-14T10:00:00Z'); await B.runBilling(t.d)
    t.at('2026-12-17T09:30:00Z')
    const orig = t.m.repo.subsToCharge
    t.m.repo.subsToCharge = async (n) => { const list = await orig(n); await B.disableAutoRenew(t.d, U); return list }
    await B.runBilling(t.d)
    assert.equal(t.f.calls.filter(c => c.body?.payment_method_id).length, 0)
  }
  {
    // 13.6 без письма «за 3 дня» не списываем: письмо сейчас, списание через 3 дня
    const t = setup(); await paidWithCard(t)
    t.at('2026-12-17T09:30:00Z'); const r = await B.runBilling(t.d)
    assert.equal(r.postponed, 1); assert.equal(t.f.calls.filter(c => c.body?.payment_method_id).length, 0)
    assert.equal(t.mails.at(-1)!.kind, 'reminder')
    t.at('2026-12-20T09:40:00Z'); assert.equal((await B.runBilling(t.d)).charged, 1)
  }
  {
    // 13.7 возврат: сорвался у ЮKassa, повтор проходит; по платежу удаленного человека вся сумма
    const t = setup(); await paidWithCard(t)
    t.at('2026-11-27T12:00:00Z'); t.f.state.refundFail = true
    assert.equal((await B.refundRemaining(t.d, U) as any).error, 'yookassa')
    assert.equal((await t.m.repo.getSub(U))!.plan_code, 'start', 'тариф не выключен, денег не вернули')
    t.f.state.refundFail = false
    const r = await B.refundRemaining(t.d, U)
    assert.ok(r.ok && r.amount === 817, JSON.stringify(r))
    assert.equal(t.f.calls.filter(c => c.method === 'createRefund').map(c => c.key)[0], t.f.calls.filter(c => c.method === 'createRefund').map(c => c.key)[1], 'тот же ключ идемпотентности')
    const t2 = setup()
    await B.startCheckout(t2.d, { userId: U, email: 'x@example.invalid', plan: 'start', autoRenew: false, via: 'any', ip: null })
    t2.m.payments[0].user_id = null
    t2.f.finish(t2.m.payments[0].yk_payment_id!, { ok: true })
    assert.equal((await t2.hook('payment.succeeded', t2.m.payments[0].yk_payment_id!, 'succeeded')).result, 'no_user')
    const r2 = await B.refundPayment(t2.d, t2.m.payments[0].id)
    assert.ok(r2.ok && r2.amount === 1290, 'вся сумма')
  }
  {
    // 13.8 продление на повторах, а человек платит сам: повторы остановлены, второго списания не будет
    const t = setup(); await paidWithCard(t); t.f.state.autopay = 'canceled'
    t.at('2026-12-14T10:00:00Z'); await B.runBilling(t.d)
    t.at('2026-12-17T09:30:00Z'); await B.runBilling(t.d)
    assert.equal((await t.m.repo.getSub(U))!.status, 'past_due')
    const r = await B.startCheckout(t.d, { userId: U, email: null, plan: 'start', autoRenew: false, via: 'any', ip: null })
    assert.ok(r.ok)
    const s = (await t.m.repo.getSub(U))!; assert.equal(s.next_charge_at, null); assert.equal(s.auto_renew, false)
    t.at('2026-12-18T10:00:00Z'); await B.runBilling(t.d)
    assert.equal(t.f.calls.filter(c => c.body?.payment_method_id).length, 1, 'повтора нет')
  }
  {
    // 13.9 цены из lib/pricing.ts
    const { PLANS } = await import('../lib/pricing')
    for (const code of ['start', 'practice'] as const) assert.equal(B.PAID_PLANS[code].price, PLANS.find(p => p.dbCodes[0] === code)!.price)
  }
  console.log('test-oplata: все сценарии прошли')
})()
