// Движок верстки текста каруселей: настоящий замер по TTF (opentype.js, тот же разбор шрифта, что у Satori)
// и своя разбивка на строки до рендера. Satori потом рисует уже готовые строки без своих переносов (nowrap),
// поэтому то, что посчитано здесь, и есть то, что будет на картинке.
//
// Правила (задача test/PROMPT-CLAUDE-CODE-karuseli-dvizhok.md, раздел 1):
// - предлоги, союзы, частицы и слова до 2 букв клеятся к следующему слову;
// - не рвем «5 признаков», «т.е.», инициалы, открывающую кавычку от слова, знак после слова;
// - в заголовке нет вдовы (одно короткое слово в последней строке), строки по возможности ровные;
// - без переносов внутри слов: длинное слово уменьшает кегль только если не влезает на минимуме;
// - кегль подбирается двоичным поиском между min и max.

import fs from 'fs'
import path from 'path'
import opentype from 'opentype.js'
import { ALL_FONT_FILES } from './pairs'

// ---------- шрифты ----------
// Имя семейства и вес как в fonts.ts (то, что получает Satori) -> файл TTF
const FONT_FILES: Record<string, string> = {
  'Oswald|700': 'Oswald_700Bold.ttf',
  'Onest|400': 'Onest_400Regular.ttf',
  'Onest|700': 'Onest_700Bold.ttf',
  'Cormorant Garamond|600': 'CormorantGaramond_600SemiBold.ttf',
  'Manrope|400': 'Manrope_400Regular.ttf',
  'Manrope|600': 'Manrope_600SemiBold.ttf',
  'Unbounded|700': 'Unbounded_700Bold.ttf',
  'PT Mono|400': 'PTMono_400Regular.ttf',
  'Montserrat|400': 'Montserrat_400Regular.ttf',
  'Montserrat|700': 'Montserrat_700Bold.ttf',
  'Caveat|400': 'Caveat_400Regular.ttf',
  'Caveat|700': 'Caveat_700Bold.ttf',
  'Neucha|400': 'Neucha_400Regular.ttf',
}
export function registerFont(family: string, weight: number, file: string) { FONT_FILES[`${family}|${weight}`] = file }
// шрифты пар (pairs.ts)
for (const f of ALL_FONT_FILES) registerFont(f.family, f.weight, f.file)

const DIR = path.join(process.cwd(), 'public', 'carousel', 'fonts')
const loaded = new Map<string, opentype.Font>()
export function fontOf(family: string, weight = 400): opentype.Font {
  const key = `${family}|${weight}`
  const hit = loaded.get(key)
  if (hit) return hit
  // ближайший вес, если такого нет (как делает Satori)
  const file = FONT_FILES[key] || Object.entries(FONT_FILES).filter(([k]) => k.startsWith(family + '|'))
    .sort((a, b) => Math.abs(Number(a[0].split('|')[1]) - weight) - Math.abs(Number(b[0].split('|')[1]) - weight))[0]?.[1]
  if (!file) throw new Error(`Нет шрифта ${key}`)
  const f = opentype.parse(toArrayBuffer(fs.readFileSync(path.join(DIR, file))))
  loaded.set(key, f)
  return f
}
const toArrayBuffer = (b: Buffer) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer

// hyphen: на обложке очень длинное слово можно перенести с дефисом (см. hyphenParts)
// Высота строчной «о» в пикселях (для капса заглавной «О»): у рукописных шрифтов при том же кегле буквы
// заметно ниже, поэтому видимый размер сравниваем по ней, а не по кеглю (Арина 03.10)
const xCache = new Map<string, number>()
export function xHeight(f: FontSpec, size: number): number {
  const key = `${f.family}|${f.weight || 400}|${f.upper ? 1 : 0}`
  let r = xCache.get(key)
  if (r === undefined) {
    const font = fontOf(f.family, f.weight || 400)
    const bb = font.charToGlyph(f.upper ? 'О' : 'о').getBoundingBox()
    r = (bb.y2 - bb.y1) / font.unitsPerEm
    xCache.set(key, r)
  }
  return r * size
}

export type FontSpec = { family: string; weight?: number; upper?: boolean; hyphen?: boolean }
const widthCache = new Map<string, number>()
// ширина строки в px: сумма продвижений глифов с кернингом
export function measure(text: string, f: FontSpec, size: number): number {
  const t = f.upper ? text.toUpperCase() : text
  const key = `${f.family}|${f.weight || 400}|${t}`
  let w1 = widthCache.get(key)
  if (w1 === undefined) {
    w1 = fontOf(f.family, f.weight || 400).getAdvanceWidth(t, 1, { kerning: true })
    if (widthCache.size > 20000) widthCache.clear()
    widthCache.set(key, w1)
  }
  return w1 * size
}

