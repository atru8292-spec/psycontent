'use client'
// Пример как пост в ленте: кружок-аватар, «тестовый психолог», текст с переносами строк как у генератора,
// свернут до 10 строк, раскрытие мгновенное. Без лайков и счетчиков.
import { useId, useState } from 'react'
import { EXAMPLE } from './content'

export default function ExamplePost({ kind, text, className = '' }: { kind: string; text: string; className?: string }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  return (
    <article className={`rounded-3xl border border-brand-border bg-brand-card p-6 lg:p-8 ${className}`}>
      <header className="flex items-center gap-3">
        <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-bg text-[17px] font-bold text-brand-text ring-1 ring-brand-border">Т</span>
        <div className="min-w-0">
          <p className="text-[15px] font-semibold text-brand-text">{EXAMPLE.author}</p>
          <p className="text-[14px] text-brand-muted">{kind}</p>
        </div>
      </header>
      <p id={id} className={`mt-4 whitespace-pre-line text-[17px] leading-[1.55] text-brand-text ${open ? '' : 'line-clamp-[10]'}`}>{text}</p>
      <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(v => !v)}
        className="mt-2 h-11 rounded-lg font-semibold text-brand-accent px-2 -mx-2 transition-colors hover:bg-brand-soft focus-visible:outline-2 focus-visible:outline-brand-accent cursor-pointer">
        {open ? EXAMPLE.less : EXAMPLE.more}
      </button>
    </article>
  )
}
