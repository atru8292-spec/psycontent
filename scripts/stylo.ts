// Замер устройства речи: длина фраз, кавычки, двоеточия, «я», связки, словечки, мат на 100 слов.
// Сравнивает наши прогоны с живыми рилсами (_знания/транскрипты-рилсов) и живыми ТГ-постами. Бесплатно, без модели.
//
//   npx tsx scripts/stylo.ts                                   живые рилсы и три последних прогона eval
//   npx tsx scripts/stylo.ts --runs=2026-10-02_..._h1,...      конкретные прогоны
//   npx tsx scripts/stylo.ts --runs=... --out=<папка>          еще и stylo.md в папку
//
// Берется только то, что зритель слышит или читает (без надписи на экране, подписи, меток), как в turing.ts.

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { plainText } from './turing-text'
import { isReels } from '../lib/generation/text-guard'

const ROOT = join(__dirname, '..')
const TEST = join(ROOT, '_знания', 'мозг-генератора', 'test')
const argv = process.argv.slice(2)
const flag = (name: string) => (argv.find(a => a.startsWith(`--${name}=`)) || '').split('=').slice(1).join('=')
// только рилсы (живые рилсы против наших рилсов); --all вернет все форматы
const REELS_ONLY = !argv.includes('--all')

export type Stylo = {
  n: number; words: number
  sentLen: number; sentSd: number; longShare: number
  quotes: number; colons: number; ya: number; links: number; particles: number; mat: number
}

const W = (s: string) => (s.match(/[\p{L}\d]+/gu) || [])
const L = 'а-яёa-z'
const count = (text: string, re: RegExp) => (text.match(re) || []).length
const RE_YA = new RegExp(`(?<![${L}])я(?![${L}])`, 'giu')
const RE_LINKS = new RegExp(`(?<![${L}])(?:потому что|значит|то есть|получается)(?![${L}])`, 'giu')
const RE_PART = new RegExp(`(?<![${L}])(?:ну|вот|блин|короче|прям|просто|давайте)(?![${L}])`, 'giu')
const RE_MAT = /(?<![а-яё])(?:бл[яе*]\S*|бл\*\S*|ху[йеяи*]\S*|пизд\S*|п\*зд\S*|еба\S*|ебу\S*|ебл\S*|заеб\S*|охуе\S*|нахуй|нихуя|сук[аи]\b|говн\S*|хер\S*)/giu

export function measure(texts: string[]): Stylo {
  const sents: number[] = []
  let words = 0, quotes = 0, colons = 0, ya = 0, links = 0, particles = 0, mat = 0
  for (const raw of texts) {
    const t = raw.replace(/^\s*Слайд\s*\d+\s*:\s*/gimu, '')
    const low = t.toLowerCase()
    words += W(t).length
    for (const s of t.split(/(?<=[.!?…])\s+|\n+/u)) { const n = W(s).length; if (n) sents.push(n) }
    quotes += count(t, /«/g)
    colons += count(t, /:/g)
    ya += count(low, RE_YA)
    links += count(low, RE_LINKS)
    particles += count(low, RE_PART)
    mat += count(low, RE_MAT)
  }
  const per = (x: number) => (words ? Math.round((x / words) * 1000) / 10 : 0)
  const mean = sents.reduce((a, b) => a + b, 0) / (sents.length || 1)
  const sd = Math.sqrt(sents.reduce((a, b) => a + (b - mean) ** 2, 0) / (sents.length || 1))
  return {
    n: texts.length, words,
    sentLen: Math.round(mean * 10) / 10, sentSd: Math.round(sd * 10) / 10,
    longShare: Math.round((sents.filter(x => x >= 20).length / (sents.length || 1)) * 100),
    quotes: per(quotes), colons: per(colons), ya: per(ya), links: per(links), particles: per(particles), mat: per(mat),
  }
}

// Живые рилсы: все транскрипты, кроме роликов про боль психологов-блогеров (03, 33, 62, 65) и разборов (79+).
export function liveReels(): string[] {
  const dir = join(ROOT, '_знания', 'транскрипты-рилсов')
  return readdirSync(dir)
    .filter(f => /^\d+_reels_.*\.txt$/.test(f) && !/^(03|33|62|65)_/.test(f))
    .map(f => readFileSync(join(dir, f), 'utf8').trim())
    .filter(t => W(t).length >= 30)
}

export function runTexts(run: string): string[] {
  const f = join(TEST, 'eval', run, 'results.json')
  if (!existsSync(f)) return []
  return JSON.parse(readFileSync(f, 'utf8')).filter((r: any) => !r.error && r.text && (!REELS_ONLY || isReels(r.format))).map((r: any) => plainText(r.text))
}

