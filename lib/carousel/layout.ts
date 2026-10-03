// П7: раскладка готового текста карусели по макету (07-KARUSELI-TZ.md, раздел 2).
// Модель только раскладывает, слова не меняет; код проверяет и при сбое раскладывает сам.

import { callJson } from '@/lib/generation/ai'
import { fill } from '@/lib/generation/prompts'
import { STYLES, type TemplateStyle } from './styles'
import { isDialogText, isPose, POSES, POSE_RU, type Pose } from './dialog'

export type SlideRole = 'cover' | 'text' | 'list' | 'pair' | 'final' | 'stop' | 'dialog'
export type SlideLayout = {
  n: number
  role: SlideRole
  big: string
  small: string
  accent: string | null
  photo: boolean
  pose?: { a?: Pose; b?: Pose } // слайд-диалог: позы клиента (А) и психолога (Б), если П7 их выбрал
}

export const P7_SYSTEM = `Ты верстальщик карусели. Тебе дают готовый текст карусели по слайдам и стиль оформления. Твоя задача разложить текст каждого слайда по местам макета. Текст ты не пишешь и не правишь.

Главное правило: слова, их порядок и знаки препинания остаются как есть. Поля big и small вместе дают ровно текст слайда: big это его начало, small продолжение. Ничего не добавляй, не убирай, не переставляй, не меняй регистр.

Как раскладывать:
- big: то, что читают первым. Обычно первая фраза или ее законченная часть, до {{big_max_words}} слов. На обложке весь текст может быть big. Если текст слайда в две строки (заголовок и с новой строки подзаголовок или мелкая добавка), big это первая строка, small все остальное.
- small: остальной текст слайда. Может быть пустым.
- accent: одно-три слова подряд из big или small, которые стоит выделить цветом. Бери слово, на котором держится мысль слайда. На двух соседних слайдах не выделяй одинаковое. Можно null.
- role: cover (слайд 1), text (обычный), list (внутри перечисление), pair (фраза и ее перевод, подача slovar), stop (короткая сильная фраза до 12 слов, на которой палец останавливается, не больше одного на карусель), dialog (слайд из реплик «А: …» и «Б: …», А клиент, Б психолог: весь текст в small, big пустой), final (последний).
- pose: только у слайда dialog. Позы человечков: {"a": "...", "b": "..."}, имя из списка: {{pose_list}}. Выбирай по смыслу реплик: кто злится, кто тревожится, кто объясняет. Можно null, тогда позу выберет код.
- photo: true, если на этом слайде уместно фото автора или фото из жизни. Только если стиль поддерживает фото ({{style_photo_rule}}). Обложка в первую очередь.
- picture: только если вид карусели generated. На какие слайды нужна картинка, решаешь сам, но не больше {{max_pictures}} на карусель, обложка всегда с картинкой. Для слайда с картинкой опиши сцену по-английски в поле scene: одна-две фигуры из стиля, простое бытовое действие и один-два предмета, которые показывают мысль слайда. Без букв, слов, цифр и надписей на картинке. Без реальных людей, знаменитостей, брендов, логотипов и известных персонажей мультфильмов и фильмов. Без крови, оружия, самоповреждения, наготы, таблеток. Если тема материала тяжелая (суицид, самоповреждение, РПП, насилие, психоз), picture везде null.

Ответ: только JSON.`

export const P7_USER = `Вид: {{carousel_kind}}   (template | generated)
Стиль: {{style_code}}
Максимум слов в big: {{big_max_words}}
Фото в стиле: {{style_photo_rule}}
Персонаж стиля: {{style_character}}
Тяжелая тема: {{heavy_topic}}   (да | нет, из risks плана)

Текст карусели:
{{carousel_text}}

Верни JSON:
{
  "slides": [
    {"n": 1, "role": "cover", "big": "...", "small": "", "accent": null, "photo": false, "pose": null,
     "picture": null или {"scene": "english scene description"}}
  ]
}`

const HEAVY_RE = /суицид|самоповрежд|рпп|расстройств[оа] пищев|насили|психоз/i
export const isHeavy = (risks: unknown): boolean =>
  Array.isArray(risks) && risks.some(r => HEAVY_RE.test(String(r)))

export const norm = (t: string) => String(t || '').replace(/\s+/g, ' ').trim()
const words = (t: string) => norm(t).split(' ').filter(Boolean)

