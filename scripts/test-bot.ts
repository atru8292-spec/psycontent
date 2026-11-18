// Тест бота поддержки (18.11, ветка feat/bot) без базы и сети: секрет вебхука, метка (подпись, срок, одноразовость),
// пересылка Арине с карточкой без текстов, реплай уходит нужному человеку, команды только из чата Арины,
// антиспам сигналов, повтор Telegram без токена в ошибках. Запуск: npx tsx scripts/test-bot.ts
import assert from 'node:assert/strict'
import { sameSecret, webhookAllowed, cronAllowed } from '../lib/bot/secrets'
import { makeToken, verifyToken, hashToken, TOKEN_RE, TOKEN_TTL_MS } from '../lib/bot/token'
import { handleUpdate, parseCommand, IN_PER_HOUR, type BotDeps, type BotRepo, type TicketRow } from '../lib/bot/core'
import { buildCard, buildSummary, throttle, evaluateSignals, genStreak, isGenFailure, dayRange, type CardAccount } from '../lib/bot/report'
import { runSignals, latestAt } from '../lib/bot/signals'
import { makeTg } from '../lib/bot/telegram'
import * as T from '../lib/bot/texts'
import { payWebhookIncident } from '../lib/bot/pay-signal'
import { incidentsOn } from '../lib/bot/incidents'

const ADMIN = '900'
const SECRET = 'l'.repeat(40)
const U1 = '11111111-1111-1111-1111-111111111111'
const PRIVATE = 'Клиентка Мария рассказала про развод' // текст материала/сообщения: в отправленные тексты бота не попадает

// ── заглушка базы ──
function memRepo(nowRef: { t: Date }) {
  const links = new Map<number, string>()
  const tokens = new Map<string, { user_id: string; expires_at: string; used_at: string | null }>()
  const tickets: (TicketRow & { last: string })[] = []
  const msgs: { id: number; ticket_id: number; tg_chat_id: number; direction: string; tg_message_id: number; admin_message_id: number | null; admin_card_id: number | null; admin_chat_id: string | null; created_at: string }[] = []
  const incidents: { kind: string; code: string }[] = []
  let seq = 0
  const repo: BotRepo = {
    async linkedUser(tg) { return links.get(tg) || null },
    async consumeToken(h, now) { const t = tokens.get(h); if (!t || t.used_at || t.expires_at <= now) return null; t.used_at = now; return t.user_id },
    async saveLink(tg, u) { links.set(tg, u); for (const t of tickets) if (t.tg_user_id === tg && !t.user_id) t.user_id = u },
    async recentTicket(chat, since) { const t = [...tickets].reverse().find(t => t.tg_chat_id === chat && t.last >= since); return t ? { ...t } : null },
    async openTicket(r) { const t = { id: ++seq, tg_chat_id: r.tg_chat_id, tg_user_id: r.tg_user_id, user_id: r.user_id, tg_first_name: r.tg_first_name, last: r.at, answered_at: null as string | null }; tickets.push(t); return { ...t } },
    async touchTicket(id, p) { const t = tickets.find(x => x.id === id)!; t.last = p.last_message_at; if ('answered_at' in p) t.answered_at = null; if (p.user_id) t.user_id = p.user_id },
    async countIn(chat, since) { return msgs.filter(m => m.tg_chat_id === chat && m.direction === 'in' && m.created_at >= since).length },
    async claimIn(r) { if (msgs.some(m => m.direction === 'in' && m.tg_chat_id === r.tg_chat_id && m.tg_message_id === r.tg_message_id)) return null; const id = ++seq; msgs.push({ id, ...r, direction: 'in', admin_message_id: null, admin_card_id: null, admin_chat_id: null, created_at: nowRef.t.toISOString() }); return id },
    async setAdminIds(id, chat, a, c) { const m = msgs.find(x => x.id === id)!; m.admin_chat_id = chat; m.admin_message_id = a; m.admin_card_id = c },
    async ticketByAdminMessage(chat, a) { const m = msgs.find(x => x.admin_chat_id === chat && (x.admin_message_id === a || x.admin_card_id === a)); return m ? tickets.find(t => t.id === m.ticket_id) || null : null },
    async recordOut(r) { msgs.push({ id: ++seq, ...r, direction: 'out', admin_card_id: null, created_at: nowRef.t.toISOString() }) },
    async markAnswered(id, at) { tickets.find(t => t.id === id)!.answered_at = at },
    async incident(kind, code) { incidents.push({ kind, code }) },
  }
  return { repo, links, tokens, tickets, msgs, incidents }
}

