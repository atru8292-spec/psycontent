// POST /api/pay/autorenew { off: true }: «Отключить автопродление» в Профиле. Срабатывает сразу, доступ до конца окна.
import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { publicOrigin } from '@/lib/origin'
import { billingDeps } from '@/lib/billing/deps'
import { disableAutoRenew } from '@/lib/billing/core'
import { errTag } from '@/lib/safe-error'

export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'not_authorized' }, { status: 401 })
  const origin = req.headers.get('origin')
  if (origin && origin !== publicOrigin(req)) return NextResponse.json({ error: 'bad_origin' }, { status: 403 })
  const b = await req.json().catch(() => null)
  if (b?.off !== true) return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  try { return NextResponse.json({ ok: true, result: await disableAutoRenew(billingDeps(), user.id) }) }
  catch (e) { console.error('pay autorenew:', errTag(e)); return NextResponse.json({ error: 'server_error' }, { status: 500 }) }
}
