// «Похоже» / «Не совсем» на экране «Вот как я тебя слышу». Уточнение идет в слепок голоса.
import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/generation/db'
import { recordEvent } from '@/lib/generation/learning'

export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const ok = body?.ok === true
  const note = typeof body?.note === 'string' ? body.note.trim().slice(0, 500) : ''
  const db = getSupabaseAdmin()
  await recordEvent(db, user.id, { kind: 'voice_feedback', data: { ok, note } })
  if (!ok && note) {
    const { data: p } = await db.from('onboarding_profiles').select('voice_corrections').eq('user_id', user.id).maybeSingle()
    const prev = String(p?.voice_corrections || '').trim()
    const next = (prev ? `${prev}\n` : '') + note
    await db.from('onboarding_profiles').update({ voice_corrections: next.slice(-1500) }).eq('user_id', user.id)
  }
  return NextResponse.json({ ok: true })
}
