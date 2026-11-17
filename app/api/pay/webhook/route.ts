// POST /api/pay/webhook: уведомления ЮKassa. Подписи у них нет: проверяем адрес отправителя по списку ЮKassa
// (X-Real-IP ставит nginx) и всегда перезапрашиваем объект своими ключами (lib/billing/core.ts handleWebhook).
// Ответ 200 только после обработки; 500 значит «пришли еще раз» (ЮKassa повторяет сутки).
import { NextRequest, NextResponse } from 'next/server'
import { billingDeps } from '@/lib/billing/deps'
import { handleWebhook } from '@/lib/billing/core'
import { ykConfigured } from '@/lib/billing/yookassa'
import { errTag } from '@/lib/safe-error'

export async function POST(req: NextRequest) {
  if (!ykConfigured()) return NextResponse.json({ error: 'not_ready' }, { status: 503 })
  const ip = (req.headers.get('x-real-ip') || '').trim()
  const len = Number(req.headers.get('content-length') || 0)
  if (len > 64 * 1024) return NextResponse.json({ error: 'too_large' }, { status: 413 })
  const body = await req.json().catch(() => null)
  try {
    const r = await handleWebhook(billingDeps(), ip, body)
    if (r.status !== 200) console.warn('pay webhook:', r.status, r.result)
    else console.info('pay webhook:', r.result)
    return NextResponse.json({ ok: r.status === 200 }, { status: r.status })
  } catch (e) {
    console.error('pay webhook error:', errTag(e))
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