// ── заглушка Telegram ──
function memTg() {
  let mid = 1000
  const sent: { chat: string; text: string; extra: any }[] = []
  const copied: { from: string; id: number; to: string; extra: any }[] = []
  const blocked = new Set<string>()
  return {
    sent, copied, blocked,
    tg: {
      async send(chat: any, text: string, extra: any = {}) { sent.push({ chat: String(chat), text, extra }); return { ok: true as const, result: { message_id: ++mid } } },
      async copy(from: any, id: number, to: any, extra: any = {}) {
        if (blocked.has(String(to))) return { ok: false as const, status: 403, code: 'tg_403_bot_was_blocked_by_the_user' }
        copied.push({ from: String(from), id, to: String(to), extra }); return { ok: true as const, result: { message_id: ++mid } }
      },
    },
  }
}

const ACCOUNT: CardAccount = {
  userId: U1, email: 'maria@example.ru', planName: 'Пробный', materials: { remaining: 3, cap: 10 }, registeredAt: '2026-11-12T08:30:00Z',
  actions: [{ at: '2026-11-18T08:00:00Z', text: 'Сделать: пост' }], errors: [{ at: '2026-11-18T08:01:00Z', text: 'ошибка «Сделать»: server, пост' }],
}

function setup() {
  const nowRef = { t: new Date('2026-11-18T09:00:00Z') }
  const db = memRepo(nowRef)
  const t = memTg()
  const calls: string[] = []
  const deps: BotDeps = {
    repo: db.repo, tg: t.tg, adminChatId: ADMIN, linkSecret: SECRET, siteUrl: 'https://psycont.ru', now: () => nowRef.t,
    data: {
      async account(u) { calls.push('account:' + u); return u === U1 ? ACCOUNT : null },
      async findUserByEmail(e) { calls.push('find:' + e); return e === 'maria@example.ru' ? U1 : null },
      async summary() { calls.push('summary'); return 'СВОДКА' },
      async recentIncidents() { calls.push('incidents'); return [{ kind: 'gen', code: 'server', created_at: '2026-11-18T08:00:00Z' }] },
    },
  }
  return { nowRef, db, t, deps, calls }
}
let msgId = 1
const userMsg = (chat: number, extra: any) => ({ message: { message_id: msgId++, chat: { id: chat, type: 'private' }, from: { id: chat, is_bot: false, first_name: 'Мария', username: 'maria_nick' }, ...extra } })
const adminMsg = (extra: any) => ({ message: { message_id: msgId++, chat: { id: Number(ADMIN), type: 'private' }, from: { id: Number(ADMIN), is_bot: false, first_name: 'Арина' }, ...extra } })

