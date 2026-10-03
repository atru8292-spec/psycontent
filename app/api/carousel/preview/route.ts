// Превью стиля на обложке этой карусели, до выбора стиля. Без модели: обложка целиком крупно.
import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/generation/db'
import { isTemplateStyle, parsePalette, VARIANTS } from '@/lib/carousel/styles'
import { loadBranding, loadImages, normDecor, renderPng, variantFor } from '@/lib/carousel/server'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const sp = req.nextUrl.searchParams
  const style = sp.get('style')
  const cover = String(sp.get('cover') || '').replace(/\s+/g, ' ').trim().slice(0, 160)
  // single=1: обложка к посту, один слайд без номеров и стрелок
  const single = sp.get('single') === '1'
  const total = single ? 1 : Math.min(12, Math.max(2, Number(sp.get('total') || '7')))
  // свои цвета из адреса (bg, text, accent без #), иначе ее цвета из профиля
  const fromUrl = parsePalette({ bg: sp.get('bg') ? `#${sp.get('bg')}` : null, text: sp.get('text') ? `#${sp.get('text')}` : null, accent: sp.get('accent') ? `#${sp.get('accent')}` : null })
  if (!isTemplateStyle(style) || !cover) return NextResponse.json({ error: 'Нет стиля или обложки' }, { status: 400 })
  const db = getSupabaseAdmin()
  const branding = await loadBranding(db, user.id)
  // mine=1: в «моем оформлении» (секция в настройках), стиль из адреса должен с ним совпадать
  const mine = sp.get('mine') === '1' && branding.myDesign?.style === style ? branding.myDesign : null
  const images = await loadImages(db, branding, style, mine?.options)
  // final=1: финал «кто я» (имя, строка о себе, ник) с текстом из cover вместо обложки
  const final = sp.get('final') === '1' && !single
  let png: ArrayBuffer
  try {
  png = await renderPng({
    style,
    slide: final ? { n: total, role: 'final', big: cover, small: '', accent: null, photo: false } : { n: 1, role: 'cover', big: cover, small: '', accent: null, photo: true },
    total,
    colors: mine ? mine.colors : sp.get('own') === '0' ? null : fromUrl || branding.palette,
    variant: mine ? mine.variant : sp.has('variant') ? Math.max(0, Math.min(VARIANTS - 1, Number(sp.get('variant')) || 0)) : variantFor(user.id + style),
    decor: mine ? mine.decor : sp.has('decor') ? normDecor(sp.get('decor')) : branding.decor,
    fontPair: mine?.fontPair,
    opts: mine?.options,
    branding,
    images,
  })
  } catch (e: any) {
    console.error('carousel preview:', e?.message)
    return NextResponse.json({ error: 'Не получилось нарисовать обложку' }, { status: 500 })
  }
  const headers: Record<string, string> = { 'Content-Type': 'image/png', 'Cache-Control': 'private, max-age=3600' }
  if (sp.get('dl') === '1') headers['Content-Disposition'] = 'attachment; filename="oblozhka.png"'
  return new NextResponse(png, { headers })
}
