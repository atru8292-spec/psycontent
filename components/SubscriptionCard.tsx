'use client'

// Блок «Тариф» в «Настройках» (вариант А, макеты A8 справа и A11 первым блоком; 17.11).
// Показывается всем: на пробном тариф и остаток, на платном до какого числа, карта, автопродление.
// «Отключить автопродление», «Удалить карту» и «Сменить тариф» срабатывают сразу после одного подтверждения (оферта).
// Включить автопродление обратно можно только новой оплатой. Тексты lib/billing/pay-texts.ts.
// «Посмотреть тарифы» раскрывает витрину TariffSection (ее рисует страница настроек, тут только кнопка).
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import { QUIET_BTN } from '@/lib/ui-classes'
import { SUB, rubles, dateRu } from '@/lib/billing/pay-texts'
import { PAID_PLANS, consentText, type PaidCode } from '@/lib/billing/plans'
import { planForDbCode } from '@/lib/pricing'
import type { Materials } from '@/lib/limit-texts'

type PayMe = {
  payments: boolean; paid: boolean; status: string; until: string | null; autoRenew: boolean; nextChargeAt: string | null
  plan: { code: string; name: string; price: number } | null; method: { title: string; type: string } | null
  nextPlan: { code: string; name: string; price: number } | null
}

type Props = {
  planCode?: string
  planName?: string
  materials?: Materials | null
  tariffsOpen?: boolean
  onToggleTariffs?: () => void
  className?: string
}

