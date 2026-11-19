'use client'

// Карточка «Тексты закончились» на «Написать» вместо серой кнопки (аудит UI 19.11, Б2; мокап oplata/mockup-zakonchilsya-390).
// Пробный: «Выбрать тариф» сразу на оплату «Спокойного ритма». Платный «Спокойный ритм»: «Перейти на «Каждый день»» (включается
// сразу) и тихая «Подожду до <дата>». «Каждый день»: апгрейда нет, только «Подожду» или «Продлить».
// Дата честная: следующий месяц внутри оплаченного окна (тот же день месяца, что у начала окна, lib/billing/period.ts),
// а если срок кончится раньше, говорим про продление. Окно и день берем из /api/pay/me (periodStart, until, anchor), тариф из /api/me.

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { track } from '@/lib/track'
import { END, TARIFF_HREF, type Materials } from '@/lib/limit-texts'
import { nextSegmentStart } from '@/lib/billing/period'
import { dateRu } from '@/lib/billing/pay-texts'
import { PAID_PLANS, isPaidCode } from '@/lib/billing/plans'
import { BTN_P, BTN_S, BTN_T } from './knopki'

type V = { title: string; line: string; main: { label: string; href: string; plan: string } | null; waitBtn?: string; quiet?: { label: string; href: string } | null }
type PayMe = { until: string | null; periodStart: string | null; anchor: number | null; ended: { plan: { code: string; name: string; price: number }; at: string } | null }

// Начало следующего месяца текстов внутри оплаченного окна (тот же расчет, что у сервера), иначе null
const nextInside = (p: PayMe | null): Date | null =>
  p?.until && p.periodStart ? nextSegmentStart(new Date(p.periodStart), p.anchor, new Date(p.until), new Date()) : null

const rub = (n: number) => `${n.toLocaleString('ru-RU').replace(/\s/g, ' ')} ₽`

export default function EndCard({ materials, planCode, paymentsOn, compact = false }: {
  materials: Materials
  planCode?: string | null
  paymentsOn: boolean
  compact?: boolean // внутри «Эта же мысль в другом формате»: без рамки карточки
}) {
  const [pay, setPay] = useState<PayMe | null>(null)
  // пока /api/pay/me не ответил, заголовка нет: иначе у человека с кончившимся платным тарифом мелькает «Пробные закончились»
  const [loaded, setLoaded] = useState(false)
  const [waiting, setWaiting] = useState(false)

  useEffect(() => {
    let on = true
    fetch('/api/pay/me', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null))
      .then(j => { if (on && j) setPay({ until: j.until ?? null, periodStart: j.periodStart ?? null, anchor: j.anchor ?? null, ended: j.ended ?? null }) })
      .catch(() => {})
      .finally(() => { if (on) setLoaded(true) })
    return () => { on = false }
  }, [])
  useEffect(() => { track('paywall_view', { where: compact ? 'make_more' : 'make_end' }) }, [compact])

  const daily = PAID_PLANS.practice
  const v = useMemo<V>(() => {
    const oplata = (code: 'start' | 'practice') => (paymentsOn ? `/dashboard/oplata?plan=${code}` : TARIFF_HREF)
    if (materials.kind === 'trial') {
      const ended = pay?.ended && isPaidCode(pay.ended.plan.code) ? pay.ended : null
      if (ended && paymentsOn) {
        const code = ended.plan.code as 'start' | 'practice'
        return { title: END.card.endedTitle(dateRu(ended.at)), line: END.card.endedLine(ended.plan.name, PAID_PLANS[code].materials),
          main: { label: END.card.endedButton(rub(ended.plan.price)), href: oplata(code), plan: code }, quiet: { label: END.card.compare, href: TARIFF_HREF } }
      }
      return { title: END.card.trialTitle, line: END.card.trialLine,
        main: { label: paymentsOn ? END.card.choose : END.button, href: oplata('start'), plan: 'start' },
        quiet: paymentsOn ? { label: END.card.compare, href: TARIFF_HREF } : null }
    }
    // платный месяц
    const until = pay?.until ?? null
    const next = nextInside(pay)
    const inside = !!next
    const date = next ? dateRu(next) : undefined
    const untilRu = until ? dateRu(until) : ''
    const isDaily = planCode === 'practice' || planCode === 'expert'
    const line = inside ? END.card.monthNext(materials.cap, date!) : until ? END.card.monthRenew(materials.cap, untilRu) : END.card.monthNoDate
    const renewHref = oplata(isDaily ? 'practice' : 'start')
    if (isDaily) {
      // апгрейда некуда: ждем новый месяц или продлеваем, если срок кончится раньше
      return inside || !until
        ? { title: END.card.monthTitle, line, main: null, waitBtn: END.card.wait(inside ? date : undefined), quiet: null }
        : { title: END.card.monthTitle, line, main: { label: paymentsOn ? END.card.renew : END.button, href: renewHref, plan: 'practice' }, quiet: null }
    }
    return {
      title: END.card.monthTitle, line,
      main: { label: paymentsOn ? END.card.upgrade(daily.name) : END.button, href: oplata('practice'), plan: 'practice' },
      // «Подожду» только если новый месяц правда придет сам; иначе тихо «Продлить с <дата>»
      ...(inside || !until ? { waitBtn: END.card.wait(date) } : { quiet: paymentsOn ? { label: END.card.renewFrom(untilRu), href: renewHref } : null }),
    }
  }, [materials, pay, planCode, paymentsOn, daily.name])

  const waitNext = materials.kind === 'month' ? nextInside(pay) : null
  const waitDate = waitNext ? dateRu(waitNext) : undefined
  const wait = () => { setWaiting(true); track('limit_wait', { plan: planCode === 'practice' || planCode === 'expert' ? 'practice' : 'start' }) }

  if (waiting) {
    return (
      <button type="button" onClick={() => setWaiting(false)} aria-expanded={false}
        className="w-full min-h-12 px-4 py-2.5 rounded-xl border border-brand-border bg-brand-card text-left text-[15px] text-brand-text-secondary cursor-pointer hover:bg-brand-soft-2">
        {END.card.waiting(waitDate)}
      </button>
    )
  }

  if (!loaded) {
    const ph = <div aria-busy="true" className="space-y-2"><div className="h-6 w-2/3 rounded-lg bg-brand-soft animate-pulse" /><div className="h-12 rounded-xl bg-brand-soft animate-pulse" /></div>
    return compact ? <div className="pt-1">{ph}</div> : <div className="rounded-2xl border border-brand-border bg-brand-card p-4 lg:p-5">{ph}</div>
  }

  const body = (
    <>
      <p className="text-[17px] leading-6 font-semibold text-brand-text">{v.title}</p>
      <p className="mt-1 text-[15px] leading-[22px] text-brand-text-secondary">{v.line}</p>
      <div className="mt-4 flex flex-col gap-1.5">
        {v.main && <Link href={v.main.href} onClick={() => track('plan_click', { plan: v.main!.plan, where: compact ? 'make_more' : 'make_end' })} className={`w-full ${BTN_P}`}>{v.main.label}</Link>}
        {v.waitBtn && <button type="button" onClick={wait} className={`w-full ${v.main ? BTN_T : BTN_S}`}>{v.waitBtn}</button>}
        {v.quiet && <Link href={v.quiet.href} className={`w-full ${BTN_T}`}>{v.quiet.label}</Link>}
      </div>
    </>
  )
  if (compact) return <div role="status" className="pt-1">{body}</div>
  return <div role="status" className="rounded-2xl border border-brand-border bg-brand-card p-4 lg:p-5">{body}</div>
}
