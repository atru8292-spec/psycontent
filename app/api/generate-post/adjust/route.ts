// Кнопки «Поправить» (теплее, короче, живее, без клише) и «3 других захода» для поста новой цепочки.
// Берет план из сохраненной записи, чтобы правка знала смысл, дугу и финал.
import { serverTrack } from '@/lib/track-server'
import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/generation/db'
import { buildContext, toFormatCode } from '@/lib/generation/context'
import { applyButton, otherHooks, coverTexts, type GenRequest, type Plan } from '@/lib/generation/pipeline'
import { BUTTONS } from '@/lib/generation/prompts'
import { recordEvent } from '@/lib/generation/learning'
import { zh6Popravit, zh6Write } from '@/lib/generation/zh6/write'
import { formatByCode } from '@/lib/generation/zh6/formaty'
import { zh6On, ZH6_ROLI } from '../new-pipeline'

// кнопки и привычки: одна запись на нажатие, как у старого пути
async function rememberButton(db: ReturnType<typeof getSupabaseAdmin>, userId: string, postId: string, action: string, profile: any) {
  await recordEvent(db, userId, { kind: 'button', postId, data: { button: action } })
  const habits = { ...(profile?.habits || {}) }
  habits[action] = (Number(habits[action]) || 0) + 1
  await db.from('onboarding_profiles').update({ habits }).eq('user_id', userId)
}

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser()
    if (!user) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
    const body = await req.json()
    const { postId, action, text } = body || {}
    if (!postId || !action) return NextResponse.json({ error: 'Нет postId или action' }, { status: 400 })

    const db = getSupabaseAdmin()
    const zh6 = zh6On()
    const COLS = 'content, plan, format, format_code, topic'
    const readPost = (cols: string) => db.from('generated_posts').select(cols).eq('id', postId).eq('user_id', user.id).single()
    const [postRes0, profileRes] = await Promise.all([
      // check_result читаем только при zh6: по нему видно, что материал сделан zh6
      readPost(zh6 ? `${COLS}, check_result` : COLS) as any,
      db.from('onboarding_profiles').select('*').eq('user_id', user.id).single(),
    ])
    const postRes: any = zh6 && postRes0.error && postRes0.error.code !== 'PGRST116' ? await readPost(COLS) : postRes0
    if (postRes.error || !postRes.data) return NextResponse.json({ error: 'Пост не найден' }, { status: 404 })
    // замеры: какая правка и к какому формату (код действия только латиницей, русские кнопки сводим к кодам)
    const ACTION_CODE: Record<string, string> = { 'теплее': 'warmer', 'короче': 'shorter', 'живее': 'livelier', 'без клише': 'no_cliche', hooks: 'other_hook', cover: 'cover' }
    serverTrack(user.id, 'material_adjust', { action: ACTION_CODE[String(action)] || 'other', format: String(postRes.data.format || 'post').startsWith('reels') ? 'reels' : String(postRes.data.format || 'post') })

    // Обложка к посту: плана не нужно (подходит и для поста из своего черновика)
    if (action === 'cover') {
      const current = typeof text === 'string' && text.trim() ? text : String(postRes.data.content || '')
      const ctx = await buildContext(db, user.id, profileRes.data || {})
      const covers = await coverTexts(ctx, current)
      if (!covers.length) return NextResponse.json({ error: 'Не получилось придумать надпись, попробуй еще раз' }, { status: 502 })
      await recordEvent(db, user.id, { kind: 'button', postId, data: { button: 'cover' } })
      return NextResponse.json({ covers })
    }
    // ---------- материал zh6 (PROMPT_HYP=zh6): свои «Поправить» и «Другой заход» ----------
    const zh4 = (postRes.data as any)?.check_result?.zh4
    if (zh6 && zh4?.zh6 && typeof zh4.zh6 === 'object') {
      const current = typeof text === 'string' && text.trim() ? text : String(postRes.data.content || '')
      const ctx = await buildContext(db, user.id, profileRes.data || {})
      const p0 = (postRes.data.plan || {}) as Partial<Plan>
      if (action === 'hooks') {
        // другой заход: тот же формат каталога и задача, новый текст целиком (zh6 сам возьмет другие примеры и конец)
        const kod = typeof zh4.zh6.ustr === 'string' && formatByCode(zh4.zh6.ustr) ? zh4.zh6.ustr : null
        const r = await zh6Write(ctx, {
          topic: p0.topic_for_text || postRes.data.topic || '',
          format: toFormatCode(postRes.data.format_code || postRes.data.format),
          intent: p0.intent || null,
          formatKod: kod,
          ...((ZH6_ROLI as readonly unknown[]).includes(zh4.rol) ? { rol: zh4.rol } : {}),
        })
        const first = r.text.split('\n').find(l => l.trim()) || ''
        // формат ответа как у старых заходов; full: весь новый текст (у zh6 заход это новый текст, не одна строка)
        return NextResponse.json({ hooks: [{ hook_type: 'zh6_zahod', text: first.trim(), why: '', full: r.text, formatName: r.zh6.formatName }] })
      }
      if (!(action in BUTTONS)) return NextResponse.json({ error: 'Неизвестное действие' }, { status: 400 })
      const fixed = await zh6Popravit(ctx, current, BUTTONS[action])
      if (!fixed.used) {
        console.info('adjust zh6: правка не взята:', fixed.reason || '')
        return NextResponse.json({ post: current, unchanged: true, error: 'Не получилось поправить, не сломав разметку. Текст на месте, попробуй еще раз или другую кнопку' }, { status: 422 })
      }
      await db.from('generated_posts').update({ content: fixed.text }).eq('id', postId).eq('user_id', user.id)
      await rememberButton(db, user.id, postId, action, profileRes.data)
      return NextResponse.json({ post: fixed.text })
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
    await rememberButton(db, user.id, postId, action, profileRes.data)
    return NextResponse.json({ post })
  } catch (e: any) {
    console.error('adjust error:', e?.message || e)
    return NextResponse.json({ error: 'Не получилось поправить, попробуй еще раз' }, { status: 500 })
  }
}
