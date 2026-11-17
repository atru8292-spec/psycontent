// POST /api/cron/billing: таймер оплаты (сверка зависших, письма за 3 дня, продления, конец окна).
// Зовет только systemd-таймер на сервере сайта (deploy/oplata/psycont-billing.*) по 127.0.0.1:3001 с секретом
// CRON_SECRET в заголовке X-Cron-Secret. Через nginx (есть X-Real-IP) не принимаем совсем.
import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { billingDeps } from '@/lib/billing/deps'
import { runBilling } from '@/lib/billing/core'
import { billingReady } from '@/lib/billing/ready'
import { errTag } from '@/lib/safe-error'

function secretOk(got: string | null): boolean {
  const want = process.env.CRON_SECRET || ''
  if (want.length < 32 || !got) return false
  const a = Buffer.from(got), b = Buffer.from(want)
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function POST(req: NextRequest) {
  // через nginx пришло, если есть X-Real-IP (его ставит только nginx). X-Forwarded-For не признак: Next добавляет его сам
  if (req.headers.get('x-real-ip')) return new NextResponse('Not found', { status: 404 })
  if (!secretOk(req.headers.get('x-cron-secret'))) return new NextResponse('Not found', { status: 404 })
  if (!billingReady()) return NextResponse.json({ skipped: 'not_ready' })
  try {
    const r = await runBilling(billingDeps())
    console.info('billing run:', JSON.stringify(r))
    return NextResponse.json(r)
  } catch (e) {
    console.error('billing run error:', errTag(e))
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
