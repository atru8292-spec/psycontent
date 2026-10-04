'use client'

import { track } from '@/lib/track'
import { useFeatureOpen, useTrackOnce } from '@/lib/analytics/hooks'
import { useEffect, useRef, useState } from 'react'
import { Check, X } from 'lucide-react'
import { PLANS, PLAN_COMMON_LINE, formatRub, planPerks, planForDbCode, type PricePlan } from '@/lib/pricing'

// Витрина тарифов в настройках. Цены и пункты из lib/pricing.ts (тот же источник, что у лендинга).
// Только показ и захват внимания, НИКАКИХ записей в БД и смены плана (план меняет только сервер,
// требование безопасности денег). Кнопка «Выбрать» открывает честный поповер «оплата скоро».

export default function TariffSection({ currentCode }: { currentCode?: string }) {
  const [picked, setPicked] = useState<PricePlan | null>(null)
  const current = planForDbCode(currentCode)
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

  return (
    <div ref={box}>
      {/* Честная плашка про оплату, без urgency */}
      <div className="rounded-3xl bg-brand-soft border border-brand-border-soft p-4 sm:p-5 mb-4">
        <p className="text-sm text-brand-text leading-relaxed">
          Оплату подключаем. Скоро можно будет переходить между тарифами прямо здесь, без анкет и звонков.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {PLANS.map((plan) => {
          const isCurrent = current?.id === plan.id
          return (
            <div
              key={plan.id}
              className={`relative flex flex-col rounded-3xl border p-5 ${
                isCurrent
                  ? 'border-brand-accent bg-brand-soft ring-1 ring-brand-accent/30'
                  : 'border-brand-border bg-brand-card'
              }`}
            >
              <p className="text-lg font-bold text-brand-text leading-tight">{plan.name}</p>
              <p className={`text-sm font-semibold mt-0.5 ${isCurrent ? 'text-brand-accent' : 'text-brand-text'}`}>{plan.price ? `${formatRub(plan.price)} в месяц` : 'бесплатно'}</p>
              <p className="text-xs text-brand-muted mt-1.5 leading-snug">{plan.who}</p>

              <ul className="mt-4 space-y-2 flex-1">
                {planPerks(plan).map((perk, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <Check className="w-3.5 h-3.5 text-brand-sage shrink-0 mt-0.5" />
                    <span className="text-[13px] text-brand-text leading-snug">{perk}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-5">
                {isCurrent ? (
                  <span className="block w-full text-center text-sm font-semibold text-brand-accent bg-brand-card border border-brand-accent/30 rounded-2xl py-2.5">
                    Ты здесь
                  </span>
                ) : plan.price > 0 ? (
                  <button
                    type="button"
                    onClick={() => { track('plan_click', { plan: plan.dbCodes[0] || plan.id }); setPicked(plan) }}
                    className="block w-full text-center text-sm font-semibold rounded-2xl py-2.5 transition cursor-pointer bg-brand-card text-brand-accent border border-brand-accent/40 hover:bg-brand-soft"
                  >
                    Выбрать
                  </button>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>
      <p className="text-[13px] text-brand-muted mt-3 leading-relaxed">{PLAN_COMMON_LINE}</p>

      {/* Поповер «оплата скоро»: честно, не переключает план, в БД не пишет */}
      {picked && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-brand-text/40 backdrop-blur-sm p-0 sm:p-4"
          onClick={() => setPicked(null)}
        >
          <div
            role="dialog"
            aria-label="Оплата скоро"
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-md bg-brand-card rounded-t-3xl sm:rounded-3xl border border-brand-border p-6 shadow-xl"
          >
            <div className="flex items-start justify-between gap-3 mb-2">
              <p className="text-lg font-bold text-brand-text">Оплата скоро</p>
              <button type="button" aria-label="Закрыть" onClick={() => setPicked(null)} className="p-1 -m-1 text-brand-muted hover:text-brand-text transition cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-brand-muted leading-relaxed">
              Мы заканчиваем подключение оплаты. Как только заработает, перейдешь на «{picked.name}» в один тап, без анкет и звонков. Загляни сюда чуть позже.
            </p>
            <button
              type="button"
              onClick={() => setPicked(null)}
              className="mt-5 w-full bg-brand-accent text-white font-semibold rounded-2xl py-3 hover:bg-brand-accent-hover transition cursor-pointer"
            >
              Хорошо
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
