// Посты из открытого телеграм-канала психолога как образцы голоса.
// Берем веб-версию канала t.me/s/<имя> (открытая страница), до 10 последних постов длиннее пары строк.
import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/generation/db'
import { recordEvent, rebuildVoice } from '@/lib/generation/learning'

function channelName(input: string): string | null {
  const s = input.trim().replace(/^@/, '')
  const m = s.match(/(?:https?:\/\/)?(?:t\.me|telegram\.me)\/(?:s\/)?([A-Za-z0-9_]{4,64})/i) || s.match(/^([A-Za-z0-9_]{4,64})$/)
  return m ? m[1] : null
}

const ENTITIES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' }
function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(amp|lt|gt|quot|nbsp|#39);/g, m => ENTITIES[m] || m)
    .replace(/&#(\d+);/g, (_m, d) => String.fromCodePoint(Number(d)))
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser()
    if (!user) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
    const body = await req.json().catch(() => ({}))
    const name = channelName(String(body?.url || ''))
    if (!name) return NextResponse.json({ error: 'Не узнала ссылку. Нужна вида t.me/имя_канала' }, { status: 400 })

    const res = await fetch(`https://t.me/s/${name}`, { signal: AbortSignal.timeout(15000), headers: { 'User-Agent': 'Mozilla/5.0' } })
    if (!res.ok) return NextResponse.json({ error: 'Канал не открылся. Он точно открытый?' }, { status: 400 })
    const html = await res.text()
    const blocks = [...html.matchAll(/<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/g)].map(m => htmlToText(m[1]))
    const posts = blocks.filter(t => t.length >= 150).slice(-10).reverse()
    if (!posts.length) return NextResponse.json({ error: 'В канале не нашла постов длиннее пары строк' }, { status: 400 })

    const db = getSupabaseAdmin()
    const seen = await db.from('voice_events').select('after_text').eq('user_id', user.id).eq('kind', 'tg_post').limit(100)
    const known = new Set((seen.data || []).map((r: any) => String(r.after_text || '').slice(0, 120)))
    let added = 0
    for (const t of posts) {
      if (known.has(t.slice(0, 120))) continue
      await recordEvent(db, user.id, { kind: 'tg_post', after: t, data: { channel: name } })
      added++
    }
    await db.from('onboarding_profiles').update({ tg_channel: name }).eq('user_id', user.id)

    const { data: profile } = await db.from('onboarding_profiles').select('*').eq('user_id', user.id).single()
    const r = await rebuildVoice(db, user.id, profile)
    return NextResponse.json({ ok: true, added, ...r })
  } catch (e: any) {
    console.error('voice-import error:', e?.message || e)
    return NextResponse.json({ error: 'Не получилось забрать посты, попробуй еще раз' }, { status: 500 })
  }
}
