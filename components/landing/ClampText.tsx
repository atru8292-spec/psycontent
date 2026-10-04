'use client'
// Длинный текст свернут до N строк с кнопкой «Показать целиком». Раскрытие мгновенное, без затухания градиентом.
import { useId, useState } from 'react'
import { EXAMPLE } from './content'

export default function ClampText({ text, lines = 9, className = '' }: { text: string; lines?: number; className?: string }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  return (
    <>
      <p id={id} className={`whitespace-pre-line ${className}`} style={open ? undefined : { display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: lines, overflow: 'hidden' }}>{text}</p>
      <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(v => !v)}
        className="mt-2 h-11 rounded-lg font-semibold text-brand-accent hover:underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-brand-accent cursor-pointer">
        {open ? EXAMPLE.less : EXAMPLE.more}
      </button>
    </>
  )
}
