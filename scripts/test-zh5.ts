// Тесты zh5 без модели (22.10): выбор начала, петли, обращения, мата, реплики, длины, конца и призыва по памяти автора,
// исправления ножниц, подпись «запись» в продукте, проверка тем.
//   npx tsx scripts/test-zh5.ts
import assert from 'node:assert/strict'
import { chooseStart5, chooseLoop, chooseAddr, chooseMat, chooseReplika, chooseLen5, chooseEnd5, choosePrizyv, chooseCaption5, hasAddress, applyFixes, offerDetail5 } from '../lib/generation/zh5'
import { emptyZh4 } from '../lib/generation/zh4'
import { PZH5_MOVES, PZH5_SYSTEM, PZH5_PICKS } from '../lib/generation/prompts.generated'
import { cleanAds } from '../lib/generation/group'
import { bareAdvice, angleScheme } from '../lib/generation/topics'
import type { Memory } from '../lib/generation/memory'

const mem = (): Memory => ({ count: 0, lastHookTypes: [], lastArcs: [], lastOpenings: [], lastEndings: [], lastRings: [], lastIntents: [], lastFormats: [], usedClientPhrases: [], usedDetails: [], usedSignaturePhrases: [], recentTopics: [], feedbackReasons: [], zh4: { ...emptyZh4(), loops: [], addr: [], mat: [], replika: [], rlens: [], prizyv: [] } })
const olga: any = { address: 'на вы, иногда девочки', samples: [], profanityRule: 'автор матерится', workDetail: 'мультик', name: 'Ольга' }
const mih: any = { address: 'на вы', samples: [], profanityRule: 'не использовать', workDetail: 'машина', name: 'Михаил' }
const EVENT = ['sovet', 'vopros', 'podruga', 'uvidela']

