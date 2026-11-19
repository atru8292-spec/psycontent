'use client'

// Блок «Тариф» в «Настройках» (вариант А, макеты A8 справа и A11 первым блоком; 17.11).
// Показывается всем: на пробном тариф и остаток, на платном до какого числа, карта, автопродление.
// «Отключить автопродление», «Удалить карту» и «Сменить тариф» срабатывают сразу после одного подтверждения (оферта).
// Включить автопродление обратно можно только новой оплатой. Тексты lib/billing/pay-texts.ts.
// Витрину TariffSection раскрывает текстовая кнопка «Сравнить тарифы» (витрину рисует страница настроек).
// 20.11 (аудит Б3, Б4): у пробного главная кнопка «Выбрать тариф» сразу на оплату (2 тапа до оплаты); на «Спокойном ритме»
// с нулем текстов главная «Перейти на «Каждый день»» (включится сразу, lib/billing/period.ts manualWindow switch), «Продлить» тихая.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import { QUIET_BTN } from '@/lib/ui-classes'
import { track } from '@/lib/track'
import { BTN_MAIN, BTN_TEXT } from '@/components/PayTrust'
import { SUB, MANUAL, rubles, dateRu } from '@/lib/billing/pay-texts'
import { PAID_PLANS, consentText, type PaidCode } from '@/lib/billing/plans'
import { planForDbCode, textsBackAt, ZERO, PAY_ONCE_LINE } from '@/lib/pricing'
import type { Materials } from '@/lib/limit-texts'

