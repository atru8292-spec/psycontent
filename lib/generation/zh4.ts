// ПЖ4 (эксперимент 21.10, задача _знания/мозг-генератора/test/PROMPT-CLAUDE-CODE-zh4.md): что модель выбирала сама,
// у нее выходило одинаковым у всех (05-ODINAKOVOST-I-TEMY.md), поэтому вид повода в первой фразе, тип конца, задачу
// и длину подписи, у карусели обложку, последний слайд и слайд с шагом выбирает код по памяти автора.
// Карточки (тексты для промпта) в 03-PROMPTY.md, раздел «Начала, концы и подписи для ПЖ4».
// Здесь же мягкий монтажер h7m (раздел «ПМ»): режет только целые абзацы и проверяет, что ничего не опирается на вырезанное.

import { PZH4_PICKS, PZH4_CARDS, PM_SYSTEM } from './prompts.generated'
import { isReels, LABEL_RE, type FormatCode } from './text-guard'
import type { Memory } from './memory'
import type { AuthorSettings } from './settings'

export type Zh4Memory = {
  starts: string[]; ends: string[]; captions: string[]; lens: string[]; vizitka: boolean[]
  covers: string[]; karEnds: string[]; karShag: boolean[]; detail: boolean[]
  // zh5: петля, обращение, мат, реплика в подписи
  loops?: boolean[]; addr?: boolean[]; mat?: boolean[]; replika?: boolean[]; rlens?: string[]; prizyv?: boolean[]; karkas?: string[]
}
export const emptyZh4 = (): Zh4Memory => ({ starts: [], ends: [], captions: [], lens: [], vizitka: [], covers: [], karEnds: [], karShag: [], detail: [] })
export type Zh4Choice = {
  start?: string; end?: string; caption?: string; len?: string; vizitka?: boolean
  cover?: string; karEnd?: string; karShag?: boolean; podzag?: boolean; detail?: boolean
}

const card = (code: string) => (PZH4_PICKS[code] || '').split('\n').slice(1).join('\n').trim()
const mem = (m: Memory): Zh4Memory => ({ ...emptyZh4(), ...(m.zh4 || {}) })

// Цель ролика по смыслу: охват, доверие, запись (роли постов из CLAUDE.md, примерно 60-70/20-30/10)
const TRUST = ['kak_v_terapii', 'poziciya', 'svoya_istoriya']
export const goalOf = (intent: string): 'ohvat' | 'doverie' | 'zapis' => intent === 'priglashenie' ? 'zapis' : TRUST.includes(intent) ? 'doverie' : 'ohvat'

// Первый из списка, которого не было в последних `gap` выборах автора; порядок списка сдвигается по счетчику,
// чтобы у разных авторов с одинаковой памятью выбор тоже расходился.
function rotate<T>(list: T[], k: number): T[] { if (!list.length) return list; const s = ((k % list.length) + list.length) % list.length; return [...list.slice(s), ...list.slice(0, s)] }
function freshest(list: string[], recent: string[], gap: number, k: number): string {
  const r = rotate(list, k)
  return r.find(x => !recent.slice(0, gap).includes(x)) || r.sort((a, b) => recent.indexOf(b) - recent.indexOf(a))[0]
}
// у каждого автора свой сдвиг (по имени), иначе три автора с пустой памятью начинают одинаково
export const seedOf = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7)

// Карточка хода: строка «Начала: sovet, vopros» или «-» (начало задает сам ход)
export function startsOfMove(moveCard: string): string[] | null {
  const m = moveCard.match(/^Начала:\s*(.+)$/mu)
  if (!m) return null
  const v = m[1].trim()
  return v === '-' ? [] : v.split(/[,\s]+/).filter(Boolean)
}
const ALL_STARTS = ['sovet', 'vopros', 'scena', 'mysl', 'rabota', 'uvidela', 'podruga', 'pryamo']
// ходы, где конец задан самим ходом (сценка кончается на клиенте, роль не выходит из роли, приглашение)
const OWN_END_MOVES = /^Ход: (СПОР В ДВА ГОЛОСА|ИГРАЮ ВРЕДНОГО|ТЕХНИКА В РАЗГОВОРЕ|ЗОВУ ПРЯМО)/mu
const OWN_END_FORMATS: FormatCode[] = ['reels_scenka', 'reels_rol', 'reels_bez_slov']

