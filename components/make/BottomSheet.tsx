'use client'

// Нижний лист для экрана «Сделать» и «Моих текстов»: max-h 85dvh, прокрутка внутри, фон под ним не крутится,
// крестик 44, отступ под safe-area. z: фон и лист 50 (шкала из задачи: контент 0, липкие 30, таб-бар 40, лист 50, тост 60).

import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'

export default function BottomSheet({ open, onClose, title, children, footer, labelledBy }: {
  open: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  footer?: React.ReactNode
  labelledBy?: string
}) {
  const panel = useRef<HTMLDivElement>(null)
  // onClose в ref: родитель передает новую функцию каждый рендер (таймер записи, поток), а фокус
  // должен ставиться один раз при открытии, иначе он уходит с кнопок раз в секунду
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    if (!open) return
    const opener = document.activeElement as HTMLElement | null
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeRef.current() }
    document.addEventListener('keydown', onKey)
    panel.current?.focus()
    return () => {
      document.body.style.overflow = prev
      document.removeEventListener('keydown', onKey)
      if (opener && document.contains(opener)) opener.focus()
    }
  }, [open])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <button type="button" aria-label="Закрыть" tabIndex={-1} onClick={onClose} className="absolute inset-0 bg-black/30 cursor-default" />
      <div ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-label={labelledBy ? undefined : title} aria-labelledby={labelledBy}
        className="relative w-full sm:max-w-[480px] max-h-[85dvh] flex flex-col bg-brand-card rounded-t-3xl sm:rounded-3xl shadow-xl outline-none pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-center justify-between gap-2 pl-5 pr-2 pt-2 shrink-0">
          <p className="min-w-0 text-[17px] font-semibold text-brand-text">{title}</p>
          <button type="button" onClick={onClose} aria-label="Закрыть" className="w-11 h-11 flex items-center justify-center rounded-full text-brand-muted hover:text-brand-text hover:bg-brand-soft cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 pb-4">{children}</div>
        {footer && <div className="shrink-0 px-5 pt-2 pb-4 border-t border-brand-border">{footer}</div>}
      </div>
    </div>
  )
}
