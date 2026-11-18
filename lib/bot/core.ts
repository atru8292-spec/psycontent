// Логика бота поддержки (18.11, ветка feat/bot) без базы и сети: зависимости приходят в BotDeps
// (боевые в lib/bot/deps.ts, заглушки в scripts/test-bot.ts).
//
// Человек пишет боту -> сообщение копируется Арине (TELEGRAM_ADMIN_CHAT_ID) с карточкой аккаунта.
// Арина отвечает реплаем на копию или карточку -> бот копирует ее ответ человеку.
// Команды /svodka, /oshibki, /chelovek только из чата Арины; от чужих это обычный вопрос.
// В базе нет текстов сообщений: только id сообщений Telegram, тип и время.
import * as T from './texts'
import { buildCard, incidentLine, type CardAccount } from './report'
import { verifyToken, hashToken } from './token'
import type { TgResult } from './telegram'

export const TICKET_GAP_MS = 24 * 3600 * 1000   // молчание дольше суток: следующее сообщение открывает новое обращение
export const IN_PER_HOUR = 30                    // антиспам: сообщений от одного чата за час

export type TicketRow = { id: number; tg_chat_id: number; tg_user_id: number; user_id: string | null; tg_first_name: string | null; answered_at?: string | null }

// короткое «спасибо» в течение часа после ответа Арины не делает обращение снова «без ответа» (ревью 18.11)
export const THANKS_WINDOW_MS = 3600 * 1000
export const THANKS_MAX_LEN = 60

export interface BotRepo {
  linkedUser(tgUserId: number): Promise<string | null>
  consumeToken(hash: string, nowIso: string): Promise<string | null>  // атомарно: не использована и не просрочена
  saveLink(tgUserId: number, userId: string): Promise<void>            // и проставить user_id недавним обращениям
  recentTicket(chatId: number, sinceIso: string): Promise<TicketRow | null>
  openTicket(row: { tg_chat_id: number; tg_user_id: number; tg_first_name: string | null; user_id: string | null; at: string }): Promise<TicketRow>
  touchTicket(id: number, patch: { last_message_at: string; answered_at?: null; user_id?: string; tg_first_name?: string | null }): Promise<void>
  countIn(chatId: number, sinceIso: string): Promise<number>
  claimIn(row: { ticket_id: number; tg_chat_id: number; kind: string; tg_message_id: number }): Promise<number | null> // id строки, null: дубль
  setAdminIds(rowId: number, adminChatId: string, adminMessageId: number | null, adminCardId: number | null): Promise<void>
  // только в чате Арины, где лежит сообщение: id сообщений уникальны внутри чата (ревью 18.11)
  ticketByAdminMessage(adminChatId: string, adminMessageId: number): Promise<TicketRow | null>
  recordOut(row: { ticket_id: number; tg_chat_id: number; kind: string; tg_message_id: number; admin_message_id: number; admin_chat_id: string }): Promise<void>
  markAnswered(ticketId: number, at: string): Promise<void>
  incident(kind: string, code: string, userId?: string | null): Promise<void> // не бросает
}

export interface BotData {
  account(userId: string): Promise<CardAccount | null>   // не бросает: при сбое частичная карточка
  findUserByEmail(email: string): Promise<string | null>
  summary(mode: 'today'): Promise<string>
  recentIncidents(n: number): Promise<{ kind: string; code: string; created_at: string }[]>
}

export interface BotTg {
  send(chatId: number | string, text: string, extra?: Record<string, unknown>): Promise<TgResult<{ message_id: number }>>
  copy(fromChat: number | string, messageId: number, toChat: number | string, extra?: Record<string, unknown>): Promise<TgResult<{ message_id: number }>>
}

export interface BotDeps {
  repo: BotRepo
  data: BotData
  tg: BotTg
  adminChatId: string
  linkSecret?: string
  siteUrl: string
  now: () => Date
}

const SUPPORTED = ['text', 'photo', 'voice', 'document', 'audio', 'video', 'video_note'] as const

export function kindOf(m: any): string | null {
  for (const k of SUPPORTED) if (m?.[k] != null) return k
  return null
}

// «/chelovek@psycont_supportbot a@b.ru» -> { cmd: 'chelovek', arg: 'a@b.ru' }
export function parseCommand(text: unknown): { cmd: string; arg: string } | null {
  if (typeof text !== 'string') return null
  const m = text.trim().match(/^\/([a-z_]+)(?:@[A-Za-z0-9_]+)?(?:\s+([\s\S]*))?$/)
  return m ? { cmd: m[1], arg: (m[2] || '').trim() } : null
}

const iso = (d: Date) => d.toISOString()

