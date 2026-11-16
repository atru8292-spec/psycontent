// /api/admin/pay: платежи для кабинета Арины. GET список (последние 300 платежей, подписки, возвраты).
// POST действия: refund (возврат за оставшиеся дни), extend (продлить на N дней), disable (выключить тариф),
// receipt (ссылка на чек «Мой налог» или отметка «аннулирован»). Только ADMIN_EMAILS, иначе 404. Каждое действие
// пишется в журнал сервера без почт и сумм-подробностей (console.info с кодом действия).
import { NextRequest, NextResponse } from 'next/server'
import { adminOrNull, notFoundResponse } from '@/lib/admin'
import { getSupabaseAdmin } from '@/lib/generation/db'
import { billingDeps } from '@/lib/billing/deps'
import { refundPayment, adminExtend, adminDisable, disableAutoRenew } from '@/lib/billing/core'
import { billingReady } from '@/lib/billing/ready'
import { errTag } from '@/lib/safe-error'
import { publicOrigin } from '@/lib/origin'

const UUID = /^[0-9a-f-]{36}$/

export async function GET() {
  if (!(await adminOrNull())) return notFoundResponse()
  const db = getSupabaseAdmin()
  const [p, r] = await Promise.all([
    db.from('payments').select('id, user_id, email, kind, plan_code, amount, status, method_type, attempt, cancellation_reason, receipt_status, receipt_url, paid_at, period_start, period_end, note, created_at').order('created_at', { ascending: false }).limit(300),
    db.from('refunds').select('id, payment_id, amount, days_left, days_total, status, created_at').order('created_at', { ascending: false }).limit(100),
  ])
  if (p.error || r.error) return NextResponse.json({ error: 'need_migration' }, { status: 200 })
  const ids = [...new Set((p.data || []).map(x => x.user_id).filter(Boolean))] as string[]
  const subs = ids.length ? (await db.from('user_subscription').select('user_id, status, auto_renew, period_end, next_charge_at, plans(code)').in('user_id', ids)).data || [] : []
  return NextResponse.json({ payments: p.data, refunds: r.data, subs, ready: billingReady() })
}

export async function POST(req: NextRequest) {
  if (!(await adminOrNull())) return notFoundResponse()
  const origin = req.headers.get('origin')
  if (origin && origin !== publicOrigin(req)) return NextResponse.json({ error: 'bad_origin' }, { status: 403 })
  const b = await req.json().catch(() => null)
  const action = String(b?.action || '')
  const userId = String(b?.userId || '')
  const d = billingDeps()
  try {
    if (action === 'refund') {
      // возврат по конкретному платежу (кнопка на его строке), в том числе удаленного человека
      const pid = String(b?.paymentId || '')
      if (!UUID.test(pid)) return NextResponse.json({ error: 'bad_payment' }, { status: 400 })
      const r = await refundPayment(d, pid)
      console.info('admin pay:', action, r.ok ? 'ok' : r.error)
      return NextResponse.json(r)
    }
    if (action === 'extend') {
      if (!UUID.test(userId)) return NextResponse.json({ error: 'bad_user' }, { status: 400 })
      const r = await adminExtend(d, userId, Number(b?.days), String(b?.plan || ''))
      console.info('admin pay:', action, r)
      return NextResponse.json({ ok: r === 'ok' })
    }
    if (action === 'autorenew_off') {
      // оферта: подписку отключают и письмом, доступ остается до конца оплаченного месяца
      if (!UUID.test(userId)) return NextResponse.json({ error: 'bad_user' }, { status: 400 })
      const r = await disableAutoRenew(d, userId)
      console.info('admin pay:', action, r)
      return NextResponse.json({ ok: true, result: r })
    }
    if (action === 'disable') {
      if (!UUID.test(userId)) return NextResponse.json({ error: 'bad_user' }, { status: 400 })
      await adminDisable(d, userId)
      console.info('admin pay:', action)
      return NextResponse.json({ ok: true })
    }
    if (action === 'receipt') {
      const pid = String(b?.paymentId || '')
      const status = String(b?.status || '')
      const url = String(b?.url || '').trim()
      if (!UUID.test(pid) || !['done', 'annulled'].includes(status)) return NextResponse.json({ error: 'bad_request' }, { status: 400 })
      // ссылка на чек «Мой налог» (lknpd.nalog.ru): ее и отправляем человеку
      if (status === 'done' && !/^https:\/\/lknpd\.nalog\.ru\/[A-Za-z0-9/_.-]{5,200}$/.test(url)) return NextResponse.json({ error: 'bad_url' }, { status: 400 })
      const patch: Record<string, unknown> = { receipt_status: status, updated_at: new Date().toISOString(), ...(status === 'done' ? { receipt_url: url } : {}) }
      const { data, error } = await getSupabaseAdmin().from('payments').update(patch).eq('id', pid).select('email').maybeSingle()
      if (error) throw error
      if (status === 'done' && data?.email) await d.mail('receipt', data.email, { url }).catch(() => {})
      console.info('admin pay:', action, status)
      return NextResponse.json({ ok: true })
    }
    return NextResponse.json({ error: 'bad_action' }, { status: 400 })
  } catch (e) {
    console.error('admin pay error:', action, errTag(e))
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
