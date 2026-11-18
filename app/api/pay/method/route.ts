// DELETE /api/pay/method: «Удалить карту» в Профиле. Сразу, без обращения в поддержку: автопродление выключается,
// строка с токеном payment_method_id стирается из нашей базы (требование ЮKassa к автоплатежам, 17.11), списать
// больше нечем. У ЮKassa нет API удаления сохраненного способа: без токена у магазина он не используется.
import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { publicOrigin } from '@/lib/origin'
import { billingDeps, supabaseRepo } from '@/lib/billing/deps'
import { deletePaymentMethod } from '@/lib/billing/core'
import { errTag } from '@/lib/safe-error'
import { autopayEnabled, AUTOPAY_OFF_MESSAGE } from '@/lib/billing/ready'

export async function DELETE(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'not_authorized' }, { status: 401 })
  const origin = req.headers.get('origin')
  if (origin && origin !== publicOrigin(req)) return NextResponse.json({ error: 'bad_origin' }, { status: 403 })
  // автоплатежи выключены (AUTOPAY_ENABLED не 1, 19.11): понятный ответ, если отключать нечего. Если с прошлого режима
  // осталась карта или автопродление, операция работает при любом флаге: убрать свои данные можно всегда (152-ФЗ)
  if (!autopayEnabled()) {
    const sub = await supabaseRepo.getSub(user.id).catch(() => null)
    if (!sub?.auto_renew && !sub?.payment_method_id) return NextResponse.json({ error: 'autopay_off', message: AUTOPAY_OFF_MESSAGE }, { status: 409 })
  }
  try { await deletePaymentMethod(billingDeps(), user.id); return NextResponse.json({ ok: true }) }
  catch (e) { console.error('pay method delete:', errTag(e)); return NextResponse.json({ error: 'server_error' }, { status: 500 }) }
}
