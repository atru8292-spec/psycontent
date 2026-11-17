// Тест текстов остатка (16.11): склонение, пилюля, подсказка, отказ сервера совпадает с экраном. npx tsx scripts/test-limit-texts.ts
import assert from 'node:assert/strict'
import { pillText, pillAria, profileLine, lowHint, isMaterials, END, LIMIT_REFUSAL, plural } from '../lib/limit-texts'

const t = (n: number) => ({ remaining: n, cap: 10, kind: 'trial' as const })
assert.equal(pillText(t(7)), '7 из 10')
assert.ok(pillAria(t(7)).includes('7 из 10'))
assert.equal(profileLine(t(3)), 'Осталось 3 из 10 пробных текстов. Срока у них нет')
assert.equal(profileLine({ remaining: 37, cap: 50, kind: 'month' }), 'В этом месяце осталось 37 из 50 текстов')
assert.equal(lowHint(t(3)), '')
assert.equal(lowHint(t(2)), 'Осталось два пробных текста из 10')
assert.equal(lowHint(t(1)), 'Это последний пробный текст')
assert.equal(lowHint(t(0)), '')
assert.equal(lowHint({ remaining: 1, cap: 50, kind: 'month' }), '')
assert.ok(isMaterials(t(0)) && !isMaterials({ remaining: '1' }) && !isMaterials(null))
assert.equal(END.trial.title(10), 'Все 10 пробных текстов использованы')
assert.ok(LIMIT_REFUSAL.trial(10).startsWith('Все 10 пробных текстов'))
assert.deepEqual([1, 2, 5, 11, 21, 22, 112].map(n => plural(n, 'а', 'б', 'в')), ['а', 'б', 'в', 'в', 'а', 'б', 'в'])
// без тире, ё и «мы» во всех строках
const all = [pillAria(t(1)), profileLine(t(1)), END.trial.text, END.month.text, END.disabled, LIMIT_REFUSAL.trial(10), LIMIT_REFUSAL.month].join(' ')
assert.ok(!/[—–ё]|\bмы\b/i.test(all), 'тире, ё или мы в тексте')
console.log('test-limit-texts: ок')
