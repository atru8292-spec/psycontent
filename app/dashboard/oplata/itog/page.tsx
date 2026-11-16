'use client'

// /dashboard/oplata/itog?p=<id платежа>: человек вернулся со страницы ЮKassa. Тариф включает только уведомление ЮKassa,
// поэтому здесь опрос статуса: каждые 3 с первые 2 минуты, потом каждые 15 с до 10 минут, пауза на скрытой вкладке.
// Через 2 минуты без ответа экран «Банк пока не ответил» (без кнопки повторной оплаты: она подталкивала бы к двойной).
// Спецификация designer-psycont 17.11, тексты lib/billing/pay-texts.ts.
import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { ITOG, reasonText, rubles, dateRu } from '@/lib/billing/pay-texts'
import { PAID_PLANS, isPaidCode } from '@/lib/billing/core'
import { track } from '@/lib/track'
import { useDashboardMe } from '@/lib/dashboard-me'

type St = { status: 'pending' | 'waiting_for_capture' | 'succeeded' | 'canceled'; plan: string; amount: number; until: string | null; reason: string | null; saveRequested: boolean; via: string | null; autoRenew: boolean; method: string | null }

function Itog() {
  const params = useSearchParams()
  const id = params.get('p') || ''
  const [st, setSt] = useState<St | null>(null)
  const [lost, setLost] = useState(false)
  const [slow, setSlow] = useState(false)
  const started = useRef(Date.now())
  const tracked = useRef(false)
  const { refresh } = useDashboardMe()

  const load = useCallback(async () => {
    if (!/^[0-9a-f-]{36}$/.test(id)) { setLost(true); return null }
    try {
      const r = await fetch(`/api/pay/status?p=${id}`, { cache: 'no-store' })
      if (r.status === 404 || r.status === 400) { setLost(true); return null }
      if (!r.ok) return null
      const j: St = await r.json(); setSt(j); return j
    } catch { return null }
  }, [id])

  useEffect(() => {
    let stop = false
    let t: number | null = null
    const tick = async () => {
      if (stop) return
      const age = Date.now() - started.current
      if (document.visibilityState === 'visible') {
        const j = await load()
        if (j && (j.status === 'succeeded' || j.status === 'canceled')) return
      }
      if (age > 120000) setSlow(true)
      if (age > 600000) return
      t = window.setTimeout(tick, age < 120000 ? 3000 : 15000)
    }
    tick()
    return () => { stop = true; if (t) window.clearTimeout(t) }
  }, [load])

  const state = lost ? 'lost' : st?.status === 'succeeded' ? 'done' : st?.status === 'canceled' ? 'failed' : slow ? 'timeout' : 'checking'
  useEffect(() => {
    if (tracked.current || state === 'checking') return
    tracked.current = state !== 'timeout'
    // тариф включился: пилюля остатка в шапке должна показать новый месяц, а не «0 из 10»
    if (state === 'done') refresh?.()
    track('feature_open', { feature: `pay_itog_${state}` })
  }, [state, refresh])

  const planName = st && isPaidCode(st.plan) ? PAID_PLANS[st.plan].name : ''
  const primary = 'w-full h-12 rounded-2xl bg-brand-accent text-white text-[16px] font-semibold hover:bg-brand-accent-hover transition cursor-pointer inline-flex items-center justify-center'
  const secondary = 'w-full h-12 rounded-2xl bg-brand-card border border-brand-accent/40 text-brand-accent text-[16px] font-semibold hover:bg-brand-soft transition cursor-pointer inline-flex items-center justify-center'

  let title = ITOG.checkingTitle
  let body: React.ReactNode = <p className="mt-2 text-[15px] leading-[22px] text-brand-text-secondary">{ITOG.checkingText}</p>
  let actions: React.ReactNode = null
  if (state === 'done' && st) {
    title = ITOG.okTitle
    const until = st.until ? dateRu(st.until) : ''
    body = (
      <>
        <dl className="mt-5 rounded-2xl bg-brand-card border border-brand-border px-4 text-left divide-y divide-brand-border">
          <div className="py-3 flex justify-between gap-3 text-[15px]"><dt className="text-brand-muted">Тариф</dt><dd className="text-brand-text font-semibold text-right">{planName}</dd></div>
          <div className="py-3 flex justify-between gap-3 text-[15px]"><dt className="text-brand-muted">Работает до</dt><dd className="text-brand-text text-right">{until}</dd></div>
          <div className="py-3 flex justify-between gap-3 text-[15px]"><dt className="text-brand-muted">Автопродление</dt><dd className="text-brand-text text-right">{st.autoRenew ? 'включено' : 'выключено'}</dd></div>
        </dl>
        <p className="mt-3 text-[13px] leading-5 text-brand-muted text-left">
          {st.autoRenew ? ITOG.okAuto(until, rubles(st.amount)) : st.saveRequested ? ITOG.okNotSaved(until) : ITOG.okNoAuto(until)}
        </p>
        <p className="mt-1 text-[13px] leading-5 text-brand-muted text-left">{ITOG.okReceipt}</p>
      </>
    )
    actions = <Link href="/dashboard/make" className={primary}>К текстам</Link>
  } else if (state === 'failed' && st) {
    title = ITOG.failTitle
    body = (
      <>
        <p className="mt-2 text-[15px] leading-[22px] text-brand-text-secondary">{reasonText(st.reason)} {ITOG.failText}</p>
        {st.via === 'sbp' && st.saveRequested && <p className="mt-2 text-[15px] leading-[22px] text-brand-text-secondary">{ITOG.failSbp}</p>}
      </>
    )
    actions = (
      <div className="space-y-2">
        <Link href={`/dashboard/oplata?plan=${isPaidCode(st.plan) ? st.plan : 'start'}`} className={primary}>{ITOG.retry}</Link>
        <Link href="/dashboard/make" className={secondary}>{ITOG.backToTexts}</Link>
      </div>
    )
  } else if (state === 'timeout') {
    title = ITOG.slowTitle
    body = <p className="mt-2 text-[15px] leading-[22px] text-brand-text-secondary">{ITOG.slowText}</p>
    actions = (
      <div className="space-y-2">
        <Link href="/dashboard/make" className={primary}>К текстам</Link>
        <button type="button" onClick={() => { void load() }} className={secondary}>{ITOG.checkAgain}</button>
      </div>
    )
  } else if (state === 'lost') {
    title = ITOG.lostTitle
    body = <p className="mt-2 text-[15px] leading-[22px] text-brand-text-secondary">{ITOG.lostText}</p>
    actions = <Link href="/dashboard/settings#tariff" className={primary}>Открыть Профиль</Link>
  }

  return (
    <div className="min-h-[100dvh] lg:min-h-[80vh] flex flex-col">
      <div className="flex-1 flex">
        <div className="my-auto w-full max-w-[480px] mx-auto px-4 py-8 text-center" aria-live="polite">
          <Image src="/brand/psycont-icon.svg" alt="" width={56} height={56}
            className={`w-14 h-14 mx-auto ${state === 'checking' ? 'animate-pulse motion-reduce:animate-none' : ''}`} />
          <h1 className="mt-5 text-[24px] leading-8 font-bold text-brand-text">{title}</h1>
          {body}
          {actions && <div className="mt-6 hidden lg:block">{actions}</div>}
        </div>
      </div>
      {actions && <div className="lg:hidden shrink-0 sticky bottom-0 bg-brand-bg border-t border-brand-border px-4 pt-3 pb-[calc(12px+env(safe-area-inset-bottom))]">{actions}</div>}
    </div>
  )
}

export default function Page() {
  return <Suspense fallback={null}><Itog /></Suspense>
}
