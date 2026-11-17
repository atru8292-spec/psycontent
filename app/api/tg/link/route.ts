// POST /api/tg/link: ссылка «Написать в Telegram» с одноразовой меткой (18.11, ветка feat/bot).
// Ответ { url }: https://t.me/psycont_supportbot?start=<метка>. Метка подписана (BOT_LINK_SECRET), живет 24 часа,
// в базе только ее sha256 (bot_link_tokens). Почты и id в ссылке нет. Только с сессией.
// Экран «Помощь» просит метку при каждом открытии, поэтому не больше 20 меток в час на человека; сверх предела,
// без секрета или при сбое базы отдаем ссылку без метки (бот примет вопрос, но без карточки аккаунта), не ошибку.
import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/generation/db'
import { makeToken, hashToken, secretOk, TOKEN_TTL_MS } from '@/lib/bot/token'
import { errTag } from '@/lib/safe-error'
import { SUPPORT_BOT_URL } from '@/lib/help-faq'

export const dynamic = 'force-dynamic'

// имя бота из одного источника с экраном «Помощь» (ревью 18.11)
const PLAIN = SUPPORT_BOT_URL
const PER_HOUR = 20

const plain = () => NextResponse.json({ url: PLAIN }, { headers: { 'cache-control': 'no-store' } })

export async function POST() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const secret = process.env.BOT_LINK_SECRET
  if (!secretOk(secret)) return plain()
  try {
    const db = getSupabaseAdmin()
    const since = new Date(Date.now() - 3600e3).toISOString()
    const c = await db.from('bot_link_tokens').select('token_hash', { count: 'exact', head: true }).eq('user_id', user.id).gte('created_at', since)
    if (c.error) { console.warn('tg link count:', errTag(c.error)); return plain() }
    if ((c.count || 0) >= PER_HOUR) return plain()
    const token = makeToken(secret)
    const ins = await db.from('bot_link_tokens').insert({ token_hash: hashToken(token), user_id: user.id, expires_at: new Date(Date.now() + TOKEN_TTL_MS).toISOString() })
    if (ins.error) { console.warn('tg link insert:', errTag(ins.error)); return plain() }
    return NextResponse.json({ url: `${PLAIN}?start=${token}` }, { headers: { 'cache-control': 'no-store' } })
  } catch (e) {
    console.warn('tg link:', errTag(e))
    return plain()
  }
}
