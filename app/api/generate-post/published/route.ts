// «Опубликовала»: психолог отмечает, что материал вышел. Статус нужен Плану, Библиотеке и ритму месяца.
import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/generation/db'

export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const postId = typeof body?.postId === 'string' ? body.postId : ''
  if (!postId) return NextResponse.json({ error: 'Нет материала' }, { status: 400 })
  const undo = body?.undo === true
  const db = getSupabaseAdmin()
  const { data, error } = await db.from('generated_posts')
    .update({ published_at: undo ? null : new Date().toISOString() })
    .eq('id', postId).eq('user_id', user.id)
    .select('id').maybeSingle()
  if (error) return NextResponse.json({ error: 'Не получилось отметить' }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Материал не найден' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
