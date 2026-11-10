// zh6 (08.11): проверки кодом после писателя. Только те, что по прошлым прогонам правда помогали:
// копия примеров и образцов (цепочки из 4 слов), «не X, а Y», мат у автора без мата и мат вставкой посреди фразы.
// Остальные флаги zh5e (шутка в конце, оговорки, рефрен) ловили малую часть и сюда не взяты.
import { neXaY } from './text'

const LABEL_RE = /^\s*(?:Слайд \d+|Текст на экране|Речь|Подпись|Надпись|Экран \d+)\s*:/gmu
export const words = (s: string) => (String(s || '').toLowerCase().replace(/ё/g, 'е').replace(LABEL_RE, ' ').match(/[\p{L}\d]+/gu) || [])

// цепочка из 4 слов, в которой есть хотя бы одно слово длиннее трех букв: «и я не могу» не считаем копией
function grams4(s: string): Map<string, string> {
  const w = words(s)
  const g = new Map<string, string>()
  for (let i = 0; i + 4 <= w.length; i++) {
    const part = w.slice(i, i + 4)
    if (part.filter(x => x.length > 3).length < 2) continue
    g.set(part.join(' '), part.join(' '))
  }
  return g
}

// общие цепочки готового текста с примерами и образцами; соседние цепочки склеиваются в один кусок
export function copyPieces(text: string, sources: string[]): string[] {
  const src = new Set<string>()
  for (const s of sources) for (const k of grams4(s).keys()) src.add(k)
  const w = words(text)
  const hit: boolean[] = new Array(w.length).fill(false)
  for (let i = 0; i + 4 <= w.length; i++) {
    const part = w.slice(i, i + 4)
    if (part.filter(x => x.length > 3).length < 2) continue
    if (src.has(part.join(' '))) for (let j = i; j < i + 4; j++) hit[j] = true
  }
  const out: string[] = []
  let cur: string[] = []
  for (let i = 0; i <= w.length; i++) {
    if (i < w.length && hit[i]) cur.push(w[i])
    else if (cur.length) { out.push(cur.join(' ')); cur = [] }
  }
  return out
}

export const MAT = /(?<![\p{L}])(?:ху[йеёияю]\p{L}*|охуе\p{L}*|аху\p{L}*|пизд\p{L}*|бля\p{L}*|еба\p{L}*|ебу\p{L}*|заеб\p{L}*|заёб\p{L}*|выеб\p{L}*|уеб\p{L}*|долбо[её]б\p{L}*|сук[аиу]|нахер|похер|херн\p{L}*|нахрен|мудак\p{L}*|мудил\p{L}*|говн\p{L}*|жоп\p{L}*|\p{L}+[\*•%&]+\p{L}+)(?![\p{L}])/iu
const VSTAVKA = /[,(]\s*(?:бля\p{L}*|б[\*•]+\p{L}*|сука|нахер|нахрен|пиздец|п[\*•]+дец|епта|ебать)\s*[,)]/iu

export type Mesto = { code: string; quote: string; why: string }

const sentOf = (text: string, at: number) => {
  const a = Math.max(text.lastIndexOf('.', at - 1), text.lastIndexOf('!', at - 1), text.lastIndexOf('?', at - 1), text.lastIndexOf('\n', at - 1)) + 1
  const ends = ['.', '!', '?', '\n'].map(c => text.indexOf(c, at)).filter(x => x >= 0)
  const b = ends.length ? Math.min(...ends) + 1 : text.length
  return text.slice(a, b).trim()
}

export function zh6Mesta(text: string, o: { sources: string[]; allowMat: boolean }): Mesto[] {
  const out: Mesto[] = []
  for (const p of copyPieces(text, o.sources)) out.push({ code: 'kopiya', quote: p, why: 'совпадает с чужим текстом, скажи это своими словами' })
  for (const x of neXaY(text)) out.push({ code: 'ne_x_a_y', quote: sentOf(text, x.at) || x.quote, why: 'схема «не X, а Y»: скажи прямо, что есть, без отрицания перед этим' })
  if (!o.allowMat) {
    const m = text.match(MAT)
    if (m) out.push({ code: 'mat', quote: sentOf(text, m.index || 0), why: 'автор не матерится, скажи без мата' })
  } else {
    const v = text.match(VSTAVKA)
    if (v) out.push({ code: 'mat_vstavka', quote: sentOf(text, v.index || 0), why: 'мат вставлен посреди фразы между запятыми; если ругаться, то ругательство это сама мысль, иначе без него' })
  }
  // круг 3: сбой модели посреди слова («побы scanло»): латиница внутри русского текста или слово из двух алфавитов
  for (const m of text.matchAll(/[\p{Script=Cyrillic}]+[A-Za-z]+[\p{Script=Cyrillic}]*|[\p{Script=Cyrillic}]+\s+[a-z]{3,}[\p{Script=Cyrillic}]+|(?<![\p{L}])[a-z]{3,}(?![\p{L}])/gu)) out.push({ code: 'sboj', quote: sentOf(text, m.index || 0), why: 'сбой: латиница или сломанное слово посреди русского текста, перепиши фразу нормально' })
  const seen = new Set<string>()
  return out.filter(x => { const k = x.code + x.quote; if (seen.has(k)) return false; seen.add(k); return true })
}