// ---------- токены ----------
// Слово, которое не должно висеть в конце строки: предлог, союз, частица, слово до 2 букв
const HANG = new Set(('в во на и а но не ни с со к ко у о об обо за по до от из без для под над при про через между перед около ' +
  'что как или где чем это то так уж даже еще ещё вот да ну').split(' '))
// частицы, которые стоят после слова: клеятся к предыдущему («какая же», «было бы»)
const POST = new Set(['же', 'ж', 'ли', 'ль', 'бы', 'б'])
// длинная неразрывная цепочка не влезет в строку крупным кеглем: дальше 22 знаков не клеим
const MAX_UNIT = 22
// слово такой длины и длиннее держит строку само, к нему ничего не клеим
export const LONG_WORD = 13
const NBSP = ' '
const bare = (w: string) => w.toLowerCase().replace(/\u2060/g, '').replace(/^[«„"'(\[]+|[»"'),.!?:;…\]]+$/g, '')

// Неразрывные группы: исходный текст абзаца -> единицы, между которыми можно перенести строку.
// Внутри единицы слова соединены неразрывным пробелом.
export function units(text: string): string[] {
  const toks = text.split(/[ \t]+/).filter(Boolean)
  const out: string[] = []
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i]
    const prev = out[out.length - 1]
    if (prev !== undefined) {
      const last = prev.split(NBSP).pop() as string
      const b = bare(last)
      // висячий предлог или короткое слово клеится к следующему
      const hang = (HANG.has(b) || (b.length > 0 && b.length <= 2 && /^[\p{L}]+$/u.test(b))) && !/[.!?…:;,]$/.test(last)
      // число и слово после него («5 признаков», «в 3 раза»)
      const num = /^\d+[%.,)]?$/.test(last) && /^[\p{L}«(]/u.test(t)
      // инициалы «А. С. Пушкин» и «т.е.», «т.к.»
      const initial = /^[\p{Lu}]\.$/u.test(last) || /^(т\.е\.|т\.к\.|т\.д\.|т\.п\.|и т\.д\.)$/i.test(last)
      // тире или одиночный знак не уходит на новую строку один
      const lone = /^[—–\-:;)»"!?…]+$/.test(t)
      const post = POST.has(bare(t)) && /^[\p{L}]/u.test(last.slice(-1))
      // перед очень длинным словом («гиперответственность») союз не клеим: иначе кегль обложки считается
      // по куску «и гиперответственность», и вся обложка мельчит; висящий союз перед таким словом допустим
      const fitsLen = (prev + NBSP + t).length <= MAX_UNIT && bare(t).length < LONG_WORD
      if ((post || lone) || ((hang || num || initial) && fitsLen)) { out[out.length - 1] = prev + NBSP + t; continue }
    }
    out.push(t)
  }
  return out
}

// Метка «эта часть продолжается в следующей без пробела»: в конце строки она становится дефисом
export const SHY = '\u2060'
// Перенос длинного слова (только обложка, когда без него слово ужимает заголовок): только по приставке
// («само|обесценивание», «гипер|ответственность»). Слово без приставки не режем: лучше кегль на шаг меньше (Арина 03.10)
export const HYPHEN_PREFIXES = ['само', 'гипер', 'сверх', 'псевдо', 'взаимо', 'недо', 'пере', 'анти', 'контр']
const hasVowel = (t: string) => /[аеёиоуыэюя]/.test(t)
export function hyphenCuts(word: string): number[] {
  const low = word.toLowerCase()
  const p = [...HYPHEN_PREFIXES].sort((a, b) => b.length - a.length).find(x => low.startsWith(x) && low.length - x.length >= 4 && hasVowel(low.slice(x.length)))
  return p ? [p.length] : []
}
const splitWord = (u: string): { pre: string; w: string; post: string } | null => {
  const m = u.match(/^([^\p{L}]*)([\p{L}]+)([^\p{L}]*)$/u)
  return m ? { pre: m[1], w: m[2], post: m[3] } : null
}
// Лучшее деление на две части (самая длинная часть как можно короче): по нему считается предел кегля обложки
export function bestTwo(u: string, f: FontSpec, size = 1): [string, string] | null {
  const m = splitWord(u)
  if (!m || m.w.length < LONG_WORD) return null
  let best: [string, string] | null = null, bw = Infinity
  for (const c of hyphenCuts(m.w)) {
    const a = m.pre + m.w.slice(0, c) + '-', b = m.w.slice(c) + m.post
    const w = Math.max(measure(a, f, size), measure(b, f, size))
    if (w < bw) { bw = w; best = [a.slice(0, -1) + SHY, b] }
  }
  return best
}

