// Тест рода (16.11): автор только из author_gender (иначе женский, по имени не угадываем), читательница по умолчанию
// в женском роде, строка о читателе есть в блоке автора zh6. npx tsx scripts/test-rod-avtora.ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { genderOf, readerRuleOf, buildAuthorSettings } from '../lib/generation/settings'

for (const name of ['Любовь', 'Адель', 'Тест', 'Нинель', 'Анна', 'Иван', '']) assert.equal(genderOf({ full_name: name }), 'female', name)
assert.equal(genderOf({ full_name: 'Анна', author_gender: 'male' }), 'male')
assert.equal(genderOf({ full_name: 'Иван', author_gender: 'female' }), 'female')
assert.equal(genderOf(null), 'female')

assert.equal(readerRuleOf(''), 'о читательнице в женском роде')
assert.equal(readerRuleOf('женщины 30-45, устали'), 'о читательнице в женском роде')
assert.equal(readerRuleOf('специалисты в найме'), 'о читательнице в женском роде')
assert.equal(readerRuleOf('мужчины после развода'), 'о читателе в мужском роде')
assert.equal(readerRuleOf('мужчины и женщины'), 'без родовых окончаний')
assert.equal(readerRuleOf('пары в кризисе'), 'без родовых окончаний')

const s = buildAuthorSettings({ full_name: 'Тест', approaches: ['КПТ'] })
assert.equal(s.genderForms, 'женском роде')
assert.equal(s.readerGenderRule, 'о читательнице в женском роде')
const m = buildAuthorSettings({ full_name: 'Олег', author_gender: 'male', approaches: ['КПТ'] })
assert.equal(m.genderForms, 'мужском роде')
assert.equal(m.readerGenderRule, 'о читательнице в женском роде', 'род автора не переносится на читателя')

assert.ok(readFileSync('lib/generation/zh6/write.ts', 'utf8').includes('Читатель: ${s.readerGenderRule'), 'строка о читателе в блоке автора')
assert.ok(readFileSync('app/onboarding/express/page.tsx', 'utf8').includes("author_gender: a.gender === 'male' ? 'male' : 'female'"))
console.log('test-rod-avtora: ок')