export function styloTable(rows: { name: string; s: Stylo }[]): string {
  const head = '| | текстов | длина фразы | разброс | длинных 20+ | кавычки | двоеточия | «я» | связки | словечки | мат |\n|---|---|---|---|---|---|---|---|---|---|---|'
  return head + '\n' + rows.map(({ name, s }) =>
    `| ${name} | ${s.n} | ${s.sentLen} | ${s.sentSd} | ${s.longShare}% | ${s.quotes} | ${s.colons} | ${s.ya} | ${s.links} | ${s.particles} | ${s.mat} |`).join('\n')
}

// Связки из 2-3 слов, которые стоят больше чем в трети текстов прогона: так ловятся тики вроде «вы уже»
export function frequentGrams(texts: string[], share = 1 / 3): { gram: string; n: number }[] {
  const seen = new Map<string, number>()
  for (const t of texts) {
    const w = W(t.toLowerCase())
    const grams = new Set<string>()
    for (let i = 0; i < w.length; i++) for (const k of [2, 3]) if (i + k <= w.length) grams.add(w.slice(i, i + k).join(' '))
    for (const g of grams) seen.set(g, (seen.get(g) || 0) + 1)
  }
  return [...seen.entries()].filter(([, n]) => n > texts.length * share).map(([gram, n]) => ({ gram, n })).sort((a, b) => b.n - a.n)
}

// Шаблоны: начала фраз из 2-4 слов, которые стоят больше чем в 4 текстах из 48 (порог растет с размером прогона).
// Так ловятся заготовки модели («я считаю», «я называю это», «сколько совпало», «все, я пошел»).
export function templateStarts(texts: string[]): { start: string; n: number }[] {
  const limit = Math.max(4, Math.round((texts.length * 4) / 48))
  const seen = new Map<string, number>()
  for (const raw of texts) {
    const starts = new Set<string>()
    for (const sent of raw.replace(/^\s*(Слайд\s*\d+|[АБ])\s*:\s*/gimu, '').split(/(?<=[.!?…])\s+|\n+/u)) {
      const w = W(sent.toLowerCase())
      for (const k of [2, 3, 4]) if (w.length >= k) starts.add(w.slice(0, k).join(' '))
    }
    for (const g of starts) seen.set(g, (seen.get(g) || 0) + 1)
  }
  const all = [...seen.entries()].filter(([, n]) => n > limit).map(([start, n]) => ({ start, n }))
  // длинное начало поглощает короткое, если встречается почти так же часто
  return all.filter(a => !all.some(b => b.start !== a.start && b.start.startsWith(a.start + ' ') && b.n >= a.n - 1)).sort((a, b) => b.n - a.n)
}

// Как автор говорит о себе: сколько текстов начинают хотя бы одну фразу с «я считаю», «меня злит/бесит», «я сама/сам»
const SELF_STARTS: [string, RegExp][] = [
  ['«Я считаю»', /^я\s+считаю/u],
  ['«Меня злит/бесит»', /^меня\s+(?:злит|бесит|особенно\s+(?:злит|бесит))/u],
  ['«Я сама/сам»', /^я\s+сам[аи]?(?![а-яё])/u],
]
export function selfStarts(texts: string[]): string {
  return SELF_STARTS.map(([name, re]) => {
    const n = texts.filter(t => t.split(/(?<=[.!?…])\s+|\n+/u).some(x => re.test(x.replace(/^\s*(?:Речь|Слайд\s*\d+|[АБ])\s*:\s*/iu, '').trim().toLowerCase()))).length
    return `${name} ${n}/${texts.length}`
  }).join(', ')
}

