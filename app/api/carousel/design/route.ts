// Оформление карусели (07-KARUSELI-TZ.md): выбрать стиль, поправить слайд, акцент, тему, ник.
// GET ?postId: текущее оформление, три подходящих стиля и «мое оформление».
// POST: разложить текст (П7) в выбранный стиль или сразу в «мое оформление» (useMine).
// PATCH: правки карусели (слайд, разделить слайд, цвета, шрифт, вид), «оставить этот вид», данные автора, отметка сохранения.
// Поля миграции 20261003100000 (font_pair, options, export_*, carousel_name, carousel_about, carousel_my_design) необязательны:
// без нее запись идет без них, а фронт прячет то, что без них не работает (designView.tunable, canSaveMine).
import { serverTrack } from '@/lib/track-server'
import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getSessionUser } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/generation/db'
import { parseCarouselText, carouselToText } from '@/lib/carousel/parse'
import { layoutWithModel, isHeavy, norm, fallbackSlide, withRhythm, slideTextOf, type SlideLayout } from '@/lib/carousel/layout'
import { STYLES, isTemplateStyle, parsePalette } from '@/lib/carousel/styles'
import { splitSlideText } from '@/lib/carousel/spec'
import { parseDialog } from '@/lib/carousel/dialog'
import { normPair } from '@/lib/carousel/pairs'
import { suggestStyles } from '@/lib/carousel/suggest'
import { brandVersion, loadBranding, loadDesign, designView, isCarouselPost, normDecor, normVariant, normOptions, variantFor, type Design } from '@/lib/carousel/server'

export const runtime = 'nodejs'
export const maxDuration = 60

const EXTRA = ['font_pair', 'options', 'export_count', 'exported_at', 'export_method']
// колонки нет в базе (миграция не применена): PostgREST отвечает PGRST204, Postgres 42703
const missingColumn = (e: any) => !!e && (e.code === 'PGRST204' || e.code === '42703')
const strip = (row: Record<string, any>) => Object.fromEntries(Object.entries(row).filter(([k]) => !EXTRA.includes(k)))
// запись в carousel_designs с новыми полями, а если их еще нет в базе, без них
async function saveDesign(run: (row: Record<string, any>) => PromiseLike<{ data: any; error: any }>, row: Record<string, any>) {
  let r = await run(row)
  if (r.error && missingColumn(r.error)) r = await run(strip(row))
  return r
}
const viewOf = (saved: any, b: Awaited<ReturnType<typeof loadBranding>>) =>
  designView({ ...saved, colors: parsePalette(saved.colors), decor: normDecor(saved.decor), font_pair: normPair(saved.font_pair), options: normOptions(saved.options),
    tunable: 'font_pair' in saved && 'options' in saved, layout: Array.isArray(saved.layout) ? saved.layout : [] } as Design, b)