export async function handleUpdate(d: BotDeps, update: any): Promise<string> {
  const m = update?.message
  if (!m || typeof m !== 'object' || !m.chat || typeof m.message_id !== 'number') return 'skip'
  if (d.adminChatId && String(m.chat.id) === String(d.adminChatId)) return handleAdmin(d, m)
  if (m.chat.type !== 'private' || !m.from || m.from.is_bot) return 'skip'
  return handleUser(d, m)
}

// ── человек ──
async function handleUser(d: BotDeps, m: any): Promise<string> {
  const chatId: number = m.chat.id
  const tgUserId: number = m.from.id
  const firstName: string | null = typeof m.from.first_name === 'string' ? m.from.first_name.slice(0, 64) : null // ник не храним
  const now = d.now()

  const cmd = parseCommand(m.text)
  if (cmd?.cmd === 'start') {
    let text = T.START
    if (cmd.arg) {
      text = T.START_EXPIRED
      if (verifyToken(d.linkSecret, cmd.arg)) {
        let userId: string | null = null
        try { userId = await d.repo.consumeToken(hashToken(cmd.arg), iso(now)) } catch { await d.repo.incident('db', 'link_token') }
        if (userId) {
          // метка уже погашена: человеку не говорим «устарела», даже если связь не записалась (ревью 18.11)
          text = T.START
          try { await d.repo.saveLink(tgUserId, userId) } catch { await d.repo.incident('db', 'link_save', userId) }
        }
      }
    }
    await sendOrLog(d, chatId, text)
    return cmd.arg ? (text === T.START ? 'start_linked' : 'start_expired') : 'start'
  }

  const kind = kindOf(m)
  if (!kind) { await sendOrLog(d, chatId, T.UNSUPPORTED); return 'unsupported' }

  let ticket: TicketRow, isNew = false, rowId: number | null, userId: string | null = null
  try {
    const count = await d.repo.countIn(chatId, iso(new Date(now.getTime() - 3600e3)))
    if (count >= IN_PER_HOUR) {
      if (count === IN_PER_HOUR) {
        // одна отметка сверх предела, чтобы предупреждение ушло один раз
        const t = await d.repo.recentTicket(chatId, iso(new Date(now.getTime() - TICKET_GAP_MS)))
        if (t) await d.repo.claimIn({ ticket_id: t.id, tg_chat_id: chatId, kind, tg_message_id: m.message_id })
        await sendOrLog(d, chatId, T.TOO_MANY)
      }
      return 'flood'
    }
    userId = await d.repo.linkedUser(tgUserId)
    const recent = await d.repo.recentTicket(chatId, iso(new Date(now.getTime() - TICKET_GAP_MS)))
    if (recent) {
      ticket = recent
      const thanks = !!recent.answered_at && now.getTime() - Date.parse(recent.answered_at) < THANKS_WINDOW_MS
        && kind === 'text' && String(m.text || '').trim().length <= THANKS_MAX_LEN
      await d.repo.touchTicket(recent.id, { last_message_at: iso(now), ...(thanks ? {} : { answered_at: null }), ...(userId && !recent.user_id ? { user_id: userId } : {}), ...(firstName !== recent.tg_first_name ? { tg_first_name: firstName } : {}) })
    } else {
      ticket = await d.repo.openTicket({ tg_chat_id: chatId, tg_user_id: tgUserId, tg_first_name: firstName, user_id: userId, at: iso(now) })
      isNew = true
    }
    rowId = await d.repo.claimIn({ ticket_id: ticket.id, tg_chat_id: chatId, kind, tg_message_id: m.message_id })
    if (rowId == null) return 'duplicate' // Telegram прислал то же сообщение повторно
  } catch {
    // база не ответила: сообщение все равно доходит до Арины, без карточки и без реплая
    await d.repo.incident('db', 'bot_ticket')
    const h = await d.tg.send(d.adminChatId, `${T.CARD.noBase}\n${T.CARD.tgName}: ${firstName || '?'}`)
    const c = await d.tg.copy(chatId, m.message_id, d.adminChatId, h.ok ? { reply_parameters: { message_id: h.result.message_id, allow_sending_without_reply: true } } : {})
    if (!c.ok) { await sendOrLog(d, chatId, T.NOT_PASSED); return 'lost' }
    return 'forwarded_nodb'
  }

  const account = (ticket.user_id || userId) ? await d.data.account((ticket.user_id || userId)!).catch(() => null) : null
  const card = buildCard({ isNew, kind, tgFirstName: firstName, account, siteUrl: d.siteUrl })
  const cardRes = await d.tg.send(d.adminChatId, card)
  if (!cardRes.ok) await d.repo.incident('bot', cardRes.code)
  const cardId = cardRes.ok ? cardRes.result.message_id : null
  const copyRes = await d.tg.copy(chatId, m.message_id, d.adminChatId, cardId ? { reply_parameters: { message_id: cardId, allow_sending_without_reply: true } } : {})
  if (!copyRes.ok) await d.repo.incident('bot', copyRes.code)
  const copyId = copyRes.ok ? copyRes.result.message_id : null
  await d.repo.setAdminIds(rowId, d.adminChatId, copyId, cardId).catch(() => d.repo.incident('db', 'bot_admin_ids'))
  if (!copyRes.ok) {
    // Арина видит карточку, но не содержимое: человеку не «получено», а просьба написать еще раз (ревью 18.11)
    if (cardRes.ok) await sendOrLog(d, d.adminChatId, T.ADMIN_COPY_FAILED, { reply_parameters: { message_id: cardId, allow_sending_without_reply: true } })
    await sendOrLog(d, chatId, T.NOT_PASSED)
    return 'lost'
  }
  if (isNew) await sendOrLog(d, chatId, T.GOT)
  return isNew ? 'forwarded_new' : 'forwarded'
}

