'use client'
// Длинный текст свернут с кнопкой «Показать целиком». Два способа:
// clamp: по числу строк (класс line-clamp, на телефоне 6, на компьютере 11);
// until: по смыслу, видно все до строки с этим куском включительно, граница одна на любой ширине
// (правая карточка сравнения: до «Бл*дь, как у вас все просто.», решение Арины 16.11).
// Свернутое лежит в HTML и скрыто только стилями (SEO). Раскрытие мгновенное, без затухания градиентом. place: код для land_more_open.
import { useId, useState } from 'react'
import { track } from '@/lib/track'
import { EXAMPLE } from './content'

export default function ClampText({ text, clamp = 'line-clamp-6 lg:line-clamp-[11]', until, place, className = '' }: { text: string; clamp?: string; until?: string; place?: string; className?: string }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const at = until ? text.indexOf(until) : -1
  const cut = at >= 0 ? (text.indexOf('\n', at + until!.length) + 1 || text.length) : -1
  const toggle = () => { if (!open && place) track('land_more_open', { place }); setOpen(v => !v) }
  return (
    <>
      {cut > 0 ? (
        <div id={id} className={`whitespace-pre-line ${className}`}>
          <span>{text.slice(0, cut).replace(/\n+$/, '')}</span>
          <span className={open ? '' : 'hidden'}>{'\n' + text.slice(cut)}</span>
        </div>
      ) : (
        <p id={id} className={`whitespace-pre-line ${open ? '' : clamp} ${className}`}>{text}</p>
      )}
      <button type="button" aria-expanded={open} aria-controls={id} onClick={toggle}
        className="-mx-2 mt-2 h-11 rounded-full px-3 font-semibold text-brand-accent transition-colors hover:bg-brand-soft focus-visible:outline-2 focus-visible:outline-brand-accent cursor-pointer">
        {open ? EXAMPLE.less : EXAMPLE.more}
      </button>
    </>
  )
}
