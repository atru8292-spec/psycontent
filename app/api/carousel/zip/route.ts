// Все слайды одним архивом плюс описание к публикации текстом.
import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/generation/db'
import { loadBranding, loadDesign, loadImages, renderPng, isLongCarousel } from '@/lib/carousel/server'
import { makeZip } from '@/lib/carousel/zip'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const db = getSupabaseAdmin()
  const d = await loadDesign(db, user.id, { id: req.nextUrl.searchParams.get('designId') || '' })
  if (!d) return NextResponse.json({ error: 'Оформление не найдено' }, { status: 404 })
  const branding = await loadBranding(db, user.id)
  const images = await loadImages(db, branding, d.style, d.options)
  const files: { name: string; data: Uint8Array }[] = []
  for (const slide of d.layout) {
    const png = await renderPng({ style: d.style, slide, total: d.layout.length, colors: d.colors, variant: d.variant, decor: d.decor, long: isLongCarousel(d.layout), all: d.layout, fontPair: d.font_pair, opts: d.options, branding, images })
    // 01.png, 02.png: в галерее и в Instagram встают по порядку
    files.push({ name: `${String(slide.n).padStart(2, '0')}.png`, data: new Uint8Array(png) })
  }
  if (d.caption) files.push({ name: 'opisanie.txt', data: new TextEncoder().encode(d.caption) })
  const zip = makeZip(files)
  return new NextResponse(Buffer.from(zip), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': 'attachment; filename="karusel.zip"',
      'Cache-Control': 'no-store',
    },
  })
}