type PayMe = {
  payments: boolean; paid: boolean; status: string; until: string | null; autoRenew: boolean; nextChargeAt: string | null
  plan: { code: string; name: string; price: number } | null; method: { title: string; type: string } | null
  nextPlan: { code: string; name: string; price: number } | null
  // ручное продление (19.11): autopay false, ended «Тариф закончился» с последним оплаченным тарифом
  autopay?: boolean; ended?: { plan: { code: string; name: string; price: number }; at: string } | null
  anchor?: number | null; periodStart?: string | null
}
const DAY = 86400000

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
  // ручное продление: автопродления нет, продлевают сами (кнопка «Продлить на месяц», новый месяц к концу оплаченного)
  const manual = !!me && me.autopay === false
  const daysLeft = me?.paid && me.until ? Math.max(1, Math.ceil((new Date(me.until).getTime() - Date.now()) / DAY)) : 0
  const payHref = (code?: string) => `/dashboard/oplata?plan=${code === 'practice' ? 'practice' : 'start'}`

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
  // тексты месяца кончились на оплаченном тарифе (ручное продление): когда вернутся и можно ли перейти сразу
  const zero = manual && !!me?.paid && !!me.until && materials?.kind === 'month' && left === 0
  const back = zero ? textsBackAt(new Date(), me!.periodStart ? new Date(me!.periodStart) : null, new Date(me!.until!), me!.anchor ?? null) : null
  const canSwitch = zero && me?.plan?.code === 'start' && me.payments
  // пробный (не оплачен и не «закончился»): главная кнопка сразу на оплату, витрина тихой кнопкой
  const trialView = !!me && !paidView && !me.ended
  const payOpen = !!me?.payments
  const btn = 'h-11 px-4 rounded-2xl border-[1.5px] border-brand-accent text-brand-accent text-[15px] font-semibold bg-brand-card hover:bg-brand-soft-2 transition cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent disabled:opacity-60'

  return (
    <section id="tariff" aria-labelledby="tariff-title" className={`scroll-mt-20 rounded-[20px] bg-brand-card border border-brand-border p-4 sm:p-6 ${className}`}>
      <h2 id="tariff-title" className="text-lg font-semibold text-brand-text">Тариф</h2>
      <p className="mt-0.5 text-[15px] leading-[22px] text-brand-muted">{paidView && !pastDue && !manual ? SUB.planUntil(name, until) : name}</p>
      {manual && me?.paid && until && <p className="mt-1 text-[16px] leading-6 font-semibold text-brand-text">{MANUAL.paidUntil(until)}</p>}
      {balance && !zero && <p className={`mt-1 text-[15px] leading-[22px] text-brand-text ${left !== 0 ? 'lg:hidden' : ''}`}>{balance}</p>}

      {manual && me?.paid && me.plan && (
        <div className="mt-4">
          {daysLeft <= 3 && <p className="mb-3 rounded-2xl bg-brand-soft-2 px-4 py-3 text-[15px] leading-[22px] text-brand-text">{MANUAL.endingSoon(until, daysLeft)}</p>}
          {zero && back && (
            <p className="mb-4 text-[15px] leading-[22px] text-brand-text">
              <span className="font-semibold">{ZERO.payTitle}</span> {ZERO.settings(materials!.cap, dateRu(back.at), back.auto, canSwitch)}
            </p>
          )}
          {canSwitch ? (
            <>
              <Link href={payHref('practice')} onClick={() => track('plan_click', { plan: 'practice', where: 'settings_zero' })} className={`w-full lg:w-auto ${BTN_MAIN}`}>{ZERO.switchBtn}</Link>
              <p className="mt-2 text-[13px] leading-[18px] text-brand-muted">{PAY_ONCE_LINE}</p>
              <Link href={payHref(me.plan.code)} onClick={() => track('plan_click', { plan: me.plan!.code, where: 'settings_renew' })} className={`mt-2 w-full lg:w-auto ${BTN_TEXT}`}>{ZERO.renewQuiet}</Link>
            </>
          ) : (
            <>
              <Link href={payHref(me.plan.code)} onClick={() => track('plan_click', { plan: me.plan!.code, where: 'settings_renew' })} className={`w-full lg:w-auto ${BTN_MAIN}`}>{MANUAL.renewBtn}</Link>
              <p className="mt-2 text-[13px] leading-[18px] text-brand-muted">{MANUAL.renewHint}</p>
            </>
          )}
        </div>
      )}

      {manual && me?.ended && !me.paid && (
        <div className="mt-4 rounded-2xl bg-brand-soft-2 p-4">
          <p className="text-[16px] leading-6 font-semibold text-brand-text">{MANUAL.endedTitle}</p>
          <p className="mt-1 text-[15px] leading-[22px] text-brand-text">{MANUAL.endedText(me.ended.plan.name, dateRu(me.ended.at))}</p>
          <Link href={payHref(me.ended.plan.code)} onClick={() => track('plan_click', { plan: me.ended!.plan.code, where: 'settings_ended' })} className={`mt-3 w-full lg:w-auto ${BTN_MAIN}`}>{MANUAL.payBtn}</Link>
          {me.payments && <p className="mt-2 text-[13px] leading-[18px] text-brand-muted">{PAY_ONCE_LINE}</p>}
        </div>
      )}

      {pastDue && me && (
        <div className="mt-4 rounded-2xl bg-brand-soft-2 p-4">
          <p className="text-[15px] leading-[22px] text-brand-text">{SUB.pastDue(nextDate)}</p>
          {me.plan && <Link href={`/dashboard/oplata?plan=${me.plan.code === 'practice' ? 'practice' : 'start'}`} className={`mt-3 inline-flex items-center ${btn}`}>{SUB.payNow}</Link>}
        </div>
      )}

      {paidView && me && !manual && (
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

      {trialView && payOpen && (
        <div className="mt-4">
          <Link href={payHref('start')} onClick={() => track('plan_click', { plan: 'start', where: 'settings_trial' })} className={`w-full lg:w-auto ${BTN_MAIN}`}>Выбрать тариф</Link>
          {manual && <p className="mt-2 text-[13px] leading-[18px] text-brand-muted">{PAY_ONCE_LINE}</p>}
        </div>
      )}

      <div className="mt-4 flex flex-col lg:flex-row lg:flex-wrap gap-2">
        {me?.autoRenew && !me.nextPlan && me.plan && <button type="button" onClick={() => { setErr(false); setAgree(false); setAsk('plan') }} className={btn}>{SUB.changeBtn}</button>}
        {me?.autoRenew && <button type="button" onClick={() => { setErr(false); setAsk('off') }} className={btn}>{SUB.offBtn}</button>}
        {me?.method && <button type="button" onClick={() => { setErr(false); setAsk('del') }} className={btn}>{SUB.delBtn(sbp)}</button>}
        {onToggleTariffs && (
          <button type="button" onClick={onToggleTariffs} aria-expanded={tariffsOpen} aria-controls="tariff-list"
            className={`lg:self-start ${payOpen ? `-mt-2 ${BTN_TEXT}` : QUIET_BTN}`}>
            {tariffsOpen ? SUB.hideTariffs : payOpen ? 'Сравнить тарифы' : SUB.seeTariffs}
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
