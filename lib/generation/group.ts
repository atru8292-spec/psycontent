// Одна мысль в несколько форматов (задача sdelat-i-brend, раздел 4).
// Ядро собирается один раз (core.ts), форматы пишутся параллельно простым путем (simple.ts) или старой цепочкой,
// каждый берет свою часть ядра и начинает со своего места. Потом проверка набора: одинаковые фразы
// и первые строки между форматами, а в Instagram еще реклама; найденное в более позднем формате переписывается.

import { YP_SYSTEM, YP_USER } from './prompts.generated'
import { fill } from './prompts'
import { callModel } from './ai'
import { finalNet, isReels, LABEL_RE, type FormatCode } from './text-guard'
import { applyCuts } from './simple'
import type { ThoughtCore, CoreField } from './core'
import type { GenContext } from './pipeline'

// Что выбирает психолог на экране «Сделать». Рилс: вид выбирает код (reels_auto).
export const GROUP_FORMATS = ['reels', 'carousel', 'post', 'post_tg', 'stories'] as const
export type GroupFormat = typeof GROUP_FORMATS[number]
export const toGroupCode = (f: GroupFormat): FormatCode => (f === 'reels' ? 'reels_auto' : f)

// «Цель» на экране «Сделать» (лист «Цель: любая»). Коды цели живут в интерфейсе и запросе; в generated_posts.core.intent
// пишется уже код смысла (GOAL_INTENTS), не код цели.
export const GOALS = ['znakomstvo', 'zapis', 'obyasnit', 'podderzhat'] as const
export type Goal = typeof GOALS[number]
export const GOAL_LABELS: Record<Goal, string> = {
  znakomstvo: 'Познакомить с собой',
  zapis: 'Записать на консультацию',
  obyasnit: 'Объяснить тему',
  podderzhat: 'Поддержать',
}
export const GOAL_INTENTS: Record<Goal, string[]> = {
  znakomstvo: ['svoya_istoriya', 'poziciya'],
  zapis: ['priglashenie'],
  obyasnit: ['mehanizm', 'obyasnenie', 'perevod_repliki', 'mif'],
  podderzhat: ['podderzhka', 'uznavanie', 'dlya_blizkih'],
}

export const isInstagram = (f: FormatCode) => f !== 'post_tg'

// Смысл формата: общий для набора, кроме двух случаев. В Instagram на консультацию не зовем (запрет рекламы
// в РФ), поэтому «Записать» там показывает, как устроена работа (kak_v_terapii), а зовет только Telegram.
// Своя история без историй автора выходит заглушкой, ее заменяет позиция.
export function intentForFormat(groupIntent: string, format: FormatCode): string {
  if (groupIntent === 'priglashenie' && isInstagram(format)) return 'kak_v_terapii'
  return groupIntent
}

type Role = { take: CoreField[]; entry: string; finale: string; label: string }
const SCENKA: FormatCode[] = ['reels_scenka', 'reels_rol']

// Таблица из задачи: какую часть ядра берет формат, с чего начинает и чем заканчивает.
export function roleFor(format: FormatCode): Role {
  if (SCENKA.includes(format)) return { label: 'Рилс сценка', take: ['others_say', 'distinction'], entry: 'реплика героя', finale: 'реплика-пуант' }
  if (isReels(format)) return { label: 'Рилс', take: ['scene', 'others_say', 'mechanism', 'quote'], entry: 'сцена в первой фразе или чужая фраза', finale: 'фраза для цитаты, без морали' }
  if (format === 'carousel') return { label: 'Карусель', take: ['mechanism', 'distinction', 'step'], entry: 'обложка с обещанием', finale: 'слайд-инструмент, потом кто я и один призыв' }
  if (format === 'post_tg') return { label: 'Пост в Telegram', take: ['thought', 'author_detail'], entry: 'первая строка как в личном сообщении', finale: 'мысль вдогонку или вопрос под реакции; мягко позвать к себе можно только тут' }
  if (format === 'stories') return { label: 'Серия сторис', take: ['others_say', 'step', 'quote'], entry: 'вопрос или сцена', finale: 'стикер или ссылка на пост' }
  return { label: 'Пост в Instagram', take: ['author_detail', 'mechanism', 'distinction'], entry: 'своя деталь или наблюдение', finale: 'вопрос по желанию' }
}

