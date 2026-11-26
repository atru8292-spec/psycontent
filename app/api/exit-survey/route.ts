// Опрос при уходе (аналитика 2, 24.10), с 26.11 карточка помощи на «Написать» (components/make/zh13/HelpCard.tsx; показ пишется с props.kind help, /admin «Почему уходят» его не считает опросом).
// GET: показывать ли (без записи), POST {action:'shown'}: отметка показа, POST с ответом: старый опрос (карточки с ответами больше нет).
// Статус берем из analytics_churn, но визит считаем по прошлой сессии (события старше SESSION_MIN минут): иначе
// app_open этого захода делает «Ушла» активной в момент входа. Свои слова человека пишутся только в exit_surveys,
// в события идут только коды причин. Причина «дорого» видна, только когда оплата открыта этому человеку (paymentsOnFor, 20.11). Без таблицы exit_surveys или events карточка молча не показывается.
import { NextRequest, NextResponse } from 'next/server'
import { errTag } from '@/lib/safe-error'
import { getSessionUser } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/generation/db'
import { serverTrack } from '@/lib/track-server'
import { decideSurvey, decideStuck, cleanAnswer, SESSION_MIN, SURVEY_PAUSE_DAYS, type ExitPlace } from '@/lib/analytics/exit-survey'
import { paymentsOnFor } from '@/lib/billing/ready'
import { TAKE_EVENT } from '@/lib/analytics/definitions'

const DAY = 86400000
const PLACES: ExitPlace[] = ['delete', 'cooling', 'cancel', 'stuck']
// коды причин в событие: значение события до 40 знаков (lib/analytics/sanitize.ts), лишние коды отбрасываем целиком
const codesForEvent = (codes: string[]) => { let s = ''; for (const c of codes) { const n = s ? `${s},${c}` : c; if (n.length > 40) break; s = n } return s }

type Reshenie = { place: 'stuck' | 'cooling' } | null

// Показывать ли карточку помощи (26.11): только решение, без записи. Сбой чтения: не показываем.
async function reshit(db: ReturnType<typeof getSupabaseAdmin>, userId: string): Promise<Reshenie> {
  const now = Date.now()
  const sessionStart = new Date(now - SESSION_MIN * 60000).toISOString()
  const [churn, prev, shown, answered, recent, stuckShown, stuckAns] = await Promise.all([
    db.rpc('analytics_churn', { p_user_id: userId, p_tz: process.env.ADMIN_TZ || 'Asia/Barnaul' }),
    db.from('events').select('created_at').eq('user_id', userId).lt('created_at', sessionStart).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    db.from('events').select('created_at').eq('user_id', userId).eq('event', 'exit_survey_shown').neq('props->>place', 'stuck').order('created_at', { ascending: false }).limit(3),
    db.from('exit_surveys').select('id', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', new Date(now - SURVEY_PAUSE_DAYS * DAY).toISOString()),
    // в этом заходе уже работает: сделала или взяла материал за последние SESSION_MIN минут
    db.from('events').select('id', { count: 'exact', head: true }).eq('user_id', userId).in('event', ['make_done', TAKE_EVENT]).gte('created_at', sessionStart),
    db.from('events').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('event', 'exit_survey_shown').eq('props->>place', 'stuck'),
    db.from('exit_surveys').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('place', 'stuck'),
  ])
  if (churn.error || !churn.data?.facts || shown.error || answered.error || stuckShown.error) return null
  // сначала «застряла» (ни разу не брала текст), иначе «вернулась после паузы»; вместе никогда
  const st = decideStuck({ facts: churn.data.facts, stuckShown: (stuckShown.count || 0) > 0, stuckAnswered: !stuckAns.error && (stuckAns.count || 0) > 0, tookThisSession: (recent.count || 0) > 0 })
  if (st.show) return { place: 'stuck' }
  const d = decideSurvey({
    facts: churn.data.facts,
    prevVisitAt: prev.data?.created_at || null,
    lastShownAt: shown.data?.[0]?.created_at || null,
    shows: shown.data?.length || 0,
    answeredRecently: (answered.count || 0) > 0,
    tookThisSession: (recent.count || 0) > 0,
  })
  return d.show ? { place: 'cooling' } : null
}

// GET: решение для карточки помощи на «Написать». Показ НЕ отмечается: раньше GET писал exit_survey_shown сразу,
// и показ тратился, даже если карточку не увидели (ушла со страницы, карточка на старой главной, которой нет).
export async function GET() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ show: false }, { status: 401 })
  try {
    const r = await reshit(getSupabaseAdmin(), user.id)
    return NextResponse.json(r ? { show: true, place: r.place } : { show: false })
  } catch (e: any) {
    console.warn('exit-survey GET:', errTag(e))
    return NextResponse.json({ show: false })
  }
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'bad_request' }, { status: 400 }) }
  // карточка помощи уже на экране: отмечаем показ, решение проверяем заново (иначе показы можно накрутить или сбить)
  if (body?.action === 'shown') {
    const db = getSupabaseAdmin()
    try {
      const r = await reshit(db, user.id)
      if (!r || r.place !== body?.place) return NextResponse.json({ ok: false }, { status: 409 })
      const mark = await db.from('events').insert({ user_id: user.id, event: 'exit_survey_shown', props: { place: r.place, kind: 'help' } })
      if (mark.error) { console.warn('exit_survey_shown:', errTag(mark.error)); return NextResponse.json({ ok: false }, { status: 500 }) }
      return NextResponse.json({ ok: true })
    } catch (e: any) {
      console.warn('exit-survey shown:', errTag(e))
      return NextResponse.json({ ok: false }, { status: 500 })
    }
  }
  // пока в продукте есть только карточка на главной; delete и cancel примем, когда появятся их экраны
  const place: ExitPlace = body?.place === undefined ? 'cooling' : body.place
  if (!PLACES.includes(place)) return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  if (place !== 'cooling' && place !== 'stuck') return NextResponse.json({ error: 'not_available' }, { status: 400 })
  // ответ только на свой показ: был показ за последние 2 суток и после него ответа еще нет (иначе можно накрутить)
  const db = getSupabaseAdmin()
  const shown = await db.from('events').select('created_at').eq('user_id', user.id).eq('event', 'exit_survey_shown').eq('props->>place', place)
    .gte('created_at', new Date(Date.now() - 2 * DAY).toISOString()).order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (shown.error || !shown.data) return NextResponse.json({ error: 'not_shown' }, { status: 409 })
  const after = await db.from('exit_surveys').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('place', place).gte('created_at', shown.data.created_at)
  if (after.error || (after.count || 0) > 0) return NextResponse.json({ error: 'already' }, { status: 409 })
  const a = body?.action === 'pause' && place !== 'stuck' ? { reasons: ['pause' as const], other: null, contact: false } : cleanAnswer(body, paymentsOnFor(user.email), place)
  if (!a.reasons.length && !a.other) return NextResponse.json({ error: 'empty' }, { status: 400 })
  const { error } = await db.from('exit_surveys')
    .insert({ user_id: user.id, place, reasons: a.reasons, other_text: a.other, can_contact: a.contact })
  if (error) {
    console.warn('exit_surveys insert:', errTag(error))
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
  serverTrack(user.id, 'exit_survey_sent', { place, reasons: codesForEvent(a.reasons), own: !!a.other, contact: a.contact })
  return NextResponse.json({ ok: true })
}
