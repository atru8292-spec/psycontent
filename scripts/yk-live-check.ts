// Живая проверка автоплатежа в ТЕСТОВОМ магазине ЮKassa (17.11, требование ЮKassa перед включением автоплатежей):
// первая оплата с сохранением карты → продление без участия человека → «Удалить карту» → попытки списания нет.
// Наш код биллинга (lib/billing/core.ts) с базой в памяти и настоящим API ЮKassa; карта вводится на странице ЮKassa
// через Playwright (scratchpad yk_pay.py), карта без 3-D Secure из таблицы ЮKassa.
// Запуск: npx tsx --env-file=<yukassa-test.env> scripts/yk-live-check.ts <путь к yk_pay.py> <папка снимков>
// Ключи только из env, нигде не печатаются; работает только с тестовым магазином 1532988.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import * as B from '../lib/billing/core'
import { memoryRepo } from '../lib/billing/memory'
import { httpYk, type YkClient } from '../lib/billing/yookassa'

const CARD = '5555555555554444' // Mastercard без 3-D Secure (таблица ЮKassa «Тестирование», совет для автоплатежей)
const U = '00000000-0000-4000-8000-0000000000aa'
const [payScript, outDir] = process.argv.slice(2)

;(async () => {
  assert.equal(process.env.YOOKASSA_SHOP_ID, '1532988', 'только тестовый магазин')
  assert.ok(!process.env.YOOKASSA_API_URL, 'настоящий API ЮKassa')
  const clock = { t: new Date() }
  const m = memoryRepo({ [U]: 'test@example.invalid' }, () => new Date(clock.t))
  const real = httpYk()
  const calls: { kind: string; method?: boolean }[] = []
  const yk: YkClient = {
    createPayment: async (b: any, k) => { calls.push({ kind: 'create', method: !!b.payment_method_id }); return real.createPayment(b, k) },
    getPayment: (id) => real.getPayment(id), createRefund: real.createRefund, getRefund: real.getRefund,
  }
  const mails: string[] = []
  const d: B.Deps = { now: () => new Date(clock.t), repo: m.repo, yk, siteUrl: 'https://psycont.ru', offerVersion: '2026-11-17',
    mail: async (kind) => { mails.push(kind) }, log: (s) => console.log('  журнал:', s) }
  const step = (n: string, x = '') => console.log(`OK  ${n}${x ? ' · ' + x : ''}`)
  const waitFinal = async (id: string) => { for (let i = 0; i < 30; i++) { const p = await real.getPayment(id); if (p.status !== 'pending') return p; await new Promise(r => setTimeout(r, 2000)) } return real.getPayment(id) }

  // 1. первая оплата с галочкой автопродления (save_payment_method)
  const co = await B.startCheckout(d, { userId: U, email: 'test@example.invalid', plan: 'start', autoRenew: true, via: 'any', ip: '127.0.0.1' })
  assert.ok(co.ok, JSON.stringify(co))
  const row = m.payments[0]
  assert.ok(row.yk_payment_id && row.save_requested, 'платеж создан с сохранением карты')
  step('1. платеж создан в ЮKassa', `сумма ${row.amount} ₽, сохранить карту: да`)
  execFileSync('python3', [payScript, row.yk_payment_id!, CARD, outDir], { stdio: ['ignore', 'ignore', 'inherit'], timeout: 180000 })
  const first = await waitFinal(row.yk_payment_id!)
  const r1 = await B.processPayment(d, first)
  assert.equal(first.status, 'succeeded', `первая оплата: ${first.status}`)
  assert.equal(first.payment_method?.saved, true, 'ЮKassa сохранила карту для автоплатежей')
  let sub = (await m.repo.getSub(U))!
  assert.ok(sub.auto_renew && sub.payment_method_id && sub.status === 'active')
  const meth = m.methods[0]
  step('2. первая оплата прошла, карта сохранена', `${r1}, ${meth.title}, saved=${first.payment_method?.saved}, следующее списание ${sub.next_charge_at?.slice(0, 10)}`)

  // 2. продление без участия человека: письмо за 3 дня (в окне 10:00-20:00 по Москве), потом списание по токену
  const charge = new Date(sub.next_charge_at!)
  const remindAt = new Date(charge.getTime() - 48 * 3600e3); remindAt.setUTCHours(8, 0, 0, 0)
  clock.t = remindAt; await B.runBilling(d)
  assert.ok(mails.includes('reminder'), 'письмо за 3 дня')
  clock.t = new Date(charge.getTime() + 5 * 60e3)
  const before = calls.length
  const rb = await B.runBilling(d)
  const renewal = m.payments.find(p => p.kind === 'renewal')!
  assert.ok(renewal?.yk_payment_id && calls.slice(before).some(c => c.method), 'автоплатеж по сохраненной карте ушел в ЮKassa')
  const second = renewal.status === 'succeeded' ? await real.getPayment(renewal.yk_payment_id!) : await waitFinal(renewal.yk_payment_id!)
  if (renewal.status !== 'succeeded') await B.processPayment(d, second)
  assert.equal(second.status, 'succeeded', `продление: ${second.status} ${JSON.stringify(second.cancellation_details || {})}`)
  sub = (await m.repo.getSub(U))!
  step('3. продление списано без участия человека', `charged=${rb.charged}, ${second.amount.value} ₽, подтверждение не нужно, окно до ${sub.period_end?.slice(0, 10)}`)

  // 3. «Удалить карту»
  await B.deletePaymentMethod(d, U)
  sub = (await m.repo.getSub(U))!
  assert.equal(m.methods.length, 0, 'строки с токеном нет')
  assert.ok(!JSON.stringify({ methods: m.methods, subs: [sub], payments: m.payments.map(p => p.payment_method_id) }).includes(meth.yk_method_id), 'токен нигде не остался')
  assert.equal(sub.auto_renew, false); assert.equal(sub.payment_method_id, null)
  step('4. карта удалена', 'строка с токеном стерта, автопродление выключено, ссылки обнулены')

  // 4. наступила дата следующего списания: попытки нет
  clock.t = new Date(new Date(sub.period_end!).getTime() + 5 * 60e3)
  const before2 = calls.length
  const rc = await B.runBilling(d)
  sub = (await m.repo.getSub(U))!
  assert.equal(calls.length, before2, 'в ЮKassa ничего не ушло')
  assert.equal(rc.charged, 0); assert.equal(sub.plan_code, 'free')
  step('5. в дату списания попытки нет', `charged=${rc.charged}, запросов в ЮKassa 0, тариф снова пробный`)
  console.log('yk-live-check: все шаги прошли')
})().catch(e => { console.error('ПРОВАЛ:', e.message || e); process.exit(1) })