// Признаки шаблона и нейросети из разборов 104 рилсов и каруселей (_знания/мозг-генератора/zh3/01-NOVYE-PRAVILA-zh3.md, раздел 3).
// Счет текстов, где признак есть. Ловится только то, что видно по словам; финал-антитезу, ровную речь без пауз
// и диагноз читателю по смыслу словами не поймать, их проверять глазами (здесь только грубые подсказки).
const sentencesOf = (t: string) => t.replace(/^\s*(?:Речь|Слайд\s*\d+|[АБ])\s*:\s*/gimu, '').split(/(?<=[.!?…])\s+|\n+/u).map(x => x.trim()).filter(x => W(x).length)
const word = (s: string) => new RegExp(`(?<![${L}])(?:${s})`, 'iu')
export const PRIZNAKI: [string, (t: string) => boolean][] = [
  ['1 «у меня для вас новость»', t => word('у меня для (?:вас|тебя) (?:есть )?новост').test(t)],
  ['2 детство последним поворотом', t => { const s = sentencesOf(t); return s.slice(Math.floor(s.length * 0.6)).some(x => word('детств|в детстве|родители ваши|ваши родители|твои родители|мама в детстве').test(x)) }],
  ['3 лекторский вход', t => word('знакома ли|знакомо ли|знакомы ли|согласитесь|присаживайтесь|давайте разберемся|давайте разберем|сегодня (?:мы )?(?:поговорим|разберем)').test(sentencesOf(t).slice(0, 2).join(' '))],
  ['4 кликбейт без содержания', t => word('(?:скрывают|скрывает)(?![а-яё])|настоящий прорыв|раз и навсегда|будет больно, но|никто не говорит об этом|об этом молчат|об этом не принято').test(t)],
  ['5 наука без источника', t => word('исследовани|ученые|доказано|по данным|университет|нейробиолог').test(t)],
  ['6 псевдотермины', t => word('энергообмен|легальн\\S* гор|самопредательств|психическ\\S* контейнер|грандиозн\\S* эго|ресурсн\\S* состояни|ресурсе|внутренн\\S* ребен').test(t)],
  ['7 мантры-утешения', t => word('это (?:его|ее|их) ответственность|(?:вы|ты) (?:точно )?не (?:сломан|поломан)|с (?:тобой|вами) все в порядке|(?:вы|ты) достойн|(?:вы|ты) имеете? право|(?:ты|вы) не обязан\\S* (?:никому|ничего)').test(t)],
  ['8 призыв-заготовка в речи', t => word('не забуд\\S* подписаться|подпиш\\S*, чтобы не потерять|сохран\\S*,? (?:чтобы не потерять|потом скаж\\S* спасибо|пригодится)|отправь\\S* (?:это )?(?:видео )?(?:подруге|друзьям)').test(t)],
  ['9 аффирмации-запреты подряд (3+ «не нужно/не надо/не обязан» в одной фразе)', t => sentencesOf(t).some(x => (x.match(new RegExp(`(?<![${L}])(?:не нужно|не надо|не обязан|не должн)`, 'giu')) || []).length >= 3)],
  ['10 финал-антитеза (подсказка: «не ..., а ...» в двух последних фразах)', t => /(?<![а-яё])не\s[^.!?]*?,\s+а\s/u.test(sentencesOf(t).slice(-2).join(' ').toLowerCase())],
  ['11 терапевт из учебника', t => word('какую (?:внутреннюю )?потребность|от чего (?:ты|вы) (?:на самом деле )?(?:бежишь|сбегаешь|убегаете)|что (?:ты|вы) (?:сейчас )?чувству\\S* в теле|что за этим стоит|что для (?:тебя|вас) значит').test(t)],
  ['12 фразы-статьи', t => word('подавал\\S* (?:вам |тебе )?сигнал|находят выход|отда\\S* ресурс|накопленн\\S* эмоци|психика (?:так )?защищается').test(t)],
  ['13 одна рамка на пунктах (начало из 2 слов 3+ раз в тексте)', t => { const n = new Map<string, number>(); for (const x of sentencesOf(t)) { const k = W(x.toLowerCase()).slice(0, 2).join(' '); if (k.split(' ').length === 2) n.set(k, (n.get(k) || 0) + 1) } return [...n.values()].some(v => v >= 3) }],
  ['14 шаблонный хук', t => word('один простой шаг|никто не говорит|никто не скажет|все равно ____|делать все «?правильно»?').test(sentencesOf(t).slice(0, 2).join(' '))],
  ['15 ровная речь (подсказка: ни «ну», «вот», «короче», «блин», «прям», ни многоточия)', t => !RE_PART.test(t.toLowerCase()) && !/…|\.\.\./u.test(t)],
  ['16 диагноз читателю (подсказка)', t => word('у (?:вас|тебя) (?:тревожн\\S* расстройств|депресси|птср|бпр|созависимост|нарцисс)|(?:вы|ты) (?:нарцисс|созависим)').test(t)],
]
export function priznaki(texts: string[]): string {
  return PRIZNAKI.map(([name, f]) => { RE_PART.lastIndex = 0; return `${name}: ${texts.filter(t => { RE_PART.lastIndex = 0; return f(t) }).length}/${texts.length}` }).join('\n')
}

// Рабочая деталь автора (zh3, поле work_detail тестовых психологов): во скольких текстах автора она стоит.
// Больше трети это новый шаблон.
const DETAIL_RE: Record<string, RegExp> = { 'Юлия': /салфет/iu, 'Ольга': /мультик|трактор|кладов|пылесос/iu, 'Михаил': /у подъезда|в машине у|из окна/iu }
export function detailShare(run: string): string {
  const f = join(TEST, 'eval', run, 'results.json')
  if (!existsSync(f)) return 'нет прогона'
  const rows = JSON.parse(readFileSync(f, 'utf8')).filter((r: any) => !r.error && r.text && (!REELS_ONLY || isReels(r.format)))
  return Object.entries(DETAIL_RE).map(([who, re]) => { const mine = rows.filter((r: any) => r.author === who); return `${who} ${mine.filter((r: any) => re.test(r.text)).length}/${mine.length}` }).join(', ')
}

