// Серверная часть каруселей: загрузка материала и оформления, фото из хранилища, рендер PNG.
import type { SupabaseClient } from '@supabase/supabase-js'
import { ImageResponse } from 'next/og'
import { fontsFor, paperDataUrl, chalkDataUrl } from './fonts'
import { renderSlide, W, H } from './slides'
import { fitCarousel, type DesignOptions } from './spec'
import { PAIRS, normPair } from './pairs'
import { STYLES, VARIANTS, DECOR_STYLES, isDecor, isTemplateStyle, parsePalette, resolvePalette, type Decor, type Palette, type TemplateStyle } from './styles'
import type { SlideLayout } from './layout'

export const PHOTO_BUCKET = 'user-photos'
export const MAX_PHOTOS = 6

export type Design = {
  id: string
  user_id: string
  post_id: string
  style: TemplateStyle
  colors: Partial<Palette> | null   // свои цвета психолога поверх цветов стиля
  variant: number                   // вариант компоновки 0..VARIANTS-1
  decor: Decor                      // узор на фоне: ленты или линии, идет через все слайды
  font_pair: number                 // шрифтовая пара стиля 0..2 (pairs.ts), нет поля в базе: 0
  options: DesignOptions            // вид акцента, крупные номера, рубрика, фото на обложке; нет поля в базе: {}
  tunable: boolean                  // в базе есть font_pair и options (миграция 20261003100000 применена)
  layout: SlideLayout[]
  caption: string
  source_text: string
  updated_at: string
}

export type Branding = {
  about: string                     // строка о себе для финала «кто я»
  handle: string
  name: string
  avatarPath: string | null
  photoPaths: string[]
  palette: Partial<Palette> | null  // ее цвета, переходят в новые карусели
  decor: Decor                      // ее узор, тоже переходит в новые карусели
  fullName: string                  // имя из профиля (подставляется, если имя для слайдов не задано)
  aboutSet: boolean                 // строку о себе задала сама (иначе собрана из ниши)
  nameSet: boolean
  myDesign: MyDesign | null         // «мое оформление»: новые карусели открываются в нем
  canSaveMine: boolean              // в профиле есть поля «моего оформления» (миграция применена)
  tone: { intensity: string | null; profanity: string | null }
}

// «Мое оформление»: стиль и вид, в котором открывается каждая новая карусель
export type MyDesign = { style: TemplateStyle; colors: Partial<Palette> | null; variant: number; decor: Decor; fontPair: number; options: DesignOptions }
export function normMyDesign(v: unknown): MyDesign | null {
  const o = (v && typeof v === 'object' ? v : null) as Record<string, unknown> | null
  if (!o || !isTemplateStyle(o.style)) return null
  return { style: o.style, colors: parsePalette(o.colors), variant: normVariant(o.variant), decor: normDecor(o.decor), fontPair: normPair(o.fontPair), options: normOptions(o.options) }
}
// оформление карусели совпадает с моим (тогда кнопку «Оставить этот вид» не показываем)
export function sameAsMine(d: Design, m: MyDesign | null): boolean {
  if (!m) return false
  const pal = (x: Partial<Palette> | null) => JSON.stringify(x ? { bg: x.bg?.toLowerCase(), text: x.text?.toLowerCase(), accent: x.accent?.toLowerCase() } : null)
  return d.style === m.style && pal(d.colors) === pal(m.colors) && normVariant(d.variant) === m.variant && normDecor(d.decor) === m.decor &&
    normPair(d.font_pair) === m.fontPair && JSON.stringify(normOptions(d.options)) === JSON.stringify(m.options)
}

// Строка о себе для финала по умолчанию: «Психолог, работаю с ...» из одной ниши профиля
export function defaultAbout(p: any): string {
  const niche = String(p?.one_niche || '').trim() || (Array.isArray(p?.niches) ? p.niches.filter(Boolean).join(', ') : '')
  if (!niche) return 'Психолог'
  const n = niche.replace(/\s+/g, ' ').replace(/[.。]+$/, '')
  return /^(работаю|помогаю)/i.test(n) ? `Психолог, ${n.charAt(0).toLowerCase()}${n.slice(1)}` : `Психолог, работаю с темой: ${n.charAt(0).toLowerCase()}${n.slice(1)}`
}

