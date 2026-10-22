// Опрос при уходе (аналитика 2, 24.10). GET: показывать ли карточку на главной (и отметка показа), POST: ответ.
// Статус берем из analytics_churn, но визит считаем по прошлой сессии (события старше SESSION_MIN минут): иначе
// app_open этого захода делает «Ушла» активной в момент входа. Свои слова человека пишутся только в exit_surveys,
// в события идут только коды причин. Без таблицы exit_surveys или events карточка молча не показывается.
import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/generation/db'
import { serverTrack } from '@/lib/track-server'
import { decideSurvey, cleanAnswer, SESSION_MIN, SURVEY_PAUSE_DAYS, type ExitPlace } from '@/lib/analytics/exit-survey'
import { PRICING_FLAGS } from '@/lib/pricing'
import { TAKE_EVENT } from '@/lib/analytics/definitions'

const DAY = 86400000
const PLACES: ExitPlace[] = ['delete', 'cooling', 'cancel']
// коды причин в событие: значение события до 40 знаков (lib/analytics/sanitize.ts), лишние коды отбрасываем целиком
const codesForEvent = (codes: string[]) => { let s = ''; for (const c of codes) { const n = s ? `${s},${c}` : c; if (n.length > 40) break; s = n } return s }

export async function GET() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ show: false }, { status: 401 })
  const db = getSupabaseAdmin()
  try {
    const now = Date.now()
    const sessionStart = new Date(now - SESSION_MIN * 60000).toISOString()
    const [churn, prev, shown, answered, recent] = await Promise.all([
      db.rpc('analytics_churn', { p_user_id: user.id, p_tz: process.env.ADMIN_TZ || 'Asia/Barnaul' }),
      db.from('events').select('created_at').eq('user_id', user.id).lt('created_at', sessionStart).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      db.from('events').select('created_at').eq('user_id', user.id).eq('event', 'exit_survey_shown').order('created_at', { ascending: false }).limit(3),
      db.from('exit_surveys').select('id', { count: 'exact', head: true }).eq('user_id', user.id).gte('created_at', new Date(now - SURVEY_PAUSE_DAYS * DAY).toISOString()),
      // в этом заходе уже работает: сделала или взяла материал за последние SESSION_MIN минут
      db.from('events').select('id', { count: 'exact', head: true }).eq('user_id', user.id).in('event', ['make_done', TAKE_EVENT]).gte('created_at', sessionStart),
    ])
    if (churn.error || !churn.data?.facts || shown.error || answered.error) return NextResponse.json({ show: false })
    const d = decideSurvey({
      facts: churn.data.facts,
      prevVisitAt: prev.data?.created_at || null,
      lastShownAt: shown.data?.[0]?.created_at || null,
      shows: shown.data?.length || 0,
      answeredRecently: (answered.count || 0) > 0,
      tookThisSession: (recent.count || 0) > 0,
    })
    if (!d.show) return NextResponse.json({ show: false })
    // показ отмечаем сразу: с этого момента 60 дней тишины, даже если человек не нажал ничего
    serverTrack(user.id, 'exit_survey_shown', { place: 'cooling' })
    return NextResponse.json({ show: true, place: 'cooling', paymentsOn: PRICING_FLAGS.paymentsOn })
  } catch (e: any) {
    console.warn('exit-survey GET:', e?.message)
    return NextResponse.json({ show: false })
  }
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'bad_request' }, { status: 400 }) }
  const place: ExitPlace = PLACES.includes(body?.place) ? body.place : 'cooling'
  const a = body?.action === 'pause' ? { reasons: ['pause' as const], other: null, contact: false } : cleanAnswer(body, PRICING_FLAGS.paymentsOn)
  if (!a.reasons.length && !a.other) return NextResponse.json({ error: 'empty' }, { status: 400 })
  const { error } = await getSupabaseAdmin().from('exit_surveys')
    .insert({ user_id: user.id, place, reasons: a.reasons, other_text: a.other, can_contact: a.contact })
  if (error) {
    console.warn('exit_surveys insert:', error.message)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
  serverTrack(user.id, 'exit_survey_sent', { place, reasons: codesForEvent(a.reasons), own: !!a.other, contact: a.contact })
  return NextResponse.json({ ok: true })
}
