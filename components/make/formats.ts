// Форматы и цели экрана «Сделать» под флагом нового мозга. Коды совпадают с lib/generation/group.ts
// (GROUP_FORMATS, GOALS), сервер их же и проверяет.

export const MAKE_FORMATS = [
  { id: 'reels', label: 'Рилс', one: 'рилс' },
  { id: 'carousel', label: 'Карусель', one: 'карусель' },
  { id: 'post', label: 'Пост', one: 'пост' },
  { id: 'post_tg', label: 'Telegram', one: 'пост для Telegram' },
  { id: 'stories', label: 'Сторис', one: 'сторис' },
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

export const GOAL_OPTIONS = [
  { id: null, label: 'Любая' },
  { id: 'znakomstvo', label: 'Познакомить с собой' },
  { id: 'zapis', label: 'Записать на консультацию' },
  { id: 'obyasnit', label: 'Объяснить тему' },
  { id: 'podderzhat', label: 'Поддержать' },
] as const
export type MakeGoal = 'znakomstvo' | 'zapis' | 'obyasnit' | 'podderzhat' | null

export function pluralMaterial(n: number): string {
  const m10 = n % 10, m100 = n % 100
  if (m10 === 1 && m100 !== 11) return 'материал'
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'материала'
  return 'материалов'
}

export function makeButtonText(formats: MakeFormat[]): string {
  if (formats.length === 1) return `Сделать ${MAKE_FORMATS.find(f => f.id === formats[0])?.one || 'пост'}`
  return `Сделать ${formats.length} ${pluralMaterial(formats.length)}`
}