const ENDS: Record<string, string[]> = {
  ohvat: ['obryv', 'scena', 'shutka', 'vopros'],
  doverie: ['samoironiya', 'mysl', 'obryv', 'scena'],
  zapis: ['priglashenie'],
}

export function chooseStart(m: Memory, format: FormatCode, moveCard: string, who: string): string | undefined {
  if (format === 'carousel' || format === 'reels_spisok' || OWN_END_FORMATS.includes(format)) return undefined
  if (format === 'reels_otvet') return 'vopros'
  const allowed = startsOfMove(moveCard)
  if (allowed && !allowed.length) return undefined
  return freshest(allowed || ALL_STARTS, mem(m).starts, 3, (m.count || 0) + seedOf(who))
}

export function chooseEnd(m: Memory, format: FormatCode, intent: string, moveText: string, who: string): string | undefined {
  if (format === 'carousel' || OWN_END_FORMATS.includes(format) || OWN_END_MOVES.test(moveText)) return undefined
  const list = ENDS[goalOf(intent)]
  const z = mem(m)
  // вопрос в конце не чаще раза в четыре текста (у zh3 вопрос как на сессии был в каждом четвертом)
  const pool = z.ends.slice(0, 3).includes('vopros') ? list.filter(x => x !== 'vopros') : list
  return freshest(pool.length ? pool : list, z.ends, 2, (m.count || 0) + seedOf(who))
}

// Подпись: одна задача из четырех. На 10 роликов примерно 3-4 без действия, 3 с вопросом, 2 с подпиской,
// 1 с записью; запись только в темах доверия и записи. Берем ту, которой в последних 9 меньше всего против этой доли;
// подписка и запись не подряд.
const CAPTION_SHARE: Record<string, number> = { dobavit: 3.5, vopros: 3, podpiska: 2, zapis: 1 }
export function chooseCaption(m: Memory, intent: string, who: string): { caption: string; len: string; vizitka: boolean } {
  const z = mem(m)
  const goal = goalOf(intent)
  let caption: string
  if (goal === 'zapis') caption = 'zapis'
  else {
    const recent = z.captions.slice(0, 9)
    const allowed = Object.keys(CAPTION_SHARE).filter(c => (c !== 'zapis' || goal === 'doverie') && !(['podpiska', 'zapis'].includes(c) && recent[0] === c))
    const n = recent.length + 1
    const deficit = (c: string) => (CAPTION_SHARE[c] * n) / 10 - recent.filter(x => x === c).length
    caption = rotate(allowed, (m.count || 0) + seedOf(who)).sort((a, b) => deficit(b) - deficit(a))[0]
  }
  // длина: вопрос и подписка чаще одной строкой, «добавить» чаще развернуто, запись средне или развернуто; по кругу
  const LENS: Record<string, string[]> = {
    dobavit: ['razvernuto', 'korotko', 'razvernuto', 'sredne'],
    vopros: ['korotko', 'sredne', 'korotko'],
    podpiska: ['korotko', 'sredne'],
    zapis: ['razvernuto', 'sredne'],
  }
  const lens = LENS[caption]
  const len = lens[z.captions.filter(x => x === caption).length % lens.length]
  // визитка только в длинной или продающей подписи и не в каждой: всегда при записи, при развернутом «добавить»
  // в теме доверия через раз
  const vizitka = caption === 'zapis' || (caption === 'dobavit' && len === 'razvernuto' && goal === 'doverie' && !z.vizitka[0])
  return { caption, len, vizitka }
}

