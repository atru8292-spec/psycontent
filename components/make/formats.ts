// Форматы и цели экрана «Сделать» под флагом нового мозга. Коды совпадают с lib/generation/group.ts
// (GROUP_FORMATS, GOALS), сервер их же и проверяет.

// Порядок как в чипах «Что написать» (макет A1, 17.11): пост, карусель, рилс, сторис, Telegram
export const MAKE_FORMATS = [
  { id: 'post', label: 'Пост', one: 'пост' },
  { id: 'carousel', label: 'Карусель', one: 'карусель' },
  { id: 'reels', label: 'Рилс', one: 'рилс' },
  { id: 'stories', label: 'Сторис', one: 'сторис' },
  { id: 'post_tg', label: 'Telegram', one: 'пост для Telegram' },
] as const
export type MakeFormat = typeof MAKE_FORMATS[number]['id']
export const DEFAULT_FORMATS: MakeFormat[] = ['post', 'carousel']
export const formatLabel = (f: string) => MAKE_FORMATS.find(x => x.id === f)?.label || f

// Что в generated_posts считается материалом (12.11, решение Арины): все, кроме хуков. Черновик, доработанный
// через «Есть свой черновик» (rewrite-post пишет format rewrite_post, rewrite_carousel, rewrite_reels, rewrite_stories),
// это материал: он списывает лимит, поэтому виден в «Моих текстах» и считается в трекере ритма.
// Хуки (format hooks) тоже списывают лимит, но экрана больше нет и материалом они не показываются.
export const NOT_MATERIAL_FORMAT = 'hooks'
export const REWRITE_PREFIX = 'rewrite_'
export const isRewriteFormat = (code: string | null | undefined) => String(code || '').startsWith(REWRITE_PREFIX)
export const isMaterialFormat = (code: string | null | undefined) => String(code || 'post') !== NOT_MATERIAL_FORMAT

// Код материала из базы (reels_monolog, post_tg, rewrite_carousel...) в формат экрана
export function toMakeFormat(raw: string): MakeFormat {
  const code = isRewriteFormat(raw) ? raw.slice(REWRITE_PREFIX.length) : raw
  if (code.startsWith('reels')) return 'reels'
  if (code === 'post_tg' || code === 'carousel' || code === 'stories') return code
  return 'post'
}

// «Зачем пишешь» (словарь 17.11, строка 12): коды прежние, сервер их проверяет
export const GOAL_OPTIONS = [
  { id: null, label: 'Подобрать по теме' },
  { id: 'znakomstvo', label: 'Познакомить с собой' },
  { id: 'obyasnit', label: 'Объяснить тему' },
  { id: 'podderzhat', label: 'Поддержать' },
  { id: 'zapis', label: 'Позвать на консультацию' },
] as const
export type MakeGoal = 'znakomstvo' | 'zapis' | 'obyasnit' | 'podderzhat' | null

export function pluralMaterial(n: number): string {
  const m10 = n % 10, m100 = n % 100
  if (m10 === 1 && m100 !== 11) return 'текст'
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'текста'
  return 'текстов'
}

// Главная кнопка «Написать» (словарь 17.11, строка 2): один формат по имени, два через «и», от трех числом
export const formatOne = (f: string) => MAKE_FORMATS.find(x => x.id === f)?.one || f
export function makeButtonText(formats: MakeFormat[]): string {
  if (formats.length === 1) return `Написать ${formatOne(formats[0])}`
  if (formats.length === 2) return `Написать ${formatOne(formats[0])} и ${formatOne(formats[1])}`
  return `Написать ${formats.length} ${pluralMaterial(formats.length)}`
}
// Формат дня из плана тем (post, carousel, reels, stories) в чип; неизвестный формат плана: пост
export function planFormat(raw: string | null | undefined): MakeFormat | undefined {
  if (!raw) return undefined
  return toMakeFormat(String(raw))
}
