// POST /api/pay/create { plan: 'start'|'practice', autoRenew: boolean, via: 'sbp'|'any' } -> { url } на страницу ЮKassa.
// Только своя сессия и свой сайт. Тариф здесь НЕ включается: только вебхук или сверка по API (lib/billing/core.ts).
import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { publicOrigin } from '@/lib/origin'
import { clientIp } from '@/lib/signup-guard'
import { ykConfigured } from '@/lib/billing/yookassa'
import { billingDeps } from '@/lib/billing/deps'
import { startCheckout } from '@/lib/billing/core'
import { errTag } from '@/lib/safe-error'

export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'not_authorized' }, { status: 401 })
  const origin = req.headers.get('origin')
  if (origin && origin !== publicOrigin(req)) return NextResponse.json({ error: 'bad_origin' }, { status: 403 })
  if (!ykConfigured()) return NextResponse.json({ error: 'not_ready' }, { status: 503 })
  const b = await req.json().catch(() => null)
  try {
    const r = await startCheckout(billingDeps(), {
      userId: user.id, email: user.email || null, plan: String(b?.plan || ''), autoRenew: b?.autoRenew === true,
      via: b?.via === 'sbp' ? 'sbp' : 'any', ip: clientIp(req.headers) === 'unknown' ? null : clientIp(req.headers),
    })
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.error === 'bad_plan' ? 400 : r.error === 'already_paid' ? 409 : 502 })
    return NextResponse.json({ url: r.url, paymentId: r.paymentId })
  } catch (e) {
    console.error('pay create:', errTag(e))
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