export async function loadBranding(db: SupabaseClient, userId: string): Promise<Branding> {
  // через * : новые поля «Мое оформление» (миграция может быть еще не применена) не ломают запрос
  const { data: p } = await db.from('onboarding_profiles').select('*').eq('user_id', userId).maybeSingle()
  const fullName = String(p?.full_name || '').trim()
  return {
    about: String(p?.carousel_about || '').trim() || defaultAbout(p),
    handle: String(p?.instagram_handle || '').replace(/^@/, '').trim(),
    name: String(p?.carousel_name || '').trim() || fullName,
    fullName,
    aboutSet: !!String(p?.carousel_about || '').trim(),
    nameSet: !!String(p?.carousel_name || '').trim(),
    myDesign: normMyDesign(p?.carousel_my_design),
    canSaveMine: !!p && 'carousel_my_design' in p,
    tone: { intensity: p?.intensity ?? null, profanity: p?.profanity ?? null },
    avatarPath: p?.avatar_path || null,
    photoPaths: Array.isArray(p?.carousel_photos) ? p!.carousel_photos.filter((x: unknown) => typeof x === 'string').slice(0, MAX_PHOTOS) : [],
    palette: parsePalette(p?.carousel_palette),
    decor: normDecor(p?.carousel_decor),
  }
}

// Файл из приватного бакета как data URL (Satori принимает картинки так).
// Путь у каждой загрузки свой (с меткой времени), поэтому кеш в памяти безопасен: слайдов много, фото одни.
const photoCache = new Map<string, string>()
async function photoDataUrl(db: SupabaseClient, path: string): Promise<string | null> {
  const hit = photoCache.get(path)
  if (hit) return hit
  try {
    const { data, error } = await db.storage.from(PHOTO_BUCKET).download(path)
    if (error || !data) return null
    const buf = Buffer.from(await data.arrayBuffer())
    const type = data.type && data.type.startsWith('image/') ? data.type : 'image/jpeg'
    const url = `data:${type};base64,${buf.toString('base64')}`
    if (photoCache.size >= 60) photoCache.delete(photoCache.keys().next().value as string)
    photoCache.set(path, url)
    return url
  } catch { return null }
}

export async function loadImages(db: SupabaseClient, b: Branding, style: TemplateStyle, opts?: DesignOptions) {
  const needPhotos = style === 't_premium' || style === 't_skrapbuk' || !!opts?.coverPhoto
  const [photos, avatar, paper, chalk] = await Promise.all([
    needPhotos ? Promise.all(b.photoPaths.map(p => photoDataUrl(db, p))) : Promise.resolve([]),
    b.avatarPath ? photoDataUrl(db, b.avatarPath) : Promise.resolve(null), // аватар нужен финалу «кто я» в любом стиле
    style === 't_zapiska' ? paperDataUrl() : Promise.resolve(null),
    style === 't_doska' ? chalkDataUrl() : Promise.resolve(null),
  ])
  return { photos: (photos as (string | null)[]).filter((x): x is string => !!x), avatar, paper, chalk }
}

export async function renderPng(args: {
  style: TemplateStyle
  slide: SlideLayout
  total: number
  colors: Partial<Palette> | null
  variant?: number
  decor?: Decor
  long?: boolean
  all?: SlideLayout[]
  fontPair?: number
  opts?: DesignOptions
  branding: Branding
  images: { photos: string[]; avatar: string | null; paper: string | null; chalk?: string | null }
}): Promise<ArrayBuffer> {
  const { pal } = resolvePalette(args.style, args.colors)
  const el = renderSlide({
    style: args.style,
    slide: args.slide,
    total: args.total,
    pal,
    handle: args.branding.handle,
    name: args.branding.name,
    about: args.branding.about,
    signature: true,
    avatar: args.images.avatar,
    photos: args.images.photos,
    paper: args.images.paper,
    chalk: args.images.chalk || null,
    variant: args.variant || 0,
    decor: args.decor || 'none',
    long: !!args.long,
    all: args.all,
    fontPair: args.fontPair || 0,
    opts: args.opts,
  })
  const res = new ImageResponse(el, { width: W, height: H, fonts: await fontsFor(args.style) })
  return res.arrayBuffer()
}

