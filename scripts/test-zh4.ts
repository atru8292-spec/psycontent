// Тесты zh4 без модели (21.10): мягкий монтажер h7m, выбор начала, конца, подписи и обложки кодом.
//   npx tsx scripts/test-zh4.ts
import assert from 'node:assert/strict'
import { applySoftCut, leansOn, chooseCaption, chooseEnd, chooseStart, chooseCarousel, goalOf, emptyZh4, zh4FormatCard, startsOfMove } from '../lib/generation/zh4'
import { PZH4_MOVES, PZH4_CARDS } from '../lib/generation/prompts.generated'
import { FORMAT_CARDS } from '../lib/generation/prompts'
import { moveText } from '../lib/generation/hypotheses'
import type { Memory } from '../lib/generation/memory'

const mem = (count = 0): Memory => ({ count, lastHookTypes: [], lastArcs: [], lastOpenings: [], lastEndings: [], lastRings: [], lastIntents: [], lastFormats: [], usedClientPhrases: [], usedDetails: [], usedSignaturePhrases: [], recentTopics: [], feedbackReasons: [], zh4: emptyZh4() })

// Черновик Михаила из zh3 (r_dengi_1): петля «Еще немного, и», h7 вырезал все повторы и оставил «Накопили.»
const draft = `Текст на экране: Зарабатываю нормально, а денег все мало

Речь: Еще немного, и вы наконец перестанете бояться, что денег не хватит. Сейчас вроде хватает: за квартиру заплатили, продукты купили.

Еще немного, и вы соберете сумму, с которой точно будет спокойно. Вы ведь уже назначали себе такую сумму. Тогда вы думали: вот накоплю, и смогу не проверять счет.

Накопили. Только теперь вы знаете, сколько стоит замена коробки передач, поэтому сумму надо увеличить.

Еще немного, и вы сможете потратить на себя без получасового обсуждения с самим собой. Старые кроссовки протекают, вы их утром сушили, но купить новые жалко.

Еще немного, и вы получите подтверждение, что справитесь. Вы ждете его от денег, а сумма растет, и вы придумываете расход побольше.

Еще немного, и вы разрешите себе считать, что денег достаточно. Завтра снова сушить старые кроссовки.

Подпись: строка`

{
  // модель просит вырезать абзац 2: следующий («Накопили.») на него опирается, код возвращает
  const r = applySoftCut(draft, [2], 60)
  assert.ok(!r.cut.some(c => c.startsWith('Еще немного, и вы соберете')), 'монтажер: абзац, на который опирается «Накопили.», не вырезан')
  assert.ok(r.restored.length >= 1, 'монтажер: абзац возвращен')
  // абзац 3 сам с обрубком «Накопили.»: вырезать можно, следующий за ним не опирается
  const r3 = applySoftCut(draft, [3], 60)
  assert.equal(r3.cut.length, 1, 'монтажер: абзац с обрубком вырезан целиком')
  assert.ok(!/Накопили\./u.test(r3.text), 'монтажер: обрубка не осталось')
  // первый и последний абзац не режутся
  const r1 = applySoftCut(draft, [1, 6], 10)
  assert.equal(r1.cut.length, 0, 'монтажер: первый и последний абзац остаются')
  // петля: остается не меньше трех абзацев с «Еще немного, и»
  const rl = applySoftCut(draft, [2, 4, 5], 10)
  const loops = (rl.text.match(/Еще немного, и/gu) || []).length
  assert.ok(loops >= 3, `монтажер: петля сохранена (${loops})`)
  assert.ok(/^Речь: /mu.test(rl.text) && /Подпись: строка/u.test(rl.text) && /Текст на экране/u.test(rl.text), 'монтажер: метки на месте')
  // не режет сильнее, чем нужно: при потолке выше длины ничего не режется
  assert.equal(applySoftCut(draft, [4], 1000).cut.length, 0, 'монтажер: в потолке не режет')
}
assert.ok(leansOn('Поэтому вы и молчите.', 'что-то'), 'опора: «Поэтому» в начале')
assert.ok(leansOn('Накопили. Дальше длинная фраза про другое дело совсем.', 'вот накоплю и успокоюсь'), 'опора: обрубок')
assert.ok(!leansOn('Вы идете в магазин и снова берете то же самое.', 'совсем другой абзац про работу'), 'опора: обычный абзац не опирается')
{
  // два случая: обе половины остаются
  const two = `Речь: Все говорят, что ссоры всегда плохо.\n\nВ одном случае вы ругаетесь из-за посуды и миритесь к вечеру.\n\nВ другом случае после каждой ссоры вы неделю ходите по квартире тихо.\n\nИ вот это уже разговор не про посуду.\n\nПодпись: x`
  assert.equal(applySoftCut(two, [2, 3], 5).cut.length, 0, 'монтажер: «два случая» не режутся')
}

