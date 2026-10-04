// Одна мысль в несколько форматов (задача sdelat-i-brend, раздел 4). Только для нового мозга.
// Ответ потоком NDJSON, по строке на событие, чтобы экран прогресса показывал, что готово:
//   {type:'core', thought}                     ядро собрано
//   {type:'progress', format}                  черновик формата готов (до проверки набора)
//   {type:'format', format, ok, postId, code, text, intent} | {type:'format', format, ok:false, error}
//   {type:'done', groupId}                     | {type:'error', error}
// Тело: { topic, userDetail?, formats: ['reels','carousel','post','post_tg','stories'], goal?, fromPostId?, editedText?,
//   sample?: {kind:'link',url} | {kind:'text',text} | {kind:'screens',images:[data URL]} }  («Сделать так же», событие {type:'sample'})
// fromPostId: «Сделать еще формат из этой мысли»: ядро берем у материала (только свой, по user_id); если текст
// правили (editedText отличается от сохраненного), ядро сначала пересобираем из правленой версии.
// Счет: каждый готовый формат как одна текстовая генерация (lib/energy.ts, kind text). Упавший не считаем.

import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { getSessionUser } from '@/lib/auth'
import { canConsume, commitConsume, recordFailure, recordRefusal } from '@/lib/energy'
import { buildContext, isNewPipeline } from '@/lib/generation/context'
import { draft, refine, postFields, PIPELINE_VERSION, type GenRequest, type Plan } from '@/lib/generation/pipeline'
import { isSimpleMode, simpleWrite, chooseIntent, chooseReelsFormat } from '@/lib/generation/simple'
import { buildCore, coreFromRow, type ThoughtCore } from '@/lib/generation/core'
import {
  GROUP_FORMATS, GOALS, GOAL_LABELS, GOAL_INTENTS, toGroupCode, intentForFormat, coreBlockFor, neighborsFor,
  checkSet, rewritePhrases, stripAds, type GroupFormat, type Goal,
} from '@/lib/generation/group'
import { finalNet, type FormatCode } from '@/lib/generation/text-guard'
import { savePost } from '../new-pipeline'
import {
  fetchTelegramPost, isInstagramUrl, isTelegramUrl, parseSample, sampleBlock, sourceLabel, overlap, sentencesWithChains, sentencesWithTrigrams,
  type SampleInput, type SampleSkeleton,
} from '@/lib/generation/sample'

export const maxDuration = 300

const OP = 'generate_post'
const PLACEHOLDER_RE = /\[добавь:[^\]]*\]/g

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env variables')
  return createClient(url, key)
}

const clean = (v: unknown, n: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : '')

