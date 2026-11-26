// Боевые зависимости бота поддержки (18.11, ветка feat/bot): база через service_role, Telegram по HTTP.
// Только сервер. Тексты материалов, темы и мысли отсюда не читаются: карточка берет почту, тариф, остаток,
// дату регистрации и коды событий (events.props прошли санитайзер: только коды и числа).
import { getSupabaseAdmin } from '@/lib/generation/db'
import { getAccountSummary } from '@/lib/energy'
import { timelineLine } from '@/lib/analytics/admin-view'
import { makeTg } from './telegram'
import { buildSummary, dayRange, monthStart, BOT_TZ, type CardAccount, type SummaryData } from './report'
import { logIncident, type IncidentKind } from './incidents'
import { INCIDENT_RU } from './texts'
import type { BotDeps, BotRepo, BotData, TicketRow } from './core'

const db = () => getSupabaseAdmin()
const SITE = (process.env.SITE_PUBLIC_URL || 'https://psycont.ru').replace(/\/$/, '')
const TICKET_COLS = 'id, tg_chat_id, tg_user_id, user_id, tg_first_name, answered_at'
const must = <T,>(r: { data: T; error: any }, what: string): T => { if (r.error) throw Object.assign(new Error(what), { code: `db_${what}_${r.error.code || 'err'}` }); return r.data }
const toTicket = (r: any): TicketRow => ({ ...r, id: Number(r.id), tg_chat_id: Number(r.tg_chat_id), tg_user_id: Number(r.tg_user_id) })

export function botTg() {
  return makeTg({ token: process.env.TELEGRAM_BOT_TOKEN || '' })
}

export const botRepo: BotRepo = {
  async linkedUser(tg) {
    const r = must(await db().from('bot_tg_links').select('user_id').eq('tg_user_id', tg).maybeSingle(), 'link_get') as any
    return r?.user_id || null
  },
  async consumeToken(hash, nowIso) {
    // один запрос: метка гасится только если не использована и не просрочена (двойной /start не привяжет дважды)
    const r = must(await db().from('bot_link_tokens').update({ used_at: nowIso }).eq('token_hash', hash).is('used_at', null).gt('expires_at', nowIso).select('user_id'), 'token_use') as any[]
    return r?.length ? r[0].user_id : null
  },
  async saveLink(tg, userId) {
    must(await db().from('bot_tg_links').upsert({ tg_user_id: tg, user_id: userId, linked_at: new Date().toISOString() }, { onConflict: 'tg_user_id' }), 'link_save')
    must(await db().from('bot_tickets').update({ user_id: userId }).eq('tg_user_id', tg).is('user_id', null), 'link_tickets')
  },
  async recentTicket(chat, since) {
    const r = must(await db().from('bot_tickets').select(TICKET_COLS).eq('tg_chat_id', chat).gte('last_message_at', since).order('last_message_at', { ascending: false }).limit(1), 'ticket_recent') as any[]
    return r?.length ? toTicket(r[0]) : null
  },
  async openTicket(row) {
    return toTicket(must(await db().from('bot_tickets').insert({ tg_chat_id: row.tg_chat_id, tg_user_id: row.tg_user_id, tg_first_name: row.tg_first_name, user_id: row.user_id, opened_at: row.at, last_message_at: row.at }).select(TICKET_COLS).single(), 'ticket_open'))
  },
  async touchTicket(id, patch) { must(await db().from('bot_tickets').update(patch).eq('id', id), 'ticket_touch') },
  async countIn(chat, since) {
    const r = await db().from('bot_messages').select('id', { count: 'exact', head: true }).eq('tg_chat_id', chat).eq('direction', 'in').gte('created_at', since)
    if (r.error) throw Object.assign(new Error('count'), { code: 'db_count' })
    return r.count || 0
  },
  async claimIn(row) {
    const r = await db().from('bot_messages').insert({ ...row, direction: 'in' }).select('id').single()
    if (r.error?.code === '23505') return null
    return Number(must(r, 'msg_in')!.id)
  },
  async setAdminIds(id, adminChat, adminMsg, card) { must(await db().from('bot_messages').update({ admin_chat_id: Number(adminChat), admin_message_id: adminMsg, admin_card_id: card }).eq('id', id), 'msg_admin') },
  async ticketByAdminMessage(adminChat, adminMsg) {
    const r = must(await db().from('bot_messages').select('ticket_id').eq('admin_chat_id', Number(adminChat)).or(`admin_message_id.eq.${Math.trunc(adminMsg)},admin_card_id.eq.${Math.trunc(adminMsg)}`).limit(1), 'msg_by_admin') as any[]
    if (!r?.length) return null
    const t = must(await db().from('bot_tickets').select(TICKET_COLS).eq('id', r[0].ticket_id).maybeSingle(), 'ticket_get')
    return t ? toTicket(t) : null
  },
  async recordOut(row) { must(await db().from('bot_messages').insert({ ...row, admin_chat_id: Number(row.admin_chat_id), direction: 'out' }), 'msg_out') },
  async markAnswered(id, at) { must(await db().from('bot_tickets').update({ answered_at: at }).eq('id', id), 'ticket_answer') },
  async incident(kind, code, userId) { logIncident(kind as IncidentKind, code, userId) },
}

