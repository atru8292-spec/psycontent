// Тест текстов остатка (16.11, словарь 17.11): склонение, пилюля, строка под кнопкой, остаток в меню, отказ сервера.
// npx tsx scripts/test-limit-texts.ts
import assert from 'node:assert/strict'
import { pillText, pillAria, profileLine, lowHint, isMaterials, END, LIMIT_REFUSAL, PAY_SOON, RESUME, plural, spendLine, leftLine } from '../lib/limit-texts'

const t = (n: number) => ({ remaining: n, cap: 10, kind: 'trial' as const })
const mo = (n: number) => ({ remaining: n, cap: 50, kind: 'month' as const })
assert.equal(pillText(t(7)), '7 из 10')
assert.ok(pillAria(t(7)).includes('7 из 10'))
assert.equal(profileLine(t(3)), 'Осталось 3 из 10 пробных текстов. Срока у них нет')
assert.equal(profileLine(mo(37)), 'В этом месяце осталось 37 из 50 текстов')
assert.equal(lowHint(t(3)), '')
assert.equal(lowHint(t(2)), 'Осталось два пробных текста из 10')
assert.equal(lowHint(t(1)), 'Это последний пробный текст')
assert.equal(lowHint(t(0)), '')
assert.equal(lowHint({ remaining: 1, cap: 50, kind: 'month' }), '')
assert.ok(isMaterials(t(0)) && !isMaterials({ remaining: '1' }) && !isMaterials(null))
assert.equal(END.trial.title(10), 'Все 10 пробных текстов использованы')
assert.equal(END.trial.short, 'Пробные тексты закончились')
assert.ok(LIMIT_REFUSAL.trial(10).startsWith('Все 10 пробных текстов'))
assert.deepEqual([1, 2, 5, 11, 21, 22, 112].map(n => plural(n, 'а', 'б', 'в')), ['а', 'б', 'в', 'в', 'а', 'б', 'в'])

// строка под кнопкой «Написать» (макеты A3, A9, решение Арины 17.11)
assert.equal(spendLine(t(10), 2), 'Это 2 из 10 пробных текстов')
assert.equal(spendLine(t(3), 2), 'После этого останется 1 пробный текст')
assert.equal(spendLine(t(7), 2), 'После этого останется 5 пробных текстов')
assert.equal(spendLine(t(5), 1), 'После этого останется 4 пробных текста')
assert.equal(spendLine(t(1), 1), 'Это последний пробный текст')
assert.equal(spendLine(t(2), 2), 'Это последние пробные тексты')
assert.equal(spendLine(t(1), 2), 'Осталось 1 пробный текст, убери лишние форматы')
assert.equal(spendLine(t(0), 2), '')
assert.equal(spendLine(t(5), 0), '')
assert.equal(spendLine(mo(38), 2, '12 декабря'), 'Останется 36 из 50 до 12 декабря')
assert.equal(spendLine(mo(38), 2), 'Останется 36 из 50 в этом месяце')
assert.equal(spendLine(mo(1), 3), 'Осталось 1 из 50, убери лишние форматы')

// остаток внизу меню на компьютере
assert.equal(leftLine(t(3)), 'Осталось 3 из 10 пробных текстов')
assert.equal(leftLine(mo(38), '17 декабря'), 'Осталось 38 из 50 до 17 декабря')
assert.equal(leftLine(t(0)), 'Пробные тексты закончились')
assert.equal(leftLine(mo(0)), 'Тексты этого месяца закончились')

// без тире, ё, «мы», «я» сервиса и «материал» во всех строках
const all = [
  pillAria(t(1)), pillAria(mo(1)), profileLine(t(1)), profileLine(mo(0)), END.trial.text, END.trial.note, END.month.text, END.month.title(), END.disabled,
  LIMIT_REFUSAL.trial(10), LIMIT_REFUSAL.month, PAY_SOON.line, PAY_SOON.popText('Каждый день'), RESUME.title, RESUME.line, RESUME.timeout,
  spendLine(t(10), 2), spendLine(t(4), 1), spendLine(mo(9), 2, '1 января'), leftLine(t(2)), leftLine(mo(4)),
].join(' ')
assert.ok(!/[—–ё]|(?<![а-яё])(мы|я)(?![а-яё])/i.test(all), 'тире, ё, «мы» или «я» в тексте')
assert.ok(!/материал/i.test(all), '«материал» вместо «текст»')
console.log('test-limit-texts: ок')
