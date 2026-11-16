// GET /api/pay/me: подписка для Профиля (тариф, до какого числа, следующее списание, способ оплаты). Только чтение своего.
import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { supabaseRepo } from '@/lib/billing/deps'
import { paidAccess, PAID_PLANS, isPaidCode } from '@/lib/billing/core'
import { billingReady } from '@/lib/billing/ready'
import { errTag } from '@/lib/safe-error'

export async function GET() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'not_authorized' }, { status: 401 })
  try {
    const sub = await supabaseRepo.getSub(user.id)
    const now = new Date()
    const method = sub?.payment_method_id ? await supabaseRepo.getMethod(sub.payment_method_id) : null
    const paid = paidAccess(sub, now)
    const pastDue = sub?.status === 'past_due'
    return NextResponse.json({
      payments: billingReady(),
      paid,
      plan: (paid || pastDue) && sub && isPaidCode(sub.plan_code) ? { code: sub.plan_code, name: PAID_PLANS[sub.plan_code].name, price: PAID_PLANS[sub.plan_code].price } : null,
      status: sub?.status || 'trial',
      until: paid ? sub!.period_end : null,
      autoRenew: !!((paid || pastDue) && sub!.auto_renew),
      nextChargeAt: (paid || pastDue) && sub!.auto_renew ? sub!.next_charge_at : null,
      method: method && !method.deleted_at ? { title: method.title, type: method.type } : null,
    })
  } catch (e) {
    console.error('pay me:', errTag(e))
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
