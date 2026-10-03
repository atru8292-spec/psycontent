// Шаблонные стили каруселей (_знания/мозг-генератора/07-KARUSELI-TZ.md, раздел 3).
// Кегли крупнее, чем в ТЗ (30.09, Арина): на телефоне слайд 1080 px сжимается втрое, 30 px читались как 11.
// Цвета свои (30.09, Арина): у каждого стиля палитра фон, текст, акцент; готовые палитры или свои цвета.
// Холст 1080×1440, безопасная зона 180 px сверху и снизу, 50 px по бокам.

export type TemplateStyle =
  | 't_redakciya' | 't_premium' | 't_skrapbuk' | 't_zapiska'
  | 't_tetrad' | 't_perepiska' | 't_plakat' | 't_mono'
  | 't_zametki' | 't_stikery' | 't_citata' | 't_slovar' | 't_doska' | 't_vozduh'
export const TEMPLATE_STYLES: TemplateStyle[] = [
  't_redakciya', 't_perepiska', 't_zametki', 't_plakat',
  't_tetrad', 't_stikery', 't_citata', 't_slovar',
  't_premium', 't_mono', 't_doska', 't_vozduh',
  't_zapiska', 't_skrapbuk',
]
// Сколько вариантов компоновки у стиля: одна и та же карусель у двух психологов не выглядит одинаково
export const VARIANTS = 3

export type Palette = { bg: string; text: string; accent: string }

export type StyleMeta = {
  id: TemplateStyle
  label: string
  hint: string               // одна строка под превью: когда брать
  palette: Palette           // цвета стиля по умолчанию
  accentSurface?: boolean    // акцент тут фон (стикер), а не цвет слов: проверяем текст на нем
  bigMaxWords: number
  photoRule: string          // для П7
  photos: 'none' | 'optional' | 'required'
  limits: { big: number; coverBig: number; small: number } // символов при 100% кегля
  forIntents: string[]
}

