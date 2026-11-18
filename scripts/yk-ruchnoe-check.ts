// Живая проверка ручного продления в ТЕСТОВОМ магазине ЮKassa (19.11, автоплатежи выключены): первая оплата →
// продление раньше срока (СБП, если тестовый магазин дает, иначе общая страница и карта) → окончание срока.
// Наш код биллинга (lib/billing/core.ts, autopay: false) с базой в памяти и настоящим API ЮKassa; карта вводится на
// странице ЮKassa через Playwright (скрипт yk_pay.py), тестовая карта без 3-D Secure из таблицы ЮKassa.
// Запуск: npx tsx --env-file=<yukassa-test.env> scripts/yk-ruchnoe-check.ts <путь к yk_pay.py> <папка снимков>
// Ключи только из env, нигде не печатаются; работает только с тестовым магазином 1532988.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import * as B from '../lib/billing/core'
import { memoryRepo } from '../lib/billing/memory'
import { httpYk, type YkClient } from '../lib/billing/yookassa'

const CARD = '5555555555554444'
const U = '00000000-0000-4000-8000-0000000000bb'
const [payScript, outDir] = process.argv.slice(2)

;(async () => {
  assert.equal(process.env.YOOKASSA_SHOP_ID, '1532988', 'только тестовый магазин')
  assert.ok(!process.env.YOOKASSA_API_URL, 'настоящий API ЮKassa')
  const clock = { t: new Date() }
  const m = memoryRepo({ [U]: 'test@example.invalid' }, () => new Date(clock.t))
  const real = httpYk()
  const bodies: any[] = []
  const yk: YkClient = {
    createPayment: async (b: any, k) => { bodies.push(b); return real.createPayment(b, k) },
    getPayment: (id) => real.getPayment(id), createRefund: real.createRefund, getRefund: real.getRefund,
  }
  const mails: string[] = []
  const logs: string[] = []
  const d: B.Deps = { now: () => new Date(clock.t), repo: m.repo, yk, siteUrl: 'https://psycont.ru', offerVersion: '2026-11-18', autopay: false,
    mail: async (kind) => { mails.push(kind) }, log: (s) => { logs.push(s); console.log('  журнал:', s) } }
  const step = (n: string, x = '') => console.log(`OK  ${n}${x ? ' · ' + x : ''}`)
  const waitFinal = async (id: string) => { for (let i = 0; i < 30; i++) { const p = await real.getPayment(id); if (p.status !== 'pending') return p; await new Promise(r => setTimeout(r, 2000)) } return real.getPayment(id) }
  const payOnPage = async (via: 'sbp' | 'any', plan: 'start' | 'practice', tag: string) => {
    const co = await B.startCheckout(d, { userId: U, email: 'test@example.invalid', plan, autoRenew: true, via, ip: '127.0.0.1' })
    assert.ok(co.ok, JSON.stringify(co))
    const row = m.payments.at(-1)!
    assert.ok(!('save_payment_method' in bodies.at(-1)), 'save_payment_method не отправлен')
    console.log(`    ${tag}: платеж создан, ${row.amount} ₽, способ на странице: ${bodies.at(-1).payment_method_data?.type || 'все способы'}`)
    execFileSync('python3', [payScript, row.yk_payment_id!, CARD, outDir], { stdio: ['ignore', 'ignore', 'inherit'], timeout: 180000 })
    const p = await waitFinal(row.yk_payment_id!)
    assert.equal(p.status, 'succeeded', `${tag}: ${p.status}`)
    assert.notEqual(p.payment_method?.saved, true, `${tag}: ЮKassa не сохранила способ`)
    return { r: await B.processPayment(d, p), p }
  }

  // 1. первая оплата
  const a = await payOnPage('any', 'start', 'первая оплата')
  let sub = (await m.repo.getSub(U))!
  assert.equal(a.r, 'activated'); assert.equal(sub.auto_renew, false); assert.equal(sub.payment_method_id, null); assert.equal(m.methods.length, 0)
  const end1 = sub.period_end!
  step('1. первая оплата прошла', `${a.p.payment_method?.type}, saved=${a.p.payment_method?.saved}, тариф до ${end1.slice(0, 10)}, автопродление выключено`)

  // 2. продление раньше срока: за 5 дней до конца
  clock.t = new Date(new Date(end1).getTime() - 5 * 86400e3)
  const b = await payOnPage('sbp', 'start', 'продление')
  sub = (await m.repo.getSub(U))!
  const sbpFallback = logs.some(l => l.includes('СБП недоступна'))
  assert.equal(b.r, 'activated')
  assert.ok(new Date(sub.period_end!).getTime() > new Date(end1).getTime() + 27 * 86400e3, 'месяц добавлен к концу оплаченного')
  step('2. продление раньше срока', `${sbpFallback ? 'СБП у тестового магазина недоступна, общая страница, карта' : 'СБП'}; было до ${end1.slice(0, 10)}, стало до ${sub.period_end!.slice(0, 10)}`)

  // 3. окончание срока: таймер выключает тариф, ни одного списания по сохраненному способу
  clock.t = new Date(new Date(sub.period_end!).getTime() + 3600e3)
  const r = await B.runBilling(d)
  sub = (await m.repo.getSub(U))!
  assert.equal(r.expired, 1); assert.equal(sub.status, 'expired'); assert.equal(sub.plan_code, 'free')
  assert.ok(bodies.every(x => !x.payment_method_id && !x.save_payment_method), 'в ЮKassa ушли только обычные платежи')
  step('3. срок кончился', `тариф выключен, обращений к ЮKassa всего ${bodies.length}, автосписаний 0, писем: ${mails.join(', ')}`)
  console.log('yk-ruchnoe-check: все шаги прошли')
})().catch(e => { console.error('ПРОВАЛ:', e?.message || e); process.exit(1) })
