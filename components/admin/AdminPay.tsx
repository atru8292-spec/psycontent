'use client'

// /admin/oplata (17.11). Платежи последними сверху. Чеки: самозанятая пробивает чек в «Мой налог» сама (ЮKassa чеки
// самозанятых не формирует), сюда вставляет ссылку lknpd.nalog.ru, она уходит человеку письмом. После возврата строка
// «аннулируй чек и выбей новый на удержанную сумму». Действия по человеку: возврат за оставшиеся дни (сумма по дням
// считается на сервере, lib/billing/period.ts), продлить на N дней, выключить тариф. Почты видит только Арина.
// Верстка 19.11: таблица фиксированной ширины влезает в 1280 без прокрутки (6 колонок, почта обрезается с подсказкой),
// возврат последним и кирпичным текстом, подтверждение говорит точную сумму и что будет с тарифом (lib/billing/refund-preview.ts).
import { useEffect, useMemo, useState } from 'react'
import { refundPreview, type RefundPreview } from '@/lib/billing/refund-preview'

type Pay = { note?: string | null; id: string; user_id: string | null; email: string | null; kind: string; plan_code: string; amount: number; status: string; method_type: string | null; attempt: number; cancellation_reason: string | null; receipt_status: string; receipt_url: string | null; paid_at: string | null; period_start: string | null; period_end: string | null; created_at: string }
type Ref = { id: string; payment_id: string; amount: number; days_left: number; days_total: number; status: string; created_at: string }
type Sub = { user_id: string; status: string; auto_renew: boolean; period_end: string | null; next_charge_at: string | null }
type Data = { payments?: Pay[]; refunds?: Ref[]; subs?: Sub[]; ready?: boolean; error?: string }

