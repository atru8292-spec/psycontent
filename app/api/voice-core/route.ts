// Голос психолога.
// GET: как я тебя слышу (описание, словечки, когда обновлен, что изменилось).
// POST: вставленные посты (до 5) сохраняются как образцы, голос пересобирается сразу.
// Без постов POST просто пересобирает голос из того, что уже накоплено (речь, рерайт, канал).
import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/generation/db'
import { recordEvent, rebuildVoice } from '@/lib/generation/learning'

export async function GET() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const db = getSupabaseAdmin()
  const { data: p } = await db.from('onboarding_profiles')
    .select('voice_summary, signature_phrases, voice_core_updated_at, voice_change_line, tg_channel, voice_samples')
    .eq('user_id', user.id).maybeSingle()
  const samples = Array.isArray(p?.voice_samples) ? p!.voice_samples : []
  return NextResponse.json({
    summary: p?.voice_summary || '',
    signatures: Array.isArray(p?.signature_phrases) ? p!.signature_phrases.slice(0, 4) : [],
    updatedAt: p?.voice_core_updated_at || null,
    changeLine: p?.voice_change_line || '',
    tgChannel: p?.tg_channel || '',
    samplesCount: samples.filter((s: any) => s?.fit !== false).length,
  })
}

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser()
    if (!user) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
    const body = await req.json().catch(() => ({}))
    const db = getSupabaseAdmin()
    const { data: profile, error } = await db.from('onboarding_profiles').select('*').eq('user_id', user.id).single()
    if (error?.code === 'PGRST116') return NextResponse.json({ need_onboarding: true }, { status: 400 })
    if (error || !profile) return NextResponse.json({ error: 'server_error' }, { status: 500 })

    const pasted: string[] = Array.isArray(body?.samples)
      ? body.samples.map((s: unknown) => String(s || '').trim()).filter((s: string) => s.length >= 60).slice(0, 5)
      : []
    for (const text of pasted) await recordEvent(db, user.id, { kind: 'pasted_post', after: text })

    const r = await rebuildVoice(db, user.id, profile)
    return NextResponse.json({ ok: true, ...r })
  } catch (e: any) {
    console.error('voice-core error:', e?.message || e)
    return NextResponse.json({ error: e?.message?.startsWith('Пока нет') ? e.message : 'Не получилось собрать голос, попробуй еще раз' }, { status: 500 })
  }
}