const COVERS = ['provokaciya', 'sovet', 'priznanie', 'vopros', 'chislo']
export function chooseCarousel(m: Memory, intent: string, who: string): { cover: string; karEnd: string; karShag: boolean; podzag: boolean } {
  const z = mem(m)
  const k = (m.count || 0) + seedOf(who)
  const cover = freshest(COVERS, z.covers, 3, k)
  const goal = goalOf(intent)
  // вопрос в комментарии не чаще чем в половине, визитка только в темах доверия и записи
  const ends = goal === 'ohvat' ? ['vopros', 'fraza', 'shag'] : ['vizitka', 'fraza', 'vopros']
  const halfQ = z.karEnds.slice(0, 2).filter(x => x === 'vopros').length >= 1
  const karEnd = freshest(halfQ ? ends.filter(x => x !== 'vopros') : ends, z.karEnds, 1, k)
  // слайд с шагом примерно в каждой третьей-четвертой: если его не было в трех последних
  const karShag = karEnd !== 'shag' && !z.karShag.slice(0, 3).some(Boolean) && z.karShag.length >= 2
  // подзаголовок под обложкой примерно в каждой третьей (у zh3 «Для тех, кто...» стоял в 12 из 14)
  const podzag = ((m.count || 0) + seedOf(who)) % 3 === 0
  return { cover, karEnd, karShag, podzag }
}

// Рабочая деталь автора (zh3 ее не брал ни разу: «в большинстве текстов не нужно» ее выключило). Цель 1-2 текста
// из 10 у автора, не больше трети: код предлагает ее в темах доверия и примерно в каждом четвертом тексте,
// но не два раза подряд, а в промпте просит взять, если тема хоть немного рядом.
export function offerDetail(m: Memory, intent: string, s: AuthorSettings): boolean {
  if (!s.workDetail) return false
  const z = mem(m)
  if (z.detail[0]) return false
  return goalOf(intent) === 'doverie' || ((m.count || 0) % 4) === 1
}
export const detailLine = (s: AuthorSettings) =>
  `Смешное или странное с работы автора: ${s.workDetail}\nВ этом тексте возьми эту подробность, если тема хоть немного рядом (как люди ведут себя перед трудным разговором, что бывает в терапии, неловкость, стыд, ожидание): одной-двумя фразами, своими словами, как живой случай из своей практики без имен.`

// Блоки для промпта
export function startEndText(c: Zh4Choice): string {
  return [c.start ? card(`nachalo_${c.start}`) : '', c.end ? card(`konec_${c.end}`) : ''].filter(Boolean).join('\n')
}
export function carouselText(c: Zh4Choice): string {
  return [card(`oblozhka_${c.cover}`), c.podzag ? 'Под обложкой короткий подзаголовок своими словами.' : 'Подзаголовка под обложкой нет, одна строка.', card(`kar_konec_${c.karEnd}`), card(c.karShag ? 'kar_shag_da' : 'kar_shag_net')].filter(Boolean).join('\n')
}
// визитка из профиля: имя, метод, с кем работает и с чем приходят, как попасть; модель берет две-три вещи
export function captionText(c: Zh4Choice, s: AuthorSettings): string {
  const facts = [
    s.name ? `имя: ${s.name}` : '',
    s.approach ? `метод: ${s.approach}` : '',
    s.niche ? `с кем работает: ${s.niche}` : '',
    s.blogAbout ? `про что блог: ${s.blogAbout}` : '',
    c.caption === 'zapis' && s.booking ? `как попасть: ${s.booking}` : '',
  ].filter(Boolean).join('; ')
  return [
    card(`podpis_${c.caption}`),
    card(`dlina_${c.len}`),
    c.vizitka ? card('vizitka') : 'О себе в этой подписи не рассказывай.',
    (c.caption === 'podpiska' || c.vizitka) && facts ? `Данные автора: ${facts}.` : c.caption === 'zapis' && s.booking ? `Как к тебе попасть: ${s.booking}.` : '',
  ].filter(Boolean).join('\n')
}

