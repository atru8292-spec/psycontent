// Проверка аналитики без базы и сети (задача analitika, этап 6). Запуск: npx tsx scripts/test-analytics.ts
import assert from 'node:assert/strict'
import { sanitizeProps, sanitizeEvent, cleanPath, cleanValue } from '../lib/analytics/sanitize'
import { EVENTS, isEventName, screenOf, FEATURES } from '../lib/analytics/events'
import { isNewSession, SESSION_GAP_MS } from '../lib/track'
import { computeRisk, statusOf, rhythmDays, habitOf, levelOf, shareCol, type PersonFacts } from '../lib/analytics/definitions'
import { toCsv, fmtDate } from '../lib/analytics/export'
import { adminTz } from '../lib/admin'
import { publicOrigin } from '../lib/origin'

// ---------- санитайзер ----------
assert.equal(cleanValue('Клиенты бросают терапию'), undefined, 'кириллица не проходит')
assert.equal(cleanValue('post carousel'), undefined, 'пробел не проходит')
assert.equal(cleanValue('a'.repeat(41)), undefined, 'длиннее 40 не проходит')
assert.equal(cleanValue('POST'), undefined, 'заглавные не проходят')
assert.equal(cleanValue('post,carousel'), 'post,carousel')
assert.equal(cleanValue(12.3456), 12.346)
assert.equal(cleanValue(Infinity), undefined)
assert.equal(cleanValue(true), true)
assert.equal(cleanValue({ a: 1 }), undefined, 'вложенный объект не проходит')
assert.equal(cleanValue(['x']), undefined, 'массив не проходит')
assert.equal(cleanValue('https://t.me/x'), undefined, 'ссылка не проходит')
const p = sanitizeProps('make_start', { formats: 'post,carousel', mode: 'thought', voice: true, n: 2, topic: 'Тема поста', text: 'длинный текст', extra: 'x' })
assert.deepEqual(p, { formats: 'post,carousel', mode: 'thought', voice: true, n: 2 }, 'лишние ключи выкинуты')
assert.deepEqual(sanitizeProps('onb_intro', { step: 1 }), {}, 'у события без ключей props пустые')
assert.deepEqual(sanitizeProps('material_take', { how: 'copy', format: 'post', post: '3f2504e0-4f89-11d3-9a0c-0305e82c3301' }).post, '3f2504e0-4f89-11d3-9a0c-0305e82c3301', 'id материала проходит')
assert.equal(sanitizeEvent({ event: 'drop_table', props: {} }), null, 'неизвестное событие отброшено')
assert.equal(sanitizeEvent({ event: 'screen_view', props: { screen: 'make' }, path: '/dashboard/make?topic=Секрет#x', session_id: 'abc-12345678' })?.path, '/dashboard/make', 'query и hash отрезаны')
assert.equal(sanitizeEvent({ event: 'screen_view', session_id: 'не id' })?.session_id, null)

// ---------- список событий ----------
for (const e of Object.keys(EVENTS)) assert.ok(/^[a-z0-9_]{2,40}$/.test(e), `имя события ${e} проходит check базы`)
for (const e of ['app_open', 'screen_view', 'signup_source', 'onb_intro', 'onb_step_view', 'onb_step_done', 'onb_skip', 'onb_mic_denied', 'onb_done', 'onb_first_click', 'make_start', 'make_done', 'make_error', 'material_take', 'material_adjust', 'limit_hit', 'paywall_view', 'plan_click', 'error_shown', 'feature_open'])
  assert.ok(isEventName(e), `событие ${e} в списке`)
assert.ok(!isEventName('toString') && !isEventName('__proto__'), 'служебные имена объекта не события')
assert.equal(screenOf('/dashboard/make'), 'make')
assert.equal(screenOf('/dashboard'), 'home')
assert.equal(screenOf('/dashboard/content-plan'), 'themes')
assert.equal(screenOf('/что-то'), 'other')
for (const f of FEATURES) assert.ok(/^[a-z0-9_]+$/.test(f))

// ---------- path ----------
assert.equal(cleanPath('/admin/people/3f2504e0-4f89-11d3-9a0c-0305e82c3301'), '/admin/people/:id')
assert.equal(cleanPath('/dashboard/make?post=3f2504e0-4f89-11d3-9a0c-0305e82c3301&f=post'), '/dashboard/make')
assert.equal(cleanPath('/x/123456'), '/x/:id')
assert.equal(cleanPath('нет'), null)
assert.ok((cleanPath('/' + 'a'.repeat(300)) || '').length <= 120)

