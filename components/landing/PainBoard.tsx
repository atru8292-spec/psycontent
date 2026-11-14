'use client'
// Блок проблемы на шоколаде: одна заметка в линейку на деревянной кнопке (текст PAINS.note), рядом на шоколаде
// что берет PsyCont и тихая строка. Раньше здесь была доска из трех заметок болей.
// Линейка с шагом 30 px: строки текста тоже по 30 px на любой ширине, сдвиг фона = верхний отступ минус 4,
// иначе линии режут текст.
// Одна из двух анимаций лендинга: заметка «прикалывается», когда входит в экран (класс note-pin в globals.css,
// только transform и opacity, один раз). Без JS и при reduced-motion заметка сразу стоит на месте.
import { useEffect, useRef } from 'react'
import { Dekor } from './Paper'
import { PAINS } from './content'

export default function PainBoard() {
  const note = useRef<HTMLDivElement>(null)

  // Если заметка ниже экрана, прячем ее и показываем, когда войдет в экран. Уже видимую не трогаем.
  useEffect(() => {
    const el = note.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    if (el.getBoundingClientRect().top <= window.innerHeight * 0.92) return
    el.dataset.pin = 'wait'
    const io = new IntersectionObserver(es => {
      if (!es.some(e => e.isIntersecting)) return
      el.dataset.pin = 'in'
      io.disconnect()
    }, { rootMargin: '0px 0px -12% 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <div className="mt-8 lg:mt-12 lg:grid lg:grid-cols-12 lg:items-center lg:gap-x-10">
      <div ref={note} className="note-pin relative lg:col-span-7">
        <div className="note-shadow relative rotate-[-1deg]">
          <p className="paper-lined rounded-[4px] px-5 pt-7 pb-7 text-[17px] leading-[30px] text-brand-text [background-position:0_24px] lg:px-10 lg:pt-10 lg:pb-8 lg:text-[19px] lg:[background-position:0_36px]">
            {PAINS.note}
          </p>
          <Dekor name="knopka-derevo" className="-top-6 left-1/2 z-10 w-[36px] -translate-x-1/2 rotate-[8deg] lg:w-[44px]" />
        </div>
      </div>
      <div className="mt-7 lg:col-span-5 lg:mt-0">
        <p className="max-w-[520px] text-[17px] leading-[1.55] text-brand-on-dark [text-wrap:pretty] lg:text-[20px]">
          <span className="font-semibold text-brand-bg">{PAINS.afterLead}</span> {PAINS.after}
        </p>
        <p className="mt-5 max-w-[480px] text-[15px] leading-[1.5] text-brand-on-dark-muted lg:mt-8 lg:text-[16px]">{PAINS.quiet}</p>
      </div>
    </div>
  )
}
