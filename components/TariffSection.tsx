'use client'

import { track } from '@/lib/track'
import { useTrackOnce } from '@/lib/analytics/hooks'
import { useEffect, useRef, useState } from 'react'
import { Check, X } from 'lucide-react'
import { PLANS, PLAN_COMMON_LINE, PAY_ONCE_LINE, formatRub, planPerks, planForDbCode, startLine, type PricePlan } from '@/lib/pricing'
import { PAY_SOON } from '@/lib/limit-texts'
import PayTrust, { BTN_MAIN, BTN_SECOND } from '@/components/PayTrust'

// Витрина тарифов в настройках («Сравнить тарифы»). Цены и пункты из lib/pricing.ts (тот же источник, что у лендинга).
// Только показ: НИКАКИХ записей в БД и смены плана (план меняет только сервер после оплаты).
// paymentsOn: оплата открыта этому человеку (paymentsOnFor на сервере, /api/me): «Оплатить месяц» ведет на /dashboard/oplata.
// Закрыта: кнопка «Выбрать» открывает честное окно «оплаты пока нет».
// manual (автоплатежи выключены): другой платный тариф можно оплатить и при оплаченном текущем, он включится сразу.
// Пробный (20.11, аудит Б4) серой строкой, а не карточкой: первым экраном должны быть платные тарифы.
export default function TariffSection({ currentCode, paymentsOn = false, manual = false }: { currentCode?: string; paymentsOn?: boolean; manual?: boolean }) {
  const [picked, setPicked] = useState<PricePlan | null>(null)
  const current = planForDbCode(currentCode)
  const trial = PLANS.find(p => p.price === 0)
  const paid = PLANS.filter(p => p.price > 0)
  // paywall_view, когда блок тарифов попал на экран
  const box = useRef<HTMLDivElement>(null)
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    const el = box.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { setSeen(true); io.disconnect() } }, { threshold: 0.3 })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  useTrackOnce('paywall_view', { where: 'tariffs' }, seen)

  const choose = (plan: PricePlan) => {
    track('plan_click', { plan: plan.dbCodes[0] || plan.id, where: 'tariffs' })
    if (paymentsOn) window.location.assign(`/dashboard/oplata?plan=${plan.dbCodes[0] === 'practice' ? 'practice' : 'start'}`)
    else setPicked(plan)
  }

  return (
    <div ref={box}>
      {/* оплата закрыта этому человеку: честная плашка, без urgency */}
      {!paymentsOn && <p className="mb-4 rounded-2xl bg-brand-soft px-4 py-3 text-[15px] leading-[22px] text-brand-text">{PAY_SOON.line}</p>}
      {paymentsOn && manual && <PayTrust className="mb-4" />}

      {trial && current?.id === trial.id && (
        <p className="mb-3 rounded-xl border border-brand-border px-4 py-3 text-[15px] leading-[22px] text-brand-muted">
          {trial.name} · {trial.materials} текстов без срока · ты здесь
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {paid.map(plan => {
          const isCurrent = current?.id === plan.id
          // при автоплатежах другой тариф меняется в блоке «Тариф» со следующего списания, тут кнопки нет
          const canPay = !isCurrent && (manual || !(paymentsOn && current && current.price > 0))
          return (
            <div key={plan.id} className={`flex flex-col rounded-2xl border bg-brand-card p-5 ${isCurrent ? 'border-brand-accent' : 'border-brand-border'}`}>
              <div className="flex items-start justify-between gap-3">
                <p className="text-[18px] leading-6 font-semibold text-brand-text">{plan.name}</p>
                {isCurrent && <span className="shrink-0 rounded-full bg-brand-soft px-2.5 py-0.5 text-[13px] font-semibold text-brand-text">Ты здесь</span>}
              </div>
              <p className="mt-2 flex items-baseline gap-2">
                <span className="text-[28px] leading-8 font-bold text-brand-text tabular-nums">{formatRub(plan.price)}</span>
                <span className="text-[15px] text-brand-muted">за месяц</span>
              </p>
              <p className="mt-1 text-[15px] leading-[22px] text-brand-muted">{plan.who}</p>
              <ul className="mt-3 space-y-2 flex-1">
                {planPerks(plan).map((perk, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <Check aria-hidden className="w-4 h-4 text-brand-accent shrink-0 mt-[3px]" strokeWidth={1.75} />
                    <span className="text-[15px] leading-[22px] text-brand-text">{perk}</span>
                  </li>
                ))}
              </ul>
              {/* описание услуги у каждого тарифа (требование ЮKassa) */}
              <p className="mt-3 text-[13px] leading-5 text-brand-muted">{plan.what} {startLine(plan)}</p>
              {canPay && (
                <div className="mt-4">
                  <button type="button" onClick={() => choose(plan)} className={`w-full ${paymentsOn ? BTN_MAIN : BTN_SECOND}`}>
                    {paymentsOn ? 'Оплатить месяц' : 'Выбрать'}
                  </button>
                  {paymentsOn && manual && <p className="mt-2 text-center text-[13px] leading-5 text-brand-muted">{PAY_ONCE_LINE}</p>}
                </div>
              )}
            </div>
          )
        })}
      </div>
      <p className="text-[13px] text-brand-muted mt-3 leading-relaxed">{PLAN_COMMON_LINE}</p>

      {/* Окно «оплаты пока нет»: честно, не переключает план, в БД не пишет */}
      {picked && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-brand-text/40 p-0 sm:p-4" onClick={() => setPicked(null)}>
          <div role="dialog" aria-modal="true" aria-label={PAY_SOON.popTitle} onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-md bg-brand-card rounded-t-3xl sm:rounded-3xl border border-brand-border p-6 pb-[calc(24px+env(safe-area-inset-bottom))]">
            <div className="flex items-start justify-between gap-3 mb-2">
              <p className="text-lg font-bold text-brand-text">{PAY_SOON.popTitle}</p>
              <button type="button" aria-label="Закрыть" onClick={() => setPicked(null)} className="w-11 h-11 -m-2.5 flex items-center justify-center text-brand-muted hover:text-brand-text transition cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-[15px] leading-[22px] text-brand-text-secondary">{PAY_SOON.popText(picked.name)}</p>
            <button type="button" onClick={() => setPicked(null)} className={`mt-5 w-full ${BTN_MAIN}`}>{PAY_SOON.popButton}</button>
          </div>
        </div>
      )}
    </div>
  )
}