function roleFor(i: number, total: number, text: string): SlideRole {
  if (i === 0) return 'cover'
  if (i === total - 1 && total > 2) return 'final'
  if (isDialogText(text)) return 'dialog'
  if (/^\s*[«"]/.test(text) && /\n\s*\n/.test(text)) return 'pair'
  if ((text.match(/^\s*(\d+[.)]|[-•])\s+/gm) || []).length >= 2) return 'list'
  return 'text'
}

// Раскладка кодом: первое предложение в big, если короткое; иначе все в small.
const CAPS_STYLES: TemplateStyle[] = ['t_redakciya', 't_premium', 't_mono', 't_plakat', 't_skrapbuk']

export function fallbackSlide(text: string, i: number, total: number, style: TemplateStyle): SlideLayout {
  const meta = STYLES[style]
  const role = roleFor(i, total, text)
  const t = text.trim()
  let big = ''
  let small = t
  if (role === 'dialog') {
    // реплики раскладывает сам слайд-диалог: весь текст в small
  } else if (role === 'pair') {
    const m = t.match(/^([\s\S]*?)\n\s*\n([\s\S]*)$/)
    if (m) { big = m[1].trim(); small = m[2].trim() }
  } else if (role === 'list') {
    // список: крупно первая строка до пунктов («7 признаков:»), пункты мелко. Точка после номера пункта не конец фразы.
    const lines = t.split('\n')
    const first = lines[0].trim()
    if (!/^\s*(\d+[.)]|[-•])\s+/.test(first) && words(first).length <= meta.bigMaxWords + 4) { big = first; small = lines.slice(1).join('\n').trim() }
  } else if (role !== 'final' && /\n/.test(t) && words(t.split('\n')[0]).length <= meta.bigMaxWords + 6) {
    // два уровня (карточка carousel в 03-PROMPTY.md): первая строка крупно, с новой строки мелкая добавка.
    // Так обложка «заголовок с обещанием + подзаголовок» встает заголовком в «Крупно», подзаголовком в «Мелко»
    const [first, ...rest] = t.split('\n')
    big = first.trim(); small = rest.join('\n').trim()
  } else if (i === 0 && words(t).length <= Math.round(meta.bigMaxWords * 1.5)) {
    big = t; small = ''
  } else {
    const m = t.match(/^([\s\S]*?[.!?…])(\s+[\s\S]*)?$/)
    const first = m ? m[1] : t
    // одно слово крупно («Вечер.») выглядит обрубком: крупной строкой берем фразу от двух слов.
    // В стилях с заголовком капсом на теле не больше 7 слов, иначе тело звучит громче обложки
    const maxW = CAPS_STYLES.includes(style) ? Math.min(7, meta.bigMaxWords) : meta.bigMaxWords
    if (words(first).length >= 2 && words(first).length <= maxW) { big = first.trim(); small = (m?.[2] || '').trim() }
  }
  return { n: i + 1, role, big, small, accent: null, photo: i === 0 && meta.photos !== 'none' }
}

export function fallbackLayout(slides: string[], style: TemplateStyle): SlideLayout[] {
  return withRhythm(slides.map((t, i) => fallbackSlide(t, i, slides.length, style)))
}

// Ритм: одна короткая сильная фраза (до 12 слов) в середине карусели становится стоп-слайдом, крупно и на акцентном фоне.
// Не чаще одного раза: из подходящих берем самую короткую. Остальные короткие идут обычным слайдом, но крупной строкой.
export const STOP_MAX_WORDS = 12
// Обложка без иерархии («Первая сессия: что на самом деле происходит в голове у клиента» одной стеной):
// часть до двоеточия крупно, остальное подзаголовком. Без двоеточия, если больше 6 слов, делим по границе
// фразы (запятая, вопрос, точка) после 3-5 слова. Если подзаголовок уже есть (две строки из промпта), не трогаем.
export const COVER_BIG_WORDS = 6
export function splitCover(s: SlideLayout): SlideLayout {
  if (s.n !== 1 || s.small || !s.big) return s
  const t = s.big.trim()
  const colon = t.match(/^([^:]{3,80}):\s+(\S[\s\S]*)$/)
  if (colon && words(colon[1]).length <= 8) return { ...s, big: `${colon[1]}:`, small: colon[2].trim() }
  if (words(t).length <= COVER_BIG_WORDS) return s
  const ws = t.split(/\s+/)
  for (const k of [3, 4, 5, 2]) {
    if (k < ws.length - 1 && /[,?!.…]$/.test(ws[k - 1])) return { ...s, big: ws.slice(0, k).join(' '), small: ws.slice(k).join(' ') }
  }
  return s
}