export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const userId = user.id

  // до 10 скринов по ~400 КБ в base64: больше 8 МБ не читаем в память
  if (Number(req.headers.get('content-length') || 0) > 8 * 1024 * 1024) return NextResponse.json({ error: 'too_large' }, { status: 413 })
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'bad_request' }, { status: 400 }) }

  const formats: GroupFormat[] = Array.isArray(body?.formats)
    ? [...new Set(body.formats.filter((f: unknown) => (GROUP_FORMATS as readonly unknown[]).includes(f)))] as GroupFormat[]
    : []
  if (!formats.length) return NextResponse.json({ error: 'no_formats' }, { status: 400 })
  const goal: Goal | null = (GOALS as readonly unknown[]).includes(body?.goal) ? body.goal : null
  const userDetail = clean(body?.userDetail, 1500) || null
  const fromPostId = clean(body?.fromPostId, 64) || null
  // правленый текст сравниваем целиком, без обрезки: иначе длинный материал всегда выглядел бы правленым
  const editedRaw = typeof body?.editedText === 'string' ? body.editedText.trim() : ''
  const editedText = editedRaw ? editedRaw.slice(0, 8000) : null

  // «Сделать так же»: ссылка (только публичный Telegram), текст поста или скрины (data URL, до 10)
  let sample: SampleInput | null = null
  const sb = body?.sample
  if (sb && typeof sb === 'object') {
    if (sb.kind === 'link' && typeof sb.url === 'string') sample = { kind: 'link', url: sb.url.trim().slice(0, 300) }
    else if (sb.kind === 'text' && typeof sb.text === 'string' && sb.text.trim().length >= 40) sample = { kind: 'text', text: sb.text.trim().slice(0, 6000) }
    else if (sb.kind === 'screens' && Array.isArray(sb.images)) {
      const images = sb.images.filter((x: unknown) => typeof x === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(x) && x.length < 3_000_000).slice(0, 10)
      if (images.length) sample = { kind: 'screens', images }
    }
    if (!sample) return NextResponse.json({ error: 'sample_failed' }, { status: 422 })
  }
  // ссылка Instagram не открывается вовсе: отвечаем сразу, без внешних запросов
  if (sample?.kind === 'link' && (isInstagramUrl(sample.url) || !isTelegramUrl(sample.url)))
    return NextResponse.json({ error: isInstagramUrl(sample.url) ? 'sample_instagram' : 'sample_failed' }, { status: 422 })

  const db = admin()
  const profileRes = await db.from('onboarding_profiles').select('*').eq('user_id', userId).single()
  if (profileRes.error) {
    if (profileRes.error.code === 'PGRST116') return NextResponse.json({ error: 'need_onboarding' }, { status: 404 })
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
  const profile = profileRes.data
  if (!isNewPipeline(profile)) return NextResponse.json({ error: 'not_available' }, { status: 403 })

  // Исходный материал для «еще формата»: только свой
  let origin: any = null
  let siblings: { format: FormatCode; text: string }[] = []
  if (fromPostId) {
    const r = await db.from('generated_posts').select('*').eq('id', fromPostId).eq('user_id', userId).maybeSingle()
    if (r.error || !r.data) return NextResponse.json({ error: 'not_found' }, { status: 404 })
    origin = r.data
    if (origin.group_id) {
      const sib = await db.from('generated_posts').select('format, content').eq('user_id', userId).eq('group_id', origin.group_id)
      siblings = (sib.data || []).map((x: any) => ({ format: x.format as FormatCode, text: String(x.content || '') }))
    } else {
      siblings = [{ format: origin.format as FormatCode, text: String(origin.content || '') }]
    }
  }
  // тема для истории короткая: если пришла только мысль, берем ее начало
  const topic = clean(body?.topic, 500) || (origin ? String(origin.topic || '') : '') || (userDetail ? (userDetail.length > 120 ? userDetail.slice(0, 120).replace(/\s+\S*$/, '') : userDetail) : '')
  // «так же» без своей темы: «подберу сама» из боли клиентов или ниши в профиле
  const sampleTopic = sample && !topic
    ? (String(profile.client_pain_phrases || '').split(/\n|;/).map((x: string) => x.trim()).find((x: string) => x.length > 6)
      || String(profile.one_niche || '').trim() || 'то, с чем ко мне приходят чаще всего').slice(0, 200)
    : ''
  const topicFinal = topic || sampleTopic
  if (!topicFinal && !userDetail) return NextResponse.json({ error: 'no_topic' }, { status: 400 })

  const decision = await canConsume(userId, OP, formats.length)
  if (!decision.ok) {
    await recordRefusal(userId, OP)
    return NextResponse.json({ error: decision.reason || 'limit', message: decision.message }, { status: 429 })
  }

  // оригинал только в памяти этого запроса; на t.me идем только после флага и проверки предела
  let original = ''
  if (sample?.kind === 'link') {
    const tg = await fetchTelegramPost(sample.url)
    if ('error' in tg) return NextResponse.json({ error: tg.error === 'closed' ? 'sample_closed' : 'sample_failed' }, { status: 422 })
    original = tg.text
  } else if (sample?.kind === 'text') original = sample.text

  const enc = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (o: unknown) => { try { controller.enqueue(enc.encode(JSON.stringify(o) + '\n')) } catch { /* клиент ушел */ } }
      // пока разбор скринов и ядро молчат дольше минуты, прокси (nginx proxy_read_timeout 60s) рвет соединение;
      // пинг раз в 15 секунд держит поток живым, клиент неизвестные события пропускает
      const ping = setInterval(() => send({ type: 'ping' }), 15000)
      try {
        const ctx = await buildContext(db, userId, profile)
        const t0 = Date.now()

        // «Так же»: разбор видит оригинал и отдает только устройство; писатель получает только устройство
        let skeleton: SampleSkeleton | null = null
        let compareWith = original
        if (sample) {
          const p = await parseSample(ctx, { kind: sample.kind, original, images: sample.kind === 'screens' ? sample.images : undefined })
          if ('error' in p) {
            await recordFailure(userId, OP)
            send({ type: 'error', code: p.error === 'private' ? 'sample_private' : 'sample_empty', error: 'Не получилось разобрать пост' })
            return
          }
          skeleton = p
          compareWith = original || p.seenText || ''
          send({ type: 'sample', label: sourceLabel(sample), priem: p.priem, clientStory: p.flags.client_story })
        }

        // Смысл набора: из ядра исходного материала, иначе по цели (своя история только при историях автора)
        const goalChoices = goal ? GOAL_INTENTS[goal].filter(i => i !== 'svoya_istoriya' || ctx.settings.stories.length > 0) : null
        const savedCore = origin ? coreFromRow(origin.core) : null
        const groupIntent = savedCore?.intent || (origin?.intent as string) || chooseIntent(ctx, { topic: topicFinal, format: 'post', intentChoices: goalChoices })
        const intentLabel = goal ? GOAL_LABELS[goal] : 'любая'

        const edited = !!(origin && editedRaw && editedRaw !== String(origin.content || '').trim())
        let core: ThoughtCore
        if (savedCore && !edited) core = savedCore
        else core = await buildCore(ctx, {
          topic: topicFinal || userDetail || '', intent: groupIntent, intentLabel,
          userDetail: origin ? null : userDetail,
          fromText: origin ? (edited ? editedText : String(origin.content || '')) : null,
        })
        // модель вернула ядро без мысли: держимся за тему, иначе все форматы получат пустую «Мысль:»
        if (!core.thought) core.thought = (userDetail || topicFinal).slice(0, 300)
        send({ type: 'core', thought: core.thought })

        const groupId: string = origin?.group_id || randomUUID()
        // старый материал без группы становится первым в группе (без колонки просто не выйдет, это не мешает)
        if (origin && !origin.group_id) {
          await db.from('generated_posts').update({ group_id: groupId, core }).eq('id', origin.id).eq('user_id', userId)
            .then(r => { if (r.error) console.warn('group_id on origin post failed:', r.error.message) })
        }

        // Коды форматов: вид рилса выбираем заранее, чтобы блок ядра и соседи знали, сценка это или монолог
        const codes = formats.map(f => {
          const c = toGroupCode(f)
          return c === 'reels_auto' ? chooseReelsFormat(ctx, intentForFormat(groupIntent, c)) : c
        })
        const all = [...siblings.map(s => s.format), ...codes]

        const results = await Promise.all(formats.map(async (f, i) => {
          const code = codes[i]
          const greq: GenRequest = {
            topic: topicFinal,
            format: code,
            intent: intentForFormat(groupIntent, code),
            userDetail: origin ? null : userDetail,
            coreBlock: coreBlockFor(core, code),
            neighbors: neighborsFor(all, code),
            sampleBlock: skeleton ? sampleBlock(skeleton) : null,
          }
          try {
            let text: string, plan: Plan, version: string, draftText: string
            if (isSimpleMode()) {
              const r = await simpleWrite(ctx, greq)
              greq.format = r.format
              text = r.text; draftText = r.text; version = 'simple-1'
              plan = { intent: r.intent, topic_for_text: greq.topic, reels_format: r.format.startsWith('reels') ? r.format : null }
            } else {
              const d = await draft(ctx, greq, { skipDetail: true })
              if (d.kind === 'need_detail') throw new Error('need_detail')
              draftText = finalNet(d.text)
              const r = await refine(ctx, d.plan, greq, d.text, d.findings)
              text = r.text; plan = d.plan; version = PIPELINE_VERSION
            }
            send({ type: 'progress', format: f })
            return { f, ok: true as const, req: greq, text, plan, version, draftText }
          } catch (e: any) {
            console.error('group format failed:', f, e?.message || e)
            return { f, ok: false as const }
          }
        }))

        // Проверка набора: в позднем формате повтор соседа или реклама в Instagram → переписать эти фразы
        const okItems = results.filter(r => r.ok) as Extract<typeof results[number], { ok: true }>[]
        // сверяем по номеру материала: соседи из прошлых запусков идут первыми, их не переписываем
        const issues = checkSet([...siblings, ...okItems.map(r => ({ format: r.req.format, text: r.text }))], core.quote)
        const fixed = new Map<number, number>()
        await Promise.all(issues.map(async iss => {
          const k = iss.index - siblings.length
          if (k < 0) return
          const item = okItems[k]
          const before = item.text
          item.text = await rewritePhrases(ctx, item.req.format, item.text, iss.phrases)
          // реклама в Instagram под жестким запретом: если перепись не помогла, вырезаем эти фразы кодом
          item.text = stripAds(item.req.format, item.text)
          if (item.text !== before) fixed.set(k, iss.phrases.length)
        }))

        // «Так же»: сверка с оригиналом (цепочка из 5 слов или больше 10% общих троек) → переписать эти фразы;
        // не вышло, отдаем совпадения экрану для подсветки
        const leftovers = new Map<number, string[]>()
        if (compareWith) {
          await Promise.all(okItems.map(async (item, k) => {
            let ov = overlap(compareWith, item.text)
            if (!ov.hit) return
            const phrases = ov.chains.length ? sentencesWithChains(item.text, ov.chains) : sentencesWithTrigrams(item.text, compareWith)
            if (phrases.length) item.text = stripAds(item.req.format, await rewritePhrases(ctx, item.req.format, item.text, phrases))
            ov = overlap(compareWith, item.text)
            if (ov.hit) leftovers.set(k, ov.chains.length ? ov.chains : sentencesWithTrigrams(item.text, compareWith))
          }))
        }

        for (const r of results) {
          if (!r.ok) {
            await recordFailure(userId, OP)
            send({ type: 'format', format: r.f, ok: false, error: 'Этот формат не получился. Попробуй еще раз' })
            continue
          }
          const postId = await savePost(db, {
            user_id: userId, topic: r.req.topic, format: r.req.format, category: 'Своя тема', content: r.text,
            ...postFields(ctx, r.plan, r.req, r.text), pipeline_version: r.version,
            draft_content: r.draftText, pipeline_status: 'ready',
            check_result: { mode: 'group', set_fixed: fixed.get(okItems.indexOf(r)) || 0, ms_total: Date.now() - t0 },
            group_id: groupId, core,
            // источник «так же»: тип, подпись и устройство, без чужого текста
            ...(skeleton && sample ? { sample_source: { kind: sample.kind, label: sourceLabel(sample), priem: skeleton.priem, steps: skeleton.steps, why: skeleton.why, format: skeleton.format, flags: skeleton.flags } } : {}),
          }, { basicId: true })
          // считаем только то, что записалось: без строки в базе материала у человека нет
          if (postId) await commitConsume(userId, OP, decision)
          send({
            type: 'format', format: r.f, ok: true, postId, code: r.req.format, intent: r.plan.intent, text: r.text,
            placeholders: r.text.match(PLACEHOLDER_RE) || [],
            overlap: leftovers.get(okItems.indexOf(r)) || [],
          })
        }
        send({ type: 'done', groupId })
      } catch (e: any) {
        console.error('group generation error:', e?.message || e)
        await recordFailure(userId, OP).catch(() => {})
        send({ type: 'error', error: 'Не получилось собрать мысль. Попробуй еще раз' })
      } finally {
        clearInterval(ping)
        // клиент мог закрыть вкладку: материалы все равно сохранены в «Моих текстах» и посчитаны
        try { controller.close() } catch { /* поток уже закрыт */ }
      }
    },
  })

  return new Response(stream, {
    headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' },
  })
}
