'use client'

// /admin/oplata (17.11). Платежи последними сверху. Чеки: самозанятая пробивает чек в «Мой налог» сама (ЮKassa чеки
// самозанятых не формирует), сюда вставляет ссылку lknpd.nalog.ru, она уходит человеку письмом. После возврата строка
// «аннулируй чек и выбей новый на удержанную сумму». Действия по человеку: возврат за оставшиеся дни (сумма по дням
// считается на сервере, lib/billing/period.ts), продлить на N дней, выключить тариф. Почты видит только Арина.
import { useEffect, useMemo, useState } from 'react'

type Pay = { id: string; user_id: string | null; email: string | null; kind: string; plan_code: string; amount: number; status: string; method_type: string | null; attempt: number; cancellation_reason: string | null; receipt_status: string; receipt_url: string | null; paid_at: string | null; period_start: string | null; period_end: string | null; created_at: string }
type Ref = { id: string; payment_id: string; amount: number; days_left: number; days_total: number; status: string; created_at: string }
type Data = { payments?: Pay[]; refunds?: Ref[]; subs?: any[]; ready?: boolean; error?: string }

const dt = (s: string | null) => (s ? new Date(s).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' }) : '')
const STATUS: Record<string, string> = { pending: 'ждет', waiting_for_capture: 'ждет', succeeded: 'оплачен', canceled: 'отменен' }
const RECEIPT: Record<string, string> = { none: '', need: 'нужен чек', done: 'чек есть', annul_need: 'аннулировать', annulled: 'аннулирован' }
const PLAN: Record<string, string> = { start: 'Спокойный ритм', practice: 'Каждый день' }

export default function AdminPay() {
  const [d, setD] = useState<Data | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [filter, setFilter] = useState<'all' | 'need'>('all')

  const load = () => fetch('/api/admin/pay', { cache: 'no-store' }).then(r => r.json()).then(setD).catch(() => setD({ error: 'load' }))
  useEffect(() => { load() }, [])

  const post = async (body: Record<string, unknown>, confirmText?: string) => {
    if (busy) return
    if (confirmText && !window.confirm(confirmText)) return
    setBusy(true); setMsg(null)
    try {
      const r = await fetch('/api/admin/pay', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const j = await r.json().catch(() => ({}))
      setMsg(r.ok && j.ok !== false ? (body.action === 'refund' ? `Возврат ${j.amount} ₽ за ${j.daysLeft} из ${j.daysTotal} дней, статус ${j.status}. Аннулируй чек и выбей новый на остаток.` : 'Готово') : `Не вышло: ${j.error || r.status}`)
      await load()
    } catch { setMsg('Не вышло: сеть') } finally { setBusy(false) }
  }

  const rows = useMemo(() => (d?.payments || []).filter(p => filter === 'all' || ['need', 'annul_need'].includes(p.receipt_status)), [d, filter])
  const subOf = (u: string | null) => (d?.subs || []).find(s => s.user_id === u)

  if (!d) return <p className="p-6 text-sm text-brand-muted">Загружаю…</p>
  if (d.error) return <p className="p-6 text-sm text-brand-text">Таблиц оплаты еще нет: примени миграцию 20261117100000_oplata.sql.</p>

  const needCount = (d.payments || []).filter(p => ['need', 'annul_need'].includes(p.receipt_status)).length
  const btn = 'h-9 px-3 rounded-xl border border-brand-border text-[13px] text-brand-text hover:bg-brand-soft cursor-pointer disabled:opacity-50'

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-6xl">
      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="text-xl font-bold text-brand-text">Оплата</h1>
        <span className="text-sm text-brand-muted">{d.ready ? 'ЮKassa подключена' : 'ключей ЮKassa нет, оплата выключена'}</span>
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={() => setFilter('all')} className={`${btn} ${filter === 'all' ? 'bg-brand-soft' : ''}`}>Все</button>
        <button type="button" onClick={() => setFilter('need')} className={`${btn} ${filter === 'need' ? 'bg-brand-soft' : ''}`}>Чеки ({needCount})</button>
      </div>
      {msg && <p role="status" className="rounded-xl bg-brand-soft px-3 py-2 text-sm text-brand-text">{msg}</p>}
      <div className="overflow-x-auto rounded-2xl border border-brand-border bg-brand-card">
        <table className="w-full text-[13px]">
          <thead className="text-left text-brand-muted"><tr>{['Когда', 'Почта', 'Тариф', 'Сумма', 'Статус', 'Окно', 'Чек', 'Действия'].map(h => <th key={h} className="px-3 py-2 font-medium whitespace-nowrap">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-brand-border">
            {rows.map(p => {
              const sub = subOf(p.user_id)
              return (
                <tr key={p.id} className="align-top">
                  <td className="px-3 py-2 whitespace-nowrap">{dt(p.created_at)}<div className="text-brand-muted">{p.kind === 'first' ? 'первая' : `продление ${p.attempt}`}</div></td>
                  <td className="px-3 py-2">{p.email || <span className="text-brand-muted">удален</span>}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{PLAN[p.plan_code] || p.plan_code}<div className="text-brand-muted">{p.method_type || ''}</div></td>
                  <td className="px-3 py-2 tabular-nums whitespace-nowrap">{Number(p.amount).toLocaleString('ru-RU')} ₽</td>
                  <td className="px-3 py-2">{STATUS[p.status] || p.status}{p.cancellation_reason && <div className="text-brand-muted">{p.cancellation_reason}</div>}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{p.period_end ? `до ${dt(p.period_end)}` : ''}{sub && <div className="text-brand-muted">{sub.status}{sub.auto_renew ? ', авто' : ''}</div>}</td>
                  <td className="px-3 py-2 min-w-[220px]">
                    <div>{RECEIPT[p.receipt_status] || p.receipt_status}{p.receipt_url && <> · <a href={p.receipt_url} target="_blank" rel="noopener" className="underline">чек</a></>}</div>
                    {p.receipt_status === 'need' && (
                      <div className="mt-1 flex gap-1">
                        <input value={urls[p.id] || ''} onChange={e => setUrls(u => ({ ...u, [p.id]: e.target.value }))} placeholder="https://lknpd.nalog.ru/..." className="min-w-0 flex-1 h-9 px-2 rounded-lg border border-brand-border text-[13px]" />
                        <button type="button" disabled={busy || !urls[p.id]} onClick={() => post({ action: 'receipt', paymentId: p.id, status: 'done', url: urls[p.id] })} className={btn}>Отправить</button>
                      </div>
                    )}
                    {p.receipt_status === 'annul_need' && <button type="button" disabled={busy} onClick={() => post({ action: 'receipt', paymentId: p.id, status: 'annulled' })} className={`mt-1 ${btn}`}>Аннулировала</button>}
                  </td>
                  <td className="px-3 py-2">
                    {p.user_id && p.status === 'succeeded' && (
                      <div className="flex flex-wrap gap-1">
                        <button type="button" disabled={busy} onClick={() => post({ action: 'refund', userId: p.user_id }, 'Вернуть деньги за оставшиеся дни и выключить тариф сейчас?')} className={btn}>Возврат</button>
                        <button type="button" disabled={busy} onClick={() => { const n = Number(window.prompt('Продлить на сколько дней?', '7')); if (n) post({ action: 'extend', userId: p.user_id, days: n, plan: p.plan_code }) }} className={btn}>Продлить</button>
                        <button type="button" disabled={busy} onClick={() => post({ action: 'disable', userId: p.user_id }, 'Выключить тариф сейчас, без возврата?')} className={btn}>Выключить</button>
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
            {!rows.length && <tr><td colSpan={8} className="px-3 py-6 text-center text-brand-muted">Платежей нет</td></tr>}
          </tbody>
        </table>
      </div>
      {(d.refunds || []).length > 0 && (
        <div>
          <h2 className="text-base font-semibold text-brand-text mb-2">Возвраты</h2>
          <ul className="text-[13px] space-y-1">{(d.refunds || []).map(r => <li key={r.id}>{dt(r.created_at)}: {Number(r.amount).toLocaleString('ru-RU')} ₽ за {r.days_left} из {r.days_total} дней, {STATUS[r.status] || r.status}</li>)}</ul>
        </div>
      )}
    </div>
  )
}