// ---------- zh4 (21.10): счет по правкам Арины к zh3 (03-PRAVKI-ARINY-zh3.md, 04, 06) ----------
type Row = { id: string; author: string; format: string; text: string; plan?: any }
export function runRows(run: string, all = false): Row[] {
  const f = join(TEST, 'eval', run, 'results.json')
  if (!existsSync(f)) return []
  return JSON.parse(readFileSync(f, 'utf8')).filter((r: any) => !r.error && r.text && (all || isReels(r.format)))
}
// речь без надписи, ролей и подписи; подпись отдельно
export function splitText(t: string): { speech: string; caption: string } {
  const m = t.match(/(^|\n)\s*Подпись\s*:\s*/u)
  const body = m && m.index !== undefined ? t.slice(0, m.index) : t
  const caption = m && m.index !== undefined ? t.slice(m.index + m[0].length).trim() : ''
  const speech = body.replace(/^\s*(?:Текст на экране|Персонажи)\s*:.*$/gimu, '').replace(/^\s*(?:Речь|[АБ]|Слайд\s*\d+)\s*:\s*/gimu, '').trim()
  return { speech, caption }
}
const sents = (t: string) => t.split(/(?<=[.!?…])\s+|\n+/u).map(x => x.trim()).filter(x => W(x).length)
const REACT = /(?<![а-яё])меня\s+(?:[а-яё]+\s+){0,3}(?:задева|цепля|беси|раздража|злит|задело)/iu
// отдельная строка-реакция: короткая фраза (до 8 слов), где кроме реакции ничего («Вот это меня особенно задевает.»)
export const reactionLine = (t: string) => sents(splitText(t).speech).some(x => REACT.test(x) && W(x).length <= 8 && !/[«"]/u.test(x))
export const otvetFormula = (t: string) => /(?<![а-яё])(?:отвечаешь|отвечаете|отвечает|отвечаю|отвечают)\s+за(?![а-яё])/iu.test(splitText(t).speech)
const lastSent = (t: string) => { const s = sents(splitText(t).speech); return s[s.length - 1] || '' }
export const endsMozhno = (t: string) => /(?<![а-яё])можно(?![а-яё])/iu.test(lastSent(t))
export const endsQuestion = (t: string) => /\?[»"]?$/u.test(lastSent(t))
const BYT: [string, RegExp][] = [['ужин', /ужин/iu], ['чай', /(?<![а-яё])ча[йяюе](?![а-яё])|чаю(?![а-яё])/iu], ['остыл', /остыл|остыва|остынет/iu], ['телефон', /телефон/iu], ['повышение', /повышени|повысил/iu], ['плита', /(?<![а-яё])плит[аеуы]/iu], ['кухня', /кухн/iu], ['диван', /диван/iu], ['сторис', /сторис/iu]]
const SIZHU = /сижу с (?:телефоном|чаем)|сижу,? (?:листаю|смотрю)|только что увидел/iu
const firstWords = (t: string, n: number) => W(sents(splitText(t).speech)[0]?.toLowerCase() || '').slice(0, n).join(' ')

export function zh4Checks(run: string, all = false): string {
  const rows = runRows(run, all)
  if (!rows.length) return 'нет прогона'
  const n = (f: (t: string) => boolean) => `${rows.filter(r => f(r.text)).length}/${rows.length}`
  const byt = BYT.map(([k, re]) => [k, rows.filter(r => re.test(splitText(r.text).speech)).length] as [string, number]).filter(([, x]) => x).map(([k, x]) => `${k} ${x}`).join(', ')
  // одинаковые первые три слова у одного автора
  const firsts = new Map<string, number>()
  for (const r of rows) { const k = `${r.author}: ${firstWords(r.text, 3)}`; firsts.set(k, (firsts.get(k) || 0) + 1) }
  const dupFirst = [...firsts.entries()].filter(([, v]) => v >= 2).map(([k, v]) => `«${k}» ${v}`).join(', ') || 'нет'
  return [
    `- любая фраза «меня (особенно) задевает / цепляет / бесит / раздражает / злит»: ${n(t => sents(splitText(t).speech).some(x => REACT.test(x)))}`,
    `- отдельные строки-реакции «меня задевает / цепляет / бесит / раздражает»: ${n(reactionLine)}`,
    `- формула «отвечаешь / отвечает за»: ${n(otvetFormula)}`,
    `- «можно» в последней фразе: ${n(endsMozhno)}`,
    `- конец вопросом: ${n(endsQuestion)}`,
    `- «сижу с телефоном / только что увидела»: ${n(t => SIZHU.test(splitText(t).speech))}`,
    `- бытовые слова (в скольких текстах): ${byt || 'нет'}`,
    `- одинаковое начало (первые три слова) у одного автора: ${dupFirst}`,
  ].join('\n')
}

// карусели: слов на слайд, обложки «Для тех, кто», концы «в комментариях», слайд с готовыми фразами
export function carouselChecks(run: string): string {
  const rows = runRows(run, true).filter(r => r.format === 'carousel')
  if (!rows.length) return 'каруселей нет'
  const slidesOf = (t: string) => splitText(t).speech.split(/\n(?=\s*\S)/u).length && t.split(/^\s*Слайд\s*\d+\s*:\s*/gimu).slice(1).map(x => x.replace(/\n\s*Подпись\s*:[\s\S]*$/u, '').trim())
  const perSlide: number[] = []
  let total = 0, dlyaTeh = 0, komm = 0, frazy = 0, oneLine = 0, podzag = 0
  for (const r of rows) {
    const sl = slidesOf(r.text) as string[]
    sl.forEach(x => perSlide.push(W(x).length))
    total += sl.reduce((a, x) => a + W(x).length, 0)
    if (/для тех/iu.test(sl[0] || '')) dlyaTeh++
    if ((sl[0] || '').split('\n').filter(x => x.trim()).length >= 2) podzag++
    if (/коммент|напиши|напишите|\?\s*$/iu.test(sl[sl.length - 1] || '')) komm++
    // слайд с готовыми фразами: две и больше реплик в кавычках на одном слайде или «что можно сказать»
    if (sl.some(x => (x.match(/«/g) || []).length >= 2 && /сказать|скажи|ответ|фраз/iu.test(x) || /что можно сказать|можно сказать так/iu.test(x))) frazy++
    if (sl.slice(1).some(x => W(x).length <= 10)) oneLine++
  }
  perSlide.sort((a, b) => a - b)
  const med = perSlide[Math.floor(perSlide.length / 2)]
  return [
    `- каруселей ${rows.length}, слов на слайд медиана ${med} (самый короткий ${perSlide[0]}, длинный ${perSlide[perSlide.length - 1]}), слов на карусель в среднем ${Math.round(total / rows.length)}`,
    `- со слайдом одной фразой (до 10 слов, кроме обложки): ${oneLine}/${rows.length}`,
    `- обложка с «Для тех, кто»: ${dlyaTeh}/${rows.length}; с подзаголовком вообще: ${podzag}/${rows.length}`,
    `- последний слайд вопросом или про комментарии: ${komm}/${rows.length}`,
    `- слайд с готовыми фразами: ${frazy}/${rows.length}`,
  ].join('\n')
}

// подписи: тип (из выбора кода zh4 или по словам), визитка, «подписывайтесь», длина
export function captionType(r: Row): string {
  const z = r.plan?.zh4?.caption
  if (z) return z
  const c = splitText(r.text).caption
  if (/директ|запис|кодов\S* слов|первая встреча|первой встреч/iu.test(c)) return 'zapis'
  if (/подпис/iu.test(c)) return 'podpiska'
  if (/\?\s*[\p{Emoji}\s]*$/u.test(c)) return 'vopros'
  return 'dobavit'
}
const VIZITKA = /(?:^|[.!?\n]\s*)[Яя]\s+[А-ЯЁ][а-яё]+,\s*(?:\S+\s+)?психолог|(?:^|[.!?\n]\s*)[Мм]еня зовут\s+[А-ЯЁ]|[Яя] психолог,?\s+работаю/u
export function captionChecks(run: string): string {
  const rows = runRows(run, true).filter(r => splitText(r.text).caption)
  if (!rows.length) return 'подписей нет'
  const types = new Map<string, number>()
  for (const r of rows) types.set(captionType(r), (types.get(captionType(r)) || 0) + 1)
  const lens = rows.map(r => W(splitText(r.text).caption).length).sort((a, b) => a - b)
  const caps = rows.map(r => splitText(r.text).caption)
  const iz = caps.filter(c => /^иногда/iu.test(c)).length
  return [
    `- подписей ${rows.length}; типы: ${[...types.entries()].map(([k, v]) => `${k} ${v}`).join(', ')}`,
    `- с визиткой: ${caps.filter(c => VIZITKA.test(c)).length}/${rows.length}; с «подписывайтесь»: ${caps.filter(c => /подпис[ыа]в/iu.test(c)).length}/${rows.length}; кончается вопросом: ${caps.filter(c => /\?[\s\p{Emoji}]*$/u.test(c)).length}/${rows.length}; начинается с «Иногда»: ${iz}/${rows.length}`,
    `- длина в словах: медиана ${lens[Math.floor(lens.length / 2)]}, от ${lens[0]} до ${lens[lens.length - 1]}; одной строкой (до 20 слов) ${lens.filter(x => x <= 20).length}, развернутых (от 50) ${lens.filter(x => x >= 50).length}`,
  ].join('\n')
}


// ---------- zh5 (22.10): короткие фразы, нарезка, петля, обращения, мат, повод, слово в кавычках, подписи ----------
// Все счетчики считаются одинаково для наших прогонов и для живых из lib/generation/live-bank.json (без каруселей).
type R5 = { id: string; author: string; format: string; text: string; plan?: any }
const KIND_FORMAT: Record<string, string> = { monolog: 'reels_monolog', obyasnenie: 'reels_monolog', otvet: 'reels_otvet', rol: 'reels_rol', scenka: 'reels_scenka', spisok: 'reels_spisok', malysh: 'reels_malysh', istoriya: 'reels_istoriya', tg_post: 'post_tg' }
export function liveRows(): R5[] {
  const b = JSON.parse(readFileSync(join(ROOT, 'lib', 'generation', 'live-bank.json'), 'utf8'))
  return b.filter((t: any) => !t.ai_like && t.kind !== 'karusel' && !['r03', 'r33', 'r40', 'r62', 'r65'].includes(t.id))
    .map((t: any) => ({ id: t.id, author: t.author || String(t.id).split('#')[0], format: KIND_FORMAT[t.kind] || 'reels_monolog', text: t.text }))
}
// реплики диалога и роли по строкам; у живых сценок метки бывают «- », у наших «А:» / «Б:»
const isDialog = (line: string) => /^\s*(?:[АБ]|[-–—])\s*[:]?\s/u.test(line)
const sentsOfLine = (l: string) => l.replace(/^\s*(?:[АБ]\s*:|[-–—])\s*/u, '').split(/(?<=[.!?…])\s+/u).map(x => x.trim()).filter(x => W(x).length)
const SHORT_OK = /^(?:да|ну|вот|так|короче|стоп|ага|нет|ой|ого|блин|ясно|именно|окей|ладно)(?![а-яё])/iu
export function shortStats(rows: R5[]) {
  let all = 0, short = 0, narezka = 0
  const lens: number[] = []
  const byFmt = new Map<string, [number, number]>()
  for (const r of rows) {
    const sp = splitText(r.text).speech
    let textNarezka = false
    for (const line of sp.split(/\n+/)) {
      const ss = sentsOfLine(line)
      let run = 0
      for (const x of ss) {
        const n = W(x).length
        all++; lens.push(n)
        const f = byFmt.get(r.format) || [0, 0]; f[0]++
        if (n <= 3) { short++; f[1]++ }
        byFmt.set(r.format, f)
        // нарезка: два и больше коротких подряд без ? и !, не реплика диалога, не «да, ну, вот, так...»
        const cut = n <= 3 && !/[?!]/u.test(x) && !isDialog(line) && !SHORT_OK.test(x)
        run = cut ? run + 1 : 0
        if (run >= 2) textNarezka = true
      }
    }
    if (textNarezka) narezka++
  }
  const mean = lens.reduce((a, b) => a + b, 0) / (lens.length || 1)
  const sd = Math.sqrt(lens.reduce((a, b) => a + (b - mean) ** 2, 0) / (lens.length || 1))
  return { shortShare: Math.round((short / (all || 1)) * 1000) / 10, narezka, sd: Math.round(sd * 10) / 10, byFmt }
}
// петля: 4 и больше абзацев речи начинаются с одного слова
export const loop4 = (t: string) => { const n = new Map<string, number>(); for (const p of splitText(t).speech.split(/\n+/)) { const w = (p.toLowerCase().match(/[\p{L}]+/gu) || [])[0]; if (w && w.length >= 3) n.set(w, (n.get(w) || 0) + 1) } return [...n.values()].some(v => v >= 4) }
export const ADDRESS = /(?<![а-яё])(?:девочки|девчонки|милая|милые|милый|хорошая моя|хорошие мои|мои хорошие|солнышк\S*|зайк\S*|малышк\S*|дорогие|дорогая|дорогой|родные мои|котики|мои дорогие)(?![а-яё])/iu
export const POVOD = /(?:увидел[аи]?|прочитал[аи]?|услышал[аи]?|наткнул\S*|попал\S* на)[^.!?]{0,40}(?:комментари|ленте|под роликом|под видео|под постом|в очереди|в гостях|в разговоре|в обсуждени|в чате|рилс)|в комментариях|вы сейчас смотрите|смотрите этот ролик|листаете ленту/iu
const QWORD = /«([^»\s]{2,20})»[^.!?]{0,40}(?:беси|злит|задева|цепля|раздража|насторажива)|(?:беси|злит|задева|цепля|раздража|насторажива|зацепил)[^.!?]{0,30}(?:это|этот|эта|этом)\s+«([^»\s]{2,20})»/iu
const MAT_FEEL = /меня[^.!?]{0,20}(?:злит|бесит|раздражает|возмущает|взбесил)|(?:злит|бесит)[^.!?]{0,10}меня/iu
const UROK = /(?<![а-яё])(?:полезно|рекомендую|важно|стоит заранее|лучше заранее|можно ответить так|можно сказать так|попробуйте сказать|выпишите)(?![а-яё])/iu
const DETAIL5 = /салфет|синий трактор|мультик|кладовк|в машине у подъезда|сидят в машине|просидел|из окна/iu
export function zh5Table(sets: { name: string; rows: R5[] }[]): string {
  const head = '| | текстов | фраз 1-3 слова | нарезка | разброс длины | петля 4+ абзаца | обращение | мат | мат рядом с «меня злит» | «увидела / в комментариях» | одно слово в кавычках у разных | реплика в кавычках в подписи | подпись-урок | рабочая деталь |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|---|'
  const lines = sets.map(({ name, rows }) => {
    const sp = (r: R5) => splitText(r.text).speech, cp = (r: R5) => splitText(r.text).caption
    const st = shortStats(rows)
    const n = (f: (r: R5) => boolean) => `${rows.filter(f).length}/${rows.length}`
    // одно и то же слово в кавычках рядом с «бесит / злит / задевает» в двух и больше текстах
    const words = new Map<string, number>()
    for (const r of rows) { const m = sp(r).match(QWORD); const w = m && (m[1] || m[2]); if (w) words.set(w.toLowerCase(), (words.get(w.toLowerCase()) || 0) + 1) }
    const rep = [...words.entries()].filter(([, v]) => v >= 2)
    const qw = rep.reduce((a, [, v]) => a + v, 0)
    const withCap = rows.filter(r => cp(r))
    return `| ${name} | ${rows.length} | ${st.shortShare}% | ${st.narezka}/${rows.length} | ${st.sd} | ${n(r => loop4(r.text))} | ${n(r => ADDRESS.test(sp(r)))} | ${n(r => RE_MAT.test(sp(r).toLowerCase()) && (RE_MAT.lastIndex = 0, true))} | ${n(r => sents(sp(r)).some(x => MAT_FEEL.test(x) && (RE_MAT.lastIndex = 0, RE_MAT.test(x.toLowerCase()))))} | ${n(r => POVOD.test(sp(r)))} | ${qw}${rep.length ? ` (${rep.map(([w, v]) => `«${w}» ${v}`).join(', ')})` : ''} | ${withCap.length ? `${withCap.filter(r => /«[^»]{12,}»/u.test(cp(r))).length}/${withCap.length}` : '-'} | ${withCap.length ? `${withCap.filter(r => UROK.test(cp(r))).length}/${withCap.length}` : '-'} | ${n(r => DETAIL5.test(sp(r)))} |`
  })
  return head + '\n' + lines.join('\n')
}

// 0.13 (zh3/08-ZHIVYE-NORMY.md): мысль против рассказа, длина текста по формату, концы-вопросы, призыв голосом
const EXPL = /(?<![а-яё])(?:это|значит|потому что|на самом деле|мозг|психик\S*|поэтому|то есть|получается)(?![а-яё])/iu
// «вы-повествование»: фраза начинается с «вы / ты» и глагола настоящего времени или сразу с такого глагола на -ете/-ите/-ешь/-ишь
const VY = /^(?:и\s+|а\s+|потом\s+|тут\s+)?(?:(?:вы|ты)\s+(?:уже\s+|снова\s+|опять\s+|еще\s+)?[а-яё]+(?:ете|ите|ешь|ишь|етесь|итесь|ешься|ишься)|[а-яё]+(?:аете|яете|уете|ете|ите)(?:сь)?)(?![а-яё])/iu
const PRIZYV = /подпис|сохран|пишите в коммент|напишите в коммент|запис|ссылк|в шапке|в директ|ставьте/iu
export function normTable(sets: { name: string; rows: R5[] }[]): string {
  const head = '| | текстов | фраз-объяснений | «вы-повествование» | слов в тексте по формату (медиана, от-до, разброс) | конец вопросом | призыв голосом в конце |\n|---|---|---|---|---|---|---|'
  return head + '\n' + sets.map(({ name, rows }) => {
    let all = 0, ex = 0, vy = 0
    for (const r of rows) for (const line of splitText(r.text).speech.split(/\n+/)) {
      if (isDialog(line)) continue
      for (const x of sentsOfLine(line)) { all++; if (EXPL.test(x)) ex++; if (VY.test(x)) vy++ }
    }
    const byF = new Map<string, number[]>()
    for (const r of rows) byF.set(r.format, [...(byF.get(r.format) || []), W(splitText(r.text).speech).length])
    const lens = [...byF.entries()].filter(([, v]) => v.length >= 3).sort().map(([f, v]) => { v.sort((a, b) => a - b); const m = v.reduce((a, b) => a + b, 0) / v.length; const sd = Math.round(Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length)); return `${f.replace('reels_', '')} ${v[Math.floor(v.length / 2)]} (${v[0]}-${v[v.length - 1]}, ±${sd})` }).join('; ')
    const last = (r: R5) => { const ss = sents(splitText(r.text).speech); return ss.slice(-2).join(' ') }
    const endQ = rows.filter(r => /\?[»"]?$/u.test((sents(splitText(r.text).speech).slice(-1)[0] || ''))).length
    const pr = rows.filter(r => PRIZYV.test(last(r))).length
    return `| ${name} | ${rows.length} | ${Math.round((ex / (all || 1)) * 100)}% | ${Math.round((vy / (all || 1)) * 1000) / 10}% | ${lens} | ${endQ}/${rows.length} | ${pr}/${rows.length} |`
  }).join('\n')
}

// доля фраз 1-3 слова по формату
export function shortByFormat(sets: { name: string; rows: R5[] }[]): string {
  return sets.map(({ name, rows }) => { const st = shortStats(rows); return `- ${name}: ` + [...st.byFmt.entries()].sort().map(([f, [a, s]]) => `${f.replace('reels_', '')} ${Math.round((s / a) * 100)}% (${a})`).join(', ') }).join('\n')
}
// по автору: обращения и мат
export function byAuthor(rows: R5[]): string {
  const au = [...new Set(rows.map(r => r.author))]
  return au.map(a => { const m = rows.filter(r => r.author === a); const sp = (r: R5) => splitText(r.text).speech; return `${a}: обращение ${m.filter(r => ADDRESS.test(sp(r))).length}/${m.length}, мат ${m.filter(r => { RE_MAT.lastIndex = 0; return RE_MAT.test(sp(r).toLowerCase()) }).length}/${m.length}, петля ${m.filter(r => loop4(r.text)).length}/${m.length}` }).join('; ')
}

function main() {
  if (argv.includes('--zh5')) {
    const sets = [{ name: 'живые (банк без каруселей)', rows: liveRows() }, ...flag('runs').split(',').filter(Boolean).map(r => ({ name: r, rows: runRows(r, argv.includes('--all')) as R5[] }))]
    const md = `# zh5: счетчики правок\n\n${zh5Table(sets)}\n\n## Мысль против рассказа, длина, концы, призыв (0.13)\n\n${normTable(sets)}\n\n## Фразы 1-3 слова по формату\n\n${shortByFormat(sets)}\n\n## По автору\n\n${sets.map(x => `- ${x.name}: ${byAuthor(x.rows)}`).join('\n')}\n`
    console.log(md)
    if (flag('out')) writeFileSync(join(flag('out'), 'stylo-zh5.md'), md)
    return
  }
  const given = flag('runs').split(',').filter(Boolean)
  const runs = given.length ? given : readdirSync(join(TEST, 'eval'))
    .filter(d => /^\d{4}-/.test(d) && !/kalibrovka|nozhnicy|demo/.test(d) && existsSync(join(TEST, 'eval', d, 'results.json')))
    .sort((a, b) => statSync(join(TEST, 'eval', b)).mtimeMs - statSync(join(TEST, 'eval', a)).mtimeMs).slice(0, 3)
  const rows = [{ name: 'живые рилсы', s: measure(liveReels()) }, ...runs.map(r => ({ name: r, s: measure(runTexts(r)) }))]
  const live = liveReels()
  const liveGrams = new Set(frequentGrams(live).map(g => g.gram))
  const grams = runs.map(r => { const t = runTexts(r); return `- ${r}: ${frequentGrams(t).filter(g => !liveGrams.has(g.gram)).slice(0, 25).map(g => `«${g.gram}» ${g.n}/${t.length}`).join(', ') || 'нет'}` })
  const selfs = runs.map(r => `- ${r}: ${selfStarts(runTexts(r))}`)
  const starts = runs.map(r => { const t = runTexts(r); return `- ${r}: ${templateStarts(t).slice(0, 30).map(g => `«${g.start}» ${g.n}/${t.length}`).join(', ') || 'нет'}` })
  const priz = [`### живые рилсы\n\n${priznaki(live)}`, ...runs.map(r => `### ${r}\n\n${priznaki(runTexts(r))}`)]
  const details = runs.map(r => `- ${r}: ${detailShare(r)}`)
  const z4 = runs.map(r => `### ${r}\n\n${zh4Checks(r)}\n${captionChecks(r)}\n${carouselChecks(r)}`)
  const md = `# Устройство речи (на 100 слов${REELS_ONLY ? ', только рилсы' : ''})\n\n${styloTable(rows)}\n\n## Как автор говорит о себе (текстов, где фраза начинается так)\n\n${selfs.join('\n')}\n\n## Шаблоны: начала фраз больше чем в 4 текстах из 48\n\n${starts.join('\n')}\n\n## Связки в больше чем трети текстов (кроме тех, что так же часты у живых)\n\n${grams.join('\n')}\n\n## Признаки шаблона и нейросети (раздел 3 правил zh3, текстов с признаком)\n\n${priz.join('\n\n')}\n\n## Рабочая деталь автора в текстах (больше трети это шаблон)\n\n${details.join('\n')}\n\n## Правки Арины к zh3: строки-реакции, формулы, концы, бытовые повторы, подписи, карусели\n\n${z4.join('\n\n')}\n`
  console.log(md)
  if (flag('out')) writeFileSync(join(flag('out'), 'stylo.md'), md)
}

if (require.main === module) main()
