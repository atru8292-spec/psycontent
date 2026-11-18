// POST /api/cron/bot-summary: утренняя сводка Арине в Telegram за прошлые сутки по Москве (18.11, ветка feat/bot).
// Зовет только systemd-таймер в 9:00 МСК (deploy/bot/psycont-bot-summary.*) по 127.0.0.1:3001 с X-Cron-Secret.
// Через nginx (есть X-Real-IP) 404. Заменяет старую сводку scripts/digest.ts (DIGEST_TG_*): одно сообщение утром.
// В сводке нет почт и текстов, только цифры.
import { NextRequest, NextResponse } from 'next/server'
import { cronAllowed } from '@/lib/bot/secrets'
import { botTg, botConfigured, collectSummary } from '@/lib/bot/deps'
import { buildSummary } from '@/lib/bot/report'
import { ADMIN_DB_FAILED } from '@/lib/bot/texts'
import { logIncident } from '@/lib/bot/incidents'
import { errTag } from '@/lib/safe-error'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  if (!cronAllowed(req.headers)) return new NextResponse('Not found', { status: 404 })
  if (!botConfigured()) return NextResponse.json({ skipped: 'not_configured' })
  const chat = process.env.TELEGRAM_ADMIN_CHAT_ID!
  let text: string
  try {
    text = buildSummary(await collectSummary('morning'))
  } catch (e) {
    console.error('bot summary error:', errTag(e))
    text = ADMIN_DB_FAILED
  }
  const r = await botTg().send(chat, text)
  if (!r.ok) {
    logIncident('bot', r.code)
    console.error('bot summary send:', r.code)
    return NextResponse.json({ error: 'send_failed' }, { status: 502 })
  }
  return NextResponse.json({ ok: true })
}
