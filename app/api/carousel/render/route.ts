// PNG одного слайда оформленной карусели. Превью и скачивание показывают одно и то же.
import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/generation/db'
import { loadBranding, loadDesign, loadImages, renderPng, isLongCarousel } from '@/lib/carousel/server'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const sp = req.nextUrl.searchParams
  const designId = sp.get('designId') || ''
  const n = Number(sp.get('n') || '1')
  const db = getSupabaseAdmin()
  const d = await loadDesign(db, user.id, { id: designId })
  if (!d) return NextResponse.json({ error: 'Оформление не найдено' }, { status: 404 })
  const slide = d.layout.find(s => s.n === n)
  if (!slide) return NextResponse.json({ error: 'Нет такого слайда' }, { status: 404 })
  const branding = await loadBranding(db, user.id)
  const images = await loadImages(db, branding, d.style, d.options)
  try {
    const png = await renderPng({ style: d.style, slide, total: d.layout.length, colors: d.colors, variant: d.variant, decor: d.decor, long: isLongCarousel(d.layout), all: d.layout, fontPair: d.font_pair, opts: d.options, branding, images })
    return new NextResponse(png, {
      headers: {
        'Content-Type': 'image/png',
        // адрес меняется с каждой правкой (v=updated_at), поэтому можно кешировать
        'Cache-Control': 'private, max-age=86400',
        // dl=1: скачать этот слайд файлом 01.png (кнопка «Скачать только этот»), иначе показать
        'Content-Disposition': `${sp.get('dl') === '1' ? 'attachment' : 'inline'}; filename="${String(n).padStart(2, '0')}.png"`,
      },
    })
  } catch (e: any) {
    console.error('carousel render:', e?.message)
    return NextResponse.json({ error: 'Не получилось нарисовать слайд' }, { status: 500 })
  }
}
