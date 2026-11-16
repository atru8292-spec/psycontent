'use client'

// /dashboard/oplata?plan=start|practice: выбор тарифа, согласие на автопродление (галочка НЕ стоит заранее, текст
// согласия всегда раскрыт: он же пишется в базу), переход на страницу ЮKassa. Своей формы оплаты и логотипов нет.
// СБП первым (главная кнопка), «Картой или другим способом» второй. Тариф включает только вебхук (lib/billing/core.ts).
// Спецификация designer-psycont 17.11, тексты lib/billing/pay-texts.ts.
import { Suspense, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { ChevronLeft, Check, Loader2 } from 'lucide-react'
import { PAY, rubles, dateRu } from '@/lib/billing/pay-texts'
import { consentText, PAID_PLANS, type PaidCode } from '@/lib/billing/core'
import { track } from '@/lib/track'

type Me = { payments: boolean; paid: boolean; plan: { name: string } | null; until: string | null }
const PLAN_MATERIALS: Record<PaidCode, number> = { start: 50, practice: 150 }

function Oplata() {
  const router = useRouter()
  const params = useSearchParams()
  const plan: PaidCode = params.get('plan') === 'practice' ? 'practice' : 'start'
  const p = PAID_PLANS[plan]
  const [me, setMe] = useState<Me | null>(null)
  const [agree, setAgree] = useState(false)
  const [busy, setBusy] = useState<null | 'sbp' | 'any'>(null)
  const [error, setError] = useState(false)
  const timer = useRef<number | null>(null)

  useEffect(() => {
    fetch('/api/pay/me', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).then(j => setMe(j || { payments: false, paid: false, plan: null, until: null })).catch(() => setMe({ payments: false, paid: false, plan: null, until: null }))
    track('feature_open', { feature: 'pay_screen' })
    return () => { if (timer.current) window.clearTimeout(timer.current) }
  }, [])

  const choose = (code: PaidCode) => { if (!busy) router.replace(`/dashboard/oplata?plan=${code}`, { scroll: false }) }

  const pay = async (via: 'sbp' | 'any') => {
    if (busy) return
    setBusy(via); setError(false)
    // если перехода нет 10 с (медленная сеть), кнопки снова доступны
    timer.current = window.setTimeout(() => setBusy(null), 10000)
    try {
      const r = await fetch('/api/pay/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan, autoRenew: agree, via }) })
      const d = await r.json().catch(() => ({}))
      if (r.status === 409) { setMe(m => (m ? { ...m, paid: true } : m)); setBusy(null); fetch('/api/pay/me', { cache: 'no-store' }).then(x => x.json()).then(setMe).catch(() => {}); return }
      if (!r.ok || typeof d?.url !== 'string' || !d.url.startsWith('https://')) throw new Error()
      window.location.assign(d.url)
    } catch {
      setError(true); setBusy(null)
      if (timer.current) window.clearTimeout(timer.current)
    }
  }

  const secondary = 'w-full h-12 rounded-2xl bg-brand-card border border-brand-accent/40 text-brand-accent text-[16px] font-semibold hover:bg-brand-soft transition cursor-pointer disabled:opacity-60 disabled:cursor-default'
  const primary = 'w-full h-12 rounded-2xl bg-brand-accent text-white text-[16px] font-semibold hover:bg-brand-accent-hover transition cursor-pointer inline-flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-default tabular-nums'

  const backBtn = (
    <button type="button" onClick={() => (window.history.length > 1 ? router.back() : router.push('/dashboard/settings#tariff'))}
      className="h-11 -ml-2 pl-1 pr-2 inline-flex items-center text-[15px] text-brand-muted cursor-pointer">
      <ChevronLeft className="w-5 h-5" />{PAY.back}
    </button>
  )

  if (!me) {
    return (
      <div className="max-w-[560px] mx-auto px-4 pt-2 pb-8">
        {backBtn}
        <div className="mt-4 space-y-2" aria-busy="true">
          <div className="h-[72px] rounded-2xl bg-brand-soft animate-pulse" />
          <div className="h-[72px] rounded-2xl bg-brand-soft animate-pulse" />
          <div className="h-40 rounded-2xl bg-brand-soft animate-pulse" />
        </div>
      </div>
    )
  }

  if (me.paid && me.plan && me.until) {
    return (
      <div className="max-w-[560px] mx-auto px-4 pt-2 pb-8">
        {backBtn}
        <div className="mt-4 rounded-3xl bg-brand-card border border-brand-border p-5">
          <h1 className="text-[20px] leading-7 font-bold text-brand-text">{PAY.alreadyTitle(me.plan.name)}</h1>
          <p className="mt-2 text-[15px] leading-[22px] text-brand-text-secondary">{PAY.alreadyText(dateRu(me.until))}</p>
          <div className="mt-5 space-y-2">
            <Link href="/dashboard/make" className={`${primary}`}>{PAY.toTexts}</Link>
            <Link href="/dashboard/settings#tariff" className={`${secondary} inline-flex items-center justify-center`}>{PAY.toProfile}</Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-[100dvh] lg:min-h-0 flex flex-col">
      <div className="flex-1 max-w-[560px] w-full mx-auto px-4 pt-2 pb-4">
        {backBtn}
        <h1 className="mt-1 text-[24px] leading-8 lg:text-[28px] font-bold text-brand-text">{PAY.title}</h1>

        <div role="radiogroup" aria-label="Тариф" className="mt-4 space-y-2">
          {(Object.keys(PAID_PLANS) as PaidCode[]).map(code => {
            const on = code === plan
            const pl = PAID_PLANS[code]
            return (
              <button key={code} type="button" role="radio" aria-checked={on} disabled={!!busy} onClick={() => choose(code)}
                className={`min-h-[72px] w-full rounded-2xl px-4 py-3 flex items-center gap-3 text-left bg-brand-card cursor-pointer transition ${on ? 'border-2 border-brand-accent' : 'border-2 border-brand-border'}`}>
                <span className={`w-[22px] h-[22px] rounded-full border-2 flex items-center justify-center shrink-0 ${on ? 'border-brand-accent' : 'border-brand-border'}`}>
                  {on && <span className="w-2.5 h-2.5 rounded-full bg-brand-accent" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[16px] font-semibold text-brand-text">{pl.name}</span>
                  <span className="block text-[13px] text-brand-muted">{PLAN_MATERIALS[code]} материалов в месяц</span>
                </span>
                <span className="text-right shrink-0">
                  <span className="block text-[16px] font-semibold text-brand-text tabular-nums">{rubles(pl.price)}</span>
                  <span className="block text-[13px] text-brand-muted">в месяц</span>
                </span>
              </button>
            )
          })}
        </div>

        {me.payments && (
          <div className="mt-5 rounded-2xl bg-brand-card border border-brand-border p-4">
            <label className="flex items-start gap-3 cursor-pointer">
              <span className="w-11 h-11 -m-2.5 flex items-center justify-center shrink-0">
                <input type="checkbox" checked={agree} disabled={!!busy} onChange={e => setAgree(e.target.checked)} className="peer sr-only" />
                <span aria-hidden className={`w-6 h-6 rounded-md border-2 flex items-center justify-center peer-focus-visible:ring-2 peer-focus-visible:ring-brand-accent/40 ${agree ? 'bg-brand-accent border-brand-accent' : 'border-brand-border bg-brand-card'}`}>
                  {agree && <Check className="w-4 h-4 text-white" />}
                </span>
              </span>
              <span className="text-[15px] leading-6 font-semibold text-brand-text">{PAY.consentLabel}</span>
            </label>
            <p className="mt-2 pl-[36px] text-[13px] leading-5 text-brand-muted">{consentText(p)}</p>
            <p className="mt-2 pl-[36px] text-[13px] leading-5 text-brand-text">{agree ? PAY.sbpNote : PAY.noConsent}</p>
          </div>
        )}
      </div>

      <div className="shrink-0 sticky bottom-0 lg:static bg-brand-bg border-t border-brand-border lg:border-0 px-4 pt-3 pb-[calc(12px+env(safe-area-inset-bottom))]">
        <div className="max-w-[560px] mx-auto">
          {!me.payments ? (
            <div className="rounded-2xl bg-brand-soft border border-brand-border-soft px-4 py-3">
              <p className="text-[15px] font-semibold text-brand-text">{PAY.notReadyTitle}</p>
              <p className="mt-1 text-[15px] leading-[22px] text-brand-text-secondary">{PAY.notReadyText}</p>
              <Link href="/dashboard/make" className={`mt-3 ${secondary} inline-flex items-center justify-center`}>{PAY.toTexts}</Link>
            </div>
          ) : (
            <>
              {error && (
                <div role="alert" className="mb-3 rounded-2xl bg-brand-soft px-4 py-3">
                  <p className="text-[15px] font-semibold text-brand-text">{PAY.errorTitle}</p>
                  <p className="mt-1 text-[15px] leading-[22px] text-brand-text-secondary">{PAY.errorText}</p>
                </div>
              )}
              <button type="button" disabled={!!busy} onClick={() => { track('plan_click', { plan }); pay('sbp') }} className={primary}>
                {busy === 'sbp' ? <><Loader2 className="w-[18px] h-[18px] animate-spin" />{PAY.opening}</> : PAY.sbp(rubles(p.price))}
              </button>
              <p className="mt-1 text-center text-[13px] text-brand-muted">{PAY.sbpSub}</p>
              <button type="button" disabled={!!busy} onClick={() => { track('plan_click', { plan }); pay('any') }} className={`mt-2 ${secondary} inline-flex items-center justify-center gap-2`}>
                {busy === 'any' ? <><Loader2 className="w-[18px] h-[18px] animate-spin" />{PAY.opening}</> : PAY.card}
              </button>
              <p className="mt-2 text-center text-[13px] leading-5 text-brand-muted">
                {PAY.offer}{' '}<a href="/offer" target="_blank" rel="noopener" className="underline underline-offset-2 text-brand-text">{PAY.offerLink}</a>.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default function Page() {
  return <Suspense fallback={null}><Oplata /></Suspense>
}