export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const postId = req.nextUrl.searchParams.get('postId') || ''
  const db = getSupabaseAdmin()
  // без материала: только «мое оформление» и данные автора (секция в настройках)
  if (!postId) {
    const b = await loadBranding(db, user.id)
    return NextResponse.json({ design: null, mine: b.myDesign ? { style: b.myDesign.style, label: STYLES[b.myDesign.style].label } : null, canSaveMine: b.canSaveMine,
      handle: b.handle, author: { name: b.name, about: b.about, nameSet: b.nameSet, aboutSet: b.aboutSet }, brandVersion: brandVersion(b) })
  }
  const [d, b, post] = await Promise.all([
    loadDesign(db, user.id, { postId }),
    loadBranding(db, user.id),
    db.from('generated_posts').select('content').eq('id', postId).eq('user_id', user.id).maybeSingle().then(r => r.data),
  ])
  return NextResponse.json({
    design: d ? designView(d, b) : null,
    handle: b.handle, photosCount: b.photoPaths.length, hasAvatar: !!b.avatarPath, brandVersion: brandVersion(b),
    // три стиля под тон текста: первым экраном вместо сетки из 14
    suggested: suggestStyles(String(post?.content || ''), b.tone),
    mine: b.myDesign ? { style: b.myDesign.style } : null,
    canSaveMine: b.canSaveMine,
    author: { name: b.name, about: b.about, nameSet: b.nameSet, aboutSet: b.aboutSet },
  })
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const postId = typeof body?.postId === 'string' ? body.postId : ''
  const db = getSupabaseAdmin()
  const branding = await loadBranding(db, user.id)
  // «мое оформление»: новая карусель открывается сразу в нем
  const mine = body?.useMine === true ? branding.myDesign : null
  const style = mine ? mine.style : body?.style
  if (!postId || !isTemplateStyle(style)) return NextResponse.json({ error: 'Нет материала или стиля' }, { status: 400 })

  const { data: post } = await db.from('generated_posts').select('id, content, format, format_code, plan').eq('id', postId).eq('user_id', user.id).maybeSingle()
  if (!post) return NextResponse.json({ error: 'Материал не найден' }, { status: 404 })
  if (!isCarouselPost(post)) return NextResponse.json({ error: 'Это не карусель' }, { status: 400 })

  const text = typeof body?.text === 'string' && body.text.trim() ? body.text.slice(0, 12000) : String(post.content || '')
  const { slides, caption } = parseCarouselText(text)
  if (slides.length < 2) return NextResponse.json({ error: 'Не нашла в тексте слайды. Нужны строки «Слайд 1: ...»' }, { status: 400 })

  const existing = await loadDesign(db, user.id, { postId })
  const meta = STYLES[style]

  // Текст тот же: раскладку не пересчитываем, только места для фото под новый стиль
  let layout = existing && norm(existing.source_text) === norm(text) && existing.layout.length === slides.length ? existing.layout : null
  if (layout) {
    layout = layout.map(s => ({ ...s, photo: meta.photos !== 'none' && (s.photo || s.n === 1) }))
  } else {
    const r = await layoutWithModel({ slides, style, heavy: isHeavy(post.plan?.risks), userId: user.id })
    layout = r.layout
  }

  // вид: из «моего оформления»; иначе цвета этой карусели, ее цвета из профиля, цвета стиля
  const colors = mine ? mine.colors : existing ? existing.colors : branding.palette
  // компоновка: как на превью этого стиля, если стиль сменили; своя, если уже крутила
  const variant = mine ? mine.variant : existing && existing.style === style ? existing.variant : variantFor(user.id + style)
  const decor = mine ? mine.decor : existing ? existing.decor : branding.decor
  const font_pair = mine ? mine.fontPair : existing && existing.style === style ? existing.font_pair : 0
  const options = mine ? mine.options : existing ? existing.options : {}

  const row = {
    user_id: user.id, post_id: postId, kind: 'template', style, colors, variant, decor, font_pair, options,
    layout, caption, source_text: text, status: 'ready', updated_at: new Date().toISOString(),
  }
  const { data: saved, error } = await saveDesign(r => db.from('carousel_designs').upsert(r, { onConflict: 'post_id' }).select('*').single(), row)
  if (error || !saved) {
    console.error('carousel design save:', error?.message)
    return NextResponse.json({ error: 'Не получилось сохранить оформление' }, { status: 500 })
  }
  return NextResponse.json({ design: viewOf({ ...saved, layout }, branding) })
}

// Разделить слайд на два по границе фразы (реплики диалога по репликам). Без модели, бесплатно.
function splitLayout(d: Design, n: number): SlideLayout[] | null {
  const s = d.layout.find(x => x.n === n)
  // обложку и финал не делим: у них своя раскладка
  if (!s || n === 1 || n === d.layout.length) return null
  const parts = splitSlideText(slideTextOf(s))
  if (!parts) return null
  const texts = d.layout.flatMap(x => (x.n === n ? parts : [slideTextOf(x)]))
  const total = texts.length
  const out: SlideLayout[] = []
  let k = 0
  for (const x of d.layout) {
    if (x.n === n) {
      // новые половинки раскладывает код, как запасная раскладка; роль у середины карусели не обложка и не финал
      for (const t of parts) { const f = fallbackSlide(t, Math.max(1, Math.min(total - 2, k)), total, d.style); out.push({ ...f, n: k + 1, photo: x.photo && k === n - 1 }); k++ }
    } else {
      out.push({ ...x, n: k + 1, role: k === total - 1 && x.role === 'final' ? 'final' : x.role }); k++
    }
  }
  return withRhythm(out)
}

