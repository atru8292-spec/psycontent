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
import { activeHyps } from '@/lib/generation/hypotheses'
import { formatByCode } from '@/lib/generation/zh6/formaty'
import { isReels, type FormatCode } from '@/lib/generation/text-guard'

// ---------- zh6 (PROMPT_HYP=zh6): формат каталога, задача и реакция из плана ----------
// zh6 пишет только простым путем (simpleWrite), поэтому при GENERATION_MODE=full его нет
export const zh6On = () => activeHyps().has('zh6') && isSimpleMode()
export const ZH6_ROLI = ['ohvat', 'doverie', 'zapis'] as const
export const ZH6_REAKCII = ['uznavanie', 'podderzhka', 'poziciya', 'priglashenie'] as const
// тип формата, как его видит каталог zh6: post_tg выбирает из постов
export const zh6Tip = (f: FormatCode | string): string => {
  const c = String(f || '')
  if (c === 'reels' || isReels(c as FormatCode)) return 'reels'
  if (c === 'post_tg') return 'post'
  return c === 'carousel' || c === 'stories' ? c : 'post'
}
// Проверка полей zh6 из тела. formatKod берем, только если он есть в каталоге и его основной тип (for[0]) совпадает
// с запрошенным: формат сохраняется и размечается по for[0] (formatCodeOf), поэтому «Перевожу на человеческий»
// (for reels, carousel, post) при нажатой «Карусели» записался бы рилсом. Неверное значение молча выкидываем.
export function zh6FieldsFrom(src: any, format: FormatCode | string): Pick<GenRequest, 'formatKod' | 'rol' | 'reakciya'> {
  const out: Pick<GenRequest, 'formatKod' | 'rol' | 'reakciya'> = {}
  if (!src || typeof src !== 'object') return out
  const kod = typeof src.formatKod === 'string' ? src.formatKod.trim().slice(0, 60) : ''
  const f6 = kod ? formatByCode(kod) : undefined
  if (f6 && f6.for[0] === zh6Tip(format)) out.formatKod = f6.code
  if ((ZH6_ROLI as readonly unknown[]).includes(src.rol)) out.rol = src.rol
  if ((ZH6_REAKCII as readonly unknown[]).includes(src.reakciya)) out.reakciya = src.reakciya
  return out
}

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
  // zh6: формат из плана, задача и реакция (старый генератор эти поля не читает, но кладем только при zh6)
  if (zh6On()) Object.assign(req, zh6FieldsFrom(body, req.format))

  // Простой путь (по умолчанию): один вызов без плана и фоновой проверки. GENERATION_MODE=full вернет старую цепочку.
  if (isSimpleMode()) {
    const r: Awaited<ReturnType<typeof simpleWrite>> & { zh4?: any; zh6?: { formatName?: string } } = await simpleWrite(ctx, req)
    req.format = r.format
    // в Instagram без цен, скидок, отзывов и приглашения записаться (запрет рекламы в РФ). zh6 с задачей «запись»:
    // решение Арины 26.10 (CLAUDE.md, «Звать к себе можно в Instagram и Telegram одинаково, если задача материала запись»)
    // в main еще не перенесено; zh6 зовет одной строкой в подписи по ее схеме, поэтому для него вырезку пропускаем
    if (!(zh6On() && req.rol === 'zapis')) r.text = await cleanAds(ctx, req.format, r.text)
    const plan: Plan = { intent: r.intent, topic_for_text: topic, reels_format: r.format.startsWith('reels') ? r.format : null }
    const postId = await savePost(db, {
      user_id: userId, topic, format: req.format, category: pillar || 'Своя тема', content: r.text,
      ...postFields(ctx, plan, req, r.text), pipeline_version: 'simple-1',
      draft_content: r.text, pipeline_status: 'ready',
      // zh4 несет выбор zh6 (устройство, примеры, конец, приемы): из него память zh6 (memory.ts) и кнопки adjust
      check_result: { mode: 'simple', ms_total: Date.now() - t0, ...(r.zh4 ? { zh4: r.zh4 } : {}) },
    })
    return NextResponse.json({
      post: r.text, postId, checking: false, intent: r.intent, format: req.format,
      ...(r.zh6?.formatName ? { formatName: r.zh6.formatName } : {}),
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
// без полей набора (group_id, core, sample_source из миграции 20261004100000, пока она не применена); только базовые.
// basicId: вернуть id и для базовой записи (набору форматов он нужен, фоновой проверке нет: ей некуда писать статус).
// старую колонку source (text, default 'generator') новый код не пишет никогда
const GROUP_COLUMNS = ['group_id', 'core', 'sample_source']
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