// Карточка формата для ПЖ4: своя у сценки и карусели; у остальных рилсов убираем строку про финал с призывом
// (призыв живет в подписи), строку про подпись (ее задачу дает код) и свою длину речи (потолок в правиле рилса).
export function zh4FormatCard(format: FormatCode, base: string): string {
  if (PZH4_CARDS[format]) return PZH4_CARDS[format]
  if (!isReels(format)) return base
  return base.split('\n')
    .filter(l => !/^Финал по плану\./u.test(l) && !/^Подпись \(это описание/u.test(l))
    .map(l => l.replace(/^Речь \d+-\d+ слов[^.]*\.\s*/u, '').replace(/\s*Речь \d+-\d+ слов[^.]*\./u, '').trim())
    .filter(l => l)
    .join('\n')
}

// ---------- h7m: мягкий монтажер ----------
const W = (s: string) => (s.match(/[\p{L}\d]+/gu) || []).length
// список тоже не режем (прогон 21.10: после вырезания пунктов «Четыре признака» оставались с двумя-тремя пунктами)
const NO_SOFT_CUT: FormatCode[] = ['reels_scenka', 'reels_rol', 'reels_bez_slov', 'reels_spisok']
export const softCutFormat = (f: FormatCode) => isReels(f) && !NO_SOFT_CUT.includes(f)

type Para = { line: number; text: string }
// абзацы речи: строки между «Речь:» и «Подпись:», пустые строки разделяют; метка «Речь:» остается у первого
function speechParas(text: string): { lines: string[]; paras: Para[] } {
  const lines = text.split('\n')
  const paras: Para[] = []
  let inSpeech = false
  lines.forEach((l, i) => {
    if (/^\s*Подпись\s*:/u.test(l)) { inSpeech = false; return }
    if (/^\s*Текст на экране\s*:/u.test(l) || /^\s*Персонажи\s*:/u.test(l)) return
    if (/^\s*Речь\s*:/u.test(l)) inSpeech = true
    if (!inSpeech || !l.trim()) return
    paras.push({ line: i, text: l.replace(LABEL_RE, '').trim() })
  })
  return { lines, paras }
}
const firstWords = (s: string, n: number) => (s.toLowerCase().match(/[\p{L}]+/gu) || []).slice(0, n).join(' ')
const sentences = (s: string) => s.split(/(?<=[.!?…])\s+/u).map(x => x.trim()).filter(Boolean)
const stems = (s: string) => new Set((s.toLowerCase().match(/[\p{L}]{5,}/gu) || []).map(w => w.slice(0, 5)))
// слова-опоры: фраза с них ссылается на предыдущее
const ANAPHOR = /^(это|этот|эта|эти|поэтому|тогда|тоже|так|и это|вот это|вот поэтому|второй|второе|во втором|в другом|зато|при этом|после этого|из-за этого|и тут|а тут|он же|она же|то есть|значит|итак|в итоге|потом)(?![\p{L}])/iu

// Повтор-петля: первое слово (от 4 букв) или первые два слова, с которых начинаются три и больше абзацев
// («Перепроверяете...», «Еще немного, и...»). Проба 21.10: по двум словам петля «Перепроверяете и» нашлась только
// в трех абзацах из пяти, и код не дал вырезать ни одного из них.
const loopKey = (p: Para, k: number) => firstWords(p.text, k)
function loopStart(paras: Para[]): { key: string; k: number } | null {
  for (const k of [1, 2]) {
    const n = new Map<string, number>()
    for (const p of paras) { const key = loopKey(p, k); if (key && (k === 2 || key.length >= 4)) n.set(key, (n.get(key) || 0) + 1) }
    const best = [...n.entries()].filter(([, v]) => v >= 3).sort((a, b) => b[1] - a[1])[0]
    if (best) return { key: best[0], k }
  }
  return null
}
const TWO_CASES = /(?<![\p{L}])(перв\S* случа|втор\S* случа|в одном случае|в другом случае|бывает два|два случая|два разных)/iu

// Какие абзацы код не дает вырезать: первый, последний, с петлей (пока их не меньше трех), оба случая сравнения
export function protectedParas(paras: Para[]): Set<number> {
  const keep = new Set<number>([0, paras.length - 1])
  if (paras.some(p => TWO_CASES.test(p.text))) paras.forEach((p, i) => { if (TWO_CASES.test(p.text)) keep.add(i) })
  return keep
}

// Опирается ли абзац на вырезанный перед ним: начинается со слова-опоры или с короткой фразы-обрубка,
// или в нем есть короткая фраза (до 4 слов) из слов вырезанного абзаца («Накопили.» после «вот накоплю»).
export function leansOn(para: string, cut: string): boolean {
  const ss = sentences(para)
  if (!ss.length) return false
  if (ANAPHOR.test(ss[0])) return true
  if (W(ss[0]) <= 3) return true
  const cs = stems(cut)
  return ss.some(s => W(s) <= 4 && [...stems(s)].some(x => cs.has(x)))
}

export function applySoftCut(text: string, cutNums: number[], maxWords: number): { text: string; cut: string[]; restored: string[] } {
  const { lines, paras } = speechParas(text)
  if (paras.length < 3) return { text, cut: [], restored: [] }
  const keep = protectedParas(paras)
  const loop = loopStart(paras)
  const loopIdx = loop ? paras.map((p, i) => (loopKey(p, loop.k) === loop.key ? i : -1)).filter(i => i >= 0) : []
  let cut = [...new Set(cutNums.map(n => Number(n) - 1))].filter(i => Number.isInteger(i) && i >= 0 && i < paras.length && !keep.has(i)).sort((a, b) => a - b)
  // петля: оставить не меньше трех абзацев с ней
  if (loopIdx.length) {
    const left = () => loopIdx.filter(i => !cut.includes(i)).length
    for (const i of [...cut].reverse()) if (loopIdx.includes(i) && left() < 3) cut = cut.filter(x => x !== i)
  }
  // проверка опоры: следующий оставшийся абзац не должен опираться на вырезанный; иначе возвращаем вырезанный
  const restored: string[] = []
  let changed = true
  while (changed) {
    changed = false
    for (const i of [...cut]) {
      const next = paras.findIndex((_, j) => j > i && !cut.includes(j))
      if (next >= 0 && leansOn(paras[next].text, paras[i].text)) { cut = cut.filter(x => x !== i); restored.push(paras[i].text); changed = true }
    }
  }
  // не резать сильнее, чем нужно: если без части вырезанного речь уже в потолке, лишнее возвращаем с конца списка
  const total = paras.reduce((a, p) => a + W(p.text), 0)
  let after = total - cut.reduce((a, i) => a + W(paras[i].text), 0)
  for (const i of [...cut].reverse()) if (after + W(paras[i].text) <= maxWords) { cut = cut.filter(x => x !== i); after += W(paras[i].text) }
  if (!cut.length) return { text, cut: [], restored }
  const drop = new Set(cut.map(i => paras[i].line))
  const out: string[] = []
  lines.forEach((l, i) => {
    if (!drop.has(i)) { out.push(l); return }
    // метка «Речь:» стоит на первом абзаце, он не режется; на всякий случай метку переносим
    const label = (l.match(LABEL_RE) || [''])[0]
    if (label) out.push(label.trimEnd())
  })
  return { text: out.join('\n').replace(/\n{3,}/g, '\n\n').replace(/(Речь\s*:)\s*\n+/u, '$1 ').trim(), cut: cut.map(i => paras[i].text), restored }
}

// номер абзаца для модели
export function numberedSpeech(text: string): { user: string; words: number } {
  const { paras } = speechParas(text)
  return { user: paras.map((p, i) => `[${i + 1}] ${p.text}`).join('\n\n'), words: paras.reduce((a, p) => a + W(p.text), 0) }
}
export { PM_SYSTEM }