export type Line = string[] // единицы строки, между ними обычный пробел

// Жадная разбивка: столько единиц в строку, сколько помещается. Ширина мерится по готовому тексту строки:
// так части слова с переносом (SHY) встают без пробела, а дефис считается только в конце строки.
export function greedy(us: string[], f: FontSpec, size: number, width: number): Line[] {
  // страховка: склейка шире колонки («потому что это единственное» в узкой колонке) делится по словам,
  // лучше редкий висячий союз, чем строка за краем
  const fitted: string[] = []
  for (const u of us) {
    if (!u.includes(NBSP) || measure(unitText(u), f, size) <= width) { fitted.push(u); continue }
    let part = ''
    for (const w0 of u.split(NBSP)) {
      const cand = part ? part + NBSP + w0 : w0
      if (part && measure(unitText(cand), f, size) > width) { fitted.push(part); part = w0 } else part = cand
    }
    if (part) fitted.push(part)
  }
  const lines: Line[] = []
  let cur: string[] = []
  for (const u of fitted) {
    if (!cur.length) { cur = [u]; continue }
    if (measure(lineText([...cur, u]), f, size) <= width) cur.push(u)
    else { lines.push(cur); cur = [u] }
  }
  if (cur.length) lines.push(cur)
  return lines
}

export const lineText = (l: Line) => l.map((u, i) => (u.endsWith(SHY) ? u.slice(0, -1) + (i === l.length - 1 ? '-' : '') : u + (i === l.length - 1 ? '' : ' '))).join('').replace(/ /g, ' ')
// текст единицы для замера: часть слова с переносом мерится с дефисом
const unitText = (u: string) => (u.endsWith(SHY) ? u.slice(0, -1) + '-' : u).replace(/ /g, ' ')
export const lineWidth = (l: Line, f: FontSpec, size: number) => measure(lineText(l), f, size)

// Ровные строки (для заголовков): самая узкая ширина, при которой число строк не растет
export function balanced(us: string[], f: FontSpec, size: number, width: number): Line[] {
  const base = greedy(us, f, size, width)
  if (base.length < 2) return base
  let lo = 0, hi = width
  // с переносом длинное слово мерится по большей из двух частей; ширину колонки не превышаем
  const longest = Math.max(...us.map(u => measure(unitText(u), f, size)))
  lo = Math.min(Math.max(longest, lo), width)
  for (let k = 0; k < 18; k++) {
    const mid = (lo + hi) / 2
    if (greedy(us, f, size, mid).length <= base.length) hi = mid; else lo = mid
  }
  return greedy(us, f, size, hi)
}

// Вдова: последняя строка из одного короткого слова. Перетягиваем к ней слово с предыдущей строки.
export function fixWidow(lines: Line[], f: FontSpec, size: number, width: number): Line[] {
  if (lines.length < 2) return lines
  const last = lines[lines.length - 1]
  const prev = lines[lines.length - 2]
  const isWidow = last.length === 1 && bare(last[0]).length <= 8 && !last[0].includes(NBSP)
  if (!isWidow || prev.length < 2) return lines
  const moved = [prev[prev.length - 1], ...last]
  if (lineWidth(moved, f, size) > width) return lines
  return [...lines.slice(0, -2), prev.slice(0, -1), moved]
}

// Вдова: одно короткое слово в последней строке, хотя в строке над ним было из чего перенести (два куска и больше).
// Заголовок из двух неразрывных кусков («Я просто / устала»») вдовой не считаем: иначе его не поставить.
export const isWidow = (lines: Line[]) => lines.length >= 2 && lines[lines.length - 1].length === 1 && !lines[lines.length - 1][0].includes(NBSP) &&
  bare(lines[lines.length - 1][0]).length <= 8 && lines[lines.length - 2].length >= 2
// висячий предлог в конце строки (кроме последней): проверка после разбивки
// Союз перед очень длинным словом на следующей строке не считаем: его иначе не поставить без мелкого кегля
export const hangingEnds = (lines: Line[]) => lines.slice(0, -1).filter((l, i) => {
  const w = (l[l.length - 1] || '').split(NBSP).pop() as string
  const b = bare(w)
  const next = bare((lines[i + 1]?.[0] || '').split(NBSP)[0] || '')
  if (next.length >= LONG_WORD) return false
  return (HANG.has(b) || (b.length > 0 && b.length <= 2 && /^[\p{L}]+$/u.test(b))) && !/[.!?…:;,]$/.test(w)
}).length

