// POST /api/pay/plan { plan: 'start'|'practice', consent: boolean }: «Сменить тариф» в Профиле. Новый тариф со следующего
// списания, без доплаты; согласие на новую сумму обязательно (пишется в autopay_consents с IP). Выбор текущего отменяет смену.
import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { publicOrigin } from '@/lib/origin'
import { clientIp } from '@/lib/signup-guard'
import { billingDeps } from '@/lib/billing/deps'
import { changePlan } from '@/lib/billing/core'
import { errTag } from '@/lib/safe-error'

export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'not_authorized' }, { status: 401 })
  const origin = req.headers.get('origin')
  if (origin && origin !== publicOrigin(req)) return NextResponse.json({ error: 'bad_origin' }, { status: 403 })
  const b = await req.json().catch(() => null)
  const ip = clientIp(req.headers)
  try {
    const r = await changePlan(billingDeps(), { userId: user.id, plan: String(b?.plan || ''), consent: b?.consent === true, ip: ip === 'unknown' ? null : ip })
    return r.ok ? NextResponse.json(r) : NextResponse.json(r, { status: 400 })
  } catch (e) {
    console.error('pay plan:', errTag(e))
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