export async function loadDesign(db: SupabaseClient, userId: string, where: { id?: string; postId?: string }): Promise<Design | null> {
  let q = db.from('carousel_designs').select('*').eq('user_id', userId)
  q = where.id ? q.eq('id', where.id) : q.eq('post_id', where.postId as string)
  const { data } = await q.maybeSingle()
  if (!data || !isTemplateStyle(data.style)) return null
  return { ...data, colors: parsePalette(data.colors), variant: normVariant(data.variant), decor: normDecor(data.decor), font_pair: normPair(data.font_pair), options: normOptions(data.options), tunable: 'font_pair' in data && 'options' in data, layout: Array.isArray(data.layout) ? data.layout : [] } as Design
}

// Версия данных автора на слайдах: ник, имя, строка о себе, фото. Входит в адрес картинок,
// иначе браузер покажет из кеша слайды со старым ником (render кешируется на сутки)
export function brandVersion(b: Branding): string {
  let h = 0
  for (const ch of [b.handle, b.name, b.about, b.avatarPath || '', ...b.photoPaths].join('|')) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return h.toString(36)
}

// То, что фронт показывает про оформление: слайды, «длинноват», чего не хватает стилю
export function designView(d: Design, b: Branding) {
  const meta = STYLES[d.style]
  const { pal, notes } = resolvePalette(d.style, d.colors)
  return {
    id: d.id,
    postId: d.post_id,
    style: d.style,
    palette: pal,
    custom: !!d.colors,
    colorNotes: notes,
    variant: normVariant(d.variant),
    decor: normDecor(d.decor),
    fontPair: normPair(d.font_pair),
    options: normOptions(d.options),
    fontPairs: PAIRS[d.style].map(p => p.label),
    tunable: d.tunable,
    isMine: sameAsMine(d, b.myDesign),
    hasMine: !!b.myDesign,
    canSaveMine: b.canSaveMine,
    name: b.name,
    about: b.about,
    decorAllowed: DECOR_STYLES.includes(d.style),
    caption: d.caption,
    sourceText: d.source_text,
    version: `${d.updated_at}-${brandVersion(b)}`,
    handle: b.handle,
    photosCount: b.photoPaths.length,
    hasAvatar: !!b.avatarPath,
    needsPhotos: meta.photos === 'required' && b.photoPaths.length === 0,
    // «Слайд длинноват» по настоящему замеру: не влез даже на минимуме или заметно длиннее соседей (кнопка «Разделить на два слайда»)
    slides: (() => {
      const fits = fitCarousel(d.style, d.layout, { variant: normVariant(d.variant), long: isLongCarousel(d.layout), hasPhotos: b.photoPaths.length > 0, hasAvatar: !!b.avatarPath, fontPair: normPair(d.font_pair), opts: normOptions(d.options) })
      return d.layout.map((s, i) => ({ ...s, overflow: !!fits[i]?.tooLong }))
    })(),
  }
}

// длинный слайд в карусели: центрованные компоновки уходят влево для всей карусели сразу
export const LONG_SMALL = 160
export const isLongCarousel = (layout: SlideLayout[]) => layout.some(s => (s.small || '').length > LONG_SMALL)
export const normDecor = (v: unknown): Decor => (isDecor(v) ? v : 'none')
export const normVariant = (v: unknown) => { const n = Number(v); return Number.isInteger(n) && n >= 0 && n < VARIANTS ? n : 0 }
// Вариант по умолчанию у каждого психолога свой: одинаковый стиль у разных людей выглядит по-разному
export const variantFor = (seed: string) => { let h = 0; for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h % VARIANTS }

export const isCarouselPost = (row: any) =>
  row && (row.format_code === 'carousel' || row.format === 'carousel' || row.format === 'rewrite_carousel')

// options из базы: только известные ключи, мусор отбрасываем
export function normOptions(v: unknown): DesignOptions {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
  const out: DesignOptions = {}
  if (o.accentKind === 'marker' || o.accentKind === 'underline' || o.accentKind === 'color') out.accentKind = o.accentKind
  if (o.bigNumbers === true) out.bigNumbers = true
  if (o.coverPhoto === true) out.coverPhoto = true
  if (typeof o.rubric === 'string' && o.rubric.trim()) out.rubric = o.rubric.trim().slice(0, 32)
  if (o.theme === 'dark' || o.theme === 'light') out.theme = o.theme
  return out
}
