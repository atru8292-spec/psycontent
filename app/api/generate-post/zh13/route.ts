// zh13 (19.11): один текст генератором zh13 (lib/generation/zh13). По умолчанию у всех; GENERATOR=zh6 или
// ZH13_ONLY_EMAILS сужают (lib/generation/zh13/flag.ts), остальные пишут zh6 через /api/generate-post/group.
// Тело: { format?: код формата zh13 | 'auto', mysl?: своя мысль, topic?: тема, fromPostId?: тот же текст в другом
// формате или заново (тема, мысль, ситуация и группа берутся у него, только свой по user_id), zanovo?: true }.
// Ответ JSON: текст по частям (главное, подпись, надпись, «Как снять», «Подойдет еще»). Счет как у zh6: один текст
// это одна текстовая генерация (lib/energy.ts, generate_post), упавший не считаем. Проверка качества пишется после
// ответа (after), в ответ не входит.
import { NextRequest, NextResponse, after } from 'next/server'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { getSessionUser } from '@/lib/auth'
import { canConsume, commitConsume, recordFailure, recordRefusal, releaseConsume } from '@/lib/energy'
import { serverTrack } from '@/lib/track-server'
import { errTag } from '@/lib/safe-error'
import { zh13Dlya } from '@/lib/generation/zh13/flag'
import { napisat, VERSIYA, KodOshibki } from '@/lib/generation/zh13/pishi'
import { formatPo } from '@/lib/generation/zh13/formaty'
import { vstavitKachestvo, doschitatKachestvo, zapisatDeystvie } from '@/lib/generation/zh13/kachestvo-db'
import { savePost } from '../new-pipeline'

export const maxDuration = 120
const OP = 'generate_post'

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
  if (!zh13Dlya(user.email)) return NextResponse.json({ error: 'not_available' }, { status: 403 })
  const userId = user.id

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'bad_request' }, { status: 400 }) }
  const kod = typeof body?.format === 'string' && formatPo(body.format) ? body.format : null
  const mysl = clean(body?.mysl, 1500) || null
  const topic = clean(body?.topic, 300) || null
  const fromPostId = clean(body?.fromPostId, 64) || null
  const zanovo = body?.zanovo === true

  const fail = (code: string, status: number, extra: Record<string, unknown> = {}) => {
    serverTrack(userId, 'make_error', { code, format: kod || 'auto' })
    return NextResponse.json({ error: code, ...extra }, { status })
  }

  const db = admin()
  const prof = await db.from('onboarding_profiles').select('*').eq('user_id', userId).single()
  if (prof.error) {
    if (prof.error.code === 'PGRST116') return NextResponse.json({ error: 'need_onboarding' }, { status: 404 })
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
  const profile = prof.data

  const decision = await canConsume(userId, OP, 1)
  if (!decision.ok) {
    await recordRefusal(userId, OP)
    return fail(decision.reason || 'limit', 429, { message: decision.message })
  }

  if (fromPostId) {
    serverTrack(userId, 'material_adjust', { action: zanovo ? 'zanovo' : 'more_format', format: kod || 'auto', post: fromPostId })
    // действие с прошлым текстом: заново или другой формат (строка проверки своя, по user_id)
    after(() => zapisatDeystvie(db, userId, fromPostId, zanovo ? 'zanovo' : 'format').then(() => {}, () => {}))
  }
  serverTrack(userId, 'make_start', { formats: kod ? (formatPo(kod)!.vid) : 'auto', n: 1, voice: body?.voice === true, format_kod: kod || 'auto', mode: mysl ? 'thought' : 'topic' })

  const t0 = Date.now()
  // бронь материала (canConsume) отпускается в finally на любом исходе; после списания ее уже нет
  try {
    const knownNames = profile.full_name ? [String(profile.full_name)] : []
    const it = await napisat(db, userId, profile, { formatKod: kod, mysl, tema: topic, fromPostId }, knownNames, { t0 })
    // пустой текст (модель прислала только «Как снять» или «Речь: нет»): не сохраняем и не списываем
    if (!it.rez.glavnoe.trim()) throw new Error('zh13_empty')
    const groupId = it.groupId || randomUUID()
    const postId = await savePost(db, {
      user_id: userId, topic: (it.meta.tema || it.meta.mysl || '').slice(0, 300), format: it.f.bazaFormat, category: 'Своя тема',
      content: it.rez.tekst, pipeline_version: VERSIYA, pipeline_status: 'ready', draft_content: it.rez.tekst,
      group_id: groupId,
      // карусель zh6: выбор zh6 (zh4) рядом, как у текстов zh6, по нему память zh6 и кнопки
      check_result: { mode: 'zh13', ms_total: Date.now() - t0, zh13: it.meta, ...(it.meta.zh4 ? { zh4: it.meta.zh4 } : {}) },
    }, { basicId: true })
    if (!postId) {
      await recordFailure(userId, OP)
      return fail('save_failed', 500)
    }
    await commitConsume(userId, OP, decision)
    // строка проверки до ответа (чтобы «Скопировать» в первые секунды нашло ее), доли за неделю и тревога после
    const q = { postId, userId, kod: it.f.kod, vid: it.f.vid, rezhim: it.meta.rezhim, opora: it.meta.opora, proverka: it.proverka, cel: it.meta.cel || null, huk: it.meta.hukVid || null }
    const vstavleno = await vstavitKachestvo(db, q)
    if (vstavleno) after(() => doschitatKachestvo(db, q))
    serverTrack(userId, 'make_done', { formats: it.f.vid, ms: Date.now() - t0, n_ok: 1 })
    return NextResponse.json({
      postId, groupId, kod: it.f.kod, vid: it.f.vid, imya: it.f.imya,
      glavnoe: it.rez.glavnoe, podpis: it.rez.podpis, nadpis: it.rez.nadpis, kakSnyat: it.rez.kakSnyat,
      podoydet: it.rez.podoydet.map(p => ({ ...p, imya: formatPo(p.kod)?.imya || p.kod })),
      tema: it.meta.tema, mysl: it.meta.mysl, text: it.rez.tekst,
    })
  } catch (e: any) {
    // формат требует фактов о себе или сцены из фильма: не сбой, человеку понятное объяснение, ничего не списано
    if (e instanceof KodOshibki) {
      await recordFailure(userId, OP).catch(() => {})
      return fail(e.kod, 422, { message: e.kod === 'net_faktov' ? 'Тут нужна твоя история. Впиши в «Свою мысль», что с тобой было' : 'Под эту тему пока не нашлось подходящего фильма. Выбери другой формат' })
    }
    console.error('zh13 generation failed:', errTag(e))
    await recordFailure(userId, OP).catch(() => {})
    const money = /credit_balance|insufficient_quota|openai_401/i.test(String(e?.message || e?.code || ''))
    return fail(money ? 'ai_unavailable' : 'format_failed', 502, { message: 'Этот текст не получился. Попробуй еще раз' })
  } finally {
    await releaseConsume(decision)
  }
}

