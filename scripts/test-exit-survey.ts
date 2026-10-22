// Опрос при уходе без базы: правило показа и чистка ответа.  npx tsx scripts/test-exit-survey.ts
import assert from 'node:assert/strict'
import { decideSurvey, cleanAnswer, visibleReasons, type SurveyInput } from '../lib/analytics/exit-survey'
import type { PersonFacts } from '../lib/analytics/definitions'

const now = new Date('2026-10-24T09:00:00Z')
const ago = (d: number) => new Date(now.getTime() - d * 86400000).toISOString()
const day = (d: number) => ago(d).slice(0, 10)
// брала тексты 3 раза месяц назад, ритм около 4 дней
const facts: PersonFacts = {
  registered_at: ago(60), onboarded: true, materials: 6, take_days: [day(30), day(34), day(38)],
  last_visit_at: now.toISOString(), // текущий заход уже записан событиями
  last_take_at: ago(30), takes_14: 0, takes_prev_14: 0, last3_taken: 1, not_like_7: 0, strong_edits_7: 0, errors_7: 0,
  limit_no_return: false, voice_core_empty: false, published_14: false,
} as PersonFacts
const base: SurveyInput = { facts, prevVisitAt: ago(20), lastShownAt: null, shows: 0, answeredRecently: false, tookThisSession: false }

// 20 дней тишины, зашла: статус по прошлому визиту «Ушла», карточка есть (без поправки на сессию было бы «активная»)
const d1 = decideSurvey(base, now)
assert.equal(d1.show, true, d1.why)
assert.equal(d1.status, 'gone')
// остывает: прошлый визит 5 дней назад, но текстов давно нет и риск высокий
const d2 = decideSurvey({ ...base, prevVisitAt: ago(5) }, now)
assert.ok(d2.status === 'cooling' || d2.status === 'gone', `ждали cooling, есть ${d2.status}`)
assert.equal(d2.show, true)
// активная: брала текст 2 дня назад, не показываем
const d3 = decideSurvey({ ...base, prevVisitAt: ago(2), facts: { ...facts, last_take_at: ago(2), take_days: [day(2), day(6), day(10)] } }, now)
assert.equal(d3.show, false)
// в этом заходе уже сделала материал: не дергаем
assert.equal(decideSurvey({ ...base, tookThisSession: true }, now).show, false)
// показывали 10 дней назад: пауза 60 дней
assert.equal(decideSurvey({ ...base, lastShownAt: ago(10), shows: 1 }, now).show, false)
// показывали 70 дней назад: можно снова
assert.equal(decideSurvey({ ...base, lastShownAt: ago(70), shows: 1 }, now).show, true)
// три показа за все время: больше никогда
assert.equal(decideSurvey({ ...base, lastShownAt: ago(200), shows: 3 }, now).show, false)
// уже отвечала недавно
assert.equal(decideSurvey({ ...base, answeredRecently: true }, now).show, false)

// ответ: только известные коды, «дорого» скрыт без оплаты, свои слова до 300 символов
const a = cleanAnswer({ reasons: ['not_me', 'expensive', 'hack', 'not_me'], other: 'x'.repeat(400), contact: 'yes' }, false)
assert.deepEqual(a.reasons, ['not_me'])
assert.equal([...(a.other || '')].length, 300)
assert.equal(a.contact, false)
assert.ok(!visibleReasons(false).includes('expensive') && visibleReasons(true).includes('expensive'))
assert.ok(cleanAnswer({ reasons: ['pause'] }, false).reasons.includes('pause'))
console.log('ok: опрос при уходе')
