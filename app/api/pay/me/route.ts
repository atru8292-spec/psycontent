// GET /api/pay/me: подписка для Профиля (тариф, до какого числа, следующее списание, способ оплаты). Только чтение своего.
// autopay (19.11): false, пока ЮKassa не разрешила автоплатежи; тогда способа оплаты, автопродления и смены тарифа
// по сохраненному способу нет, зато есть anchor для подсказки «будет оплачено до» и ended («Тариф закончился»).
import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { supabaseRepo } from '@/lib/billing/deps'
import { paidAccess, PAID_PLANS, isPaidCode } from '@/lib/billing/core'
import { paymentsOnFor, autopayEnabled } from '@/lib/billing/ready'
import { errTag } from '@/lib/safe-error'

const ENDED_SHOW_DAYS = 60 // «Тариф закончился» в кабинете виден 60 дней после конца, потом обычный пробный вид

export async function GET() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'not_authorized' }, { status: 401 })
  try {
    const autopay = autopayEnabled()
    const sub = await supabaseRepo.getSub(user.id)
    const now = new Date()
    const method = autopay && sub?.payment_method_id ? await supabaseRepo.getMethod(sub.payment_method_id) : null
    const paid = paidAccess(sub, now)
    const pastDue = sub?.status === 'past_due'
    const planOf = (code: string) => (isPaidCode(code) ? { code, name: PAID_PLANS[code].name, price: PAID_PLANS[code].price } : null)
    // ручное продление: тариф закончился недавно, показываем его и кнопку «Оплатить тариф»
    let ended: { plan: { code: string; name: string; price: number }; at: string } | null = null
    if (!autopay && !paid && sub?.period_end && now.getTime() - new Date(sub.period_end).getTime() < ENDED_SHOW_DAYS * 86400000) {
      const last = await supabaseRepo.lastPaid(user.id)
      const p = last ? planOf(last.plan_code) : null
      if (p) ended = { plan: p, at: sub.period_end }
    }
    return NextResponse.json({
      payments: paymentsOnFor(user.email),
      autopay,
      paid,
      plan: (paid || pastDue) && sub ? planOf(sub.plan_code) : null,
      status: sub?.status || 'trial',
      until: paid ? sub!.period_end : null,
      anchor: paid ? sub!.billing_anchor_day : null,
      autoRenew: autopay && !!((paid || pastDue) && sub!.auto_renew),
      nextChargeAt: autopay && (paid || pastDue) && sub!.auto_renew ? sub!.next_charge_at : null,
      method: method && !method.deleted_at ? { title: method.title, type: method.type } : null,
      nextPlan: autopay && (paid || pastDue) && sub?.next_plan_code && isPaidCode(sub.next_plan_code) && sub.next_plan_code !== sub.plan_code ? planOf(sub.next_plan_code) : null,
      ended,
    })
  } catch (e) {
    console.error('pay me:', errTag(e))
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
