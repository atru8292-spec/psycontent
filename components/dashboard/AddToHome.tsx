'use client'

// Подсказка «PsyCont на экран Домой» (17.11, макет A11). Только телефон и только в «Настройках».
// Если PsyCont уже открыт с экрана «Домой» (standalone), карточки нет. Раскрытие пишет feature_open 'add_home'.
// Отдельной кнопки «Скрыть» нет (новой кнопке нужно свое событие): карточка сворачивается нажатием на заголовок.
import { useEffect, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { track } from '@/lib/track'

type Os = 'ios' | 'android' | 'other'

function detect(): { show: boolean; os: Os } {
  if (typeof window === 'undefined') return { show: false, os: 'other' }
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone === true
  const ua = navigator.userAgent || ''
  // iPad с iPadOS представляется Mac, отличаем по касанию
  const ios = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
  const os: Os = ios ? 'ios' : /Android/i.test(ua) ? 'android' : 'other'
  return { show: !standalone, os }
}

export default function AddToHome({ className = '' }: { className?: string }) {
  // читаем окружение после монтирования: на сервере его нет, а разметка должна совпасть
  const [env, setEnv] = useState<{ show: boolean; os: Os }>({ show: false, os: 'other' })
  const [open, setOpen] = useState(false)
  useEffect(() => { setEnv(detect()) }, [])
  if (!env.show) return null

  const toggle = () => {
    if (!open) track('feature_open', { feature: 'add_home' })
    setOpen(o => !o)
  }
  const ios = <>В Safari нажми «Поделиться», потом «На экран «Домой»»</>
  const android = <>В Chrome нажми три точки справа вверху, потом «Добавить на главный экран»</>

  return (
    <section className={`lg:hidden rounded-[20px] bg-brand-card border border-brand-border ${className}`}>
      <button type="button" onClick={toggle} aria-expanded={open} aria-controls="add-home-how"
        className="w-full min-h-14 px-4 py-3 flex items-center gap-3 text-left cursor-pointer rounded-[20px] focus-visible:outline-2 focus-visible:outline-brand-accent">
        <span className="flex-1 min-w-0">
          <span className="block text-base font-semibold text-brand-text">PsyCont одной кнопкой</span>
          <span className="block text-[13px] leading-[18px] text-brand-muted">Значок рядом с приложениями на телефоне</span>
        </span>
        <ChevronDown className={`w-5 h-5 text-brand-muted shrink-0 transition-transform motion-reduce:transition-none ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      {open && (
        <div id="add-home-how" className="px-4 pb-4 -mt-1">
          {env.os === 'other' ? (
            <ul className="space-y-2 text-[15px] leading-[22px] text-brand-text">
              <li><span className="font-semibold">iPhone.</span> {ios}</li>
              <li><span className="font-semibold">Android.</span> {android}</li>
            </ul>
          ) : (
            <p className="text-[15px] leading-[22px] text-brand-text">{env.os === 'ios' ? ios : android}</p>
          )}
        </div>
      )}
    </section>
  )
}