const FIELD_NAMES: Record<CoreField, string> = {
  thought: 'Мысль', who: 'Кто читатель', scene: 'Сцена', mechanism: 'Почему так', others_say: 'Что обычно говорят',
  distinction: 'Что не путать', step: 'Шаг или вопрос к себе', quote: 'Фраза для цитаты', author_detail: 'Деталь автора',
}

// Блок <ядро_мысли> для одного формата: мысль и читатель всем, дальше только свои части, вход и финал.
export function coreBlockFor(core: ThoughtCore, format: FormatCode): string {
  const r = roleFor(format)
  const lines = [`Мысль: ${core.thought}`]
  if (core.who) lines.push(`Кто читатель: ${core.who}`)
  for (const f of r.take) {
    if (f === 'thought') continue
    if (f === 'quote' && core.quote) lines.push(`Фраза для цитаты (можно дословно): ${core.quote}`)
    else if (core[f]) lines.push(`${FIELD_NAMES[f]}: ${core[f]}`)
  }
  if (r.take.includes('author_detail') && !core.author_detail) lines.push('Своей детали автора здесь нет: личного не добавляй, строй без него.')
  lines.push(`Этот материал (${r.label}) начинается так: ${r.entry}. Заканчивается так: ${r.finale}.`)
  lines.push('Другие части мысли оставь соседним материалам, не пересказывай их.')
  if (isInstagram(format)) lines.push('Это Instagram: без цен, скидок, «успей», отзывов и приглашения записаться.')
  if (core.flags.length) lines.push(`Осторожно: ${core.flags.join('; ')}.`)
  return '\n' + lines.join('\n') + '\n'
}

// Блок <соседи>: что делают другие форматы набора. Первые строки соседей при параллельной генерации
// еще неизвестны, поэтому передаем их план (вход, части ядра, финал), а одинаковые начала ловит checkSet.
export function neighborsFor(formats: FormatCode[], current: FormatCode): string {
  const others = formats.filter(f => f !== current)
  if (!others.length) return ''
  return '\n' + others.map(f => {
    const r = roleFor(f)
    return `${r.label}: начинает так: ${r.entry}; берет: ${r.take.map(x => FIELD_NAMES[x].toLowerCase()).join(', ')}. Не начинай так же.`
  }).join('\n') + '\n'
}

// ---------- проверка набора ----------
const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\d ]+/gu, ' ').replace(/\s+/g, ' ').trim()
const wordsOf = (s: string) => (s.match(/[\p{L}\d]+/gu) || []).length

// Предложения материала без служебных меток.
export function sentences(text: string): string[] {
  const out: string[] = []
  for (const raw of text.split('\n')) {
    const line = raw.replace(LABEL_RE, '').trim()
    if (!line) continue
    for (const p of line.split(/(?<=[.!?…])\s+/u)) if (p.trim()) out.push(p.trim())
  }
  return out
}
export function firstLine(text: string): string {
  for (const raw of text.split('\n')) {
    const l = raw.replace(LABEL_RE, '').trim()
    if (l && !/^(Персонажи|Снять)\s*:/iu.test(raw.trim())) return l
  }
  return ''
}

