// Новая цепочка для generate-post (включается флагом, см. lib/generation/context.ts).
// Ответ фронту совместим со старым: поле post с текстом. Новые поля рядом:
// postId, checking (проверка идет фоном), intent, placeholders, needDetail + pendingPlan.

import { NextResponse, after } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { buildContext, intentFromBody, isSyncMode, toFormatCode } from '@/lib/generation/context'
import { draft, refine, postFields, type GenRequest, type Plan } from '@/lib/generation/pipeline'
import { finalNet } from '@/lib/generation/text-guard'
import { isSimpleMode, simpleWrite } from '@/lib/generation/simple'
import { intentForFormat, cleanAds } from '@/lib/generation/group'

const PLACEHOLDER_RE = /\[добавь:[^\]]*\]/g

export async function handleNewPipeline(args: {
  db: SupabaseClient
  userId: string
  profile: any
  body: any
  topic: string
  pillar?: string | null
}) {
  const { db, userId, profile, body, topic, pillar } = args
  const t0 = Date.now()
  const ctx = await buildContext(db, userId, profile)
  const { intent, intentChoices } = intentFromBody(body)
  const req: GenRequest = {
    topic,
    format: toFormatCode(body?.format),
    intent,
    intentChoices,
    userDetail: typeof body?.userDetail === 'string' && body.userDetail.trim() ? body.userDetail.trim().slice(0, 1500) : null,
  }
  // в Instagram на консультацию не зовем (запрет рекламы в РФ): «позвать» там показывает, как устроена работа
  if (req.intent) req.intent = intentForFormat(req.intent, req.format)
  if (req.intentChoices) req.intentChoices = [...new Set(req.intentChoices.map(i => intentForFormat(i, req.format)))]

  // Простой путь (по умолчанию): один вызов без плана и фоновой проверки. GENERATION_MODE=full вернет старую цепочку.
  if (isSimpleMode()) {
    const r = await simpleWrite(ctx, req)
    req.format = r.format
    // в Instagram без цен, скидок, отзывов и приглашения записаться (запрет рекламы в РФ)
    r.text = await cleanAds(ctx, req.format, r.text)
    const plan: Plan = { intent: r.intent, topic_for_text: topic, reels_format: r.format.startsWith('reels') ? r.format : null }
    const postId = await savePost(db, {
      user_id: userId, topic, format: req.format, category: pillar || 'Своя тема', content: r.text,
      ...postFields(ctx, plan, req, r.text), pipeline_version: 'simple-1',
      draft_content: r.text, pipeline_status: 'ready', check_result: { mode: 'simple', ms_total: Date.now() - t0 },
    })
    return NextResponse.json({
      post: r.text, postId, checking: false, intent: r.intent, format: req.format,
      placeholders: r.text.match(PLACEHOLDER_RE) || [],
    })
  }

  // Ответ на вопрос плана или «Пропустить»: план уже есть, его прислал фронт.
  const pendingPlan: Plan | undefined = body?.pendingPlan && typeof body.pendingPlan === 'object' ? body.pendingPlan : undefined
  const d = await draft(ctx, req, {
    plan: req.userDetail ? undefined : pendingPlan, // с деталью план собирается заново
    skipDetail: body?.skipDetail === true,
  })

  if (d.kind === 'need_detail') {
    return NextResponse.json({ needDetail: d.question, pendingPlan: d.plan, intent: d.plan.intent })
  }

  const draftText = finalNet(d.text)
  const fields = postFields(ctx, d.plan, req, draftText)
  const tDraft = Date.now() - t0

  // Синхронный режим: всё в одном запросе (тесты, замеры).
  if (isSyncMode()) {
    const r = await refine(ctx, d.plan, req, d.text, d.findings)
    r.text = await cleanAds(ctx, req.format, r.text)
    const saved = await savePost(db, {
      user_id: userId, topic, format: req.format, category: pillar || 'Своя тема', content: r.text,
      ...postFields(ctx, d.plan, req, r.text),
      draft_content: draftText, pipeline_status: 'ready',
      check_result: { ...r.review, fixes: r.fixes, rewritten: r.rewritten, ms_draft: tDraft, ms_total: Date.now() - t0 },
    })
    return NextResponse.json({
      post: r.text, postId: saved, checking: false, changed: r.changed, intent: d.plan.intent, format: req.format,
      placeholders: r.text.match(PLACEHOLDER_RE) || [],
    })
  }

  const postId = await savePost(db, {
    user_id: userId, topic, format: req.format, category: pillar || 'Своя тема', content: draftText,
    ...fields, draft_content: draftText, pipeline_status: 'checking',
  })

  // Проверка и правка после ответа: фронт опрашивает /api/generate-post/status и подменяет текст.
  if (postId) {
    after(async () => {
      try {
        const r = await refine(ctx, d.plan, req, d.text, d.findings)
        r.text = await cleanAds(ctx, req.format, r.text)
        await db.from('generated_posts').update({
          content: r.text,
          ...postFields(ctx, d.plan, req, r.text),
          pipeline_status: 'ready',
          check_result: { ...r.review, fixes: r.fixes, rewritten: r.rewritten, ms_draft: tDraft, ms_total: Date.now() - t0 },
        }).eq('id', postId).eq('user_id', userId)
      } catch (e: any) {
        console.error('new pipeline refine error:', e?.message || e)
        await db.from('generated_posts').update({ pipeline_status: 'error' }).eq('id', postId).eq('user_id', userId)
      }
    })
  }

  return NextResponse.json({
    post: draftText, postId, checking: !!postId, intent: d.plan.intent, format: req.format,
    placeholders: draftText.match(PLACEHOLDER_RE) || [],
  })
}

// Запись с новыми полями; если миграция еще не применена, пишем как раньше. Три ступени: все поля;
// без полей набора (group_id, core, source из миграции 20261004100000, пока она не применена); только базовые.
// basicId: вернуть id и для базовой записи (набору форматов он нужен, фоновой проверке нет: ей некуда писать статус).
const GROUP_COLUMNS = ['group_id', 'core', 'source']
export async function savePost(db: SupabaseClient, row: Record<string, any>, opts?: { basicId?: boolean }): Promise<string | null> {
  const full = await db.from('generated_posts').insert(row).select('id').single()
  if (!full.error) return full.data?.id ?? null
  console.warn('generated_posts insert (new fields) failed, fallback:', full.error.message)
  if (GROUP_COLUMNS.some(k => k in row)) {
    const mid = Object.fromEntries(Object.entries(row).filter(([k]) => !GROUP_COLUMNS.includes(k)))
    const r = await db.from('generated_posts').insert(mid).select('id').single()
    if (!r.error) return r.data?.id ?? null
    console.warn('generated_posts insert (without group fields) failed, fallback:', r.error.message)
  }
  const { user_id, topic, format, category, content } = row
  const basic = await db.from('generated_posts').insert({ user_id, topic, format, category, content }).select('id').single()
  if (basic.error) console.warn('generated_posts insert failed:', basic.error.message)
  return opts?.basicId ? basic.data?.id ?? null : null
}
