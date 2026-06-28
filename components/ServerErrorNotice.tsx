'use client'

import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'

// Мягкое сообщение о СЕРВЕРНОМ сбое (не врём про профиль, не пугаем).
// Кнопка «Попробовать снова» с задержкой (cooldown), чтобы не долбить мёртвый
// сервер повторами. Тон бережный, без красного.
export function ServerErrorNotice({
  onRetry,
  cooldownSec = 5,
}: {
  onRetry: () => void
  cooldownSec?: number
}) {
  const [left, setLeft] = useState(cooldownSec)

  useEffect(() => {
    if (left <= 0) return
    const t = setTimeout(() => setLeft((n) => n - 1), 1000)
    return () => clearTimeout(t)
  }, [left])

  const ready = left <= 0

  return (
    <div className="rounded-3xl bg-brand-soft border border-brand-border-soft p-5 sm:p-6 flex items-start gap-3">
      <div className="w-10 h-10 rounded-2xl bg-brand-card flex items-center justify-center shrink-0">
        <RefreshCw className="w-5 h-5 text-brand-sage" />
      </div>
      <div>
        <p className="font-semibold text-brand-text mb-1">Что-то пошло не так на нашей стороне</p>
        <p className="text-sm text-brand-text leading-relaxed">
          Это временно и не связано с вами. Попробуйте ещё раз через минуту.
        </p>
        <button
          onClick={onRetry}
          disabled={!ready}
          className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 rounded-2xl bg-brand-accent text-white text-sm font-semibold transition cursor-pointer disabled:opacity-50 disabled:cursor-default hover:bg-brand-accent-hover"
        >
          {ready ? 'Попробовать снова' : `Попробовать снова (${left})`}
        </button>
      </div>
    </div>
  )
}