// ---------- сессия 30 минут ----------
assert.equal(isNewSession(null, 1000), true)
assert.equal(isNewSession(0, SESSION_GAP_MS), false, 'ровно 30 минут еще та же сессия')
assert.equal(isNewSession(0, SESSION_GAP_MS + 1), true, 'больше 30 минут новая')

// ---------- люди ----------
const NOW = new Date('2026-10-20T12:00:00Z')
const day = (ago: number) => new Date(NOW.getTime() - ago * 86400000).toISOString().slice(0, 10)
const at = (ago: number) => new Date(NOW.getTime() - ago * 86400000).toISOString()
const base = (o: Partial<PersonFacts>): PersonFacts => ({
  registered_at: at(60), onboarded: true, materials: 20, take_days: [], last_visit_at: at(0), last_take_at: null,
  takes_14: 0, takes_prev_14: 0, last3_taken: 1, not_like_7: 0, strong_edits_7: 0, errors_7: 0,
  limit_no_return: false, voice_core_empty: false, published_14: false, ...o,
})

// личный ритм
assert.equal(rhythmDays([]), 7, 'меньше трех взятий: ритм 7')
assert.equal(rhythmDays([day(1), day(8)]), 7)
assert.equal(rhythmDays([day(0), day(1), day(2), day(3)]), 1, 'каждый день: ритм 1')
assert.equal(rhythmDays([day(0), day(3), day(6), day(9), day(12)]), 3, 'раз в три дня')
assert.equal(rhythmDays([day(0), day(0), day(1), day(2)]), 1, 'повторы одного дня не считаются')
assert.equal(habitOf([day(1), day(9)], day(0)), true, 'две недели из трех')
assert.equal(habitOf([day(1), day(2)], day(0)), false)

// 1) пишет раз в неделю, 6 дней тишины: норма
const weekly = base({ take_days: [day(6), day(13), day(20), day(27), day(34)], last_take_at: at(6), takes_14: 2, takes_prev_14: 2, last3_taken: 2 })
const r1 = computeRisk(weekly, NOW)!
assert.equal(r1.rhythm_days, 7)
assert.equal(r1.level, 'norm', `раз в неделю, 6 дней тишины: норма, а вышло ${r1.score} ${JSON.stringify(r1.reasons)}`)
// 2) писала каждый день, 4 дня тишины: внимание и выше
const daily = base({ take_days: Array.from({ length: 10 }, (_, i) => day(4 + i)), last_take_at: at(4), takes_14: 10, takes_prev_14: 6, last3_taken: 2 })
const r2 = computeRisk(daily, NOW)!
assert.equal(r2.rhythm_days, 1)
assert.ok(r2.score >= 30, `каждый день, 4 дня тишины: внимание и выше, а вышло ${r2.score} ${JSON.stringify(r2.reasons)}`)
// 3) три последних не взяты и два «не похоже» (и с последнего взятия неделя при ритме раз в два дня): риск
const unhappy = base({ take_days: [day(7), day(9), day(11), day(13)], last_take_at: at(7), takes_14: 4, takes_prev_14: 4, last3_taken: 0, not_like_7: 2 })
const r3 = computeRisk(unhappy, NOW)!
assert.equal(r3.level, 'high', `3 не взяты и 2 «не похоже»: риск, а вышло ${r3.score} ${JSON.stringify(r3.reasons)}`)
// те же две причины без тишины дают только внимание (20 + 15): это видно в отчете
const unhappyFresh = base({ ...unhappy, take_days: [day(1), day(3), day(5)], last_take_at: at(1) })
assert.equal(computeRisk(unhappyFresh, NOW)!.score, 35)

// риск не считается, если не брала ни разу
assert.equal(computeRisk(base({}), NOW), null)
assert.equal(levelOf(29), 'norm'); assert.equal(levelOf(30), 'attention'); assert.equal(levelOf(60), 'high')
// обрезка 0-100
const worst = base({ take_days: [day(30), day(31), day(32)], last_take_at: at(30), takes_14: 0, takes_prev_14: 3, last3_taken: 0, not_like_7: 3, errors_7: 3, limit_no_return: true, voice_core_empty: true })
assert.equal(computeRisk(worst, NOW)!.score, 100)