export function withRhythm(layout: SlideLayout[]): SlideLayout[] {
  const out = layout.map(s => splitCover({ ...s }))
  const total = out.length
  const isShort = (s: SlideLayout) => s.n !== 1 && s.n !== total && (s.role === 'text' || s.role === 'stop') &&
    words(`${s.big} ${s.small}`).length <= STOP_MAX_WORDS && !/\n/.test(`${s.big}\n${s.small}`.trim().replace(/^\n|\n$/g, ''))
  // не второй слайд (сразу после обложки рано), из подходящих ближе к 2/3 карусели
  const target = Math.round(total * 0.65)
  const cand = out.filter(s => isShort(s) && s.n !== 2).sort((a, b) => Math.abs(a.n - target) - Math.abs(b.n - target) || a.n - b.n)
  for (const s of out) if (s.role === 'stop') s.role = 'text'
  const pick = cand[0]
  if (pick) { pick.role = 'stop'; pick.big = norm(`${pick.big} ${pick.small}`); pick.small = '' }
  // прочие короткие: весь текст крупной строкой, чтобы не мельчить его общим кеглем основного текста
  for (const s of out) if (s !== pick && isShort(s) && !s.big) { s.big = norm(s.small); s.small = '' }
  // финал: весь текст призыва одной крупной строкой, раскладку по частям делает сам финал «кто я»
  const last = out[total - 1]
  if (total > 2 && last.role === 'final') { last.big = norm(`${last.big} ${last.small}`); last.small = '' }
  return out
}

export { ctaOf, type CtaKind } from './cta'

// Текст слайда обратно одной строкой для материала: фраза и перевод через пустую строку, реплики диалога построчно
export function slideTextOf(s: SlideLayout): string {
  if (s.role === 'dialog' || s.role === 'list') return [s.big, s.small].filter(Boolean).join('\n')
  return [s.big, s.small].filter(Boolean).join(s.role === 'pair' ? '\n\n' : ' ')
}

// Проверка ответа П7: слова те же, accent из текста, соседние акценты разные.
export function checkLayout(slides: string[], raw: any, style: TemplateStyle): { layout: SlideLayout[]; fixed: number } {
  const got: any[] = Array.isArray(raw?.slides) ? raw.slides : []
  const meta = STYLES[style]
  let fixed = 0
  let prevAccent: string | null = null
  const layout = slides.map((text, i) => {
    const r = got.find(s => Number(s?.n) === i + 1) || got[i]
    const big = typeof r?.big === 'string' ? r.big.trim() : ''
    const small = typeof r?.small === 'string' ? r.small.trim() : ''
    if (!r || norm(`${big} ${small}`) !== norm(text)) { fixed++; prevAccent = null; return fallbackSlide(text, i, slides.length, style) }
    let accent: string | null = typeof r.accent === 'string' && r.accent.trim() ? r.accent.trim() : null
    if (accent && !big.includes(accent) && !small.includes(accent)) accent = null
    if (accent && prevAccent && accent.toLowerCase() === prevAccent.toLowerCase()) accent = null
    if (accent && words(accent).length > 3) accent = null
    prevAccent = accent
    // диалог определяет код по тексту: модель могла разложить реплики по big и small, собираем обратно
    if (roleFor(i, slides.length, text) === 'dialog') {
      const pose = r.pose && typeof r.pose === 'object' ? { ...(isPose(r.pose.a) ? { a: r.pose.a } : {}), ...(isPose(r.pose.b) ? { b: r.pose.b } : {}) } : {}
      return { n: i + 1, role: 'dialog' as SlideRole, big: '', small: text.trim(), accent: null, photo: false, ...(Object.keys(pose).length ? { pose } : {}) }
    }
    const role: SlideRole = ['cover', 'text', 'list', 'pair', 'final', 'stop'].includes(r.role) ? r.role : roleFor(i, slides.length, text)
    const photo = meta.photos !== 'none' && r.photo === true
    return { n: i + 1, role: i === 0 ? 'cover' : role, big, small, accent, photo }
  })
  return { layout: withRhythm(layout), fixed }
}

export async function layoutWithModel(args: {
  slides: string[]
  style: TemplateStyle
  heavy: boolean
  userId?: string
}): Promise<{ layout: SlideLayout[]; fixed: number; viaModel: boolean }> {
  const meta = STYLES[args.style]
  const vars = {
    carousel_kind: 'template',
    style_code: args.style,
    big_max_words: meta.bigMaxWords,
    style_photo_rule: meta.photoRule,
    style_character: 'нет',
    heavy_topic: args.heavy ? 'да' : 'нет',
    max_pictures: 0,
    pose_list: POSES.map(p => `${p} (${POSE_RU[p]})`).join(', '),
    carousel_text: args.slides.map((s, i) => `Слайд ${i + 1}: ${s}`).join('\n'),
  }
  try {
    const raw = await callJson({
      system: fill(P7_SYSTEM, vars),
      user: fill(P7_USER, vars),
      effort: 'low',
      verbosity: 'low',
      timeoutMs: 40000,
      userId: args.userId,
      operation: 'carousel_layout',
    })
    const { layout, fixed } = checkLayout(args.slides, raw, args.style)
    return { layout, fixed, viaModel: true }
  } catch (e: any) {
    console.warn('П7 не сработал, раскладка кодом:', e?.message)
    return { layout: fallbackLayout(args.slides, args.style), fixed: args.slides.length, viaModel: false }
  }
}
