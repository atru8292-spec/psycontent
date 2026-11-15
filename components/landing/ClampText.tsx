'use client'
// Длинный текст свернут с кнопкой «Показать целиком»: по числу строк (класс line-clamp, на телефоне 6, на компьютере 11).
// Свернутое лежит в HTML и скрыто только стилями (SEO). Раскрытие мгновенное, без затухания градиентом. place: код для land_more_open.
import { useId, useState } from 'react'
import { track } from '@/lib/track'
import { EXAMPLE } from './content'

export default function ClampText({ text, clamp = 'line-clamp-6 lg:line-clamp-[11]', place, className = '' }: { text: string; clamp?: string; place?: string; className?: string }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const toggle = () => { if (!open && place) track('land_more_open', { place }); setOpen(v => !v) }
  return (
    <>
      <p id={id} className={`whitespace-pre-line ${open ? '' : clamp} ${className}`}>{text}</p>
      <button type="button" aria-expanded={open} aria-controls={id} onClick={toggle}
        className="-mx-2 mt-2 h-11 rounded-full px-3 font-semibold text-brand-accent transition-colors hover:bg-brand-soft focus-visible:outline-2 focus-visible:outline-brand-accent cursor-pointer">
        {open ? EXAMPLE.less : EXAMPLE.more}
      </button>
    </>
  )
}
