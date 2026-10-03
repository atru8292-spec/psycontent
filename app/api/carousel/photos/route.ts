// Фото психолога для каруселей: из жизни (до 6, для «Премиум» и «Скрапбук») и аватар («Записка»).
// Бакет приватный, путь user_id/..., загружает и отдает только сервер. Фото уже уменьшено в браузере.
import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/generation/db'
import { loadBranding, PHOTO_BUCKET, MAX_PHOTOS } from '@/lib/carousel/server'

export const runtime = 'nodejs'
const MAX_BYTES = 4 * 1024 * 1024

async function signed(db: ReturnType<typeof getSupabaseAdmin>, paths: string[]) {
  if (!paths.length) return [] as { path: string; url: string }[]
  const { data } = await db.storage.from(PHOTO_BUCKET).createSignedUrls(paths, 3600)
  return (data || []).filter(x => x.signedUrl).map(x => ({ path: x.path as string, url: x.signedUrl as string }))
}

export async function GET() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const db = getSupabaseAdmin()
  const b = await loadBranding(db, user.id)
  const [photos, avatar] = await Promise.all([signed(db, b.photoPaths), signed(db, b.avatarPath ? [b.avatarPath] : [])])
  return NextResponse.json({ photos, avatar: avatar[0] || null })
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  const kind = form?.get('kind') === 'avatar' ? 'avatar' : 'photo'
  if (!(file instanceof Blob)) return NextResponse.json({ error: 'Нет файла' }, { status: 400 })
  if (!['image/jpeg', 'image/png'].includes(file.type)) return NextResponse.json({ error: 'Нужна картинка JPG или PNG' }, { status: 400 })
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'Фото слишком большое' }, { status: 400 })

  const db = getSupabaseAdmin()
  const b = await loadBranding(db, user.id)
  if (kind === 'photo' && b.photoPaths.length >= MAX_PHOTOS) return NextResponse.json({ error: `Не больше ${MAX_PHOTOS} фото. Убери одно, чтобы добавить новое` }, { status: 400 })

  const ext = file.type === 'image/png' ? 'png' : 'jpg'
  const path = `${user.id}/${kind}-${Date.now()}.${ext}`
  const up = await db.storage.from(PHOTO_BUCKET).upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: false })
  if (up.error) {
    console.error('photo upload:', up.error.message)
    return NextResponse.json({ error: 'Не получилось загрузить фото' }, { status: 500 })
  }
  if (kind === 'avatar') {
    if (b.avatarPath) await db.storage.from(PHOTO_BUCKET).remove([b.avatarPath])
    await db.from('onboarding_profiles').update({ avatar_path: path }).eq('user_id', user.id)
  } else {
    await db.from('onboarding_profiles').update({ carousel_photos: [...b.photoPaths, path] }).eq('user_id', user.id)
  }
  return GET()
}

export async function DELETE(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const path = req.nextUrl.searchParams.get('path') || ''
  const db = getSupabaseAdmin()
  const b = await loadBranding(db, user.id)
  // удаляем только свое и только то, что есть в списке
  if (!path.startsWith(`${user.id}/`)) return NextResponse.json({ error: 'Нет такого фото' }, { status: 404 })
  if (path === b.avatarPath) {
    await db.from('onboarding_profiles').update({ avatar_path: null }).eq('user_id', user.id)
  } else if (b.photoPaths.includes(path)) {
    await db.from('onboarding_profiles').update({ carousel_photos: b.photoPaths.filter(p => p !== path) }).eq('user_id', user.id)
  } else {
    return NextResponse.json({ error: 'Нет такого фото' }, { status: 404 })
  }
  await db.storage.from(PHOTO_BUCKET).remove([path])
  return GET()
}