// Свой текст zh13 по id (из «Моих текстов»: /dashboard/make?post=<id>): части для экрана из check_result.zh13
export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const id = clean(req.nextUrl.searchParams.get('post'), 64)
  // ?since=<мс>: последний свой zh13-текст после этого времени (26.11, активация). Экран зовет это, когда ответ
  // генерации оборвался (связь, свернутый браузер, обновление страницы), а сервер текст уже дописал и списал:
  // иначе человек видел «сбой» и тратил второй пробный. Не старше 10 минут назад; нет текста: 404 not_yet
  const since = Number(req.nextUrl.searchParams.get('since'))
  if (!id && Number.isFinite(since) && since > Date.now() - 10 * 60000) {
    const q = await admin().from('generated_posts').select('id, group_id, content, check_result, pipeline_version').eq('user_id', user.id)
      .eq('pipeline_version', VERSIYA).gte('created_at', new Date(since).toISOString()).order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (q.error) return NextResponse.json({ error: 'server_error' }, { status: 500 })
    if (!q.data || typeof q.data.check_result?.zh13?.glavnoe !== 'string') return NextResponse.json({ error: 'not_yet' }, { status: 404 })
    return NextResponse.json(otvet(q.data))
  }
  if (!id) return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  const r = await admin().from('generated_posts').select('id, group_id, content, check_result, pipeline_version').eq('id', id).eq('user_id', user.id).maybeSingle()
  // сбой чтения не выдаем за «нет такого текста»: 404 значит «текст не от zh13», экран тогда открывает прежний
  if (r.error) return NextResponse.json({ error: 'server_error' }, { status: 500 })
  const m = r.data?.check_result?.zh13
  if (!r.data || r.data.pipeline_version !== VERSIYA || !m || typeof m.glavnoe !== 'string') return NextResponse.json({ error: 'not_found' }, { status: 404 })
  return NextResponse.json(otvet(r.data))
}

function otvet(row: any) {
  const m = row.check_result.zh13
  const f = formatPo(m.kod)
  return {
    postId: row.id, groupId: row.group_id, kod: m.kod, vid: m.vid, imya: f?.imya || m.kod,
    glavnoe: m.glavnoe, podpis: m.podpis || '', nadpis: m.nadpis || '', kakSnyat: m.kakSnyat || [],
    podoydet: (m.podoydet || []).map((p: any) => ({ ...p, imya: formatPo(p.kod)?.imya || p.kod })),
    tema: m.tema || null, mysl: m.mysl || null, text: row.content,
  }
}