export default function SubscriptionCard({ planCode, planName, materials, tariffsOpen = false, onToggleTariffs, className = '' }: Props) {
  const [me, setMe] = useState<PayMe | null>(null)
  const [ask, setAsk] = useState<null | 'off' | 'del' | 'plan'>(null)
  const [agree, setAgree] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const load = () => fetch('/api/pay/me', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).then(j => setMe(j)).catch(() => {})
  useEffect(() => { load() }, [])

  const pastDue = me?.status === 'past_due'
  const paidView = !!me && (me.paid || pastDue)
  const until = me?.until ? dateRu(me.until) : ''
  const sbp = me?.method?.type === 'sbp'
  // смена тарифа: другой из двух; со следующего списания
  const otherCode: PaidCode = me?.plan?.code === 'practice' ? 'start' : 'practice'
  const other = PAID_PLANS[otherCode]
  const nextDate = me?.nextChargeAt ? dateRu(me.nextChargeAt) : ''
  const name = (paidView && me?.plan?.name) || planForDbCode(planCode)?.name || planName || SUB.title

  const cancelChange = async () => {
    if (busy || !me?.plan) return
    setBusy(true)
    try {
      const r = await fetch('/api/pay/plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan: me.plan.code, consent: false }) })
      if (!r.ok) throw new Error()
      setToast(SUB.toastCancel(me.plan.name)); window.setTimeout(() => setToast(null), 4000); await load()
    } catch { setToast(SUB.error) } finally { setBusy(false) }
  }

  const act = async () => {
    if (busy || !ask) return
    setBusy(true); setErr(false)
    try {
      const r = ask === 'off'
        ? await fetch('/api/pay/autorenew', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ off: true }) })
        : ask === 'plan'
        ? await fetch('/api/pay/plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan: otherCode, consent: agree }) })
        : await fetch('/api/pay/method', { method: 'DELETE' })
      if (!r.ok) throw new Error()
      setToast(ask === 'off' ? SUB.toastOff(until) : ask === 'plan' ? SUB.toastChange(nextDate, other.name) : SUB.toastDel)
      window.setTimeout(() => setToast(null), 4000)
      setAsk(null)
      await load()
    } catch { setErr(true) } finally { setBusy(false) }
  }

  // остаток: на телефоне тут (на компьютере он один раз, внизу меню); конец текстов виден везде
  const left = materials ? Math.max(0, materials.remaining) : null
  const balance = materials && left !== null
    ? (materials.kind === 'trial'
      ? (left === 0 ? SUB.trialEnd : SUB.trialLeft(left, materials.cap))
      : (left === 0 ? SUB.monthEnd : SUB.monthLeft(left, materials.cap)))
    : ''
  const btn = 'h-11 px-4 rounded-2xl border-[1.5px] border-brand-accent text-brand-accent text-[15px] font-semibold bg-brand-card hover:bg-brand-soft-2 transition cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent disabled:opacity-60'

  return (
    <section id="tariff" aria-labelledby="tariff-title" className={`scroll-mt-20 rounded-[20px] bg-brand-card border border-brand-border p-4 sm:p-6 ${className}`}>
      <h2 id="tariff-title" className="text-lg font-semibold text-brand-text">Тариф</h2>
      <p className="mt-0.5 text-[15px] leading-[22px] text-brand-muted">{paidView && !pastDue ? SUB.planUntil(name, until) : name}</p>
      {balance && <p className={`mt-1 text-[15px] leading-[22px] text-brand-text ${left !== 0 ? 'lg:hidden' : ''}`}>{balance}</p>}

      {pastDue && me && (
        <div className="mt-4 rounded-2xl bg-brand-soft-2 p-4">
          <p className="text-[15px] leading-[22px] text-brand-text">{SUB.pastDue(nextDate)}</p>
          {me.plan && <Link href={`/dashboard/oplata?plan=${me.plan.code === 'practice' ? 'practice' : 'start'}`} className={`mt-3 inline-flex items-center ${btn}`}>{SUB.payNow}</Link>}
        </div>
      )}

      {paidView && me && (
        <div className="mt-4 rounded-2xl border border-brand-border px-4 py-3">
          <p className="text-[15px] font-semibold text-brand-text">{me.method ? SUB.methodTitle(me.method.title) : `${SUB.method}: ${SUB.noMethod}`}</p>
          {me.paid && !pastDue && (
            <p className="mt-0.5 text-[13px] leading-[18px] text-brand-muted">
              {me.autoRenew && me.nextChargeAt && me.plan ? SUB.autoOn(nextDate, rubles(me.plan.price)) : me.autoRenew ? '' : SUB.autoOff(until)}
            </p>
          )}
        </div>
      )}
      {me?.paid && !pastDue && me.autoRenew && <p className="mt-2 text-[13px] leading-[18px] text-brand-muted">{SUB.autoHint}</p>}

      {me?.nextPlan && nextDate && (
        <div className="mt-3 rounded-2xl bg-brand-soft-2 p-4">
          <p className="text-[15px] leading-[22px] text-brand-text">{SUB.planned(nextDate, me.nextPlan.name, rubles(me.nextPlan.price))}</p>
          <button type="button" disabled={busy} onClick={cancelChange} className={`mt-3 ${btn}`}>{SUB.cancelChange(me.plan?.name || '')}</button>
        </div>
      )}

      <div className="mt-4 flex flex-col lg:flex-row lg:flex-wrap gap-2">
        {me?.autoRenew && !me.nextPlan && me.plan && <button type="button" onClick={() => { setErr(false); setAgree(false); setAsk('plan') }} className={btn}>{SUB.changeBtn}</button>}
        {me?.autoRenew && <button type="button" onClick={() => { setErr(false); setAsk('off') }} className={btn}>{SUB.offBtn}</button>}
        {me?.method && <button type="button" onClick={() => { setErr(false); setAsk('del') }} className={btn}>{SUB.delBtn(sbp)}</button>}
        {onToggleTariffs && (
          <button type="button" onClick={onToggleTariffs} aria-expanded={tariffsOpen} aria-controls="tariff-list"
            className={`lg:self-start ${QUIET_BTN}`}>
            {tariffsOpen ? SUB.hideTariffs : SUB.seeTariffs}
          </button>
        )}
      </div>
      {me?.paid && <p className="mt-4 text-[13px] leading-5 text-brand-muted">{SUB.refund(until)}</p>}
      {toast && <p role="status" className="mt-2 text-[13px] text-brand-text">{toast}</p>}

      {ask && me && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-brand-text/40 p-0 sm:p-4" onClick={() => !busy && setAsk(null)}>
          <div role="dialog" aria-modal="true" aria-labelledby="sub-ask" onClick={e => e.stopPropagation()}
            className="w-full sm:max-w-md bg-brand-card rounded-t-3xl sm:rounded-3xl border border-brand-border p-6 pb-[calc(24px+env(safe-area-inset-bottom))] shadow-xl">
            <p id="sub-ask" className="text-[19px] leading-6 font-semibold text-brand-text">{ask === 'off' ? SUB.offTitle : ask === 'plan' ? SUB.changeTitle : SUB.delTitle(sbp)}</p>
            {ask === 'plan' ? (
              <>
                <p className="mt-2 text-[15px] leading-[22px] text-brand-text-secondary">{SUB.changeText(nextDate, me.plan?.name || '')}</p>
                <div className="mt-4 rounded-2xl border-2 border-brand-accent p-4 flex items-center justify-between gap-3">
                  <span><span className="block text-[16px] font-semibold text-brand-text">{other.name}</span><span className="block text-[13px] text-brand-muted">{other.materials} текстов в месяц</span></span>
                  <span className="text-[16px] font-semibold text-brand-text tabular-nums">{rubles(other.price)}</span>
                </div>
                <label className="mt-4 flex items-start gap-3 cursor-pointer">
                  <input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} className="mt-0.5 w-6 h-6 shrink-0 accent-[#33472B]" />
                  <span className="text-[15px] leading-6 font-semibold text-brand-text">{SUB.changeAgree(rubles(other.price), nextDate)}</span>
                </label>
                <p className="mt-2 pl-9 text-[13px] leading-5 text-brand-muted max-h-40 overflow-y-auto">{consentText(other)}</p>
              </>
            ) : (
              <p className="mt-2 text-[15px] leading-[22px] text-brand-text-secondary">{ask === 'off' ? (pastDue ? SUB.offTextPastDue : SUB.offText(until)) : SUB.delText(until)}</p>
            )}
            {err && <p role="alert" className="mt-3 rounded-2xl bg-brand-soft px-4 py-3 text-[15px] text-brand-text">{ask === 'plan' ? SUB.changeError : SUB.error}</p>}
            <div className="mt-6 flex flex-col-reverse sm:flex-row gap-2">
              <button type="button" disabled={busy} onClick={() => setAsk(null)} className="h-12 w-full sm:w-auto sm:flex-1 shrink-0 rounded-2xl border border-brand-border text-brand-text font-semibold hover:bg-brand-soft cursor-pointer">{ask === 'plan' ? SUB.changeNo : SUB.keep}</button>
              <button type="button" disabled={busy || (ask === 'plan' && !agree)} onClick={act} className="h-12 w-full sm:w-auto sm:flex-1 shrink-0 rounded-2xl bg-brand-accent text-white font-semibold hover:bg-brand-accent-hover cursor-pointer inline-flex items-center justify-center gap-2 disabled:opacity-60">
                {busy && <Loader2 className="w-4 h-4 animate-spin" />}{ask === 'off' ? SUB.offYes : ask === 'plan' ? SUB.changeYes(other.name) : SUB.delYes}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
