// zh6 (08.11): банк живых примеров lib/generation/zh6-primery.json и подбор 2-3 примеров на генерацию.
// Подбор: формат, голос автора, смысл материала; ротация без повтора недавних (exclude), у каждого автора свой сдвиг.
// Свои тексты автора главнее: они идут в промпт первыми отдельным блоком (write.ts), примеры только манера и живость.
import bank from '../zh6-primery.json'
import type { AuthorSettings } from '../settings'
import { isReels, type FormatCode } from '../text-guard'

export type Primer = {
  id: string
  src: string
  author: string
  format: 'reels' | 'post' | 'tg' | 'carousel'
  voice: string[]
  smysl: string
  tema: string
  chem_horosh: string
  text: string
}

export const PRIMERY: Primer[] = bank as Primer[]

const MAT_RE = /(?<![\p{L}])(?:ху[йеёияю]\p{L}*|охуе\p{L}*|аху\p{L}*|пизд\p{L}*|бля\p{L}*|еба\p{L}*|ебу\p{L}*|заеб\p{L}*|заёб\p{L}*|выеб\p{L}*|долбо[её]б\p{L}*|сук[аиу]|нахер|похер|херн\p{L}*|мудак\p{L}*|говн\p{L}*|жоп\p{L}*)(?![\p{L}])/iu
export const hasMat = (t: string) => MAT_RE.test(t)

// формат генерации в формат банка
export function bankFormat(f: FormatCode): Primer['format'] {
  if (f === 'carousel') return 'carousel'
  if (f === 'post_tg') return 'tg'
  if (isReels(f)) return 'reels'
  return 'post'
}

// голос автора по профилю и его текстам: какие пометки банка ему близки
export function authorVoice(s: AuthorSettings): string[] {
  const own = s.samples.join('\n')
  const v: string[] = []
  const matOk = s.profanityRule !== 'не использовать' && !/^не использовать/u.test(s.profanityRule)
  if (matOk && (hasMat(own) || s.intensity === 'hot')) v.push('mat')
  if (s.intensity === 'hot') v.push('zhestko')
  if (s.intensity === 'calm') v.push('spokojno', 'berezhno')
  if (s.intensity === 'live') v.push('ironiya', 'teplo')
  if (/КПТ|ACT|доказательн|когнитивн/iu.test(s.approach || '')) v.push('ekspert')
  return [...new Set(v)]
}

const seedOf = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7)

// 2-3 примера: два своего формата и один другого (живость не зависит от формата), без мата для автора без мата.
// exclude: id, которые этот автор недавно видел; если подходящих мало, exclude ослабляется.
export function pickPrimery(o: { format: FormatCode; voice: string[]; smysl?: string; allowMat: boolean; seed: string; exclude?: string[]; count?: number }): Primer[] {
  const want = bankFormat(o.format)
  const count = o.count ?? 3
  const ok = PRIMERY.filter(p => o.allowMat || !(p.voice.includes('mat') || hasMat(p.text)))
  const score = (p: Primer) => {
    let x = 0
    if (p.format === want) x += 4
    else if ((want === 'post' && p.format === 'tg') || (want === 'tg' && p.format === 'post')) x += 3
    for (const v of p.voice) if (o.voice.includes(v)) x += 2
    if (o.smysl && p.smysl === o.smysl) x += 1
    return x
  }
  const rnd = seedOf(o.seed)
  const order = (list: Primer[]) => list
    .map(p => ({ p, s: score(p) + ((seedOf(p.id) ^ rnd) % 1000) / 1000 * 2.5 }))
    .sort((a, b) => b.s - a.s).map(x => x.p)
  const ex = new Set(o.exclude || [])
  let pool = order(ok.filter(p => !ex.has(p.id)))
  if (pool.length < count) pool = order(ok)
  const same = pool.filter(p => p.format === want || (want !== 'carousel' && want !== 'reels' && (p.format === 'post' || p.format === 'tg')))
  const other = pool.filter(p => !same.includes(p))
  const out: Primer[] = []
  const authors = new Set<string>()
  const take = (list: Primer[], n: number) => {
    for (const p of list) {
      if (out.length >= count || n <= 0) break
      if (out.includes(p) || (p.author && authors.has(p.author))) continue
      out.push(p); if (p.author) authors.add(p.author); n--
    }
  }
  take(same, count - 1)
  take(other, 1)
  take(same, count - out.length)
  take(pool, count - out.length)
  return out
}

export function primeryBlock(list: Primer[]): string {
  return list.map((p, i) => `Пример ${i + 1} (${p.format === 'reels' ? (/Речь:/u.test(p.text) || !/Текст на экране:/u.test(p.text) ? 'рилс, расшифровка речи' : 'рилс без слов: надпись на экране и подпись') : p.format === 'carousel' ? 'карусель' : p.format === 'tg' ? 'пост в телеграме' : 'пост'}):\n${p.text.trim()}`).join('\n\n')
}
