// Шаблонность и недельный подсчет без базы.  npx tsx scripts/test-quality.ts
import assert from 'node:assert/strict'
import { qualityOf, hasLoop, isWorse, signalsOf, plain } from '../lib/analytics/quality'
import { computeWeek, demoWeekPosts, weekOf, lastClosedWeek } from '../lib/analytics/quality-week'

// петля: три абзаца подряд с одного слова
assert.ok(hasLoop('Ты устала.\n\nТы держишься.\n\nТы молчишь.'))
assert.ok(!hasLoop('Ты устала.\n\nИ держишься.\n\nТы молчишь.'))
// метки сценария и подпись не считаются текстом
assert.equal(plain('Речь: Привет\nПодпись: ссылка'), 'Привет')
// одинаковое начало у разных людей и цепочки у 5+ людей
const same = Array.from({ length: 6 }, (_, i) => ({ userId: `u${i}`, format: 'post', text: `Знаешь это чувство, когда усталость копится незаметно. Текст ${i}.` }))
const q = qualityOf([...same, { userId: 'x', format: 'post', text: 'Совсем другой текст про весну и прогулки.' }])
assert.equal(q.authors, 7)
assert.ok(q.sameStart > 0.8 && q.sameStart < 0.9)
assert.ok(q.chains >= 1, 'цепочка у 6 людей')
// у одного человека цепочки не считаются
const one = qualityOf(Array.from({ length: 6 }, () => ({ userId: 'u', format: 'post', text: 'Знаешь это чувство, когда усталость копится незаметно.' })))
assert.equal(one.chains, 0)
assert.equal(one.sameStart, 0)
// «хуже»: доля выросла на 5 п.п. при 20+ текстах, на малой выборке не сравниваем
assert.ok(isWorse('sameStart', 0.3, 0.2, 40, 40))
assert.ok(!isWorse('sameStart', 0.3, 0.2, 10, 40))
assert.ok(isWorse('takeRate', 0.3, 0.4, 40, 40))
assert.ok(isWorse('chains', 9, 5) && !isWorse('chains', 2, 1))
assert.ok(isWorse('sentLen', 15, 11, 40, 40, 10) && !isWorse('sentLen', 11, 15, 40, 40, 10))
// сигналы людей
const s = signalsOf([{ taken: true, adjusts: 2 }, { taken: false, adjusts: 0, verdict: 'not_like' }], 1)
assert.equal(s.takeRate, 0.5); assert.equal(s.adjustsAvg, 1); assert.equal(s.notLike, 0.5); assert.ok(Math.abs(s.errors - 1 / 3) < 0.01)
// неделя: строки all, по формату, по варианту; только числа
const rows = computeWeek('2026-10-12', demoWeekPosts(), { all: 2 })
assert.ok(rows.find(r => r.format === 'all' && r.variant === 'all'))
for (const r of rows) for (const v of Object.values(r.metrics)) assert.equal(typeof v, 'number')
// неделя пн-вс по поясу: 24.10.2026 пятница → понедельник 19.10, прошлая закрытая 12.10
assert.equal(weekOf(new Date('2026-10-24T09:00:00Z'), 'Asia/Barnaul').start, '2026-10-19')
assert.equal(lastClosedWeek(new Date('2026-10-24T09:00:00Z'), 'Asia/Barnaul').start, '2026-10-12')
console.log('ok: качество и шаблонность')