export const STYLES: Record<TemplateStyle, StyleMeta> = {
  t_redakciya: {
    id: 't_redakciya', label: 'Редакция', hint: 'Крупно, как журнал. Для объяснений и разборов',
    palette: { bg: '#FFFFFF', text: '#111111', accent: '#D7263D' }, bigMaxWords: 8,
    photoRule: 'нет, стиль без фото', photos: 'none',
    limits: { big: 60, coverBig: 70, small: 340 },
    forIntents: ['obyasnenie', 'mif', 'mehanizm'],
  },
  t_perepiska: {
    id: 't_perepiska', label: 'Переписка', hint: 'Как чат с клиентом. Для фраз клиентов и узнавания',
    palette: { bg: '#EEF1F5', text: '#1C1C1E', accent: '#5B4FA0' }, bigMaxWords: 14,
    photoRule: 'нет, стиль без фото', photos: 'none',
    limits: { big: 110, coverBig: 70, small: 300 },
    forIntents: ['uznavanie', 'perevod_repliki', 'slovar'],
  },
  t_tetrad: {
    id: 't_tetrad', label: 'Тетрадь', hint: 'От руки на листе в линейку. Тепло и лично',
    palette: { bg: '#FBF8F1', text: '#23324F', accent: '#E0457B' }, bigMaxWords: 9,
    photoRule: 'нет, стиль без фото', photos: 'none',
    limits: { big: 55, coverBig: 55, small: 260 },
    forIntents: ['podderzhka', 'razreshenie', 'malenkiy_shag'],
  },
  t_plakat: {
    id: 't_plakat', label: 'Плакат', hint: 'Сочный цвет и огромный текст. Сразу цепляет в ленте',
    palette: { bg: '#E8603C', text: '#1E1420', accent: '#FFF1E0' }, bigMaxWords: 8,
    photoRule: 'нет, стиль без фото', photos: 'none',
    limits: { big: 55, coverBig: 55, small: 280 },
    forIntents: ['poziciya', 'mif', 'yumor'],
  },
  t_zametki: {
    id: 't_zametki', label: 'Заметки', hint: 'Как заметка в телефоне. Просто и по-свойски',
    palette: { bg: '#FFFFFF', text: '#1C1C1E', accent: '#C98A00' }, bigMaxWords: 10,
    photoRule: 'нет, стиль без фото', photos: 'none',
    limits: { big: 70, coverBig: 70, small: 360 },
    forIntents: ['malenkiy_shag', 'uznavanie', 'obyasnenie'],
  },
  t_stikery: {
    id: 't_stikery', label: 'Стикеры', hint: 'Записка на стикере от руки. Для поддержки',
    palette: { bg: '#EFEAE2', text: '#2A2A2A', accent: '#FFE27A' }, accentSurface: true, bigMaxWords: 8,
    photoRule: 'нет, стиль без фото', photos: 'none',
    limits: { big: 50, coverBig: 50, small: 220 },
    forIntents: ['podderzhka', 'razreshenie'],
  },
  t_citata: {
    id: 't_citata', label: 'Цитата', hint: 'Большие кавычки. Для фраз клиентов и своих мыслей',
    palette: { bg: '#F4EEE6', text: '#2A2320', accent: '#C0573E' }, bigMaxWords: 14,
    photoRule: 'нет, стиль без фото', photos: 'none',
    limits: { big: 110, coverBig: 90, small: 300 },
    forIntents: ['uznavanie', 'poziciya', 'perevod_repliki'],
  },
  t_slovar: {
    id: 't_slovar', label: 'Словарь', hint: 'Как статья в словаре. Объяснить слово или фразу',
    palette: { bg: '#FAF7F0', text: '#1F1B16', accent: '#3B5BA5' }, bigMaxWords: 8,
    photoRule: 'нет, стиль без фото', photos: 'none',
    limits: { big: 50, coverBig: 60, small: 340 },
    forIntents: ['perevod_repliki', 'mif', 'obyasnenie'],
  },
  t_doska: {
    id: 't_doska', label: 'Доска', hint: 'Мелом на школьной доске. Для объяснений',
    palette: { bg: '#2F3B33', text: '#F2F0E6', accent: '#F2D16B' }, bigMaxWords: 9,
    photoRule: 'нет, стиль без фото', photos: 'none',
    limits: { big: 60, coverBig: 60, small: 300 },
    forIntents: ['mehanizm', 'obyasnenie'],
  },
  t_vozduh: {
    id: 't_vozduh', label: 'Воздух', hint: 'Много пустого места, тихо и бережно',
    palette: { bg: '#FFFFFF', text: '#2B2B2B', accent: '#9C7A5B' }, bigMaxWords: 10,
    photoRule: 'нет, стиль без фото', photos: 'none',
    limits: { big: 80, coverBig: 80, small: 260 },
    forIntents: ['podderzhka', 'razreshenie', 'pismo'],
  },
  t_premium: {
    id: 't_premium', label: 'Премиум', hint: 'Спокойно и дорого, с твоим фото',
    palette: { bg: '#1E1C1A', text: '#EDE7DE', accent: '#B8956A' }, bigMaxWords: 12,
    photoRule: 'да, фото автора, в первую очередь на обложке', photos: 'optional',
    limits: { big: 80, coverBig: 80, small: 340 },
    forIntents: ['poziciya', 'priglashenie', 'svoya_istoriya', 'kak_v_terapii'],
  },
  t_mono: {
    id: 't_mono', label: 'Моно', hint: 'Машинописный текст, главное цветом. Для разборов',
    palette: { bg: '#ECECEA', text: '#1F1F1F', accent: '#8C1C2B' }, bigMaxWords: 10,
    photoRule: 'нет, стиль без фото', photos: 'none',
    limits: { big: 70, coverBig: 70, small: 320 },
    forIntents: ['mehanizm', 'obyasnenie'],
  },
  t_zapiska: {
    id: 't_zapiska', label: 'Записка', hint: 'Экспертная записка с твоим аватаром',
    palette: { bg: '#E9E8E5', text: '#111111', accent: '#111111' }, bigMaxWords: 9,
    photoRule: 'нет, только аватар в подвале', photos: 'none',
    limits: { big: 70, coverBig: 70, small: 360 },
    forIntents: ['obyasnenie', 'mehanizm', 'uznavanie', 'kak_v_terapii'],
  },
  t_skrapbuk: {
    id: 't_skrapbuk', label: 'Скрапбук', hint: 'Легко и лично, с фото из жизни',
    palette: { bg: '#FFFFFF', text: '#1A1A1A', accent: '#1A1A1A' }, bigMaxWords: 9,
    photoRule: 'да, фото из жизни, маленькие кадры на каждом слайде', photos: 'required',
    limits: { big: 60, coverBig: 70, small: 300 },
    forIntents: ['svoya_istoriya', 'malenkiy_shag', 'podderzhka'],
  },
}

