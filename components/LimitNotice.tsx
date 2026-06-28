'use client'

import { Sparkles } from 'lucide-react'

// Мягкое брендовое сообщение, когда дорогая операция упёрлась в лимит/доступ.
// Без давления, без красного, без кнопки оплаты (платёжки пока нет).
// message — спокойный текст с сервера (decision.message).
export function LimitNotice({ title = 'Пока недоступно', message }: { title?: string; message: string }) {
  return (
    <div className="rounded-3xl bg-brand-soft border border-brand-border-soft p-5 sm:p-6 flex items-start gap-3">
      <div className="w-10 h-10 rounded-2xl bg-brand-card flex items-center justify-center shrink-0">
        <Sparkles className="w-5 h-5 text-brand-sage" />
      </div>
      <div>
        <p className="font-semibold text-brand-accent mb-1">{title}</p>
        <p className="text-sm text-brand-text leading-relaxed">{message}</p>
      </div>
    </div>
  )
}
