// Анкета 2, версия 2 (19.11): выбор групп и тем, порядок тем для niches, ниша для генератора, тема дня по кругу,
// темы анкеты в плане. Без базы и без модели:  npx tsx scripts/test-anketa.ts
import assert from 'node:assert/strict'
import { GRUPPY, OBSHAYA, vybratGruppu, vybratTemu, temyPoKrugu, temyGruppy, nishaProfilya, parseKlienty, gruppaTemy } from '../lib/anketa'
import { anketaTopics } from '../lib/first-topic'
import { temyAnketyLine } from '../lib/generation/zh6/write'

let n = 0
const ok = (name: string, fn: () => void) => { fn(); n++; console.log('ok', name) }

ok('8 групп и общие, нейро и горя нет', () => {
  assert.equal(GRUPPY.length, 8)
  assert.ok(OBSHAYA && OBSHAYA.temy.length > 0)
  assert.ok(!GRUPPY.some(g => /нейро|горе/i.test(g.imya)))
})

ok('тап по группе отмечает все ее темы, повторный снимает', () => {
  const r = vybratGruppu([], [], 'trevoga')
  assert.deepEqual(r.groups, ['trevoga'])
  assert.deepEqual(r.topics, temyGruppy('trevoga'))
  const r2 = vybratGruppu(r.groups, [...r.topics, 'Своя старая'], 'trevoga')
  assert.deepEqual(r2, { groups: [], topics: ['Своя старая'] })
})

ok('снять одну тему, вернуть ее; последняя снятая снимает группу', () => {
  let r = vybratGruppu([], [], 'telo')
  const t = temyGruppy('telo')
  r = vybratTemu(r.groups, r.topics, t[1])
  assert.equal(r.topics.length, t.length - 1)
  assert.deepEqual(r.groups, ['telo'])
  r = vybratTemu(r.groups, r.topics, t[1])
  assert.equal(r.topics.length, t.length)
  for (const x of t) r = vybratTemu(r.groups, r.topics, x)
  assert.deepEqual(r, { groups: [], topics: [] })
  // тема у неотмеченной группы отмечает группу
  r = vybratTemu([], [], t[0])
  assert.deepEqual(r, { groups: ['telo'], topics: [t[0]] })
})

ok('темы для niches по кругу между группами, старые в конце', () => {
  let r = vybratGruppu([], [], 'rabota')
  r = vybratGruppu(r.groups, [...r.topics, 'Тревога и паника'], 'telo')
  const out = temyPoKrugu(r.groups, r.topics)
  assert.equal(out[0], temyGruppy('rabota')[0])
  assert.equal(out[1], temyGruppy('telo')[0])
  assert.equal(out[out.length - 1], 'Тревога и паника')
  assert.equal(out.length, temyGruppy('rabota').length + temyGruppy('telo').length + 1)
  assert.equal(gruppaTemy('Тревога и паника'), null)
})

ok('ниша для генератора: группы, иначе старая ниша', () => {
  assert.equal(nishaProfilya({ klienty: { groups: ['roditeli', 'rabota'] }, one_niche: 'Сепарация от родителей' }), 'Родители и детство, Работа и деньги')
  assert.equal(nishaProfilya({ one_niche: 'Тревога и паника', niches: ['Тревога и паника'] }), 'Тревога и паника')
  assert.equal(nishaProfilya({ niches: ['А', 'Б'] }), 'А, Б')
  // старые коды групп первой версии отбрасываются
  assert.deepEqual(parseKlienty({ groups: ['a', 'n', 'travma'] }).groups, ['travma'])
})

ok('тема дня берется по кругу, у одной темы она сама', () => {
  const all = temyGruppy('rabota')
  const t = anketaTopics(all)
  assert.equal(t.length, all.length)
  assert.equal(anketaTopics(['Своя тема']).join(), 'Своя тема')
})

ok('в план идут следующие n тем по кругу', () => {
  const s: any = { temyAnkety: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] }
  assert.match(temyAnketyLine(s, 5, 0), /- a\n- b\n- c\n- d\n- e\n/)
  assert.match(temyAnketyLine(s, 5, 1), /- f\n- g\n- a\n- b\n- c\n/)
  assert.equal(temyAnketyLine({} as any, 5, 0), '')
})

console.log(`\nвсе ${n} проверок прошли`)