export const isTemplateStyle = (s: unknown): s is TemplateStyle => typeof s === 'string' && (TEMPLATE_STYLES as string[]).includes(s)

// Готовые палитры: подходят к любому стилю. Спокойные и сочные, без кислотных.
export const PALETTES: { name: string; p: Palette }[] = [
  { name: 'Бумага', p: { bg: '#F7F3EC', text: '#2E2A45', accent: '#5B4FA0' } },
  { name: 'Графит', p: { bg: '#1E1C1A', text: '#EDE7DE', accent: '#B8956A' } },
  { name: 'Терракота', p: { bg: '#E8603C', text: '#1E1420', accent: '#FFF1E0' } },
  { name: 'Шалфей', p: { bg: '#E4E9DC', text: '#23301F', accent: '#5E7A4A' } },
  { name: 'Лаванда', p: { bg: '#E7E2F2', text: '#2E2A45', accent: '#C2185B' } },
  { name: 'Ночь', p: { bg: '#1F2A44', text: '#F3F0E8', accent: '#F2B84B' } },
  { name: 'Пудра', p: { bg: '#F6E4E1', text: '#3B2426', accent: '#B23A48' } },
  { name: 'Море', p: { bg: '#DDEBEE', text: '#11353F', accent: '#E07A2F' } },
  { name: 'Лимон', p: { bg: '#F7E96B', text: '#1D1D1B', accent: '#1D1D1B' } },
  { name: 'Белый', p: { bg: '#FFFFFF', text: '#111111', accent: '#D7263D' } },
  // из референсов Арины (30.09): цвета взяты из ее подборок, акцент где нужно чуть темнее, чтобы читался
  { name: 'Фиалка', p: { bg: '#F3D9ED', text: '#3B2C39', accent: '#7A8220' } },
  { name: 'Баклажан', p: { bg: '#3B2C39', text: '#F3D9ED', accent: '#B1BA3A' } },
  { name: 'Лотос', p: { bg: '#DEC59E', text: '#202808', accent: '#33432B' } },
  { name: 'Кувшинка', p: { bg: '#33432B', text: '#DEC59E', accent: '#C4866D' } },
  { name: 'Вишня', p: { bg: '#DBD2C9', text: '#63131C', accent: '#9F6162' } },
  { name: 'Бордо', p: { bg: '#63131C', text: '#DBD2C9', accent: '#CD9395' } },
  { name: 'Пастила', p: { bg: '#FFDBED', text: '#383B6E', accent: '#C9456F' } },
  { name: 'Какао', p: { bg: '#E2D1C2', text: '#442913', accent: '#8A6448' } },
  { name: 'Шоколад', p: { bg: '#442913', text: '#E2D1C2', accent: '#98755B' } },
  { name: 'Хвоя', p: { bg: '#E8E4DD', text: '#3C431E', accent: '#572512' } },
  { name: 'Камин', p: { bg: '#572512', text: '#E8E4DD', accent: '#C9A98A' } },
  { name: 'Ель', p: { bg: '#3C431E', text: '#E8E4DD', accent: '#B89C82' } },
  { name: 'Лес', p: { bg: '#FAF4F5', text: '#294936', accent: '#5E6B5D' } },
  { name: 'Туман', p: { bg: '#CFD9DE', text: '#294936', accent: '#3E5566' } },
  { name: 'Изумруд', p: { bg: '#1C352D', text: '#F8F0E5', accent: '#D8BF94' } },
  { name: 'Сливки', p: { bg: '#F8F0E5', text: '#1C352D', accent: '#4F7A66' } },
]

// Узор фона: идет через всю карусель, на стыке слайдов не рвется. Цвет узора из палитры.
export type Decor = 'none' | 'lenty' | 'linii' | 'zmeyki' | 'kletka' | 'dymka'
export const DECORS: { id: Decor; label: string }[] = [
  { id: 'none', label: 'Без узора' },
  { id: 'lenty', label: 'Ленты' },
  { id: 'linii', label: 'Линии' },
  { id: 'zmeyki', label: 'Змейки' },
  { id: 'kletka', label: 'Клетка' },
  { id: 'dymka', label: 'Дымка' },
]
export const isDecor = (v: unknown): v is Decor => DECORS.some(d => d.id === v)
// где узор уместен: у тетради, доски, записки и скрапбука свой фон, узор его испортит
// Заметки без узора: это экран iPhone, у него свой фон
export const DECOR_STYLES: TemplateStyle[] = ['t_redakciya', 't_perepiska', 't_plakat', 't_stikery', 't_citata', 't_slovar', 't_premium', 't_mono', 't_vozduh']

