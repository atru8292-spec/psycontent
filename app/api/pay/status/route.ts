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
  const { data } = await getSupabaseAdmin().from('payments').select('status, plan_code, period_end, cancellation_reason, save_requested, user_id').eq('id', id).maybeSingle()
  if (!data || data.user_id !== user.id) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  return NextResponse.json({ status: data.status, plan: data.plan_code, until: data.period_end, reason: data.cancellation_reason, autoRenew: data.save_requested })
}
