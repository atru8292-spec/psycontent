// Список форматов каталога zh6, подходящих голосу автора (выбор формата внутри чипа на экране «Сделать»).
// Только коды и имена, без ходов, примеров и других текстов каталога. Без zh6 или без нового мозга пустой список,
// экран тогда показывает чипы как раньше.
import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/generation/db'
import { isNewPipeline } from '@/lib/generation/context'
import { buildAuthorSettings } from '@/lib/generation/settings'
import { formatyAvtora } from '@/lib/generation/zh6/write'
import { bezGolosa } from '@/lib/generation/zh6/formaty'
import { zh6On } from '../new-pipeline'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const user = await getSessionUser()
    if (!user) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
    if (!zh6On()) return NextResponse.json({ formaty: [] })

    const db = getSupabaseAdmin()
    const profileRes = await db.from('onboarding_profiles').select('*').eq('user_id', user.id).single()
    if (profileRes.error) {
      if (profileRes.error.code === 'PGRST116') return NextResponse.json({ error: 'need_onboarding' }, { status: 404 })
      console.error('formaty: profile read failed', profileRes.error.message)
      return NextResponse.json({ error: 'server_error' }, { status: 500 })
    }
    const profile = profileRes.data
    if (!isNewPipeline(profile)) return NextResponse.json({ formaty: [] })

    const formaty = formatyAvtora(buildAuthorSettings(profile)).map(f => ({
      code: f.code,
      name: f.name,
      tip: f.for[0] as 'reels' | 'post' | 'carousel',
      scene: !!f.scene,
      short: !!f.short,
      bezGolosa: bezGolosa(f),
    }))
    return NextResponse.json({ formaty, zh6: true }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e: any) {
    console.error('formaty error:', e?.message || e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