// ── карточка аккаунта ──
const ERR_EVENTS = ['make_error', 'error_shown', 'limit_hit']
// в «последних действиях» шум; help_* это сам путь в поддержку, он съедал бы 5 строк перед вопросом (ревью 18.11)
const SKIP_EVENTS = ['app_open', 'screen_view', 'help_tg_click', 'help_faq_open']

async function account(userId: string): Promise<CardAccount | null> {
  const u = await db().auth.admin.getUserById(userId).catch(() => null)
  const user = u?.data?.user
  if (!user) return null
  const [summary, acts, errs, inc] = await Promise.all([
    getAccountSummary(userId).catch(() => null),
    db().from('events').select('event, props, created_at').eq('user_id', userId).not('event', 'in', `(${SKIP_EVENTS.join(',')})`).order('created_at', { ascending: false }).limit(5),
    db().from('events').select('event, props, created_at').eq('user_id', userId).in('event', ERR_EVENTS).order('created_at', { ascending: false }).limit(3),
    db().from('bot_incidents').select('kind, code, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(3),
  ])
  const line = (e: any) => ({ at: e.created_at, text: timelineLine({ at: e.created_at, type: 'event', event: e.event, props: e.props || {} }).text })
  const errors = [
    ...(errs.data || []).map(line),
    ...(inc.data || []).map((x: any) => ({ at: x.created_at, text: `сбой, ${INCIDENT_RU[x.kind] || x.kind}: ${x.code}` })),
  ].sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, 3)
  return {
    userId,
    email: user.email || null,
    planName: summary?.plan.name || '?',
    materials: summary ? (summary.plan.isUnlimited ? 'unlimited' : summary.materials ? { remaining: summary.materials.remaining, cap: summary.materials.cap } : null) : null,
    registeredAt: user.created_at || null,
    actions: (acts.data || []).map(line),
    errors,
  }
}

async function findUserByEmail(email: string): Promise<string | null> {
  // та же функция кабинета (execute только у service_role); людей немного, список целиком
  const r = must(await db().rpc('_analytics_users', { p_exclude_emails: [], p_exclude_test: false }), 'users') as any[]
  const hit = (r || []).find((x: any) => String(x.email || '').toLowerCase() === email.toLowerCase())
  return hit?.user_id || null
}

