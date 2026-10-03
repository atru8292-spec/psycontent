// Кнопки «Поправить» (теплее, короче, живее, без клише) и «3 других захода» для поста новой цепочки.
// Берет план из сохраненной записи, чтобы правка знала смысл, дугу и финал.
import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/generation/db'
import { buildContext, toFormatCode } from '@/lib/generation/context'
import { applyButton, otherHooks, coverTexts, type GenRequest, type Plan } from '@/lib/generation/pipeline'
import { BUTTONS } from '@/lib/generation/prompts'
import { recordEvent } from '@/lib/generation/learning'

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser()
    if (!user) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
    const body = await req.json()
    const { postId, action, text } = body || {}
    if (!postId || !action) return NextResponse.json({ error: 'Нет postId или action' }, { status: 400 })

    const db = getSupabaseAdmin()
    const [postRes, profileRes] = await Promise.all([
      db.from('generated_posts').select('content, plan, format, format_code, topic').eq('id', postId).eq('user_id', user.id).single(),
      db.from('onboarding_profiles').select('*').eq('user_id', user.id).single(),
    ])
    if (postRes.error || !postRes.data) return NextResponse.json({ error: 'Пост не найден' }, { status: 404 })

    // Обложка к посту: плана не нужно (подходит и для поста из своего черновика)
    if (action === 'cover') {
      const current = typeof text === 'string' && text.trim() ? text : String(postRes.data.content || '')
      const ctx = await buildContext(db, user.id, profileRes.data || {})
      const covers = await coverTexts(ctx, current)
      if (!covers.length) return NextResponse.json({ error: 'Не получилось придумать надпись, попробуй еще раз' }, { status: 502 })
      await recordEvent(db, user.id, { kind: 'button', postId, data: { button: 'cover' } })
      return NextResponse.json({ covers })
    }
    if (!postRes.data.plan) return NextResponse.json({ error: 'Пост не найден' }, { status: 404 })

    const plan = postRes.data.plan as Plan
    const current = typeof text === 'string' && text.trim() ? text : String(postRes.data.content || '')
    const ctx = await buildContext(db, user.id, profileRes.data || {})
    const gen: GenRequest = { topic: plan.topic_for_text || postRes.data.topic || '', format: toFormatCode(postRes.data.format_code || postRes.data.format), intent: plan.intent }

    if (action === 'hooks') {
      const hooks = await otherHooks(ctx, plan, gen, current)
      return NextResponse.json({ hooks })
    }
    if (!(action in BUTTONS)) return NextResponse.json({ error: 'Неизвестное действие' }, { status: 400 })

    const post = await applyButton(ctx, plan, gen, current, action)
    await db.from('generated_posts').update({ content: post }).eq('id', postId).eq('user_id', user.id)

    // Привычка: какую кнопку жмет. Частая просьба потом сразу учитывается в плане.
    await recordEvent(db, user.id, { kind: 'button', postId, data: { button: action } })
    const habits = { ...((profileRes.data as any)?.habits || {}) }
    habits[action] = (Number(habits[action]) || 0) + 1
    await db.from('onboarding_profiles').update({ habits }).eq('user_id', user.id)
    return NextResponse.json({ post })
  } catch (e: any) {
    console.error('adjust error:', e?.message || e)
    return NextResponse.json({ error: 'Не получилось поправить, попробуй еще раз' }, { status: 500 })
  }
}