// ---------- статусы ----------
assert.equal(statusOf(base({ registered_at: at(1), materials: 0, onboarded: true }), null, NOW), 'new')
assert.equal(statusOf(base({ registered_at: at(2), onboarded: false, materials: 0 }), null, NOW), 'stuck', 'больше суток без онбординга')
assert.equal(statusOf(daily, r2, NOW), 'active', 'брала 4 дня назад: по определению активная, хотя риск уже внимание')
const dailyLate = base({ ...daily, take_days: Array.from({ length: 10 }, (_, i) => day(9 + i)), last_take_at: at(9) })
assert.equal(statusOf(dailyLate, computeRisk(dailyLate, NOW), NOW), 'cooling', 'ежедневная, 9 дней тишины: остывает')
{
  const fresh = base({ take_days: [day(2), day(5), day(8)], last_take_at: at(2), takes_14: 3 })
  assert.equal(statusOf(fresh, computeRisk(fresh, NOW), NOW), 'active')
}
assert.equal(statusOf(base({ registered_at: at(10), materials: 3, last_visit_at: at(1) }), null, NOW), 'trying', 'сделала, но не брала')
const gone = base({ take_days: [day(40), day(47), day(54)], last_take_at: at(40), last_visit_at: at(30) })
assert.equal(statusOf(gone, computeRisk(gone, NOW), NOW), 'gone', 'ритм 7, тишина 30 дней (больше 28)')
const notGone = base({ take_days: [day(20), day(34), day(48)], last_take_at: at(20), last_visit_at: at(20) })
assert.notEqual(statusOf(notGone, computeRisk(notGone, NOW), NOW), 'gone', 'ритм 14: 20 дней тишины еще не ушла (нужно 56)')

// ---------- выгрузка ----------
{
  const csv = toCsv({ name: 't', headers: ['Имя', 'Число'], rows: [['=HYPERLINK("x";"y")', 1.5], ['+7 999', -3], ['a;b', null], [true, 2]] })
  assert.ok(csv.startsWith('\uFEFF'), 'BOM в начале')
  const lines = csv.slice(1).split('\r\n')
  assert.equal(lines[0], 'Имя;Число')
  assert.equal(lines[1], `"'=HYPERLINK(""x"";""y"")";1,5`, 'формула обезврежена, дробь с запятой')
  assert.equal(lines[2], "'+7 999;-3", 'плюс в начале строки обезврежен, отрицательное число осталось числом')
  assert.equal(lines[3], '"a;b";', 'точка с запятой в кавычках, пусто для null')
  assert.equal(lines[4], 'да;2')
  assert.equal(fmtDate('2026-10-04T17:00:00Z', 'Asia/Barnaul'), '05.10.2026 00:00', 'полночь пишется 00, не 24')
  assert.equal(shareCol(3, 7, 25), '43%'); assert.equal(shareCol(3, 7, 19), '3 из 7')
}
{
  const prev = process.env.ADMIN_TZ
  process.env.ADMIN_TZ = 'Asia/Барнаул-опечатка'
  assert.equal(adminTz(), 'Asia/Barnaul', 'кривой пояс не роняет кабинет')
  process.env.ADMIN_TZ = prev
}

// ---------- адрес для редиректов за nginx ----------
{
  const r = (h: Record<string, string>) => ({ headers: new Headers(h) })
  const prev = process.env.SITE_URL
  delete process.env.SITE_URL
  assert.equal(publicOrigin(r({ host: 'psycont.ru', 'x-forwarded-proto': 'https', 'x-forwarded-host': 'psycont.ru' })), 'https://psycont.ru')
  assert.equal(publicOrigin(r({ host: 'psycont.ru' })), 'https://psycont.ru', 'без x-forwarded-proto протокол https')
  assert.equal(publicOrigin(r({ host: 'localhost:3001', 'x-forwarded-proto': 'https' })), 'https://psycont.ru', 'localhost без SITE_URL уходит на psycont.ru')
  assert.equal(publicOrigin(r({ host: '127.0.0.1:3007' })), 'https://psycont.ru')
  process.env.SITE_URL = 'http://localhost:3005/'
  assert.equal(publicOrigin(r({ host: 'localhost:3005' })), 'http://localhost:3005', 'на localhost берем SITE_URL')
  if (prev === undefined) delete process.env.SITE_URL; else process.env.SITE_URL = prev
}

console.log('ok: все проверки аналитики')
