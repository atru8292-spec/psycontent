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

// надпись на экране обрубками (11.11): «Текст на экране:» вместе со строками-продолжениями до следующей метки, две и
// больше фраз, и все короче пяти слов («Вы отказали. Мама уже плохая мать.»: без ролика непонятно, кто кому отказал).
// Фраза это кусок между . ! ? … и концом строки; точка внутри «» фразу не режет, фраза целиком в «» не считается
// (ни обрубком, ни в подсчете). Беззвучные рилсы со сменами ([смена]) и рамкой «Психолог:», «Клиентка:» не проверяем:
// там короткие надписи по очереди это устройство формата.
const NEXT_LABEL = /^\s*(?:Слайд \d+|Текст на экране|Речь|Подпись|Надпись|Экран \d+|Снять|Стикер)\s*:/u
const ROLE_LINE = /^\s*(?:Психолог|Терапевт|Клиент\p{L}*|Спустя[^:\n]{0,30}|Я|Внутренний голос|Критик)\s*:/u
export function nadpisBlocks(text: string): string[] {
  const lines = String(text || '').split('\n')
  const out: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\s*Текст на экране\s*:(.*)$/u)
    if (!m) continue
    const part = [m[1]]
    for (let j = i + 1; j < lines.length && !NEXT_LABEL.test(lines[j]); j++) part.push(lines[j])
    out.push(part.join('\n').trim())
  }
  return out.filter(Boolean)
}
export function frazyNadpisi(block: string): string[] {
  const out: string[] = []
  let cur = '', depth = 0
  for (const ch of block) {
    if (ch === '«' || ch === '“') depth++
    else if ((ch === '»' || ch === '”') && depth > 0) depth--
    if (ch === '\n' || (depth === 0 && /[.!?…]/u.test(ch))) { if (cur.trim()) out.push(cur.trim()); cur = ''; if (ch === '\n') depth = 0; continue }
    cur += ch
  }
  if (cur.trim()) out.push(cur.trim())
  return out
}
const slovNadpisi = (s: string) => (s.match(/[\p{L}\d]+(?:-[\p{L}\d]+)*/gu) || []).length
export function nadpisObrubki(text: string): string[] {
  return nadpisBlocks(text).filter(b => {
    if (/\[смена\]/u.test(b) || b.split('\n').some(l => ROLE_LINE.test(l))) return false
    const fr = frazyNadpisi(b).filter(f => !/^«[^«»]*»$|^“[^“”]*”$/u.test(f) && slovNadpisi(f) > 0)
    return fr.length >= 2 && fr.every(f => slovNadpisi(f) < 5)
  })
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
  for (const b of nadpisObrubki(text)) out.push({ code: 'nadpis_obrubki', quote: b, why: 'надпись на экране рублеными кусками, без ролика непонятно, о чем она; скажи одним целым предложением до 12 слов: кто что сделал или сказал и что из этого вышло' })
  const seen = new Set<string>()
  return out.filter(x => { const k = x.code + x.quote; if (seen.has(k)) return false; seen.add(k); return true })
}
