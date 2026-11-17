// DELETE /api/pay/method: «Удалить карту» в Профиле. Сразу, без обращения в поддержку: автопродление выключается,
// строка с токеном payment_method_id стирается из нашей базы (требование ЮKassa к автоплатежам, 17.11), списать
// больше нечем. У ЮKassa нет API удаления сохраненного способа: без токена у магазина он не используется.
import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { publicOrigin } from '@/lib/origin'
import { billingDeps } from '@/lib/billing/deps'
import { deletePaymentMethod } from '@/lib/billing/core'
import { errTag } from '@/lib/safe-error'

export async function DELETE(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'not_authorized' }, { status: 401 })
  const origin = req.headers.get('origin')
  if (origin && origin !== publicOrigin(req)) return NextResponse.json({ error: 'bad_origin' }, { status: 403 })
  try { await deletePaymentMethod(billingDeps(), user.id); return NextResponse.json({ ok: true }) }
  catch (e) { console.error('pay method delete:', errTag(e)); return NextResponse.json({ error: 'server_error' }, { status: 500 }) }
}
