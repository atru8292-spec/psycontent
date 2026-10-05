'use client'
// Длинный текст свернут с кнопкой «Показать целиком»: на мобилке до 6 строк, на десктопе до 11 (класс clamp).
// Раскрытие мгновенное, без затухания градиентом.
import { useId, useState } from 'react'
import { EXAMPLE } from './content'

export default function ClampText({ text, clamp = 'line-clamp-6 lg:line-clamp-[11]', className = '' }: { text: string; clamp?: string; className?: string }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  return (
    <>
      <p id={id} className={`whitespace-pre-line ${open ? '' : clamp} ${className}`}>{text}</p>
      <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(v => !v)}
        className="-mx-2 mt-2 h-11 rounded-lg px-2 font-semibold text-brand-accent transition-colors hover:bg-brand-soft focus-visible:outline-2 focus-visible:outline-brand-accent cursor-pointer">
        {open ? EXAMPLE.less : EXAMPLE.more}
      </button>
    </>
  )
}