;(async () => {
  // 1. секрет вебхука и таймера
  assert.equal(sameSecret('a'.repeat(31), 'a'.repeat(31)), false, 'секрет короче 32 не принимается')
  assert.equal(sameSecret('b'.repeat(40), 'a'.repeat(40)), false)
  assert.equal(sameSecret('a'.repeat(39), 'a'.repeat(40)), false)
  assert.equal(sameSecret(null, 'a'.repeat(40)), false)
  assert.equal(sameSecret('a'.repeat(40), 'a'.repeat(40)), true)
  process.env.TELEGRAM_WEBHOOK_SECRET = 'w'.repeat(40)
  process.env.CRON_SECRET = 'c'.repeat(40)
  const H = (o: Record<string, string>) => ({ get: (n: string) => o[n.toLowerCase()] ?? null })
  assert.equal(webhookAllowed(H({ 'x-telegram-bot-api-secret-token': 'w'.repeat(40) })), true)
  assert.equal(webhookAllowed(H({ 'x-telegram-bot-api-secret-token': 'x'.repeat(40) })), false)
  assert.equal(webhookAllowed(H({})), false)
  assert.equal(cronAllowed(H({ 'x-cron-secret': 'c'.repeat(40) })), true)
  assert.equal(cronAllowed(H({ 'x-cron-secret': 'c'.repeat(40), 'x-real-ip': '1.2.3.4' })), false, 'через nginx таймер не принимаем')
  process.env.TELEGRAM_WEBHOOK_SECRET = 'short'
  assert.equal(webhookAllowed(H({ 'x-telegram-bot-api-secret-token': 'short' })), false)

  // 2. метка: формат, подпись, чужой секрет, порча
  const tok = makeToken(SECRET)
  assert.ok(TOKEN_RE.test(tok) && tok.length === 28, 'метка 28 знаков base64url')
  assert.ok(`https://t.me/psycont_supportbot?start=${tok}`.length <= 200)
  assert.equal(verifyToken(SECRET, tok), true)
  assert.equal(verifyToken('o'.repeat(40), tok), false, 'чужой секрет')
  assert.equal(verifyToken(SECRET, tok.slice(0, -1) + (tok.at(-1) === 'A' ? 'B' : 'A')), false, 'порча подписи')
  assert.equal(verifyToken(SECRET, 'x'.repeat(28)), false)
  assert.equal(verifyToken(undefined, tok), false)
  assert.match(hashToken(tok), /^[0-9a-f]{64}$/)
  assert.throws(() => makeToken('short'))

  // 3. /start с меткой: привязка, одноразовость, срок
  {
    const s = setup()
    const good = makeToken(SECRET)
    s.db.tokens.set(hashToken(good), { user_id: U1, expires_at: new Date(s.nowRef.t.getTime() + TOKEN_TTL_MS).toISOString(), used_at: null })
    assert.equal(await handleUpdate(s.deps, userMsg(501, { text: `/start ${good}` })), 'start_linked')
    assert.equal(s.db.links.get(501), U1)
    assert.equal(s.t.sent.at(-1)!.text, T.START)
    // второй раз та же метка: устарела, но вопрос принимается
    assert.equal(await handleUpdate(s.deps, userMsg(502, { text: `/start ${good}` })), 'start_expired')
    assert.equal(s.db.links.get(502), undefined, 'одноразовая')
    assert.equal(s.t.sent.at(-1)!.text, T.START_EXPIRED)
    // просроченная
    const old = makeToken(SECRET)
    s.db.tokens.set(hashToken(old), { user_id: U1, expires_at: new Date(s.nowRef.t.getTime() - 1000).toISOString(), used_at: null })
    assert.equal(await handleUpdate(s.deps, userMsg(503, { text: `/start ${old}` })), 'start_expired')
    assert.equal(s.db.links.get(503), undefined)
    // подделанная метка: в базу не ходим
    assert.equal(await handleUpdate(s.deps, userMsg(504, { text: '/start ' + 'A'.repeat(28) })), 'start_expired')
    // без метки
    assert.equal(await handleUpdate(s.deps, userMsg(505, { text: '/start' })), 'start')
    assert.equal(s.t.sent.at(-1)!.text, T.START)
    assert.equal(s.t.copied.length, 0, '/start Арине не пересылается')
  }

  // 4. пересылка Арине с карточкой, без текстов; ник не хранится; GOT один раз на обращение
  {
    const s = setup()
    s.db.links.set(501, U1)
    assert.equal(await handleUpdate(s.deps, userMsg(501, { text: PRIVATE })), 'forwarded_new')
    const card = s.t.sent.find(x => x.chat === ADMIN)!
    assert.ok(card.text.includes('maria@example.ru'), 'почта полностью (решение Арины 18.11)')
    assert.ok(card.text.includes('Пробный') && card.text.includes('3 из 10') && card.text.includes('12.11.2026'))
    assert.ok(card.text.includes(`https://psycont.ru/admin/people/${U1}`))
    assert.ok(card.text.includes('Сделать: пост') && card.text.includes('server'))
    assert.ok(!card.text.includes('maria_nick'), 'ник не показываем и не храним')
    assert.ok(!s.t.sent.some(x => x.text.includes('Мария рассказала')), 'текст сообщения не попадает в тексты бота, только копией')
    assert.deepEqual(s.t.copied[0].to, ADMIN)
    assert.equal(s.t.copied[0].from, '501')
    assert.equal(s.t.copied[0].extra.reply_parameters.message_id, (s.db.msgs[0].admin_card_id), 'копия реплаем к карточке')
    assert.equal(s.t.sent.filter(x => x.chat === '501' && x.text === T.GOT).length, 1)
    assert.ok(!JSON.stringify(s.db.tickets).includes('maria_nick'))
    // второе сообщение того же обращения: короткая строка, без GOT
    assert.equal(await handleUpdate(s.deps, userMsg(501, { photo: [{ file_id: 'x' }], caption: PRIVATE })), 'forwarded')
    assert.equal(s.t.sent.filter(x => x.chat === '501' && x.text === T.GOT).length, 1, 'GOT один раз')
    assert.ok(s.t.sent.at(-1)!.text.startsWith(T.CARD.more))
    // повтор того же update от Telegram: не пересылаем второй раз
    const dup = userMsg(501, { text: 'еще' })
    await handleUpdate(s.deps, dup)
    const n = s.t.copied.length
    assert.equal(await handleUpdate(s.deps, dup), 'duplicate')
    assert.equal(s.t.copied.length, n)
    // через сутки молчания новое обращение и снова GOT
    s.nowRef.t = new Date(s.nowRef.t.getTime() + 25 * 3600e3)
    assert.equal(await handleUpdate(s.deps, userMsg(501, { voice: { file_id: 'v' } })), 'forwarded_new')
    assert.equal(s.db.tickets.length, 2)
    // без аккаунта
    assert.equal(await handleUpdate(s.deps, userMsg(777, { document: { file_id: 'd' } })), 'forwarded_new')
    assert.ok(s.t.sent.some(x => x.chat === ADMIN && x.text.includes(T.CARD.noAccount)))
    // неподдерживаемое
    assert.equal(await handleUpdate(s.deps, userMsg(777, { sticker: { file_id: 's' } })), 'unsupported')
    assert.equal(s.t.sent.at(-1)!.text, T.UNSUPPORTED)
    // группы и боты не обрабатываются
    assert.equal(await handleUpdate(s.deps, { message: { message_id: 1, chat: { id: -5, type: 'group' }, from: { id: 9 }, text: 'x' } }), 'skip')
  }

  // 5. реплай Арины уходит нужному человеку
  {
    const s = setup()
    await handleUpdate(s.deps, userMsg(601, { text: 'вопрос А' }))
    await handleUpdate(s.deps, userMsg(602, { text: 'вопрос Б' }))
    const copyB = s.db.msgs.find(m => m.tg_chat_id === 602)!
    assert.equal(await handleUpdate(s.deps, adminMsg({ text: 'ответ Б', reply_to_message: { message_id: copyB.admin_message_id } })), 'admin_replied')
    const last = s.t.copied.at(-1)!
    assert.equal(last.to, '602', 'ответ ушел Б')
    assert.equal(last.from, ADMIN)
    assert.ok(s.db.tickets.find(t => t.tg_chat_id === 602)!.answered_at)
    assert.equal(s.db.tickets.find(t => t.tg_chat_id === 601)!.answered_at, null)
    // реплай на карточку тоже работает
    const cardA = s.db.msgs.find(m => m.tg_chat_id === 601)!.admin_card_id
    await handleUpdate(s.deps, adminMsg({ photo: [{ file_id: 'p' }], reply_to_message: { message_id: cardA } }))
    assert.equal(s.t.copied.at(-1)!.to, '601')
    // без реплая
    assert.equal(await handleUpdate(s.deps, adminMsg({ text: 'привет' })), 'admin_no_reply')
    assert.equal(s.t.sent.at(-1)!.text, T.ADMIN_NO_REPLY)
    // реплай на непонятное сообщение
    assert.equal(await handleUpdate(s.deps, adminMsg({ text: 'x', reply_to_message: { message_id: 999999 } })), 'admin_nobody')
    assert.equal(s.t.sent.at(-1)!.text, T.ADMIN_REPLY_NOBODY)
    // человек заблокировал бота
    s.t.blocked.add('601')
    assert.equal(await handleUpdate(s.deps, adminMsg({ text: 'x', reply_to_message: { message_id: cardA } })), 'admin_blocked')
    assert.equal(s.t.sent.at(-1)!.text, T.ADMIN_NOT_DELIVERED)
    // короткое «спасибо» в течение часа после ответа не открывает обращение заново
    const tB = () => s.db.tickets.find(t => t.tg_chat_id === 602)!
    await handleUpdate(s.deps, userMsg(602, { text: 'Спасибо!' }))
    assert.ok(tB().answered_at, 'спасибо не делает «без ответа»')
    assert.equal(s.t.copied.at(-1)!.to, ADMIN, 'но Арине оно все равно пересылается')
    // длинное сообщение открывает
    await handleUpdate(s.deps, userMsg(602, { text: 'И еще вопрос: почему карусель не скачивается на телефоне?' + ' '.repeat(5) + 'вот так' }))
    assert.equal(tB().answered_at, null)
    // ответ, а через час короткое уже открывает
    const copyB2 = s.db.msgs.filter(m => m.tg_chat_id === 602 && m.direction === 'in').at(-1)!
    await handleUpdate(s.deps, adminMsg({ text: 'ответ', reply_to_message: { message_id: copyB2.admin_message_id } }))
    assert.ok(tB().answered_at)
    s.nowRef.t = new Date(s.nowRef.t.getTime() + 61 * 60e3)
    await handleUpdate(s.deps, userMsg(602, { text: 'ой' }))
    assert.equal(tB().answered_at, null)

    // ревью п.5: реплай ищется только в текущем чате Арины; после смены TELEGRAM_ADMIN_CHAT_ID старый id не уйдет чужому
    const s2 = setup()
    await handleUpdate(s2.deps, userMsg(611, { text: 'вопрос' }))
    const oldCopy = s2.db.msgs.find(m => m.tg_chat_id === 611)!.admin_message_id!
    assert.equal(s2.db.msgs.find(m => m.tg_chat_id === 611)!.admin_chat_id, ADMIN)
    s2.deps.adminChatId = '901'
    const r2 = await handleUpdate(s2.deps, { message: { message_id: oldCopy, chat: { id: 901, type: 'private' }, from: { id: 901 }, text: 'x', reply_to_message: { message_id: oldCopy } } })
    assert.equal(r2, 'admin_nobody')
    assert.ok(!s2.t.copied.some(c => c.to === '611' && c.from === '901'))
  }

  // ревью п.6: copyMessage упал: человеку не GOT, а просьба написать еще раз; Арине строка про содержимое
  {
    const s = setup()
    const origCopy = s.t.tg.copy
    s.t.tg.copy = async (from: any, id: number, to: any, extra: any = {}) => String(to) === ADMIN ? { ok: false as const, status: 400, code: 'tg_400_message_to_copy_not_found' } : origCopy(from, id, to, extra)
    assert.equal(await handleUpdate(s.deps, userMsg(621, { text: 'вопрос' })), 'lost')
    assert.ok(!s.t.sent.some(x => x.chat === '621' && x.text === T.GOT))
    assert.equal(s.t.sent.filter(x => x.chat === '621').at(-1)!.text, T.NOT_PASSED)
    assert.ok(s.t.sent.some(x => x.chat === ADMIN && x.text === T.ADMIN_COPY_FAILED))
    assert.ok(s.db.incidents.some(i => i.kind === 'bot' && i.code.startsWith('tg_400')))
  }

  // метка погашена, а связь не записалась: человеку START, не «устарела»
  {
    const s = setup()
    const good = makeToken(SECRET)
    s.db.tokens.set(hashToken(good), { user_id: U1, expires_at: new Date(s.nowRef.t.getTime() + 3600e3).toISOString(), used_at: null })
    s.deps.repo.saveLink = async () => { throw new Error('db') }
    assert.equal(await handleUpdate(s.deps, userMsg(631, { text: `/start ${good}` })), 'start_linked')
    assert.equal(s.t.sent.at(-1)!.text, T.START)
    assert.ok(s.db.incidents.some(i => i.code === 'link_save'))
  }

  // 6. команды только из чата Арины
  {
    const s = setup()
    assert.equal(await handleUpdate(s.deps, userMsg(701, { text: '/svodka' })), 'forwarded_new', 'чужой /svodka это вопрос')
    assert.equal(await handleUpdate(s.deps, userMsg(701, { text: '/oshibki' })), 'forwarded')
    assert.equal(await handleUpdate(s.deps, userMsg(701, { text: '/chelovek maria@example.ru' })), 'forwarded')
    assert.ok(!s.calls.includes('summary') && !s.calls.includes('incidents') && !s.calls.some(c => c.startsWith('find')), 'чужому данные не отдаются')
    assert.ok(!s.t.sent.some(x => x.chat === '701' && x.text === 'СВОДКА'))
    assert.equal(await handleUpdate(s.deps, adminMsg({ text: '/svodka' })), 'admin_svodka')
    assert.equal(s.t.sent.at(-1)!.text, 'СВОДКА')
    assert.equal(s.t.sent.at(-1)!.chat, ADMIN)
    assert.equal(await handleUpdate(s.deps, adminMsg({ text: '/oshibki@psycont_supportbot' })), 'admin_oshibki')
    assert.ok(s.t.sent.at(-1)!.text.includes('генерация: server'))
    assert.equal(await handleUpdate(s.deps, adminMsg({ text: '/chelovek Maria@Example.ru' })), 'admin_chelovek')
    assert.ok(s.t.sent.at(-1)!.text.startsWith(T.CARD.person) && s.t.sent.at(-1)!.text.includes('maria@example.ru'))
    assert.equal(await handleUpdate(s.deps, adminMsg({ text: '/chelovek nobody@example.ru' })), 'admin_chelovek_none')
    assert.equal(await handleUpdate(s.deps, adminMsg({ text: '/chelovek' })), 'admin_chelovek_usage')
    assert.deepEqual(parseCommand('/chelovek@psycont_supportbot a@b.ru'), { cmd: 'chelovek', arg: 'a@b.ru' })
    assert.equal(parseCommand('привет'), null)
  }

  // 7. антиспам сообщений человека
  {
    const s = setup()
    for (let i = 0; i < IN_PER_HOUR; i++) await handleUpdate(s.deps, userMsg(801, { text: 'x' + i }))
    assert.equal(await handleUpdate(s.deps, userMsg(801, { text: 'лишнее' })), 'flood')
    assert.equal(s.t.sent.at(-1)!.text, T.TOO_MANY)
    const before = s.t.sent.length
    assert.equal(await handleUpdate(s.deps, userMsg(801, { text: 'лишнее 2' })), 'flood')
    assert.equal(s.t.sent.length, before, 'предупреждение один раз')
  }

  // 8. карточка и сводка
  {
    const c = buildCard({ isNew: true, kind: 'text', tgFirstName: 'Мария', account: { ...ACCOUNT, materials: 'unlimited' }, siteUrl: 'https://psycont.ru/' })
    assert.ok(c.includes('без предела') && c.includes('/admin/people/' + U1) && !c.includes('ru//admin'))
    const s = buildSummary({ mode: 'morning', label: '17 ноября', registered: 0, firstText: 0, copies: 2, trialEnd: 0, payFirst: 0, payRenewal: 0, payFailed: 0, refunds: 0, autoOff: 0, texts: 0, incidents: { gen: 0, openai: 2 }, aiRubDay: 0.2, aiRubMonth: 1000, unanswered: 0 })
    assert.ok(s.includes('Регистраций: 0'), 'регистрации всегда')
    assert.ok(!s.includes('Оплат') && !s.includes('Текстов сделано') && !s.includes('OpenAI за сутки') && !s.includes('генерация'), 'нули не показываем')
    assert.ok(s.includes('Копирований текста: 2') && s.includes('OpenAI 2') && s.includes('1 000 ₽'))
    assert.ok(!/@/.test(s), 'в сводке нет почт')
    const r = dayRange('Europe/Moscow', 'yesterday', new Date('2026-11-18T06:00:00Z'))
    assert.equal(r.from.toISOString(), '2026-11-16T21:00:00.000Z')
    assert.equal(r.to.toISOString(), '2026-11-17T21:00:00.000Z')
    assert.equal(r.label, '17 ноября')
  }

  // 9. сбои и сигналы
  assert.equal(isGenFailure('server'), true)
  assert.equal(isGenFailure('http_502'), true)
  assert.equal(isGenFailure('text_limit'), false)
  assert.equal(isGenFailure('sample_private'), false)
  assert.equal(isGenFailure('http_429'), false)
  assert.equal(genStreak([{ event: 'make_error', code: 'server' }, { event: 'make_error', code: 'sample_closed' }, { event: 'make_error', code: 'format_failed' }, { event: 'make_error', code: 'server' }, { event: 'make_done' }, { event: 'make_error', code: 'server' }]), 3)
  assert.equal(genStreak([{ event: 'make_done' }, { event: 'make_error', code: 'server' }]), 0)
  const sigs = evaluateSignals({ streak: 3, genHour: 10, fresh: [{ kind: 'gen', code: 'server' }, { kind: 'openai', code: 'openai_401' }, { kind: 'openai', code: 'openai_429_insufficient_quota' }, { kind: 'openai', code: 'openai_429_rate_limit_exceeded' }, { kind: 'pay_webhook', code: '500_error' }, { kind: 'billing', code: 'errors_2' }] })
  assert.deepEqual(sigs.map(x => x.key), ['gen_streak', 'gen_hour', 'openai_401', 'openai_quota', 'openai_429', 'pay_webhook', 'billing'])
  assert.deepEqual(evaluateSignals({ streak: 2, genHour: 9, fresh: [{ kind: 'gen', code: 'server' }] }), [])
  // ревью п.4: серия и «за час» по старым данным без свежего сбоя молчат; n = число новых сбоев
  assert.deepEqual(evaluateSignals({ streak: 5, genHour: 12, fresh: [] }), [], 'старая проблема без новых сбоев не будит')
  assert.deepEqual(evaluateSignals({ streak: 5, genHour: 12, fresh: [{ kind: 'openai', code: 'openai_500' }] }).map(x => x.key), [])
  const g2 = evaluateSignals({ streak: 4, genHour: 3, fresh: [{ kind: 'gen', code: 'server' }, { kind: 'gen', code: 'http_502' }] })
  assert.deepEqual(g2.map(x => [x.key, x.n]), [['gen_streak', 2]])

  // 10. антиспам сигналов: раз в 30 минут, повторы копятся
  {
    const t0 = new Date('2026-11-18T10:00:00Z')
    let st = throttle(null, t0)
    assert.equal(st.send, true); assert.equal(st.repeats, 0)
    let st2 = throttle(st.next, new Date(t0.getTime() + 5 * 60e3), 2)
    assert.equal(st2.send, false); assert.equal(st2.next.suppressed, 2)
    st2 = throttle(st2.next, new Date(t0.getTime() + 25 * 60e3))
    assert.equal(st2.send, false); assert.equal(st2.next.suppressed, 3)
    const st3 = throttle(st2.next, new Date(t0.getTime() + 30 * 60e3))
    assert.equal(st3.send, true); assert.equal(st3.repeats, 3); assert.equal(st3.next.suppressed, 0)

    // runSignals целиком на заглушках: журнал со временем, курсор, состояние
    const min = (m: number) => new Date(t0.getTime() + m * 60e3)
    const mk = () => {
      const w = {
        state: new Map<string, any>(), cursor: null as string | null, dbUp: true, sendOk: true,
        inc: [] as { kind: string; code: string; at: string }[], streak: [] as any[], sent: [] as string[], cleaned: 0,
      }
      const sd = (now: Date, memory = new Map()) => ({
        now: () => now, memory,
        send: async (t: string) => { if (!w.sendOk) return false; w.sent.push(t); return true },
        repo: {
          pingDb: async () => w.dbUp, cursor: async () => w.cursor, setCursor: async (a: string) => { w.cursor = a },
          freshIncidents: async (since: string) => w.inc.filter(x => x.at > since).sort((a, b) => a.at.localeCompare(b.at)).map(({ kind, code, at }) => ({ kind, code, created_at: at })),
          genHour: async (since: string) => w.inc.filter(x => x.kind === 'gen' && x.at >= since).length,
          makeEvents: async () => w.streak,
          getState: async (k: string) => w.state.get(k) || null, setState: async (k: string, s: any) => { w.state.set(k, s) },
          listStates: async () => [...w.state.entries()].filter(([, v]) => v.suppressed > 0).map(([key, v]) => ({ key, ...v })),
          cleanup: async () => { w.cleaned++ },
        },
      })
      return { w, sd }
    }
    {
      const { w, sd } = mk()
      w.inc.push({ kind: 'openai', code: 'openai_401', at: min(-1).toISOString() })
      let r = await runSignals(sd(t0))
      assert.deepEqual(r.sent, ['openai_401'])
      w.inc.push({ kind: 'openai', code: 'openai_401', at: min(3).toISOString() })
      r = await runSignals(sd(min(5)))
      assert.deepEqual(r.muted, ['openai_401']); assert.equal(w.sent.length, 1)
      r = await runSignals(sd(min(10)))
      assert.deepEqual(r.muted, [], 'тот же сбой второй раз не считается')
      assert.equal(w.state.get('openai_401').suppressed, 1)
      // ревью п.3: полчаса прошли, нового сбоя нет: короткое «еще N за полчаса»
      r = await runSignals(sd(min(31)))
      assert.deepEqual(r.sent, ['openai_401:flush'])
      assert.equal(w.sent.at(-1), T.SIGNAL.flush(T.SIGNAL_KEY_RU.openai_401, 1))
      assert.equal(w.state.get('openai_401').suppressed, 0)
      r = await runSignals(sd(min(40)))
      assert.deepEqual(r.sent, [], 'flush один раз')
      assert.equal(w.cleaned, 5, 'уборка на каждом проходе')
    }
    {
      // ревью п.3: отправка не удалась, курсор стоит, на следующем проходе сигнал уходит
      const { w, sd } = mk()
      w.cursor = min(-5).toISOString()
      w.inc.push({ kind: 'billing', code: 'errors_1', at: min(-1).toISOString() })
      w.sendOk = false
      let r = await runSignals(sd(t0))
      assert.deepEqual(r.sent, [])
      assert.equal(w.cursor, min(-5).toISOString(), 'курсор не сдвинулся')
      w.sendOk = true
      r = await runSignals(sd(min(5)))
      assert.deepEqual(r.sent, ['billing'])
      assert.equal(w.cursor, min(-1).toISOString(), 'курсор на время записи из базы')
      await runSignals(sd(min(10)))
      assert.equal(w.cursor, min(-1).toISOString(), 'пустая выборка курсор не трогает')
    }
    {
      // часы базы впереди часов VPS: запись «из будущего» не считается дважды (курсор по created_at, а не по now)
      const { w, sd } = mk()
      w.inc.push({ kind: 'openai', code: 'openai_429_rate_limit_exceeded', at: min(2).toISOString() })
      assert.deepEqual((await runSignals(sd(t0))).sent, ['openai_429'])
      assert.equal(w.cursor, min(2).toISOString())
      await runSignals(sd(min(1)))
      assert.equal(w.state.get('openai_429').suppressed, 0, 'та же запись второй раз не засчитана')
      assert.equal(latestAt([{ created_at: '2026-11-18T10:00:00+00:00' }, { created_at: '2026-11-18T12:59:00+03:00' }, { created_at: '2026-11-18T09:00:00Z' }]), '2026-11-18T10:00:00+00:00')
      assert.equal(latestAt([]), null)
    }
    {
      // ревью п.4: ночью серия старых сбоев не повторяется; новый сбой будит, n = новые сбои
      const { w, sd } = mk()
      w.streak = [{ event: 'make_error', code: 'server' }, { event: 'make_error', code: 'server' }, { event: 'make_error', code: 'server' }]
      for (const m of [-4, -3, -2]) w.inc.push({ kind: 'gen', code: 'server', at: min(m).toISOString() })
      assert.deepEqual((await runSignals(sd(t0))).sent, ['gen_streak'])
      assert.deepEqual((await runSignals(sd(min(35)))).sent, [], 'через 35 минут без новых сбоев тишина')
      assert.deepEqual((await runSignals(sd(min(70)))).sent, [])
      w.inc.push({ kind: 'gen', code: 'server', at: min(72).toISOString() })
      w.streak = [{ event: 'make_error', code: 'server' }, ...w.streak]
      assert.deepEqual((await runSignals(sd(min(75)))).sent, ['gen_streak'])
    }
    {
      // база не отвечает: антиспам в памяти процесса; когда база ожила, накопленное одной строкой
      const { w, sd } = mk()
      w.dbUp = false
      const mem = new Map()
      assert.deepEqual((await runSignals(sd(t0, mem))).sent, ['db_down'])
      assert.deepEqual((await runSignals(sd(min(5), mem))).muted, ['db_down'])
      w.dbUp = true
      await runSignals(sd(min(10), mem))
      assert.equal(w.sent.at(-1), T.SIGNAL.flush(T.SIGNAL_KEY_RU.db_down, 1))
      assert.equal(mem.size, 0)
    }
  }

  // 12. ревью п.1: вебхук ЮKassa пишет в журнал только с адреса ЮKassa, bad_ip от сканеров только в журнал pm2
  {
    const YK = '185.71.76.5', SCAN = '203.0.113.7'
    assert.equal(payWebhookIncident(SCAN, 403, 'bad_ip'), null)
    assert.equal(payWebhookIncident(SCAN, 400, 'bad_body'), null)
    assert.equal(payWebhookIncident(SCAN, 'exception', 'Error'), null)
    assert.equal(payWebhookIncident('', 500, 'error'), null)
    assert.equal(payWebhookIncident(YK, 200, 'renewed'), null)
    assert.equal(payWebhookIncident(YK, 403, 'bad_ip'), null)
    assert.equal(payWebhookIncident(YK, 400, 'bad_body'), '400_bad_body')
    assert.equal(payWebhookIncident(YK, 500, 'error'), '500_error')
    assert.equal(payWebhookIncident(YK, 'exception', 'db_event_57014'), 'exception_db_event_57014')
  }

  // 13. ревью п.2: журнал сбоев пишется только при BOT_INCIDENTS=1 (локальный .env.local смотрит в боевую базу)
  {
    const keep = { u: process.env.NEXT_PUBLIC_SUPABASE_URL, k: process.env.SUPABASE_SERVICE_ROLE_KEY, b: process.env.BOT_INCIDENTS }
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:9'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'x'
    delete process.env.BOT_INCIDENTS
    assert.equal(incidentsOn(), false, 'без BOT_INCIDENTS не пишем, даже если база задана')
    process.env.BOT_INCIDENTS = 'true'
    assert.equal(incidentsOn(), false, 'только точное 1')
    process.env.BOT_INCIDENTS = '1'
    assert.equal(incidentsOn(), true)
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    assert.equal(incidentsOn(), false)
    for (const [k, v] of [['NEXT_PUBLIC_SUPABASE_URL', keep.u], ['SUPABASE_SERVICE_ROLE_KEY', keep.k], ['BOT_INCIDENTS', keep.b]] as const) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v
    }
  }

  // 11. Telegram: повтор при 429 и 5xx, без повтора при 403, токен не попадает в ошибки
  {
    const TOKEN = '123456:SECRET-TOKEN-abc'
    const waits: number[] = []
    let n = 0
    const seq = [
      { status: 429, body: { ok: false, error_code: 429, description: 'Too Many Requests: retry after 3', parameters: { retry_after: 3 } } },
      { status: 502, body: { ok: false, error_code: 502, description: 'Bad Gateway' } },
      { status: 200, body: { ok: true, result: { message_id: 5 } } },
    ]
    const fetchImpl: any = async (url: string) => { assert.ok(url.includes(TOKEN)); const x = seq[n++]; return { ok: x.status === 200, status: x.status, json: async () => x.body } }
    const tg = makeTg({ token: TOKEN, fetchImpl, sleep: async (ms) => { waits.push(ms) } })
    const r = await tg.send(1, 'hi')
    assert.ok(r.ok); assert.equal(n, 3); assert.deepEqual(waits, [3000, 1500])
    let calls = 0
    const tg403 = makeTg({ token: TOKEN, fetchImpl: (async () => { calls++; return { ok: false, status: 403, json: async () => ({ ok: false, error_code: 403, description: 'Forbidden: bot was blocked by the user' }) } }) as any, sleep: async () => {} })
    const r2 = await tg403.copy(1, 2, 3)
    assert.equal(calls, 1, '403 без повтора')
    assert.ok(!r2.ok && r2.code === 'tg_403_bot_was_blocked_by_the_user' && r2.status === 403)
    const tgNet = makeTg({ token: TOKEN, fetchImpl: (async (u: string) => { throw new Error(`fetch failed ${u}`) }) as any, sleep: async () => {} })
    const r3 = await tgNet.send(1, 'x')
    assert.ok(!r3.ok && r3.code === 'tg_net')
    assert.ok(!JSON.stringify(r3).includes('SECRET-TOKEN'), 'токен не в ошибке')
    const big = makeTg({ token: TOKEN, fetchImpl: (async () => ({ ok: false, status: 429, json: async () => ({ ok: false, error_code: 429, parameters: { retry_after: 600 } }) })) as any, sleep: async (ms) => { assert.ok(ms <= 10000, 'ожидание 429 не дольше 10 с') } })
    assert.ok(!(await big.send(1, 'x')).ok)
  }

  console.log('test-bot: все проверки прошли')
})().catch(e => { console.error(e); process.exit(1) })
