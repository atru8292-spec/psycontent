// Шаблонность текстов кодом (аналитика 2, 24.10). Чистые функции: на входе тексты одной недели с автором, на выходе
// только числа. Тексты и цепочки наружу не уходят: в базу (quality_weekly) и в кабинет попадают только метрики,
// сами частые цепочки печатает только scripts/quality-week.ts --show-chains в локальный файл (после анонимайзера).
// Функции перенесены по смыслу из scripts/stylo.ts, sameness.ts и clones.ts веток feat/zh4/zh5 (сами ветки не тянем).
// Нормы живых текстов: _знания/мозг-генератора/zh3/08-ZHIVYE-NORMY.md (разбор 76 живых рилсов и постов, 21.10).

export type QText = { userId: string; format: string; text: string }

// нормы живых (08-ZHIVYE-NORMY.md, раздел 1 и находки 4, 6-9): медиана по рилсам и постам
export const LIVE_NORMS = {
  sentLen: 10,        // слов во фразе, медиана
  sentSd: 9,          // разброс длины фраз (стандартное отклонение)
  shortShare: 0.14,   // доля фраз из 1-3 слов
  questionEnd: 0.09,  // доля текстов, которые кончаются вопросом (5 из 55)
  loop: 0.02,         // доля текстов с петлей одним словом в начале абзацев (1 из 59)
  address: 0.07,      // доля текстов с обращением к читателю (5 из 76)
  mat: 0.14,          // доля текстов с матом (11 из 76)
  sameStart: 0,       // одинакового начала у разных людей у живых нет
} as const

export type QualityMetrics = {
  texts: number; authors: number
  sameStart: number      // доля текстов, у которых первые 4 слова совпали с текстом другого человека
  chains: number         // цепочек из 4 слов, которые есть у 5+ разных людей
  chainTexts: number     // доля текстов, где есть хотя бы одна такая цепочка
  loop: number; address: number; mat: number; questionEnd: number
  sentLen: number; sentSd: number; shortShare: number
}

// метки сценария и подписи не считаем: только то, что читатель читает или слышит
const LABEL = /^\s*(?:Текст на экране|Надпись на видео|Речь|Подпись|Кадр|Экран \d+|Слайд \d+|Крупно на экране|Рисую|Итог на схеме|[АБ])\s*:\s*/iu
export function plain(text: string): string {
  return (text || '').split('\n')
    .filter(l => !/^\s*Подпись\s*:/iu.test(l))
    .map(l => l.replace(LABEL, '').trim())
    .filter(Boolean).join('\n')
}
export const words = (s: string) => (s.toLowerCase().replace(/ё/g, 'е').match(/[\p{L}\d]+/gu) || [])
export function sentences(t: string): string[] {
  return plain(t).split(/(?<=[.!?…])\s+|\n+/u).map(s => s.trim()).filter(s => words(s).length > 0)
}
// служебные цепочки (одни короткие слова) не считаем: «и это не то» есть у всех
const SHORT = new Set('и а но в на с к по за от до из у о об не что как это то же ли бы вы ты я он она мы они его ее их вас вам тебя тебе меня мне все так вот ну да уже еще когда если чтобы потому есть был была было там тут этот эта эти'.split(' '))
export function chains4(text: string): Set<string> {
  const w = words(plain(text)), out = new Set<string>()
  for (let i = 0; i + 4 <= w.length; i++) { const g = w.slice(i, i + 4); if (g.some(x => !SHORT.has(x) && x.length > 3)) out.add(g.join(' ')) }
  return out
}
export const opening = (text: string) => words(plain(text)).slice(0, 4).join(' ')

const MAT = /(?<![а-яё])(?:бля|хуй|хуе|хуё|пизд|ебан|ебат|еба[лт]|ёба|охуе|охуи|нахуй|пиздец|сука|мудак)/iu
const ADDRESS = /(?:^|[.!?]\s+)(?:девочки|девчонки|друзья|дорогие|мои хорошие|ребята|подруга|милая|слушай(?:те)?|смотри(?:те)?)(?=[,.! ])/iu
export function hasLoop(text: string): boolean {
  const paras = plain(text).split(/\n+/).map(p => words(p)[0]).filter(Boolean)
  for (let i = 0; i + 2 < paras.length; i++) if (paras[i] === paras[i + 1] && paras[i + 1] === paras[i + 2]) return true
  return false
}
const endsWithQuestion = (text: string) => /\?\s*$/u.test(plain(text))