// Правка одного слайда. У диалога одно поле: реплики «А: …» и «Б: …» построчно.
function editLayout(d: Design, n: number, big: string, small: string): SlideLayout[] | null {
  const s = d.layout.find(x => x.n === n)
  if (!s) return null
  return withRhythm(d.layout.map(x => {
    if (x.n !== n) return x
    const whole = [big, small].filter(Boolean).join('\n')
    // финал «кто я» раскладывает сам: весь текст призыва одной строкой
    if (x.role === 'final' && x.n === d.layout.length) return { ...x, big: norm(`${big} ${small}`), small: '', accent: null }
    if (x.n !== 1 && x.n !== d.layout.length && parseDialog(whole)) return { ...x, role: 'dialog' as const, big: '', small: whole, accent: null }
    // был диалог, а стал обычный текст: раскладываем кодом
    if (x.role === 'dialog') return { ...fallbackSlide(whole, n - 1, d.layout.length, d.style), photo: x.photo }
    const accent = x.accent && (big.includes(x.accent) || small.includes(x.accent)) ? x.accent : null
    return { ...x, big, small, accent }
  }))
}

async function updateProfile(db: SupabaseClient, userId: string, patch: Record<string, any>) {
  const { error } = await db.from('onboarding_profiles').update(patch).eq('user_id', userId)
  if (error) console.error('carousel profile update:', error.message)
  return !error
}

