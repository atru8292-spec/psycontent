'use client'

import { useState } from 'react'
import { Check, X } from 'lucide-react'

// Витрина тарифов. Только показ и захват внимания, НИКАКИХ записей в БД и смены
// плана (план меняет только сервер, требование безопасности денег). Кнопка «Выбрать»
// открывает честный поповер «оплата скоро», ничего не переключает.
// Числа энергии черновые, в маркетинг не выносим, описываем качественно.

type Plan = {
  code: string
  name: string
  price: string
  who: string
  perks: string[]
  popular?: boolean
}

const PLANS: Plan[] = [
  {
    code: 'free',
    name: 'Старт',
    price: 'бесплатно',
    who: 'Попробовать, как звучит',
    perks: ['10 пробных текстов', 'по одной пробе карусели, картинки и анализа', 'дальше нужен платный тариф'],
  },
  {
    code: 'start',
    name: 'Блог',
    price: '990 ₽/мес',
    who: 'Чтобы наконец писать регулярно',
    perks: ['тексты без ограничений: посты, карусели, хуки, рилс, план', 'немного энергии на картинки к каруселям', 'карта бренда и контент-план'],
  },
  {
    code: 'practice',
    name: 'Практика',
    price: '2490 ₽/мес',
    popular: true,
    who: 'Когда блог должен приводить клиентов',
    perks: ['все из Блога', 'больше энергии на картинки и расшифровки', 'глубокий разбор конкурентов'],
  },
  {
    code: 'expert',
    name: 'Студия',
    price: '4990 ₽/мес',
    who: 'Полная мощность',
    perks: ['все из Практики', 'много энергии на картинки, расшифровки и анализ', 'для тех, кто ведет несколько площадок'],
  },
]

export default function TariffSection({ currentCode }: { currentCode?: string }) {
  const [picked, setPicked] = useState<Plan | null>(null)

  return (
    <div>
      {/* Честная плашка про оплату, без urgency */}
      <div className="rounded-3xl bg-brand-soft border border-brand-border-soft p-4 sm:p-5 mb-4">
        <p className="text-sm text-brand-text leading-relaxed">
          Оплату подключаем. Скоро можно будет переходить между тарифами прямо здесь, без анкет и звонков.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {PLANS.map((plan) => {
          const isCurrent = currentCode === plan.code
          return (
            <div
              key={plan.code}
              className={`relative flex flex-col rounded-3xl border p-5 ${
                isCurrent
                  ? 'border-brand-accent bg-brand-soft ring-1 ring-brand-accent/30'
                  : plan.popular
                  ? 'border-brand-border-soft bg-brand-card'
                  : 'border-brand-border bg-brand-card'
              }`}
            >
              {plan.popular && !isCurrent && (
                <span className="absolute top-4 right-4 text-[10px] font-bold uppercase tracking-wide text-brand-accent bg-brand-soft-2 px-2 py-0.5 rounded-full">
                  Популярный
                </span>
              )}

              <p className="text-lg font-bold text-brand-text leading-tight">{plan.name}</p>
              <p className={`text-sm font-semibold mt-0.5 ${isCurrent || plan.popular ? 'text-brand-accent' : 'text-brand-text'}`}>{plan.price}</p>
              <p className="text-xs text-brand-muted mt-1.5 leading-snug">{plan.who}</p>

              <ul className="mt-4 space-y-2 flex-1">
                {plan.perks.map((perk, i) => (
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
                ) : (
                  <button
                    type="button"
                    onClick={() => setPicked(plan)}
                    className={`block w-full text-center text-sm font-semibold rounded-2xl py-2.5 transition cursor-pointer ${
                      plan.popular
                        ? 'bg-brand-accent text-white hover:bg-brand-accent-hover'
                        : 'bg-brand-card text-brand-accent border border-brand-accent/40 hover:bg-brand-soft'
                    }`}
                  >
                    Выбрать
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

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
