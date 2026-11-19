// zh13: действие психолога с текстом для проверки качества (zh13_kachestvo.deystviya): скопировал текст или подпись,
// отредактировал. «Другой формат» и «заново» пишет сам роут генерации. Только свой текст (по user_id).
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getSessionUser } from '@/lib/auth'
import { zapisatDeystvie } from '@/lib/generation/zh13/kachestvo-db'

const MOZHNO = ['copy', 'copy_podpis', 'edit'] as const

export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'bad_request' }, { status: 400 }) }
  const postId = typeof body?.postId === 'string' ? body.postId.slice(0, 64) : ''
  const action = (MOZHNO as readonly string[]).includes(body?.action) ? body.action as (typeof MOZHNO)[number] : null
  if (!postId || !action) return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return NextResponse.json({ error: 'server_error' }, { status: 500 })
  const ok = await zapisatDeystvie(createClient(url, key), user.id, postId, action).catch(() => false)
  return NextResponse.json({ ok })
}
