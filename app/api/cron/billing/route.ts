// POST /api/cron/billing: таймер оплаты (сверка зависших, письма за 3 дня, продления, конец окна).
// Зовет только systemd-таймер на сервере сайта (deploy/oplata/psycont-billing.*) по 127.0.0.1:3001 с секретом
// CRON_SECRET в заголовке X-Cron-Secret. Через nginx (есть X-Real-IP) не принимаем совсем.
import { NextRequest, NextResponse } from 'next/server'
import { cronAllowed } from '@/lib/bot/secrets'
import { billingDeps } from '@/lib/billing/deps'
import { runBilling } from '@/lib/billing/core'
import { billingReady } from '@/lib/billing/ready'
import { errTag } from '@/lib/safe-error'
import { logIncident } from '@/lib/bot/incidents'

export async function POST(req: NextRequest) {
  // через nginx пришло, если есть X-Real-IP (его ставит только nginx; X-Forwarded-For Next добавляет сам). Общая проверка lib/bot/secrets.ts
  if (!cronAllowed(req.headers)) return new NextResponse('Not found', { status: 404 })
  if (!billingReady()) return NextResponse.json({ skipped: 'not_ready' })
  try {
    const r = await runBilling(billingDeps())
    console.info('billing run:', JSON.stringify(r))
    if (r.errors > 0) logIncident('billing', `errors_${r.errors}`) // сигнал Арине (lib/bot/signals.ts)
    return NextResponse.json(r)
  } catch (e) {
    console.error('billing run error:', errTag(e))
    logIncident('billing', `exception_${errTag(e)}`)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