const TZ = 'Europe/Moscow'
const dt = (s: string | null) => (s ? new Date(s).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: TZ }) : '')
const day = (s: string | null) => (s ? new Date(s).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: TZ }) : '')
const dayLong = (s: string | null) => (s ? new Date(s).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', timeZone: TZ }) : '')
const rub = (n: number) => `${Number(n).toLocaleString('ru-RU')}\u00a0₽`
const STATUS: Record<string, string> = { pending: 'ждет оплаты', waiting_for_capture: 'ждет оплаты', succeeded: 'оплачен', canceled: 'не прошел' }
const RECEIPT: Record<string, string> = { none: 'чек не нужен', need: 'нужен чек', done: 'чек отправлен', annul_need: 'аннулировать чек', annulled: 'чек аннулирован' }
const PLAN: Record<string, string> = { start: 'Спокойный ритм', practice: 'Каждый день', free: 'Бесплатный' }
const METHOD: Record<string, string> = { sbp: 'СБП', bank_card: 'карта', yoo_money: 'ЮMoney', sberbank: 'SberPay', tinkoff_bank: 'T-Pay', mir_pay: 'Mir Pay' }
const REASON: Record<string, string> = { insufficient_funds: 'не хватило денег', expired_on_confirmation: 'не подтвердил вовремя', canceled_by_merchant: 'отменен магазином', card_expired: 'карта просрочена', payment_method_restricted: 'способ оплаты ограничен', permission_revoked: 'отозвано разрешение', general_decline: 'банк отказал', '3d_secure_failed': 'не прошел 3-D Secure', fraud_suspected: 'банк заподозрил мошенничество', internal_timeout: 'сбой ЮKassa' }
// подписка человека под сроком платежа: что сейчас с его тарифом
const subText = (s: Sub, now: number) => {
  if (s.status === 'expired' || (s.period_end && new Date(s.period_end).getTime() < now)) return 'тариф закончился'
  if (s.status === 'past_due') return 'не прошло списание'
  if (s.status === 'trial') return 'пробный период'
  return s.auto_renew ? 'автопродление включено' : 'автопродление выключено'
}
const kindText = (p: Pay) => (p.kind === 'first' ? 'первая оплата' : p.kind === 'renewal' ? `автопродление${p.attempt > 1 ? `, попытка ${p.attempt}` : ''}` : 'продление')
const NOT_REFUNDABLE: Record<string, string> = { refunded: 'возврат уже оформлен', not_latest: 'сначала верни последний платеж человека', nothing_left: 'оплаченные дни кончились, возвращать нечего', not_paid: '' }

// текст подтверждения: сколько вернется и что будет с тарифом
function refundConfirm(p: Pay, r: Extract<RefundPreview, { can: true }>): string {
  const plan = PLAN[p.plan_code] || p.plan_code
  const who = p.email || 'удаленный аккаунт'
  if (r.effect === 'no_account') return `Вернуть ${rub(r.amount)} целиком (${who})?\n\nАккаунта нет, тариф менять не у кого. Деньги уйдут тем же способом, которым платили.`
  if (r.effect === 'future') return `Вернуть ${rub(r.amount)} целиком (${who})?\n\nЭто продление еще не началось. Тариф «${plan}» не выключится и будет работать до ${dayLong(r.keepUntil)}, как до этой оплаты. Придет письмо о возврате.`
  return `Вернуть ${rub(r.amount)} из ${rub(Number(p.amount))} за ${r.daysLeft} из ${r.daysTotal} дней (${who})?\n\nТариф «${plan}» выключится сейчас, человек перейдет на бесплатный. Придет письмо о возврате.`
}

export default function AdminPay() {
  const [d, setD] = useState<Data | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [filter, setFilter] = useState<'all' | 'need'>('all')

  const load = () => fetch('/api/admin/pay', { cache: 'no-store' }).then(r => r.json()).then(setD).catch(() => setD({ error: 'load' }))
  useEffect(() => { load() }, [])

  const post = async (body: Record<string, unknown>, confirmText?: string, paid?: number) => {
    if (busy) return
    if (confirmText && !window.confirm(confirmText)) return
    setBusy(true); setMsg(null)
    try {
      const r = await fetch('/api/admin/pay', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const j = await r.json().catch(() => ({}))
      const ok = r.ok && j.ok !== false
      setMsg(ok
        ? (body.action === 'refund'
          ? `Возврат ${rub(j.amount)} оформлен${j.daysTotal ? ` за ${j.daysLeft} из ${j.daysTotal} дней` : ''}, статус ЮKassa ${j.status}. ${paid && Number(j.amount) >= paid ? 'Вернулась вся сумма: чек аннулируй, если уже выбила, новый не нужен.' : `Аннулируй чек и выбей новый на ${rub((paid || 0) - Number(j.amount))}.`}`
          : 'Готово')
        : j.error === 'not_latest' ? 'Не вышло: после этого платежа уже оплачены продления. Сначала верни последний платеж человека или разберись руками.'
        : j.error === 'already_refunded' ? 'Не вышло: по этому платежу возврат уже оформлен.'
        : j.error === 'nothing_left' ? 'Не вышло: оплаченные дни кончились, возвращать нечего.'
        : `Не вышло: ${j.error || r.status}`)
      await load()
    } catch { setMsg('Не вышло: сеть') } finally { setBusy(false) }
  }

  const rows = useMemo(() => (d?.payments || []).filter(p => filter === 'all' || ['need', 'annul_need'].includes(p.receipt_status)), [d, filter])
  const subOf = (u: string | null) => (d?.subs || []).find(s => s.user_id === u)

  if (!d) return <p className="p-6 text-sm text-brand-muted">Загружаю…</p>
  if (d.error) return <p className="p-6 text-sm text-brand-text">Таблиц оплаты еще нет: примени миграцию 20261117100000_oplata.sql.</p>

  const now = new Date()
  const needCount = (d.payments || []).filter(p => ['need', 'annul_need'].includes(p.receipt_status)).length
  const btn = 'h-9 px-3 rounded-xl border border-brand-border text-[13px] text-brand-text hover:bg-brand-soft cursor-pointer disabled:opacity-50 disabled:cursor-default'
  const act = 'w-full min-h-8 py-1 px-2.5 rounded-lg border border-brand-border bg-brand-card text-left text-[13px] text-brand-text hover:bg-brand-soft cursor-pointer disabled:opacity-50 disabled:cursor-default'

  return (
    <div className="py-6 space-y-4">
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
        <table className="w-full min-w-[1000px] table-fixed text-[13px] leading-[18px]">
          <colgroup>
            <col className="w-[132px]" /><col /><col className="w-[150px]" /><col className="w-[178px]" /><col className="w-[220px]" /><col className="w-[212px]" />
          </colgroup>
          <thead className="text-left text-brand-muted"><tr>{['Когда', 'Почта', 'Оплата', 'Статус и срок', 'Чек', 'Действия'].map(h => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-brand-border">
            {rows.map(p => {
              const sub = subOf(p.user_id)
              const refunded = (p.note || '').match(/refunded:([\d.]+)/)?.[1]
              const r = refundPreview(p, sub, now)
              const live = p.user_id && p.status === 'succeeded' && !refunded
              const ended = !sub || subText(sub, now.getTime()) === 'тариф закончился'
              return (
                <tr key={p.id} className="align-top">
                  <td className="px-3 py-3"><span className="whitespace-nowrap">{dt(p.created_at)}</span><div className="text-brand-muted">{kindText(p)}</div></td>
                  <td className="px-3 py-3 min-w-0">
                    {p.email ? <div className="truncate" title={p.email}>{p.email}</div> : <span className="text-brand-muted">аккаунт удален</span>}
                  </td>
                  <td className="px-3 py-3">
                    <div className="font-semibold tabular-nums">{rub(p.amount)}</div>
                    <div className="text-brand-muted">{PLAN[p.plan_code] || p.plan_code}{p.method_type ? `, ${METHOD[p.method_type] || p.method_type}` : ''}</div>
                  </td>
                  <td className="px-3 py-3">
                    <div>{STATUS[p.status] || p.status}{refunded ? `, возврат ${rub(Number(refunded))}` : ''}</div>
                    {p.cancellation_reason && <div className="text-brand-muted">{REASON[p.cancellation_reason] || p.cancellation_reason}</div>}
                    {p.period_end && <div className="text-brand-muted">{p.period_start ? `${day(p.period_start)} → ` : ''}{day(p.period_end)}</div>}
                    {sub && p.status === 'succeeded' && <div className="text-brand-muted">{subText(sub, now.getTime())}</div>}
                  </td>
                  <td className="px-3 py-3">
                    {refunded && <div className="text-brand-muted">чек на {rub(Number(p.amount) - Number(refunded))}</div>}
                    <div className={['need', 'annul_need'].includes(p.receipt_status) ? 'font-semibold' : 'text-brand-muted'}>
                      {RECEIPT[p.receipt_status] ?? p.receipt_status}{p.receipt_url && <> · <a href={p.receipt_url} target="_blank" rel="noopener" className="underline">открыть чек</a></>}
                    </div>
                    {p.receipt_status === 'need' && (
                      <div className="mt-1.5 space-y-1">
                        <input value={urls[p.id] || ''} onChange={e => setUrls(u => ({ ...u, [p.id]: e.target.value }))} placeholder="ссылка lknpd.nalog.ru/…" aria-label="Ссылка на чек из «Мой налог»" className="w-full h-8 px-2 rounded-lg border border-brand-border text-[13px]" />
                        <button type="button" disabled={busy || !urls[p.id]} onClick={() => post({ action: 'receipt', paymentId: p.id, status: 'done', url: urls[p.id] })} className={act}>Отправить чек человеку</button>
                      </div>
                    )}
                    {p.receipt_status === 'annul_need' && <button type="button" disabled={busy} onClick={() => post({ action: 'receipt', paymentId: p.id, status: 'annulled' })} className={`mt-1.5 ${act}`}>Чек аннулировала</button>}
                  </td>
                  <td className="px-3 py-3">
                    {/(refund_due|check)/.test(p.note || '') && <div className="mb-1.5 font-semibold">{(p.note || '').includes('check') ? 'проверить в ЮKassa' : (p.note || '').includes('double') ? 'двойная оплата: вернуть' : 'аккаунт удален: вернуть деньги'}</div>}
                    <div className="space-y-1">
                      {live && sub?.auto_renew && <button type="button" disabled={busy} onClick={() => post({ action: 'autorenew_off', userId: p.user_id })} className={act}>Выключить автопродление</button>}
                      {live && <button type="button" disabled={busy} onClick={() => { const n = Number(window.prompt('Продлить тариф бесплатно на сколько дней? (от 1 до 62)', '7')); if (n) post({ action: 'extend', userId: p.user_id, days: n, plan: p.plan_code }) }} className={act}>Продлить бесплатно…</button>}
                      {live && !ended && <button type="button" disabled={busy} onClick={() => post({ action: 'disable', userId: p.user_id }, `Выключить тариф сейчас без возврата денег (${p.email || 'аккаунт'})?\n\nЧеловек перейдет на бесплатный, деньги останутся у тебя.`)} className={act}>Выключить без возврата</button>}
                    </div>
                    {r.can ? (
                      <button type="button" disabled={busy} onClick={() => post({ action: 'refund', paymentId: p.id }, refundConfirm(p, r), Number(p.amount))}
                        className={`w-full text-left ${live ? 'mt-2.5 border-t border-brand-border pt-2' : ''} text-[13px] font-medium text-brand-danger underline-offset-2 hover:underline cursor-pointer disabled:opacity-50 disabled:cursor-default`}>
                        Вернуть {rub(r.amount)}…
                      </button>
                    ) : NOT_REFUNDABLE[r.why] ? <div className={`text-brand-muted ${live ? 'mt-2.5 border-t border-brand-border pt-2' : ''}`}>{NOT_REFUNDABLE[r.why]}</div> : null}
                  </td>
                </tr>
              )
            })}
            {!rows.length && <tr><td colSpan={6} className="px-3 py-6 text-center text-brand-muted">Платежей нет</td></tr>}
          </tbody>
        </table>
      </div>
      {(d.refunds || []).length > 0 && (
        <div>
          <h2 className="text-base font-semibold text-brand-text mb-2">Возвраты</h2>
          <ul className="text-[13px] space-y-1">{(d.refunds || []).map(r => <li key={r.id}>{dt(r.created_at)}: {rub(r.amount)} {r.days_total ? `за ${r.days_left} из ${r.days_total} дней` : 'целиком'}, {r.status === 'succeeded' ? 'деньги ушли' : r.status === 'canceled' ? 'не прошел' : 'в обработке'}</li>)}</ul>
        </div>
      )}
    </div>
  )
}
