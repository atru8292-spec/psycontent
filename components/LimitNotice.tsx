'use client'

import { Sparkles } from 'lucide-react'
import { useRouter } from 'next/navigation'

// Мягкое брендовое сообщение, когда операция упёрлась в лимит/доступ или
// требует заполненного профиля. Без давления, без красного, без кнопки оплаты.
// message — спокойный текст; actionLabel + actionHref — опциональная кнопка
// с понятным следующим шагом (например «Заполнить профиль» → /onboarding).
export function LimitNotice({
  title = 'Пока недоступно',
  message,
  actionLabel,
  actionHref,
}: {
  title?: string
  message: string
  actionLabel?: string
  actionHref?: string
}) {
  const router = useRouter()
  return (
    <div className="rounded-3xl bg-brand-soft border border-brand-border-soft p-5 sm:p-6 flex items-start gap-3">
      <div className="w-10 h-10 rounded-2xl bg-brand-card flex items-center justify-center shrink-0">
        <Sparkles className="w-5 h-5 text-brand-sage" />
      </div>
      <div>
        <p className="font-semibold text-brand-accent mb-1">{title}</p>
        <p className="text-sm text-brand-text leading-relaxed">{message}</p>
        {actionLabel && actionHref && (
          <button
            onClick={() => router.push(actionHref)}
            className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 rounded-2xl bg-brand-accent text-white text-sm font-semibold hover:bg-brand-accent-hover transition cursor-pointer"
          >
            {actionLabel}
          </button>
        )}
      </div>
    </div>
  )
}
