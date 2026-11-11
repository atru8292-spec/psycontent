// Разбор текста рилса для экрана результата (components/ReelsScript.tsx) и копирования. Без React, чтобы проверять
// скриптом (scripts/test-reels-parse.ts).
//
// Виды zh6: reels_monolog (голова в кадре), reels_scenka (в блоке «Речь:» реплики «Я:», «Психолог:»,
// «Внутренний голос:», «Я, обычная реакция:» и т.п., ремарки в скобках), reels_bez_slov («Текст на экране:», экраны
// разделены строкой [смена], потом «Подпись:»). Старые материалы (А:/Б:, «Экран N:», «Кадр:») разбираются как раньше.

export type Line = { label: string | null; text: string; role?: string; smena?: boolean }

const LABEL = /^(Текст на экране|Крупно на экране|Итог на схеме|Кадр|Речь|Подпись|Персонажи|Рисую|Экран\s*\d+|[АБAB](?:\s*\([^)]{1,40}\))?)\s*:\s*/u
// Роль в сценке: в начале строки, с заглавной, до трех слов, можно с уточнением через запятую до шести слов
// («Я, после роликов про бережное общение:») и пометкой в скобках («Мама (тихо):»).
// Ищется только внутри блока «Речь» у reels_scenka, чтобы «Знаешь что: ...» посреди монолога не стал ролью.
const W = '[а-яёА-ЯЁa-zA-Z«»"-]+'
const ROLE = new RegExp(`^([А-ЯЁA-Z][а-яёa-z-]*(?:\\s+[а-яёА-ЯЁa-zA-Z-]+){0,2}(?:,\\s*${W}(?:\\s+${W}){0,5})?(?:\\s*\\([^)]{1,40}\\))?)\\s*:\\s+(\\S.*)$`, 'u')
// начало обычной фразы, а не имя: «Ну, знаешь что: ...» ролью не считается
const NE_IMYA = new Set(['Ну', 'Да', 'Нет', 'Так', 'Вот', 'Ой', 'Ах', 'Ладно', 'Слушай', 'Знаешь', 'Короче', 'Кстати', 'Конечно', 'Хорошо', 'Okay', 'Ок'])
const SMENA = /^\[\s*смена\s*\]$/iu
export const SERVICE = new Set(['Текст на экране', 'Крупно на экране', 'Итог на схеме', 'Кадр', 'Речь', 'Подпись', 'Персонажи', 'Рисую'])

// ключ роли для сдвига реплик: без уточнения и пометки («Я, обычная реакция» и «Я (тихо)» это роль «Я»)
export const roleKey = (r: string) => r.replace(/\s*[,(].*$/u, '')
// имя роли и уточнение для показа: «Я, обычная реакция» -> ['Я,', 'обычная реакция']; без запятой уточнения нет
export function splitRole(r: string): [string, string] {
  const i = r.indexOf(',')
  if (i < 0) return [r, '']
  return [r.slice(0, i + 1), r.slice(i + 1).trim()]
}

// Подсказки к съемке, не текст ролика
export const HOW_TO: Record<string, string> = {
  'Текст на экране': 'Надпись на весь ролик',  // остальные метки больше не приходят, но старые ролики их содержат
  'Кадр': 'Где и как снять',
  'Крупно на экране': 'Слово крупно на экране',
  'Итог на схеме': 'Что получится на листе',
  'Персонажи': 'Роли',
}

export function parse(text: string, format?: string): Line[] {
  const out: Line[] = []
  const scenka = format === 'reels_scenka'
  // у сценки без метки «Речь:» реплики начинаются сразу
  let block: string | null = scenka && !/(^|\n)\s*Речь\s*:/u.test(text) ? 'Речь' : null
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line) { out.push({ label: null, text: '' }); continue }
    if (SMENA.test(line)) { out.push({ label: null, text: '', smena: true }); continue }
    const m = line.match(LABEL)
    let l: Line = m ? { label: m[1], text: line.slice(m[0].length) } : { label: null, text: line }
    if (l.label && SERVICE.has(l.label)) block = l.label
    if (l.label && /^[АБAB]/u.test(l.label)) l = { label: null, text: l.text, role: l.label }
    else if (scenka && block === 'Речь' && (!l.label || l.label === 'Речь')) {
      const r = l.text.match(ROLE)
      if (r && !SERVICE.has(r[1]) && !(r[1].includes(',') && NE_IMYA.has(roleKey(r[1])))) l = { label: null, text: r[2], role: r[1] }
    }
    out.push(l)
  }
  return out
}

// Надпись беззвучного рилса: строки после «Текст на экране:» до следующей метки, экраны по [смена]
export function screenGroups(lines: Line[]): string[][] | null {
  const start = lines.findIndex(l => l.label === 'Текст на экране')
  if (start < 0) return null
  const groups: string[][] = [[]]
  if (lines[start].text) groups[0].push(lines[start].text)
  for (const l of lines.slice(start + 1)) {
    if (l.label) break
    if (l.smena) { groups.push([]); continue }
    if (l.text) groups[groups.length - 1].push(l.role ? `${l.role}: ${l.text}` : l.text)
  }
  const res = groups.filter(g => g.length)
  return res.length ? res : null
}

// Надпись на видео у говорящего рилса и сценки: строки с меткой «Текст на экране:» (обычно одна).
// Показывается плашкой над текстом, в «Как снять» и в копию текста не идет.
export function overlayOf(lines: Line[]): string[] {
  return lines.filter(l => l.label === 'Текст на экране' && l.text).map(l => l.text)
}

// Текст для копирования: только то, что говорится или пишется на экране по ходу ролика.
// У беззвучного рилса это вся надпись, экраны подряд через пустую строку, без [смена].
export function reelsSpeech(text: string, format?: string): string {
  const lines = parse(text, format)
  if (format === 'reels_bez_slov') {
    const g = screenGroups(lines)
    if (g) return g.map(x => x.join('\n')).join('\n\n')
  }
  const res: string[] = []
  let inCaption = false
  for (const l of lines) {
    if (l.label === 'Подпись') { inCaption = true; continue }
    if (l.label && (HOW_TO[l.label] || l.label === 'Рисую')) { inCaption = false; continue }
    if (inCaption || l.smena) continue
    if (l.role) res.push(`${l.role}: ${l.text}`)
    else if (l.label && /^Экран/u.test(l.label)) res.push(l.text)
    else if (l.text) res.push(l.text)
  }
  return res.join('\n').trim()
}
