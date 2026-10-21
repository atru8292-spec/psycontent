// Тесты zh5b без модели (22.10, ночь): каркас по памяти автора, начало под каркас, сарказм и вопрос в конце не чаще
// одного из 8, карточки «в этом тексте один раз», клоны убраны, скелет попадает в блок писателя.
//   npx tsx scripts/test-zh5b.ts
import assert from 'node:assert/strict'
import { chooseKarkas, startForKarkas, chooseEnd5b, skeletonText, card5b } from '../lib/generation/zh5b'
import { emptyZh4 } from '../lib/generation/zh4'
import { PZH5B_MOVES, PZH5B_PICKS, PZH5B_CARDS, PZH5B_SYSTEM } from '../lib/generation/prompts.generated'
import type { Memory } from '../lib/generation/memory'

const mem = (): Memory => ({ count: 0, lastHookTypes: [], lastArcs: [], lastOpenings: [], lastEndings: [], lastRings: [], lastIntents: [], lastFormats: [], usedClientPhrases: [], usedDetails: [], usedSignaturePhrases: [], recentTopics: [], feedbackReasons: [], zh4: { ...emptyZh4(), karkas: [] } })
for (const who of ['Юлия', 'Ольга', 'Михаил']) {
  const m = mem(); const k: string[] = [], e: string[] = []
  for (let i = 0; i < 24; i++) {
    const x = chooseKarkas(m, 'reels_monolog', who, false)!; k.push(x); m.zh4!.karkas!.unshift(x)
    m.zh4!.starts.unshift(startForKarkas(m, x, who))
    const y = chooseEnd5b(m, 'reels_monolog', 'uznavanie', 'Ход: X', who)!; e.push(y); m.zh4!.ends.unshift(y)
    m.count++
  }
  assert.ok(!k.includes('obraz') && k.filter(x => x === 'razoblachenie').length === 12, `${who}: каркасы по очереди без образа (${k.join(',')})`)
  for (const v of ['vopros', 'sarkazm']) e.forEach((x, i) => { if (x === v) assert.ok(!e.slice(Math.max(0, i - 7), i).includes(v), `${who}: ${v} в конце чаще одного из 8 (${e.join(',')})`) })
}
assert.equal(chooseKarkas(mem(), 'reels_spisok', 'Ольга', false), 'spisok')
assert.equal(chooseKarkas(mem(), 'reels_scenka', 'Ольга', false), undefined, 'у сценки ход, без каркаса')
assert.ok(['razoblachenie', 'mehanizm', 'obraz'].includes(chooseKarkas(mem(), 'reels_monolog', 'Ольга', true)!), 'zh5bx: образ в выборе')
assert.equal(startForKarkas(mem(), 'spisok', 'Ольга'), 'bez')
assert.ok(['replika', 'sovet'].includes(startForKarkas(mem(), 'razoblachenie', 'Ольга')), 'разоблачение начинается с чужих слов')
// карточки: мат, обращение, призыв «в этом тексте», клоны убраны, сарказм отдельным видом
for (const c of ['mat_da', 'obr_da', 'prizyv_da']) assert.ok(/В этом тексте/u.test(card5b(c)) && !/можно/u.test(card5b(c).split('.')[0]), `карточка ${c} без «можно»`)
const all = [PZH5B_SYSTEM, ...Object.values(PZH5B_MOVES), ...Object.values(PZH5B_PICKS), ...Object.values(PZH5B_CARDS)].join('\n')
for (const bad of ['бывают два разных случая', 'часто приходят', 'замечаю одну вещь', 'за годы работы', 'какая прелесть']) assert.ok(!all.includes(bad), `zh5b: нет «${bad}»`)
assert.ok(card5b('konec_sarkazm') && !/язвительн/u.test(card5b('konec_shutka').replace(/Язвительную оценку[^.]*\./u, '')), 'сарказм отдельно от шутки')
// скелет в блоке писателя, слова профессии только в zh5bx
const t = skeletonText('mehanizm', { mysl: 'М', pochemu: ['П1', 'П2'], primer: 'Пр' }, false)
assert.ok(/мысль: М/u.test(t) && /П1; П2/u.test(t) && /Пример: Пр/u.test(t) && !/профессии/u.test(t), 'скелет в блоке')
assert.ok(/профессии/u.test(skeletonText('mehanizm', null, true)), 'zh5bx: слова профессии')
console.log('ok: zh5b')
