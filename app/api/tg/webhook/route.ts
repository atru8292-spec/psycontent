// POST /api/tg/webhook: обновления Telegram для бота поддержки @psycont_supportbot (18.11, ветка feat/bot).
// Без верного X-Telegram-Bot-Api-Secret-Token (TELEGRAM_WEBHOOK_SECRET, от 32 знаков) отвечаем 404, как будто роута нет.
// После обработки всегда 200: ошибка внутри не должна запускать у Telegram цикл повторов (повтор того же
// сообщения и так отсекается по id в bot_messages). Логика в lib/bot/core.ts, в журнал только коды.
import { NextRequest, NextResponse } from 'next/server'
import { webhookAllowed } from '@/lib/bot/secrets'
import { handleUpdate } from '@/lib/bot/core'
import { botDeps, botConfigured } from '@/lib/bot/deps'
import { errTag } from '@/lib/safe-error'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  if (!webhookAllowed(req.headers)) return new NextResponse('Not found', { status: 404 })
  if (!botConfigured()) return NextResponse.json({ ok: true })
  const len = Number(req.headers.get('content-length') || 0)
  if (len > 1024 * 1024) return NextResponse.json({ ok: true })
  const update = await req.json().catch(() => null)
  if (!update) return NextResponse.json({ ok: true })
  try {
    const r = await handleUpdate(botDeps(), update)
    if (r !== 'skip') console.info('tg webhook:', r)
  } catch (e) {
    console.error('tg webhook error:', errTag(e))
  }
  return NextResponse.json({ ok: true })
}
