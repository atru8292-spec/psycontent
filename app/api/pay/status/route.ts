// GET /api/pay/status?p=<id платежа> -> статус своего платежа для экрана «Проверяю оплату».
// Только чтение своей строки. Тариф отсюда не включается (его включает вебхук).
import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/generation/db'

export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'not_authorized' }, { status: 401 })
  const id = req.nextUrl.searchParams.get('p') || ''
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ error: 'bad_id' }, { status: 400 })
  const { data } = await getSupabaseAdmin().from('payments').select('status, plan_code, amount, period_end, cancellation_reason, save_requested, method_type, user_id').eq('id', id).maybeSingle()
  if (!data || data.user_id !== user.id) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  let subAuto = false
  let method: string | null = null
  if (data.status === 'succeeded') {
    const sub = await getSupabaseAdmin().from('user_subscription').select('auto_renew, next_charge_at, payment_method_id').eq('user_id', user.id).maybeSingle()
    subAuto = !!sub.data?.auto_renew
    if (sub.data?.payment_method_id) method = (await getSupabaseAdmin().from('payment_methods').select('title').eq('id', sub.data.payment_method_id).maybeSingle()).data?.title || null
  }
  return NextResponse.json({ status: data.status, plan: data.plan_code, amount: Number(data.amount), until: data.period_end, reason: data.cancellation_reason, saveRequested: data.save_requested, via: data.method_type, autoRenew: subAuto, method })
}