for (const who of ['Юлия', 'Ольга', 'Михаил']) {
  const m = mem(), z = m.zh4!
  const st: string[] = [], loops: boolean[] = [], ends: string[] = [], pr: boolean[] = [], rep: boolean[] = [], lens: string[] = []
  for (let i = 0; i < 24; i++) {
    const s = chooseStart5(m, 'reels_monolog', PZH5_MOVES.hod_beshus, who)!; st.push(s); z.starts.unshift(s)
    const l = chooseLoop(m, who); loops.push(l); z.loops!.unshift(l)
    const e = chooseEnd5(m, 'reels_monolog', 'uznavanie', 'Ход: X', who)!; ends.push(e); z.ends.unshift(e)
    const p = choosePrizyv(m, 'reels_monolog', who); pr.push(p); z.prizyv!.unshift(p)
    const r = chooseReplika(m); rep.push(r); z.replika!.unshift(r)
    const ln = chooseLen5(m, 'reels_monolog', who)!; lens.push(ln.rlen); z.rlens!.unshift(ln.rlen)
    m.count++
  }
  const ev = st.filter(x => EVENT.includes(x)).length
  assert.ok(ev >= 2 && ev <= 6, `${who}: событие в начале ${ev} из 24 (${st.join(',')})`)
  st.forEach((x, i) => { if (x === 'uvidela') assert.ok(!st.slice(Math.max(0, i - 7), i).includes('uvidela'), `${who}: «видела» чаще одного из 8`) })
  assert.ok(new Set(st).size >= 4, `${who}: начала разные (${st.join(',')})`)
  assert.ok(loops.filter(Boolean).length <= 3, `${who}: петля ${loops.filter(Boolean).length} из 24`)
  ends.forEach((e, i) => { if (e === 'vopros') assert.ok(!ends.slice(Math.max(0, i - 7), i).includes('vopros'), `${who}: вопрос в конце чаще одного из 8 (${ends.join(',')})`) })
  const p = pr.filter(Boolean).length
  assert.ok(p >= 2 && p <= 5, `${who}: призыв голосом ${p} из 24`)
  assert.ok(rep.filter(Boolean).length <= 5, `${who}: реплика в подписи ${rep.filter(Boolean).length} из 24`)
  assert.ok(new Set(lens).size === 3, `${who}: длины разные`)
}
// обращение только у автора, в голосе которого оно есть, и примерно в одном тексте из 6-8; мат примерно каждый третий
{
  assert.ok(hasAddress(olga) && !hasAddress(mih), 'обращение: у Ольги есть, у Михаила нет')
  const m = mem(); const a: boolean[] = [], mt: boolean[] = []
  for (let i = 0; i < 24; i++) { const x = chooseAddr(m, olga, 'Ольга'); a.push(x); m.zh4!.addr!.unshift(x); const y = chooseMat(m, olga); mt.push(y); m.zh4!.mat!.unshift(y); m.count++ }
  assert.ok(a.filter(Boolean).length >= 2 && a.filter(Boolean).length <= 4, `обращение у Ольги ${a.filter(Boolean).length} из 24`)
  assert.equal(mt.filter(Boolean).length, 8, 'мат у Ольги каждый третий')
  assert.equal(chooseAddr(mem(), mih, 'Михаил'), false, 'у Михаила обращений нет')
  assert.equal(chooseMat(mem(), mih), false, 'у Михаила мата нет')
}
// подпись: после вопроса в конце второго вопроса нет
for (let i = 0; i < 6; i++) { const m = mem(); m.count = i; assert.notEqual(chooseCaption5(m, 'uznavanie', 'Ольга', 'vopros').caption, 'vopros', 'подпись: нет второго вопроса') }
// деталь: только темы доверия, не в карусели
assert.equal(offerDetail5(mem(), 'uznavanie', 'мама обижается', olga, 'reels_monolog'), false, 'деталь: не в теме охвата')
assert.equal(offerDetail5(mem(), 'kak_v_terapii', 'о чем говорить на первой сессии', olga, 'reels_monolog'), true, 'деталь: в теме доверия')
assert.equal(offerDetail5(mem(), 'kak_v_terapii', 'первая сессия', olga, 'carousel'), false, 'деталь: не в карусели')
// исправления ножниц
{
  const t = 'Речь: Муж спрашивает: «Ты опять обиделись?» Вы молчите.'
  assert.equal(applyFixes(t, [{ was: 'Ты опять обиделись?', now: 'Ты опять обиделась?' }]).text, 'Речь: Муж спрашивает: «Ты опять обиделась?» Вы молчите.', 'ножницы: ошибка исправлена')
  assert.equal(applyFixes(t, [{ was: 'Вы молчите.', now: 'Вы молчите, потому что боитесь, что он уйдет навсегда.' }]).fixed.length, 0, 'ножницы: переписать длиннее нельзя')
}
// промпт: без «повод всегда есть», без короткого запрета, «просто» не источник
assert.ok(!/Повод у текста всегда есть/u.test(PZH5_SYSTEM) && !/Фраз из одного-трех слов не пиши/u.test(PZH5_SYSTEM), 'ПЖ5: старые правила убраны')
for (const bad of ['снова и снова приходят', 'за годы работы', 'иногда все проще', 'сама не идеальна', 'что они уже вынесли', 'прицепленное к ее словам'])
  assert.ok(![...Object.values(PZH5_MOVES), ...Object.values(PZH5_PICKS)].join('\n').includes(bad), `ПЖ5: нет «${bad}»`)
// темы
assert.ok(bareAdvice('Сначала полюби себя и тогда все наладится') && !bareAdvice('«Сначала полюби себя»: почему этот совет не работает'), 'темы: голый совет')
assert.ok(angleScheme('Как стать начальницей мужа: делай все сама') && angleScheme('Что я вижу в кабинете') && !angleScheme('Гремлю кастрюлями, чтобы муж понял'), 'темы: схема угла')
// продукт: подпись «запись» не чистится, приглашение в речи по-прежнему не пропускается (без модели: в речи рекламы нет)
cleanAds({ userId: '', settings: { knownNames: [] } } as any, 'reels_monolog', 'Речь: Обычная речь.\nПодпись: Пишите в директ слово «разбор», запишу на первую встречу.', { keepCaption: true }).then(t => {
  assert.ok(/директ/u.test(t), 'подпись «запись» осталась')
  console.log('ok: zh5')
})