export type BlockStyle = FontSpec & { lh: number; paraGap: number; balance?: boolean }
export type Block = { paras: Line[][]; size: number; height: number; width: number; lines: number; longWord: boolean }

export const paragraphs = (text: string) => String(text || '').split(/\n+/).map(p => p.trim()).filter(Boolean)

// Разбивка текста при данном кегле
export function layoutBlock(text: string, st: BlockStyle, size: number, width: number): Block {
  const paras = paragraphs(text).map(p => {
    // перенос с дефисом (обложка): решаем один раз по ширине колонки, до выравнивания строк,
    // иначе выравнивание сужает строку и переносит слово, которое целиком помещалось
    let us = st.hyphen ? units(p).flatMap(u => (!u.includes(NBSP) && measure(unitText(u), st, size) > width ? bestTwo(u, st, size) ?? [u] : [u])) : units(p)
    // союз перед перенесенным словом клеим к его первой части: «и гипер-» вместе, «и» не висит в конце строки
    if (st.hyphen) us = us.reduce<string[]>((acc, u) => {
      const prev = acc[acc.length - 1]
      if (prev !== undefined && u.endsWith(SHY) && (HANG.has(bare(prev)) || bare(prev).length <= 2) && !/[.!?…:;,]$/.test(prev)) acc[acc.length - 1] = prev + NBSP + u
      else acc.push(u)
      return acc
    }, [])
    // короткий абзац (до 25 слов) тоже ровняем: иначе посередине остается строка «а сил» из двух слов
    const short = p.split(/\s+/).length <= 25
    let lines = st.balance || short ? balanced(us, st, size, width) : greedy(us, st, size, width)
    lines = fixWidow(lines, st, size, width)
    // заголовок без вдовы: пробуем колонку чуть уже, пока последняя строка не перестанет быть одним коротким словом
    if (st.balance && isWidow(lines)) {
      for (let k = 0.97; k >= 0.55; k -= 0.03) {
        const alt = fixWidow(greedy(us, st, size, width * k), st, size, width * k)
        if (!isWidow(alt) && alt.length <= lines.length + 1) { lines = alt; break }
      }
    }
    return lines
  })
  const lines = paras.reduce((n, p) => n + p.length, 0)
  const height = lines * size * st.lh + Math.max(0, paras.length - 1) * paraGapPx(st, size)
  const width0 = Math.max(0, ...paras.flat().map(l => lineWidth(l, st, size)))
  return { paras, size, height, width: width0, lines, longWord: false }
}
export const paraGapPx = (st: BlockStyle, size: number) => Math.round(size * st.paraGap)

// Самая длинная неразрывная единица при кегле 1: ниже какого кегля она влезает в ширину
export function longestUnitAt1(text: string, f: FontSpec): number {
  return Math.max(0, ...paragraphs(text).flatMap(p => units(p)).map(u => {
    const two = f.hyphen && !u.includes(NBSP) ? bestTwo(u, f) : null
    return two ? Math.max(measure(unitText(two[0]), f, 1), measure(two[1], f, 1)) : measure(unitText(u), f, 1)
  }))
}

// Наибольший кегль в [min, max], при котором блок влезает в width x height. Шаг 1 px.
export function fitBlock(text: string, st: BlockStyle, width: number, height: number, min: number, max: number): Block & { overflow: boolean } {
  if (!paragraphs(text).length) return { paras: [], size: max, height: 0, width: 0, lines: 0, longWord: false, overflow: false }
  // длинное слово: не больше ширины на этом кегле
  const capByWord = Math.floor(width / Math.max(1e-6, longestUnitAt1(text, st)))
  let longWord = false
  let hi = Math.min(max, capByWord)
  let lo = min
  if (capByWord < min) { longWord = true; lo = capByWord; hi = capByWord }
  const fits = (s: number) => layoutBlock(text, st, s, width).height <= height
  if (!fits(lo)) {
    const b = layoutBlock(text, st, lo, width)
    return { ...b, longWord, overflow: true }
  }
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2)
    if (fits(mid)) lo = mid; else hi = mid
  }
  const size = fits(hi) ? hi : lo
  return { ...layoutBlock(text, st, size, width), longWord, overflow: false }
}
