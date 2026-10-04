// Ядро мысли: одна мысль, из которой делается набор форматов (задача sdelat-i-brend, раздел 4).
// Собирается отдельным коротким вызовом (раздел «ЯМ» в 03-PROMPTY.md): простой путь ПЖ работает без плана,
// поэтому ядро не может жить на шаге плана pipeline.ts. Каждый формат берет из ядра свою часть (group.ts).

import { YM_SYSTEM, YM_USER } from './prompts.generated'
import { fill } from './prompts'
import { callJson } from './ai'
import { storiesText, relevantStories } from './settings'
import type { GenContext } from './pipeline'

export type ThoughtCore = {
  thought: string
  who: string
  scene: string
  mechanism: string
  others_say: string
  distinction: string
  step: string
  quote: string
  intent: string
  author_detail: string
  flags: string[]
}

export const CORE_FIELDS = ['thought', 'who', 'scene', 'mechanism', 'others_say', 'distinction', 'step', 'quote', 'author_detail'] as const
export type CoreField = typeof CORE_FIELDS[number]

const str = (v: unknown, n = 600) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '')
const countWords = (s: string) => (s.match(/[\p{L}\d]+/gu) || []).length

// Чистим ответ модели: только известные поля, строки, quote до 12 слов (иначе пусто), ё → е.
export function normalizeCore(raw: any, intent: string): ThoughtCore {
  const yo = (s: string) => s.replace(/ё/g, 'е').replace(/Ё/g, 'Е')
  const c: ThoughtCore = {
    thought: yo(str(raw?.thought)), who: yo(str(raw?.who)), scene: yo(str(raw?.scene)),
    mechanism: yo(str(raw?.mechanism)), others_say: yo(str(raw?.others_say)), distinction: yo(str(raw?.distinction)),
    step: yo(str(raw?.step)), quote: yo(str(raw?.quote, 200)), intent,
    author_detail: yo(str(raw?.author_detail)),
    flags: Array.isArray(raw?.flags) ? raw.flags.map((f: unknown) => yo(str(f, 120))).filter(Boolean).slice(0, 6) : [],
  }
  if (countWords(c.quote) > 12) c.quote = ''
  return c
}

// Ядро из сохраненного материала (generated_posts.core): берем, только если похоже на ядро.
export function coreFromRow(v: unknown, intent?: string): ThoughtCore | null {
  if (!v || typeof v !== 'object') return null
  const c = normalizeCore(v, intent || str((v as any).intent, 60))
  return c.thought ? c : null
}

// Деталь автора только из ее слов: если в ее мысли и историях нет ни одного слова детали длиннее 4 букв,
// считаем деталь выдуманной и убираем. Грубо, но личное лучше потерять, чем приписать.
function detailIsHers(detail: string, sources: string): boolean {
  if (!detail) return true
  const src = sources.toLowerCase()
  const ws = detail.toLowerCase().split(/[^\p{L}]+/u).filter(w => w.length > 4).map(w => w.slice(0, 5))
  if (!ws.length) return false
  const hits = ws.filter(w => src.includes(w)).length
  return hits / ws.length >= 0.4
}

export async function buildCore(ctx: GenContext, args: {
  topic: string
  intent: string
  intentLabel: string
  userDetail?: string | null
  fromText?: string | null // ядро по готовому (правленому) тексту: «еще формат» после правки
}): Promise<ThoughtCore> {
  const s = ctx.settings
  const stories = storiesText(relevantStories(s.stories, args.topic))
  const thoughtSrc = [args.userDetail || '', args.fromText ? `Готовый текст автора, ядро собери по нему:\n${args.fromText}` : ''].filter(Boolean).join('\n\n')
  const raw = await callJson<any>({
    system: YM_SYSTEM,
    user: fill(YM_USER, {
      topic: args.topic,
      user_detail: thoughtSrc,
      intent_label: args.intentLabel,
      author: [s.name ? `зовут ${s.name}` : '', 'психолог', s.niche ? `тема: ${s.niche}` : ''].filter(Boolean).join(', '),
      audience: s.clientPhrases ? `как говорят ее клиенты: ${s.clientPhrases}` : 'люди, которые читают блог психолога',
      stories: stories || 'нет',
    }),
    effort: 'low', verbosity: 'low', maxTokens: 2500,
    userId: ctx.userId, operation: 'generate_post_core', knownNames: s.knownNames,
  })
  const core = normalizeCore(raw, args.intent)
  // готовый текст автора тоже ее слова, если она его правила; деталь из него допустима
  if (!detailIsHers(core.author_detail, [args.userDetail || '', args.fromText || '', stories].join('\n'))) core.author_detail = ''
  return core
}
