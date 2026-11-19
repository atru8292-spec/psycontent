// Дата новых текстов (20.11, ревью «Сейчас»): одна функция nextSegmentStart (lib/billing/period.ts) для «Написать»,
// Профиля и экрана оплаты, и она совпадает с тем, как сервер считает ключ счетчика (windowKey в lib/energy.ts:
// windowKeyOf(monthSegmentStart(period_start, anchor, now))). Без базы и без сети: npx tsx scripts/test-texts-back.ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { nextSegmentStart, monthSegmentStart, manualWindow, addMonthAnchored } from '../lib/billing/period'
import { textsBackAt } from '../lib/pricing'

const src = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8')

async function main() {
  process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'http://127.0.0.1:9'
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test'
  const { windowKeyOf } = await import('../lib/energy')
  // ключ счетчика, который сервер возьмет в момент t (та же формула, что в getPlanForUser)
  const serverKey = (ps: string, anchor: number | null, t: Date) => windowKeyOf(monthSegmentStart(new Date(ps), anchor, t))
  const D = (s: string) => new Date(s)
  const MIN = 60000

  // проверка: в найденный день сервер правда открывает новый счетчик, а минутой раньше еще старый
  const sameAsServer = (ps: string, anchor: number | null, until: string, now: string, want: string | null, msg: string) => {
    const got = nextSegmentStart(D(ps), anchor, D(until), D(now))
    assert.equal(got ? got.toISOString() : null, want, msg)
    if (!got) return
    assert.notEqual(serverKey(ps, anchor, got), serverKey(ps, anchor, D(now)), `${msg}: в этот момент у сервера новый счетчик`)
    assert.equal(serverKey(ps, anchor, new Date(got.getTime() - MIN)), serverKey(ps, anchor, D(now)), `${msg}: минутой раньше счетчик прежний`)
    assert.equal(serverKey(ps, anchor, got), windowKeyOf(got), `${msg}: ключ нового месяца это его день по Москве`)
    const back = textsBackAt(D(now), D(ps), D(until), anchor)
    assert.deepEqual([back.at.toISOString(), back.auto], [want, true], `${msg}: textsBackAt то же`)
  }

  // 1. один месяц: следующий месяц совпадает с концом срока, новые тексты только после продления
  sameAsServer('2026-11-20T09:00:00Z', 20, '2026-12-20T09:00:00Z', '2026-12-01T10:00:00Z', null, 'один месяц')
  {
    const back = textsBackAt(D('2026-12-01T10:00:00Z'), D('2026-11-20T09:00:00Z'), D('2026-12-20T09:00:00Z'), 20)
    assert.deepEqual([back.at.toISOString(), back.auto], ['2026-12-20T09:00:00.000Z', false], 'один месяц: дата конца, без «появятся сами»')
  }

  // 2. продлено заранее: окно 20.11 - 20.01, в декабре тексты вернутся 20 декабря сами
  sameAsServer('2026-11-20T09:00:00Z', 20, '2027-01-20T09:00:00Z', '2026-12-01T10:00:00Z', '2026-12-20T09:00:00.000Z', 'продлено заранее')
  // во втором месяце окна следующего месяца внутри уже нет
  sameAsServer('2026-11-20T09:00:00Z', 20, '2027-01-20T09:00:00Z', '2026-12-25T10:00:00Z', null, 'продлено заранее, второй месяц')

  // 3. смена тарифа с бонусными днями: 8.12 «Каждый день» до 15.01 (месяц + 7 дней). Месяц текстов с 8.01, а не с 15
  {
    const w = manualWindow(D('2026-12-08T09:00:00Z'), { planCode: 'start', price: 1290, end: D('2026-12-20T09:00:00Z'), anchor: 20 }, { code: 'practice', price: 2490 })
    assert.equal(w.end.toISOString(), '2027-01-15T09:00:00.000Z')
    const ps = w.start.toISOString(), until = w.end.toISOString()
    sameAsServer(ps, w.anchor, until, '2026-12-20T10:00:00Z', '2027-01-08T09:00:00.000Z', 'смена тарифа')
    // пустой якорь после смены: старый расчет от конца (15-е) дал бы 15 января, то есть «после продления»
    sameAsServer(ps, null, until, '2026-12-20T10:00:00Z', '2027-01-08T09:00:00.000Z', 'смена тарифа, пустой якорь')
  }

  // 4. пустой якорь: день берется из начала окна по Москве (оплата 22:30 UTC = следующий день в Москве)
  sameAsServer('2026-11-17T22:30:00Z', null, '2027-01-18T22:30:00Z', '2026-12-05T10:00:00Z', '2026-12-17T22:30:00.000Z', 'пустой якорь, день по Москве')

  // 5. якорь 31: короткие месяцы дают последний день, потом снова 31
  {
    const ps = '2027-01-31T09:00:00Z'
    const until = addMonthAnchored(addMonthAnchored(addMonthAnchored(D(ps), 31), 31), 31).toISOString() // 30 апреля
    assert.equal(until, '2027-04-30T09:00:00.000Z')
    sameAsServer(ps, 31, until, '2027-02-10T10:00:00Z', '2027-02-28T09:00:00.000Z', 'якорь 31, февраль')
    sameAsServer(ps, 31, until, '2027-03-01T10:00:00Z', '2027-03-31T09:00:00.000Z', 'якорь 31, март')
    sameAsServer(ps, 31, until, '2027-04-05T10:00:00Z', null, 'якорь 31, последний месяц')
  }

  // 6. без начала окна (старый ответ /api/pay/me) честно про продление; битые даты не роняют
  {
    const back = textsBackAt(D('2026-12-01T10:00:00Z'), null, D('2027-01-20T09:00:00Z'), 20)
    assert.equal(back.auto, false)
    assert.equal(nextSegmentStart(D('x'), 20, D('2027-01-20T09:00:00Z'), D('2026-12-01T10:00:00Z')), null)
  }

  // 7. клиенты считают одной функцией, дублей нет; /api/pay/me отдает начало окна
  assert.ok(!/nextMonthStart|addMonthAnchored|anchorDayOf/.test(src('components/make/zh13/EndCard.tsx')), 'EndCard без своей копии расчета')
  assert.match(src('components/make/zh13/EndCard.tsx'), /nextSegmentStart\(/)
  assert.ok(!/addMonthAnchored|anchorDayOf/.test(src('lib/pricing.ts')), 'pricing без своей копии расчета')
  assert.match(src('lib/pricing.ts'), /nextSegmentStart\(periodStart, anchor, until, now\)/)
  assert.match(src('components/SubscriptionCard.tsx'), /textsBackAt\(new Date\(\), me!\.periodStart/)
  assert.match(src('app/dashboard/oplata/page.tsx'), /textsBackAt\(new Date\(\), me!\.periodStart/)
  assert.match(src('app/api/pay/me/route.ts'), /periodStart: paid \? sub!\.period_start : null/)
  assert.match(src('lib/energy.ts'), /windowKeyOf\(monthSegmentStart\(new Date\(sub\.period_start\)/, 'сервер считает от period_start')

  console.log('test-texts-back: все проверки прошли')
}

main().catch(e => { console.error(e); process.exit(1) })