// ── Арина ──
async function handleAdmin(d: BotDeps, m: any): Promise<string> {
  const say = (text: string) => sendOrLog(d, d.adminChatId, text, { reply_parameters: { message_id: m.message_id, allow_sending_without_reply: true } })
  const cmd = parseCommand(m.text)
  if (cmd && ['start', 'help', 'svodka', 'oshibki', 'chelovek'].includes(cmd.cmd)) {
    if (cmd.cmd === 'start' || cmd.cmd === 'help') { await say(T.ADMIN_HELP); return 'admin_help' }
    if (cmd.cmd === 'svodka') {
      const text = await d.data.summary('today').catch(() => T.ADMIN_DB_FAILED)
      await say(text); return 'admin_svodka'
    }
    if (cmd.cmd === 'oshibki') {
      const rows = await d.data.recentIncidents(10).catch(() => null)
      await say(rows == null ? T.ADMIN_DB_FAILED : rows.length ? rows.map(r => incidentLine(r)).join('\n') : T.ADMIN_NO_INCIDENTS)
      return 'admin_oshibki'
    }
    // chelovek
    const email = cmd.arg.toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) { await say(T.ADMIN_PERSON_USAGE); return 'admin_chelovek_usage' }
    const userId = await d.data.findUserByEmail(email).catch(() => undefined)
    if (userId === undefined) { await say(T.ADMIN_DB_FAILED); return 'admin_chelovek_db' }
    if (!userId) { await say(T.ADMIN_PERSON_NOT_FOUND); return 'admin_chelovek_none' }
    const account = await d.data.account(userId).catch(() => null)
    await say(buildCard({ isNew: true, kind: 'text', tgFirstName: null, account, siteUrl: d.siteUrl, head: T.CARD.person }))
    return 'admin_chelovek'
  }

  const replyTo = m.reply_to_message?.message_id
  if (typeof replyTo !== 'number') { await say(T.ADMIN_NO_REPLY); return 'admin_no_reply' }
  let ticket: TicketRow | null
  try { ticket = await d.repo.ticketByAdminMessage(d.adminChatId, replyTo) } catch { await say(T.ADMIN_DB_FAILED); return 'admin_db' }
  if (!ticket) { await say(T.ADMIN_REPLY_NOBODY); return 'admin_nobody' }
  const res = await d.tg.copy(d.adminChatId, m.message_id, ticket.tg_chat_id)
  if (!res.ok) {
    await d.repo.incident('bot', res.code, ticket.user_id)
    await say(res.status === 403 ? T.ADMIN_NOT_DELIVERED : T.ADMIN_SENT_FAILED)
    return res.status === 403 ? 'admin_blocked' : 'admin_failed'
  }
  const now = iso(d.now())
  try {
    await d.repo.recordOut({ ticket_id: ticket.id, tg_chat_id: ticket.tg_chat_id, kind: kindOf(m) || 'other', tg_message_id: res.result.message_id, admin_message_id: m.message_id, admin_chat_id: d.adminChatId })
    await d.repo.markAnswered(ticket.id, now)
  } catch { await d.repo.incident('db', 'bot_out') }
  return 'admin_replied'
}

async function sendOrLog(d: BotDeps, chatId: number | string, text: string, extra: Record<string, unknown> = {}) {
  const r = await d.tg.send(chatId, text, extra)
  if (!r.ok) await d.repo.incident('bot', r.code)
}