// ── сводка ──
// служебные (INTERNAL_EMAILS и тариф test) не считаются, как в кабинете и в старой сводке scripts/digest.ts
export async function collectSummary(mode: 'morning' | 'today', now = new Date()): Promise<SummaryData> {
  const range = dayRange(BOT_TZ, mode === 'morning' ? 'yesterday' : 'today', now)
  const from = range.from.toISOString(), to = range.to.toISOString()
  const internal = (process.env.INTERNAL_EMAILS || '').split(',').map(s => s.trim()).filter(Boolean)
  const base = { p_exclude_emails: internal, p_exclude_test: true }
  const [people, users, costDay, costMonth] = await Promise.all([
    db().rpc('analytics_people', { ...base, p_tz: BOT_TZ }),
    db().rpc('_analytics_users', base),
    db().rpc('analytics_costs', { ...base, p_from: from, p_to: to, p_tz: BOT_TZ }),
    db().rpc('analytics_costs', { ...base, p_from: monthStart(BOT_TZ, now).toISOString(), p_to: null, p_tz: BOT_TZ }),
  ])
  if (people.error || users.error) throw Object.assign(new Error('summary'), { code: 'db_summary' })
  const allowed = new Set((users.data || []).map((u: any) => u.user_id))
  const inDay = (s: string | null) => { const t = s ? Date.parse(s) : NaN; return t >= range.from.getTime() && t < range.to.getTime() }
  const evs = async (names: string[]) => {
    const r = await db().from('events').select('user_id, event, props').in('event', names).gte('created_at', from).lt('created_at', to).limit(10000)
    return (r.data || []).filter((e: any) => allowed.has(e.user_id))
  }
  const [take, limit, pay, posts, refunds, incidents, open] = await Promise.all([
    evs(['material_take']),
    evs(['limit_hit']),
    evs(['pay_done', 'pay_failed', 'pay_autorenew_off']),
    db().from('generated_posts').select('user_id, format').gte('created_at', from).lt('created_at', to).limit(10000),
    db().from('refunds').select('user_id').eq('status', 'succeeded').gte('updated_at', from).lt('updated_at', to).limit(1000),
    db().from('bot_incidents').select('kind').gte('created_at', from).lt('created_at', to).limit(10000),
    db().from('bot_tickets').select('id', { count: 'exact', head: true }).is('answered_at', null),
  ])
  const incByKind: Record<string, number> = {}
  for (const x of incidents.data || []) incByKind[(x as any).kind] = (incByKind[(x as any).kind] || 0) + 1
  const isText = (f: string) => !!f && f !== 'hooks' && !f.startsWith('rewrite')
  const ppl = (people.data || []) as any[]
  return {
    mode, label: range.label,
    registered: ppl.filter(p => inDay(p.registered_at)).length,
    firstText: ppl.filter(p => inDay(p.first_material_at)).length,
    copies: take.filter((e: any) => String(e.props?.how || '').startsWith('copy')).length,
    trialEnd: new Set(limit.filter((e: any) => e.props?.plan === 'free' && e.props?.reason === 'text_limit').map((e: any) => e.user_id)).size,
    payFirst: pay.filter((e: any) => e.event === 'pay_done' && e.props?.kind === 'first').length,
    payRenewal: pay.filter((e: any) => e.event === 'pay_done' && e.props?.kind === 'renewal').length,
    payFailed: pay.filter((e: any) => e.event === 'pay_failed' && e.props?.kind === 'renewal').length,
    refunds: (refunds.data || []).length, // таблицы нет (оплата не применена): 0
    autoOff: pay.filter((e: any) => e.event === 'pay_autorenew_off').length,
    texts: (posts.data || []).filter((p: any) => allowed.has(p.user_id) && isText(String(p.format || ''))).length,
    incidents: incByKind,
    aiRubDay: Number((costDay.data as any)?.total_rub || 0),
    aiRubMonth: Number((costMonth.data as any)?.total_rub || 0),
    unanswered: open.count || 0,
    mskNote: (process.env.ADMIN_TZ || 'Asia/Barnaul') !== BOT_TZ,
  }
}

export const botData: BotData = {
  account,
  findUserByEmail,
  async summary(mode) { return buildSummary(await collectSummary(mode)) },
  async recentIncidents(n) {
    return must(await db().from('bot_incidents').select('kind, code, created_at').order('created_at', { ascending: false }).limit(n), 'incidents') as any[]
  },
}

