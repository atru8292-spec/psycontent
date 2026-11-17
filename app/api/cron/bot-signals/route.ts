// POST /api/cron/bot-signals: срочные сигналы Арине и уборка таблиц бота (18.11, ветка feat/bot).
// Зовет только systemd-таймер раз в 5 минут (deploy/bot/psycont-bot-signals.*) по 127.0.0.1:3001 с X-Cron-Secret.
// Через nginx (есть X-Real-IP) 404. Логика в lib/bot/signals.ts.
import { NextRequest, NextResponse } from 'next/server'
import { cronAllowed } from '@/lib/bot/secrets'
import { botTg, botConfigured, signalsRepo } from '@/lib/bot/deps'
import { runSignals, processMemory } from '@/lib/bot/signals'
import { errTag } from '@/lib/safe-error'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  if (!cronAllowed(req.headers)) return new NextResponse('Not found', { status: 404 })
  if (!botConfigured()) return NextResponse.json({ skipped: 'not_configured' })
  const tg = botTg()
  const chat = process.env.TELEGRAM_ADMIN_CHAT_ID!
  try {
    const r = await runSignals({
      repo: signalsRepo,
      send: async (text) => { const x = await tg.send(chat, text); if (!x.ok) console.error('bot signal send:', x.code); return x.ok },
      now: () => new Date(),
      memory: processMemory,
    })
    if (r.sent.length || !r.db) console.info('bot signals:', JSON.stringify(r))
    return NextResponse.json(r)
  } catch (e) {
    console.error('bot signals error:', errTag(e))
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
