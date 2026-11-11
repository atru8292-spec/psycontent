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
import { canConsume, commitConsume, recordRefusal } from '@/lib/energy'

// «Другой заход» zh6 пишет целый текст: считаем как генерацию текста, как набор на «Сделать»
const ZAHOD_OP = 'generate_post'

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
    const ACTION_CODE: Record<string, string> = { 'теплее': 'warmer', 'короче': 'shorter', 'живее': 'livelier', 'без клише': 'no_cliche', hooks: 'other_hook', cover: 'cover', zahod_pick: 'zahod_pick' }
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
      const cr = ((postRes.data as any).check_result || {}) as Record<string, any>
      if (action === 'zahod_pick') {
        // выбрала другой заход: ставим в материал текст и выбор zh6, которые сервер сам сохранил при генерации захода
        const z = cr.zahod
        if (!z || typeof z.text !== 'string' || !z.text.trim()) return NextResponse.json({ error: 'Заход не найден, нажми «Другой заход» еще раз' }, { status: 404 })
        const { zahod: _z, ...rest } = cr
        void _z
        await db.from('generated_posts').update({ content: z.text, check_result: { ...rest, zh4: z.zh4 || zh4 } }).eq('id', postId).eq('user_id', user.id)
        return NextResponse.json({ post: z.text })
      }
      if (action === 'hooks') {
        // другой заход: тот же формат каталога и задача, новый текст целиком (zh6 сам возьмет другие примеры и конец).
        // Это целый новый текст, поэтому считается как текст (canConsume до, commitConsume после успеха).
        const decision = await canConsume(user.id, ZAHOD_OP, 1)
        if (!decision.ok) {
          await recordRefusal(user.id, ZAHOD_OP)
          return NextResponse.json({ error: decision.message || 'Материалы закончились', limit: true }, { status: 429 })
        }
        // прошлый заход (если был) идет в память как уже показанный: следующий возьмет другие примеры и конец
        const prev = cr.zahod?.zh4?.zh6
        if (prev && ctx.memory) {
          const m: any = ctx.memory as any
          m.zh6 = m.zh6 || { ustr: [], primery: [], kon: [], priemy: [] }
          if (Array.isArray(prev.primery)) m.zh6.primery = [...(m.zh6.primery || []), ...prev.primery]
          if (typeof prev.kon === 'string') m.zh6.kon = [...(m.zh6.kon || []), prev.kon]
          if (typeof prev.ustr === 'string') m.zh6.ustr = [...(m.zh6.ustr || []), prev.ustr]
          m.total = (Number(m.total ?? m.count) || 0) + 1
        }
        const kod = typeof zh4.zh6.ustr === 'string' && formatByCode(zh4.zh6.ustr) ? zh4.zh6.ustr : null
        const r = await zh6Write(ctx, {
          topic: p0.topic_for_text || postRes.data.topic || '',
          format: toFormatCode(postRes.data.format_code || postRes.data.format),
          intent: p0.intent || null,
          formatKod: kod,
          ...((ZH6_ROLI as readonly unknown[]).includes(zh4.rol) ? { rol: zh4.rol } : {}),
        })
        // текст материала не меняем, пока она не выбрала заход: заход ждет в check_result.zahod (action zahod_pick)
        await db.from('generated_posts').update({ check_result: { ...cr, zahod: { text: r.text, zh4: r.zh4 } } }).eq('id', postId).eq('user_id', user.id)
        await commitConsume(user.id, ZAHOD_OP, decision)
        const first = r.text.split('\n').find(l => l.trim()) || ''
        // формат ответа как у старых заходов; full: весь новый текст (у zh6 заход это новый текст, не одна строка)
        return NextResponse.json({ hooks: [{ hook_type: 'zh6_zahod', text: first.trim(), why: '', full: r.text, formatName: r.zh6.formatName }] })
      }
      if (!(action in BUTTONS)) return NextResponse.json({ error: 'Неизвестное действие' }, { status: 400 })
      const fixed = await zh6Popravit(ctx, current, BUTTONS[action], typeof zh4.zh6.ustr === 'string' ? zh4.zh6.ustr : null)
      if (!fixed.used) {
        console.info('adjust zh6: правка не взята:', fixed.reason || '')
        return NextResponse.json({ post: current, unchanged: true, error: 'Не вышло поправить аккуратно, поэтому оставила текст как был. Попробуй еще раз или другую кнопку.' }, { status: 422 })
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