export function botConfigured(): boolean {
  return !!process.env.TELEGRAM_BOT_TOKEN && !!process.env.TELEGRAM_ADMIN_CHAT_ID
}

export function botDeps(): BotDeps {
  return {
    repo: botRepo,
    data: botData,
    tg: botTg(),
    adminChatId: process.env.TELEGRAM_ADMIN_CHAT_ID || '',
    linkSecret: process.env.BOT_LINK_SECRET,
    siteUrl: SITE,
    now: () => new Date(),
  }
}

// ── таймер сигналов ──
export type SignalsRepo = {
  pingDb(): Promise<boolean>
  cursor(): Promise<string | null>
  setCursor(at: string): Promise<void>
  freshIncidents(since: string): Promise<{ kind: string; code: string; created_at: string }[]>
  genHour(since: string): Promise<number>
  makeEvents(since: string): Promise<{ event: string; code?: unknown }[]>
  getState(key: string): Promise<{ last_sent_at: string; suppressed: number } | null>
  listStates(): Promise<{ key: string; last_sent_at: string; suppressed: number }[]>
  setState(key: string, s: { last_sent_at: string; suppressed: number }): Promise<void>
  cleanup(now: Date): Promise<void>
}

const CURSOR = 'cursor'

export const signalsRepo: SignalsRepo = {
  async pingDb() {
    try {
      const r = await db().from('bot_signal_state').select('key').limit(1).abortSignal(AbortSignal.timeout(8000))
      return !r.error || r.error.code === '42P01' || r.error.code === 'PGRST205' // таблицы нет: база жива, миграция не применена
    } catch { return false }
  },
  async cursor() { const r = await db().from('bot_signal_state').select('last_sent_at').eq('key', CURSOR).maybeSingle(); return (r.data as any)?.last_sent_at || null },
  async setCursor(at) { await db().from('bot_signal_state').upsert({ key: CURSOR, last_sent_at: at, suppressed: 0, updated_at: at }, { onConflict: 'key' }) },
  async freshIncidents(since) {
    return must(await db().from('bot_incidents').select('kind, code, created_at').gt('created_at', since).in('kind', ['gen', 'openai', 'pay_webhook', 'billing']).order('created_at', { ascending: true }).limit(1000), 'fresh') as any[]
  },
  async genHour(since) {
    const r = await db().from('bot_incidents').select('id', { count: 'exact', head: true }).eq('kind', 'gen').not('code', 'like', 'anon_ner%').gte('created_at', since)
    if (r.error) throw Object.assign(new Error('gen'), { code: 'db_gen_hour' })
    return r.count || 0
  },
  async makeEvents(since) {
    const r = must(await db().from('events').select('event, props, created_at').in('event', ['make_done', 'make_error']).gte('created_at', since).order('created_at', { ascending: false }).limit(50), 'make_events') as any[]
    return r.map(e => ({ event: e.event, code: e.props?.code }))
  },
  async getState(key) { const r = await db().from('bot_signal_state').select('last_sent_at, suppressed').eq('key', key).maybeSingle(); return (r.data as any) || null },
  async listStates() {
    return must(await db().from('bot_signal_state').select('key, last_sent_at, suppressed').neq('key', CURSOR).gt('suppressed', 0), 'states') as any[]
  },
  async setState(key, s) { await db().from('bot_signal_state').upsert({ key, ...s, updated_at: new Date().toISOString() }, { onConflict: 'key' }) },
  async cleanup(now) {
    const ago = (days: number) => new Date(now.getTime() - days * 86400e3).toISOString()
    // метки: просроченные удаляем через сутки после срока
    await db().from('bot_link_tokens').delete().lt('expires_at', ago(1))
    // переписка: 12 месяцев после последнего сообщения обращения (решение Арины 18.11), сообщения каскадом
    await db().from('bot_tickets').delete().lt('last_message_at', ago(365))
    // журнал сбоев: 60 дней
    await db().from('bot_incidents').delete().lt('created_at', ago(60))
  },
}