// Реклама в Instagram: цены, скидки, «успей», отзывы, приглашение записаться.
// \b в JS не видит кириллицу, поэтому границы слова через (?<!\p{L}) и (?!\p{L}).
// Ловим цену, скидку с числом, «успей», отзывы клиентов и приглашение записаться; обычные фразы психолога
// («дай себе скидку», «запись на диктофон», «3 рубрики», «отзывается») не трогаем.
const L = '(?<!\\p{L})', R = '(?!\\p{L})'
const AD_RE = new RegExp([
  `\\d[\\d\\s]*\\s?(?:₽|руб(?:л|\\.|${R})|р\\.)`,
  `стои(?:т|мость)\\s+\\d[\\d\\s]*(?:₽|руб|р\\.|тыс)`,
  `${L}скидк\\p{L}*\\s+(?:\\d|до\\s+\\d)|\\d+\\s?%\\s*скидк`,
  `${L}успе(?:й|йте)${R}`,
  `${L}отзыв(?:ы|ов|ами|ам)${R}|${L}отзыв\\p{L}*\\s+клиент`,
  `${L}запис(?:ывайся|ывайтесь|аться|ь\\p{L}*)\\s+(?:на|ко|к)\\s+(?:консультац|сесси|прием|встреч|мне)`,
  `${L}запиш(?:ись|итесь)${R}|${L}записывай(?:ся|тесь)${R}`,
  `${L}(?:пиши|напиши|пишите|напишите)\\s+(?:мне\\s+)?в\\s+(?:директ|личк|лс)`,
  `${L}консультаци\\p{L}*\\s+(?:стоит|по\\s+ссылке|в\\s+профил)`,
  `осталось\\s+\\d+\\s+мест`,
  `${L}запис\\p{L}*\\s+(?:открыт|в\\s+шапк|по\\s+ссылк)`,
  `${L}(?:пиши|напиши|пишите|напишите)\\s+(?:мне\\s+)?в\\s+личн\\p{L}*\\s+сообщени`,
].join('|'), 'iu')
export function adPhrases(text: string): string[] {
  return sentences(text).filter(s => AD_RE.test(s))
}

// index: номер материала в items (соседи из прошлых запусков идут первыми, их не переписываем)
export type SetIssue = { index: number; format: FormatCode; phrases: string[] }

// Ищем, что в более позднем материале повторяет более ранний (по порядку набора). quote повторять можно.
// Считаем по номеру материала, а не по формату: «еще пост» из поста тоже должен ловить повтор.
export function checkSet(items: { format: FormatCode; text: string }[], quote: string): SetIssue[] {
  const q = norm(quote)
  const seen = new Map<string, number>()
  const seenFirst = new Map<string, number>()
  const issues: SetIssue[] = []
  items.forEach((it, idx) => {
    const phrases = new Set<string>()
    const first = firstLine(it.text)
    const fn = norm(first)
    if (fn && seenFirst.has(fn) && fn !== q) phrases.add(first)
    for (const s of sentences(it.text)) {
      const n = norm(s)
      if (wordsOf(s) < 4 || !n || n === q || (q && q.includes(n))) continue
      if (seen.has(n) && seen.get(n) !== idx) phrases.add(s)
    }
    if (isInstagram(it.format)) for (const s of adPhrases(it.text)) phrases.add(s)
    for (const s of sentences(it.text)) { const n = norm(s); if (n && !seen.has(n)) seen.set(n, idx) }
    if (fn && !seenFirst.has(fn)) seenFirst.set(fn, idx)
    if (phrases.size) issues.push({ index: idx, format: it.format, phrases: [...phrases] })
  })
  return issues
}

// Последний рубеж в Instagram: фразы с рекламой, которые остались после переписи, вырезаем целиком (как ножницы:
// только целые фразы, не первую строку, метку пустой не оставляем). Telegram не трогаем: там звать можно.
export function stripAds(format: FormatCode, text: string): string {
  if (!isInstagram(format)) return text
  const ads = adPhrases(text)
  if (!ads.length) return text
  return applyCuts(text, ads, 1 / 2).text
}

// Одиночная генерация в Instagram: нашли рекламу, переписываем эти фразы, а что осталось, вырезаем
export async function cleanAds(ctx: GenContext, format: FormatCode, text: string): Promise<string> {
  if (!isInstagram(format)) return text
  const ads = adPhrases(text)
  if (!ads.length) return text
  return stripAds(format, await rewritePhrases(ctx, format, text, ads))
}

// Переписать только названные фразы. Если модель вернула что-то сильно другое по длине, оставляем как было.
export async function rewritePhrases(ctx: GenContext, format: FormatCode, text: string, phrases: string[]): Promise<string> {
  try {
    const out = await callModel({
      system: YP_SYSTEM,
      user: fill(YP_USER, { format_code: format, phrases: phrases.map(p => `- ${p}`).join('\n'), text }),
      effort: 'low', verbosity: 'medium', maxTokens: 6000,
      userId: ctx.userId, operation: 'generate_post_set_fix', writer: true, knownNames: ctx.settings.knownNames,
    })
    const fixed = finalNet(out)
    const a = wordsOf(text), b = wordsOf(fixed)
    if (!fixed || b < a * 0.7 || b > a * 1.3) return text
    return fixed
  } catch {
    return text
  }
}