// подписи: на 10 роликов охвата примерно 3-4 без действия, 3 с вопросом, 2 с подпиской; записи в охвате нет
{
  const m = mem()
  const got: string[] = []
  for (let i = 0; i < 20; i++) {
    const c = chooseCaption(m, 'uznavanie', 'Ольга')
    got.push(c.caption)
    m.zh4!.captions.unshift(c.caption); m.zh4!.lens.unshift(c.len); m.zh4!.vizitka.unshift(c.vizitka); m.count++
    assert.ok(!c.vizitka, 'подпись: в охвате без визитки')
  }
  const n = (k: string) => got.filter(x => x === k).length
  assert.equal(n('zapis'), 0, 'подпись: записи в охвате нет')
  assert.ok(n('dobavit') >= 6 && n('dobavit') <= 8 && n('vopros') >= 5 && n('vopros') <= 7 && n('podpiska') >= 3 && n('podpiska') <= 5, `подпись: доли ${got.join(',')}`)
  assert.ok(!got.some((x, i) => x === 'podpiska' && got[i + 1] === 'podpiska'), 'подпись: подписка не подряд')
  assert.equal(chooseCaption(mem(), 'priglashenie', 'Ольга').caption, 'zapis', 'подпись: приглашение это запись')
  // в доверии запись бывает
  const md = mem(); const gd: string[] = []
  for (let i = 0; i < 10; i++) { const c = chooseCaption(md, 'kak_v_terapii', 'Юлия'); gd.push(c.caption); md.zh4!.captions.unshift(c.caption); md.zh4!.lens.unshift(c.len); md.zh4!.vizitka.unshift(c.vizitka); md.count++ }
  assert.ok(gd.filter(x => x === 'zapis').length === 1, `подпись: в доверии одна запись на 10 (${gd.join(',')})`)
}
// концы: вопрос не чаще раза в четыре, у сценки конца из кода нет
{
  const m = mem(); const ends: string[] = []
  for (let i = 0; i < 16; i++) { const e = chooseEnd(m, 'reels_monolog', 'uznavanie', 'Ход: ОДНА МЫСЛЬ', 'Михаил')!; ends.push(e); m.zh4!.ends.unshift(e); m.count++ }
  ends.forEach((e, i) => { if (e === 'vopros') assert.ok(!ends.slice(Math.max(0, i - 3), i).includes('vopros'), `конец: вопрос чаще раза в четыре (${ends.join(',')})`) })
  assert.ok(new Set(ends).size === 4, 'конец: все четыре вида охвата')
  assert.equal(chooseEnd(mem(), 'reels_scenka', 'mehanizm', '', 'Ольга'), undefined, 'конец: у сценки свой')
  assert.equal(goalOf('priglashenie'), 'zapis')
}
// начала: ход ограничивает виды, у хода «-» начала нет, повтор не раньше чем через три
{
  assert.deepEqual(startsOfMove(PZH4_MOVES.hod_raznesti), ['sovet'])
  assert.deepEqual(startsOfMove(PZH4_MOVES.hod_povtor), [])
  assert.equal(chooseStart(mem(), 'reels_monolog', PZH4_MOVES.hod_raznesti, 'Ольга'), 'sovet')
  assert.equal(chooseStart(mem(), 'reels_monolog', PZH4_MOVES.hod_povtor, 'Ольга'), undefined)
  const m = mem(); const st: string[] = []
  for (let i = 0; i < 8; i++) { const x = chooseStart(m, 'post', PZH4_MOVES.hod_beshus, 'Юлия')!; st.push(x); m.zh4!.starts.unshift(x); m.count++ }
  st.forEach((x, i) => assert.ok(!st.slice(Math.max(0, i - 3), i).includes(x) || new Set(st).size < 4, `начало: повтор раньше чем через три (${st.join(',')})`))
  // у разных авторов с пустой памятью начало разное хотя бы у двух из трех
  const three = ['Юлия', 'Ольга', 'Михаил'].map(w => chooseStart(mem(), 'post', '', w))
  assert.ok(new Set(three).size >= 2, `начало: у трех авторов не одинаково (${three.join(',')})`)
}
// карусели: вопрос в конце не чаще чем в половине, слайд с шагом примерно в каждой третьей-четвертой
{
  const m = mem(); const ends: string[] = []; let shag = 0
  for (let i = 0; i < 12; i++) { const c = chooseCarousel(m, 'uznavanie', 'Ольга'); ends.push(c.karEnd); if (c.karShag) shag++; m.zh4!.covers.unshift(c.cover); m.zh4!.karEnds.unshift(c.karEnd); m.zh4!.karShag.unshift(c.karShag); m.count++ }
  assert.ok(ends.filter(x => x === 'vopros').length <= 6, `карусель: вопросов ${ends.join(',')}`)
  assert.ok(shag >= 2 && shag <= 4, `карусель: слайд с шагом ${shag} из 12`)
}
// карточки: в zh4 нет клонов и «Б подтверждает», у рилсов без своей карточки нет строки про финал с призывом
{
  const all = [...Object.values(PZH4_MOVES), ...Object.values(PZH4_CARDS)].join('\n')
  for (const bad of ['хорошую новость', 'чашка', 'подтверждает', 'за что человек правда отвечает', 'Вечный Подготовщик']) assert.ok(!all.includes(bad), `zh4: нет «${bad}»`)
  const malysh = zh4FormatCard('reels_malysh', FORMAT_CARDS.reels_malysh)
  assert.ok(!/Подпись \(это описание|Речь \d+-\d+ слов/u.test(malysh) && /Формат ответа/u.test(malysh), 'zh4: у малыша без строки подписи и длины')
  assert.ok(!/^Начала:/mu.test(moveText(PZH4_MOVES.hod_beshus)), 'zh4: строка «Начала» в промпт не идет')
}
console.log('ok: zh4')
