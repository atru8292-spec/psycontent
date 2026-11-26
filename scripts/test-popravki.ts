// Поправки по «Не совсем» для zh13 (26.11). Без базы и модели: npx tsx scripts/test-popravki.ts
import assert from 'node:assert/strict'
import { popravkiIz } from '../lib/generation/zh13/pishi'

assert.equal(popravkiIz([]), '', 'без ответов строки нет')
assert.equal(popravkiIz([{ verdict: 'mine', reasons: [] }]), '', '«Да, это я» поправок не дает')
assert.equal(popravkiIz([{ verdict: 'not_like', reasons: ['не та тема'] }]), '', 'тема писателю не нужна')
assert.equal(popravkiIz([{ verdict: 'not_like', reasons: ['мой текст про маму Ольги'] }]), '', 'свои слова в промпт не идут')
const s = popravkiIz([
  { verdict: 'not_like', reasons: ['слишком умно', 'длинно'] },
  { verdict: 'not_like', reasons: ['слишком умно', 'слишком умно'] },
  { verdict: 'mine', reasons: [] },
  { verdict: 'not_like', reasons: ['слишком сладко'] },
])
assert.equal(s, 'В прошлых текстах ты отметила: слишком заумно (2 раза), слишком длинно. Поэтому пиши проще, бытовыми словами, без терминов; короче.', 'причины старше «Да, это я» не берем')
assert.ok(popravkiIz([{ verdict: 'not_like', reasons: ['длинно'] }], 'avtor').startsWith('В прошлых текстах автор отметил:'))
const pyat = Array.from({ length: 5 }, () => ({ verdict: 'not_like', reasons: ['длинно'] }))
assert.ok(popravkiIz(pyat, 'ty-m').includes('ты отметил: слишком длинно (5 раз)'), 'склонение и род')
assert.ok(!/[—–ё]/.test(s), 'без тире и ё')
console.log('test-popravki: все проверки прошли')
