'use client'
// Пример как пост в ленте: кружок-аватар и «тестовый психолог» (вид рилса стоит в пометке над карточкой), текст с переносами строк
// как у генератора, свернут (мобилка 5 строк, десктоп 11; на мобилке шапки нет), раскрытие мгновенное. Без лайков и счетчиков.
import { useId, useState } from 'react'
import { EXAMPLE } from './content'

export default function ExamplePost({ text, className = '' }: { text: string; className?: string }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  return (
    <article className={`rounded-3xl border border-brand-border bg-brand-card px-5 pt-4 pb-2 lg:p-7 ${className}`}>
      <header className="flex items-center gap-2.5 max-lg:hidden">
        <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-bg text-[15px] font-bold text-brand-text ring-1 ring-brand-border">Т</span>
        <p className="min-w-0 text-[14px] font-semibold leading-[1.3] text-brand-text">{EXAMPLE.author}</p>
      </header>
      <p id={id} className={`whitespace-pre-line text-[17px] lg:mt-3 leading-[1.55] text-brand-text ${open ? '' : 'line-clamp-5 lg:line-clamp-[11]'}`}>{text}</p>
      <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(v => !v)}
        className="-mx-2 mt-1 h-11 rounded-lg px-2 font-semibold text-brand-accent transition-colors hover:bg-brand-soft focus-visible:outline-2 focus-visible:outline-brand-accent cursor-pointer">
        {open ? EXAMPLE.less : EXAMPLE.more}
      </button>
    </article>
  )
}