// ---- контраст (WCAG) ----
function lum(hex: string): number {
  const m = hex.replace('#', '').match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i)
  if (!m) return 0
  const [r, g, b] = m.slice(1).map(x => {
    const c = parseInt(x, 16) / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
export function contrast(a: string, b: string): number {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}
export const isHex = (s: unknown): s is string => typeof s === 'string' && /^#[0-9a-f]{6}$/i.test(s)
export const isDark = (hex: string) => lum(hex) < 0.18

// Смешать два цвета (для второго фона, линий и подложек)
export function mix(a: string, b: string, t: number): string {
  const pa = a.slice(1).match(/.{2}/g)!.map(x => parseInt(x, 16))
  const pb = b.slice(1).match(/.{2}/g)!.map(x => parseInt(x, 16))
  return '#' + pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, '0')).join('')
}

export function parsePalette(v: unknown): Partial<Palette> | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  const out: Partial<Palette> = {}
  if (isHex(o.bg)) out.bg = o.bg
  if (isHex(o.text)) out.text = o.text
  if (isHex(o.accent)) out.accent = o.accent
  return Object.keys(out).length ? out : null
}

// Итоговые цвета: свои поверх цветов стиля, текст всегда читается (контраст от 4.5),
// акцент от 3 к фону, иначе берется цвет текста. notes: что пришлось поправить.
export function resolvePalette(style: TemplateStyle, custom?: Partial<Palette> | null): { pal: Palette; notes: string[] } {
  const base = STYLES[style].palette
  const pal: Palette = { bg: custom?.bg || base.bg, text: custom?.text || base.text, accent: custom?.accent || base.accent }
  const notes: string[] = []
  if (contrast(pal.text, pal.bg) < 4.5) {
    const alt = contrast('#111111', pal.bg) >= contrast('#FFFFFF', pal.bg) ? '#111111' : '#FFFFFF'
    if (custom?.text) notes.push('Текст плохо читался на этом фоне, поставила ' + (alt === '#111111' ? 'темный' : 'светлый'))
    pal.text = alt
  }
  if (STYLES[style].accentSurface) {
    // акцент тут поверхность (стикер): подбираем оттенок акцента, на котором текст читается. Молча:
    // это подстройка стиля под палитру, а не ошибка психолога
    const toward = isDark(pal.text) ? '#FFFFFF' : '#000000'
    const pick = [pal.accent, mix(pal.accent, toward, 0.45), mix(pal.accent, toward, 0.7), mix(pal.accent, toward, 0.9)]
      .find(c => contrast(pal.text, c) >= 4.5)
    pal.accent = pick || (isDark(pal.text) ? '#FFFFFF' : '#111111')
    return { pal, notes }
  }
  if (contrast(pal.accent, pal.bg) < 3) {
    if (custom?.accent) notes.push('Акцент сливался с фоном, выделяю цветом текста')
    pal.accent = pal.text
  }
  return { pal, notes }
}

// Кегль по длине: 100%, 90%, 80%; дальше «слайд длинноват»
export function fitScale(len: number, limit: number): { scale: number; overflow: boolean } {
  if (len <= limit) return { scale: 1, overflow: false }
  if (len <= limit / 0.81) return { scale: 0.9, overflow: false }
  if (len <= limit / 0.64) return { scale: 0.8, overflow: false }
  return { scale: 0.8, overflow: true }
}

// Строка о себе на финале: почти цветом текста, контраст к фону от 4.5 (серая бледная не читалась с телефона)
export function aboutInk(p: Palette, bg: string): string {
  for (const t of [0.12, 0.06, 0]) { const c = mix(p.text, bg, t); if (contrast(c, bg) >= 4.5) return c }
  return p.text
}

// Заметки iPhone: цвета сняты пипеткой со скринов (test/karuseli/zametki-ref). Свои цвета у этого стиля не применяются,
// иначе он перестает узнаваться. Тема светлая или темная (options.theme)
export const ZAMETKI_THEMES = {
  light: { bg: '#FFFFFF', text: '#444444', accent: '#E3AA00', ui: '#000000', date: '#8A8A8E', circle: '#C0C0C0' },
  dark: { bg: '#1E1E1E', text: '#F2F2F2', accent: '#F2BB4B', ui: '#FFFFFF', date: '#818181', circle: '#5A5A5E' },
} as const