export async function PATCH(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const db = getSupabaseAdmin()
  let branding = await loadBranding(db, user.id)

  // ник печатается на всех слайдах, хранится в профиле
  if (typeof body?.handle === 'string') {
    const handle = body.handle.replace(/^@/, '').replace(/[^a-zA-Z0-9._]/g, '').slice(0, 30)
    await updateProfile(db, user.id, { instagram_handle: handle || null })
  }
  // имя и строка о себе на обложке и в финале: только если поля уже есть в базе
  if (branding.canSaveMine && (typeof body?.name === 'string' || typeof body?.about === 'string')) {
    const p: Record<string, any> = {}
    if (typeof body.name === 'string') p.carousel_name = body.name.replace(/\s+/g, ' ').trim().slice(0, 60) || null
    if (typeof body.about === 'string') p.carousel_about = body.about.replace(/\s+/g, ' ').trim().slice(0, 90) || null
    await updateProfile(db, user.id, p)
  }

  const designId = typeof body?.designId === 'string' ? body.designId : ''
  if (!designId) {
    branding = await loadBranding(db, user.id)
    return NextResponse.json({ ok: true, author: { name: branding.name, about: branding.about, nameSet: branding.nameSet, aboutSet: branding.aboutSet }, handle: branding.handle })
  }
  const d = await loadDesign(db, user.id, { id: designId })
  if (!d) return NextResponse.json({ error: 'Оформление не найдено' }, { status: 404 })

  // отметка сохранения сама по себе адрес слайдов не меняет: иначе после нее все слайды перерисуются зря
  const onlyExport = typeof body?.exported === 'string' && Object.keys(body).every(k => k === 'exported' || k === 'designId')
  if (onlyExport) {
    if (!['share', 'zip', 'single', 'list'].includes(body.exported)) return NextResponse.json({ ok: false }, { status: 400 })
    // без миграции колонок нет: молча пропускаем, сохранению слайдов это не мешает
    const { error } = await db.from('carousel_designs').update({ export_count: (Number((d as any).export_count) || 0) + 1, exported_at: new Date().toISOString(), export_method: body.exported })
      .eq('id', d.id).eq('user_id', user.id)
    if (error && !missingColumn(error)) console.error('carousel export mark:', error.message)
    serverTrack(user.id, 'material_take', { how: body.exported, format: 'carousel', post: (d as any).post_id })
    return NextResponse.json({ ok: true })
  }
  const patch: Record<string, any> = { updated_at: new Date().toISOString() }
  let layout: SlideLayout[] | null = null

  if (body?.edit && typeof body.edit === 'object') {
    const big = String(body.edit.big ?? '').slice(0, 600).trim()
    const small = String(body.edit.small ?? '').slice(0, 2000).trim()
    if (!big && !small) return NextResponse.json({ error: 'Пустой слайд не сохраню' }, { status: 400 })
    layout = editLayout(d, Number(body.edit.n), big, small)
    if (!layout) return NextResponse.json({ error: 'Нет такого слайда' }, { status: 400 })
  }
  if (body?.split != null) {
    if (d.layout.length >= 20) return NextResponse.json({ error: 'Слайдов уже двадцать, Instagram больше не возьмет' }, { status: 400 })
    layout = splitLayout(d, Number(body.split))
    if (!layout) return NextResponse.json({ error: 'Тут одна фраза, делить не по чему. Сократи ее' }, { status: 400 })
  }
  if (layout) {
    patch.layout = layout
    // правка на превью попадает и в текст материала: так ее увидит память голоса при копировании
    patch.source_text = carouselToText(layout.map(slideTextOf), d.caption)
  }
  if (body && 'variant' in body) patch.variant = normVariant(body.variant)
  if (body && 'fontPair' in body) patch.font_pair = normPair(body.fontPair)
  if (body?.options && typeof body.options === 'object') patch.options = normOptions({ ...d.options, ...body.options })
  // узор фона и свои цвета: в этой карусели. Ее последний выбор запоминаем в профиле, пока «моего оформления» нет
  if (body && 'decor' in body) {
    patch.decor = normDecor(body.decor)
    if (!branding.myDesign) await updateProfile(db, user.id, { carousel_decor: patch.decor })
  }
  if (body && 'colors' in body) {
    patch.colors = body.colors === null ? null : parsePalette(body.colors)
    if (!branding.myDesign) await updateProfile(db, user.id, { carousel_palette: patch.colors })
  }
  // отметка сохранения: как узнаем, что слайды забирают (поле из миграции, без нее молча пропускаем)
  if (typeof body?.exported === 'string' && ['share', 'zip', 'single', 'list'].includes(body.exported)) {
    patch.export_count = (Number((d as any).export_count) || 0) + 1
    patch.exported_at = new Date().toISOString()
    patch.export_method = body.exported
    serverTrack(user.id, 'material_take', { how: body.exported, format: 'carousel', post: (d as any).post_id })
  }

  const { data: saved, error } = await saveDesign(r => db.from('carousel_designs').update(r).eq('id', d.id).eq('user_id', user.id).select('*').single(), patch)
  if (error || !saved) return NextResponse.json({ error: 'Не получилось сохранить' }, { status: 500 })

  // «Оставить этот вид»: вид этой карусели становится моим оформлением, новые карусели откроются в нем
  if (body?.makeMine === true) {
    if (!branding.canSaveMine) return NextResponse.json({ error: 'Запомнить вид пока нельзя: база еще не обновлена' }, { status: 409 })
    const mine = { style: saved.style, colors: parsePalette(saved.colors), variant: normVariant(saved.variant), decor: normDecor(saved.decor), fontPair: normPair(saved.font_pair), options: normOptions(saved.options) }
    const ok = await updateProfile(db, user.id, { carousel_my_design: mine, carousel_palette: mine.colors, carousel_decor: mine.decor })
    if (!ok) return NextResponse.json({ error: 'Не получилось запомнить вид' }, { status: 500 })
  }
  branding = await loadBranding(db, user.id)
  return NextResponse.json({ design: viewOf(saved, branding), text: patch.source_text ?? null, mine: branding.myDesign ? { style: branding.myDesign.style } : null })
}
