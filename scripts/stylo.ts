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

function main() {
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
  const md = `# Устройство речи (на 100 слов${REELS_ONLY ? ', только рилсы' : ''})\n\n${styloTable(rows)}\n\n## Как автор говорит о себе (текстов, где фраза начинается так)\n\n${selfs.join('\n')}\n\n## Шаблоны: начала фраз больше чем в 4 текстах из 48\n\n${starts.join('\n')}\n\n## Связки в больше чем трети текстов (кроме тех, что так же часты у живых)\n\n${grams.join('\n')}\n`
  console.log(md)
  if (flag('out')) writeFileSync(join(flag('out'), 'stylo.md'), md)
}

if (require.main === module) main()