export function qualityOf(list: QText[]): QualityMetrics {
  const n = list.length
  const zero: QualityMetrics = { texts: 0, authors: 0, sameStart: 0, chains: 0, chainTexts: 0, loop: 0, address: 0, mat: 0, questionEnd: 0, sentLen: 0, sentSd: 0, shortShare: 0 }
  if (!n) return zero
  // одинаковое начало: текст считается, если такое же начало есть у другого человека
  const byOpen = new Map<string, Set<string>>()
  for (const t of list) { const o = opening(t.text); if (o.split(' ').length < 3) continue; if (!byOpen.has(o)) byOpen.set(o, new Set()); byOpen.get(o)!.add(t.userId) }
  const same = list.filter(t => (byOpen.get(opening(t.text))?.size || 0) >= 2).length
  // цепочки у 5+ разных людей
  const byChain = chainAuthors(list)
  const common = new Set([...byChain].filter(([, s]) => s.size >= 5).map(([k]) => k))
  const chainTexts = list.filter(t => [...chains4(t.text)].some(g => common.has(g))).length
  // фразы
  const lens: number[] = []
  for (const t of list) for (const s of sentences(t.text)) lens.push(words(s).length)
  const mean = lens.reduce((a, b) => a + b, 0) / (lens.length || 1)
  const sd = Math.sqrt(lens.reduce((a, b) => a + (b - mean) ** 2, 0) / (lens.length || 1))
  const share = (f: (t: QText) => boolean) => list.filter(f).length / n
  const r = (x: number, k = 3) => Math.round(x * 10 ** k) / 10 ** k
  return {
    texts: n, authors: new Set(list.map(t => t.userId)).size,
    sameStart: r(same / n), chains: common.size, chainTexts: r(chainTexts / n),
    loop: r(share(t => hasLoop(t.text))), address: r(share(t => ADDRESS.test(plain(t.text)))),
    mat: r(share(t => MAT.test(t.text))), questionEnd: r(share(t => endsWithQuestion(t.text))),
    sentLen: r(mean, 1), sentSd: r(sd, 1), shortShare: r(lens.filter(l => l <= 3).length / (lens.length || 1)),
  }
}

// цепочка → у каких людей встретилась (для --show-chains; наружу не уходит)
export function chainAuthors(list: QText[]): Map<string, Set<string>> {
  const m = new Map<string, Set<string>>()
  for (const t of list) for (const g of chains4(t.text)) { if (!m.has(g)) m.set(g, new Set()); m.get(g)!.add(t.userId) }
  return m
}

// «стало хуже прошлой недели»: для каждой метрики свое направление и порог. Порог выбран так, чтобы шум одной
// недели при 30-100 текстах не мигал: доли на 5 процентных пунктов и больше, длина фразы на 2 слова, разброс на 2,
// цепочки на 50% и не меньше 3 штук. Сравнение только когда в обеих неделях от 20 текстов.
type Dir = 'up' | 'down' | 'toNorm'
export const WORSE_RULES: Record<string, { dir: Dir; abs: number }> = {
  sameStart: { dir: 'up', abs: 0.05 }, chainTexts: { dir: 'up', abs: 0.05 }, loop: { dir: 'up', abs: 0.05 },
  address: { dir: 'up', abs: 0.05 }, questionEnd: { dir: 'up', abs: 0.05 },
  shortShare: { dir: 'down', abs: 0.05 }, sentSd: { dir: 'down', abs: 2 }, sentLen: { dir: 'toNorm', abs: 2 },
  // сигналы людей
  takeRate: { dir: 'down', abs: 0.05 }, notLike: { dir: 'up', abs: 0.05 }, errors: { dir: 'up', abs: 0.03 }, mine: { dir: 'down', abs: 0.05 },
}
export function isWorse(key: string, now: number | null | undefined, prev: number | null | undefined, nNow = 99, nPrev = 99, norm?: number): boolean {
  const rule = WORSE_RULES[key]
  if (key === 'chains') return now != null && prev != null && now >= 3 && now >= prev * 1.5
  if (!rule || now == null || prev == null || nNow < 20 || nPrev < 20) return false
  if (rule.dir === 'up') return now - prev >= rule.abs
  if (rule.dir === 'down') return prev - now >= rule.abs
  if (norm == null) return false
  return Math.abs(now - norm) - Math.abs(prev - norm) >= rule.abs
}

// Сигналы людей по набору материалов недели (без текстов): взяли, поправили, правок, «не похоже», «мое», ошибки
export type PeopleSignals = { materials: number; takeRate: number; adjustedRate: number; adjustsAvg: number; notLike: number; mine: number; errors: number }
export function signalsOf(m: { taken: boolean; adjusts: number; verdict?: string | null; favorite?: boolean }[], errors: number): PeopleSignals {
  const n = m.length
  const r = (x: number) => Math.round(x * 1000) / 1000
  if (!n) return { materials: 0, takeRate: 0, adjustedRate: 0, adjustsAvg: 0, notLike: 0, mine: 0, errors: errors ? 1 : 0 }
  return {
    materials: n,
    takeRate: r(m.filter(x => x.taken).length / n),
    adjustedRate: r(m.filter(x => x.adjusts > 0).length / n),
    adjustsAvg: r(m.reduce((a, x) => a + x.adjusts, 0) / n),
    notLike: r(m.filter(x => x.verdict === 'not_like').length / n),
    mine: r(m.filter(x => x.verdict === 'mine' || x.favorite).length / n),
    errors: r(errors / (n + errors)),
  }
}
