// Мера одинаковости между авторами (zh4, 21.10, 05-ODINAKOVOST-I-TEMY.md): одна тема у трех тестовых авторов рилсом.
// Для каждой темы считаем общее между тремя текстами (по парам): общие цепочки из 3 и 4 слов, одинаковый вид начала
// и конца, общие бытовые подробности. Итог одной цифрой на вариант и списком самых частых общих кусков. Бесплатно.
//   npx tsx scripts/sameness.ts --name=zh4 --main=<прогон raznye> --same=<прогон odinakovost> [--name=... ...]
// Можно несколько вариантов: --v=zh4:<main>:<same> --v=zh4h7m:<main>:<same>
//
// Индекс на пару текстов = общих цепочек из 3 слов + 2 × общих бытовых подробностей + 2 × (одинаковое начало)
// + 2 × (одинаковый конец). Чем меньше, тем меньше похожи тексты разных авторов на одну тему. Общие слова
// из самой темы (ее цепочки) и служебные цепочки из одних коротких слов не считаются.
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { splitText } from './stylo'
import { TOPICS_RAZNYE } from './eval-data'

const TEST = join(__dirname, '..', '_знания', 'мозг-генератора', 'test', 'eval')
const argv = process.argv.slice(2)
const vs = argv.filter(a => a.startsWith('--v=')).map(a => a.slice(4).split(':'))
const SAME_IDS = ['r_rod_1', 'r_men_1', 'r_vybor_1', 'r_body_1', 'r_post_1', 'r_drug_1']
const W = (s: string) => (s.toLowerCase().match(/[\p{L}\d]+/gu) || [])
const load = (run: string) => { const f = join(TEST, run, 'results.json'); return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')).filter((r: any) => !r.error && r.text) : [] }
const SHORT = new Set('и а но в на с к по за от до из у о об не что как это то же ли бы вы ты я он она мы они его ее их вас вам вам тебя тебе меня мне все так вот ну да уже еще когда если чтобы потому есть был была было там тут этот эта эти'.split(' '))
function grams(t: string, k: number): Set<string> {
  const w = W(t); const out = new Set<string>()
  for (let i = 0; i + k <= w.length; i++) { const g = w.slice(i, i + k); if (g.some(x => !SHORT.has(x) && x.length > 3)) out.add(g.join(' ')) }
  return out
}
const BYT = ['ужин', 'чай', 'кофе', 'остыл', 'телефон', 'кухн', 'плит', 'посуд', 'диван', 'сторис', 'лент', 'машин', 'подъезд', 'магазин', 'холодильник', 'сковород', 'ноутбук', 'душ', 'кроват', 'подушк', 'чат', 'голосов', 'сообщени', 'приложени', 'стирк', 'кастрюл', 'зеркал', 'пижам', 'тапк', 'балкон']
const bytOf = (t: string) => new Set(BYT.filter(b => W(t).some(w => w.startsWith(b))))
// вид начала и конца по словам (грубо, одинаково для всех вариантов)
function startKind(t: string): string {
  const f = (t.split(/(?<=[.!?…])\s+|\n+/u)[0] || '').toLowerCase()
  if (/^«|^"/u.test(f) || /говорят|советуют|слышу|фраз/u.test(f)) return 'sovet'
  if (/спросил|спрашива|пишут|написала/u.test(f)) return 'vopros'
  if (/подруг|сестр|коллег|знаком/u.test(f)) return 'podruga'
  if (/приход|на консультац|клиент/u.test(f)) return 'rabota'
  if (/увидел|видела|прочитал|листа|сижу/u.test(f)) return 'uvidela'
  if (/\?$/u.test(f)) return 'vopros_zritelyu'
  return 'scena'
}
function endKind(t: string): string {
  const s = t.split(/(?<=[.!?…])\s+|\n+/u).filter(x => x.trim()); const l = (s[s.length - 1] || '').toLowerCase()
  if (/\?$/u.test(l)) return 'vopros'
  if (/можно/u.test(l)) return 'mozhno'
  if (/отвеча\S* за/u.test(l)) return 'otvechaet'
  if (/приход|запис/u.test(l)) return 'priglashenie'
  if (/(?<![а-яё])я(?![а-яё])|сама|сам(?![а-яё])/u.test(l)) return 'o_sebe'
  return 'fraza'
}

for (const [name, main, same] of vs) {
  const a = load(main), b = load(same)
  let idxSum = 0, pairs = 0
  const common = new Map<string, number>()
  const per: string[] = []
  for (const id of SAME_IDS) {
    const t = TOPICS_RAZNYE.find(r => r.id === id)!
    const texts = [a.find((r: any) => r.id === id), ...b.filter((r: any) => r.id.startsWith(`s_${id}_`))].filter(Boolean).map((r: any) => ({ who: r.author, sp: splitText(r.text).speech }))
    if (texts.length < 2) { per.push(`- ${id}: мало текстов (${texts.length})`); continue }
    const topicGrams = grams(t.topic, 3)
    let tIdx = 0, tPairs = 0
    const bits: string[] = []
    for (let i = 0; i < texts.length; i++) for (let j = i + 1; j < texts.length; j++) {
      const g = [...grams(texts[i].sp, 3)].filter(x => grams(texts[j].sp, 3).has(x) && !topicGrams.has(x))
      const by = [...bytOf(texts[i].sp)].filter(x => bytOf(texts[j].sp).has(x))
      const ss = startKind(texts[i].sp) === startKind(texts[j].sp), ee = endKind(texts[i].sp) === endKind(texts[j].sp)
      const idx = g.length + 2 * by.length + (ss ? 2 : 0) + (ee ? 2 : 0)
      tIdx += idx; tPairs++
      g.forEach(x => common.set(x, (common.get(x) || 0) + 1))
      by.forEach(x => common.set(`[быт] ${x}`, (common.get(`[быт] ${x}`) || 0) + 1))
      if (ss) common.set(`[начало] ${startKind(texts[i].sp)}`, (common.get(`[начало] ${startKind(texts[i].sp)}`) || 0) + 1)
      if (ee) common.set(`[конец] ${endKind(texts[i].sp)}`, (common.get(`[конец] ${endKind(texts[i].sp)}`) || 0) + 1)
      bits.push(`${texts[i].who}/${texts[j].who}: ${idx}${g.length ? ` («${g.slice(0, 4).join('», «')}»)` : ''}${by.length ? ` быт ${by.join(', ')}` : ''}${ss ? ' начало' : ''}${ee ? ' конец' : ''}`)
    }
    idxSum += tIdx; pairs += tPairs
    per.push(`- ${id} «${t.topic}» (${texts.length} текста), на пару ${(tIdx / tPairs).toFixed(1)}: ${bits.join('; ')}`)
  }
  console.log(`\n## ${name}: индекс одинаковости ${(idxSum / (pairs || 1)).toFixed(1)} на пару (${pairs} пар)\n`)
  console.log(per.join('\n'))
  console.log(`\nСамые частые общие куски: ${[...common.entries()].sort((x, y) => y[1] - x[1]).slice(0, 15).map(([k, v]) => `${k} ${v}`).join(', ')}`)
}
