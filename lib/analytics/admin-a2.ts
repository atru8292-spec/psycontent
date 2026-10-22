// Данные кабинета для аналитики 2: опрос при уходе и вкладка «Тексты». Только сервер, service_role, только админу.
// Свои слова из опроса показываются в кабинете (их люди написали нам), но почт рядом нет: почта только в карточке.
import { getSupabaseAdmin } from '@/lib/generation/db'
import { adminOrNull, internalEmails } from '@/lib/admin'
import type { AdminOpts } from './admin-types'
import type { Loaded } from './admin-data'
import type { ExitPlace, ExitReason } from './exit-survey'
import { computeWeek, demoWeekPosts, weekOf } from './quality-week'

export type ExitAnswer = { id: string; user_id: string; place: ExitPlace; reasons: ExitReason[]; other_text: string | null; can_contact: boolean; created_at: string }
export type ExitStats = { shown: number; sent: number; dismissed: number; answers: ExitAnswer[] }
export type PersonExit = { answers: ExitAnswer[]; shownAt: string | null; dismissedAt: string | null }
export type QualityRow = { week_start: string; format: string; variant: string; texts: number; metrics: Record<string, number> }

const missing = (code?: string) => code === '42P01' || code === 'PGRST205'
const since = (o: AdminOpts) => (o.period === 'all' ? null : new Date(Date.now() - Number(o.period) * 86400000).toISOString())

async function allowedUsers(o: AdminOpts): Promise<Set<string> | null> {
  const { data, error } = await getSupabaseAdmin().rpc('_analytics_users', { p_exclude_emails: o.includeInternal ? [] : internalEmails(), p_exclude_test: !o.includeInternal })
  if (error) return null
  return new Set((data || []).map((u: any) => u.user_id))
}

// ---------- демо ----------
const DEMO_ANSWERS = (now = Date.now()): ExitAnswer[] => {
  const at = (d: number) => new Date(now - d * 86400000).toISOString()
  const u = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`
  return [
    { id: 'e1', user_id: u(3), place: 'cooling', reasons: ['not_me', 'same'], other_text: 'Слишком гладко выходит, мои клиенты так не говорят', can_contact: true, created_at: at(1) },
    { id: 'e2', user_id: u(5), place: 'cooling', reasons: ['pause'], other_text: null, can_contact: false, created_at: at(2) },
    { id: 'e3', user_id: u(7), place: 'cooling', reasons: ['no_clients'], other_text: 'Выложила восемь постов, записей ноль', can_contact: false, created_at: at(4) },
    { id: 'e4', user_id: u(8), place: 'cooling', reasons: ['no_time', 'hard'], other_text: null, can_contact: false, created_at: at(6) },
    { id: 'e5', user_id: u(9), place: 'cooling', reasons: ['same'], other_text: null, can_contact: true, created_at: at(9) },
    { id: 'e6', user_id: u(10), place: 'cooling', reasons: ['broken', 'other'], other_text: 'Карусель не скачивалась на айфоне', can_contact: false, created_at: at(13) },
  ]
}
export function demoExitStats(): ExitStats { const a = DEMO_ANSWERS(); return { shown: 17, sent: a.length, dismissed: 5, answers: a } }
export function demoQuality(now = new Date(), tz = 'Asia/Barnaul'): QualityRow[] {
  const rows: QualityRow[] = []
  let monday = weekOf(now, tz).from
  for (let i = 0; i < 9; i++) {
    const w = weekOf(monday, tz)
    // неделя за неделей одинаковости чуть больше: видно подсветку «хуже»
    const posts = demoWeekPosts(7 + i * 13, 50 + i * 3).map(p => (i < 2 ? { ...p, text: p.text.replace(/^\S+/, 'Знаешь') } : p))
    rows.push(...computeWeek(w.start, posts, { all: i === 0 ? 4 : 1 }))
    monday = new Date(w.from.getTime() - 3 * 86400000)
  }
  return rows
}

// ---------- загрузка ----------
export async function loadExitStats(o: AdminOpts): Promise<Loaded<ExitStats>> {
  if (!(await adminOrNull())) return { data: null, error: 'failed' }
  if (o.demo) return { data: demoExitStats(), error: null }
  const db = getSupabaseAdmin()
  const from = since(o)
  let q = db.from('exit_surveys').select('id, user_id, place, reasons, other_text, can_contact, created_at').order('created_at', { ascending: false }).limit(500)
  if (from) q = q.gte('created_at', from)
  const { data, error } = await q
  if (error) return { data: null, error: missing(error.code) ? 'no_migration' : 'failed' }
  const allowed = await allowedUsers(o)
  // без списка людей не отделить служебных: лучше честная ошибка, чем цифры вместе со служебными
  if (!allowed) return { data: null, error: 'failed' }
  const answers = ((data || []) as ExitAnswer[]).filter(a => allowed.has(a.user_id))
  const count = async (event: string) => {
    let e = db.from('events').select('user_id').eq('event', event)
    if (from) e = e.gte('created_at', from)
    const r = await e.limit(5000)
    return (r.data || []).filter((x: any) => allowed.has(x.user_id)).length
  }
  const [shown, dismissed] = await Promise.all([count('exit_survey_shown'), count('exit_survey_dismiss')])
  return { data: { shown, sent: answers.length, dismissed, answers }, error: null }
}

export async function loadPersonExit(o: AdminOpts, userId: string): Promise<Loaded<PersonExit>> {
  if (!(await adminOrNull())) return { data: null, error: 'failed' }
  if (o.demo) { const a = DEMO_ANSWERS().filter(x => x.user_id === userId); return { data: { answers: a, shownAt: a[0]?.created_at || null, dismissedAt: null }, error: null } }
  const db = getSupabaseAdmin()
  const [ans, shown, dis] = await Promise.all([
    db.from('exit_surveys').select('id, user_id, place, reasons, other_text, can_contact, created_at').eq('user_id', userId).order('created_at', { ascending: false }),
    db.from('events').select('created_at').eq('user_id', userId).eq('event', 'exit_survey_shown').order('created_at', { ascending: false }).limit(1).maybeSingle(),
    db.from('events').select('created_at').eq('user_id', userId).eq('event', 'exit_survey_dismiss').order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ])
  if (ans.error) return { data: null, error: missing(ans.error.code) ? 'no_migration' : 'failed' }
  return { data: { answers: (ans.data || []) as ExitAnswer[], shownAt: shown.data?.created_at || null, dismissedAt: dis.data?.created_at || null }, error: null }
}

// последние 9 недель (8 закрытых и текущая, если уже посчитана)
export async function loadQuality(o: AdminOpts): Promise<Loaded<QualityRow[]>> {
  if (!(await adminOrNull())) return { data: null, error: 'failed' }
  if (o.demo) return { data: demoQuality(), error: null }
  const from = new Date(Date.now() - 9 * 7 * 86400000).toISOString().slice(0, 10)
  const { data, error } = await getSupabaseAdmin().from('quality_weekly').select('week_start, format, variant, texts, metrics').gte('week_start', from).order('week_start', { ascending: false })
  if (error) return { data: null, error: missing(error.code) ? 'no_migration' : 'failed' }
  return { data: (data || []) as QualityRow[], error: null }
}
