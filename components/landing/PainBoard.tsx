'use client'
// Блок проблемы на шоколаде: одна заметка в линейку на деревянной кнопке (текст PAINS.note), рядом на шоколаде
// три ценности (StoryBrand, 26.11) и тихая строка. Раньше здесь была доска из трех заметок болей.
// Линейка с шагом 30 px: строки текста тоже по 30 px на любой ширине, сдвиг фона = верхний отступ минус 4,
// иначе линии режут текст.
// Одна из двух анимаций лендинга: заметка «прикалывается», когда входит в экран (класс note-pin в globals.css,
// только transform и opacity, один раз). Без JS и при reduced-motion заметка сразу стоит на месте.
import { useEffect, useRef } from 'react'
import Image from 'next/image'
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
        {/* Фразы самих психологов из их чатов (PAINS.quotes) под заметкой */}
        <div className="mt-9 lg:mt-12">
          <p id="pain-quotes" className="text-[14px] text-brand-on-dark-muted lg:text-[15px]">{PAINS.quotesLead}</p>
          <ul aria-labelledby="pain-quotes" className="mt-2">
            {PAINS.quotes.map(q => (
              <li key={q} className="border-b border-brand-on-dark-muted/25 py-3 text-[17px] leading-[1.45] text-brand-on-dark last:border-b-0 lg:py-4 lg:text-[19px]">{q}</li>
            ))}
          </ul>
        </div>
      </div>
      <div className="mt-8 lg:col-span-5 lg:mt-0">
        {/* Вера поздно вечером у ноутбука: блог как вторая работа. Украшение, alt пустой */}
        <Image src="/vera/vecher.webp" alt="" width={880} height={782} sizes="(min-width: 1024px) 320px, 200px"
          className="mb-5 ml-auto h-auto w-[200px] lg:mx-0 lg:mb-8 lg:w-full lg:max-w-[320px]" />
        <p className="max-w-[520px] text-[17px] leading-[1.55] font-semibold text-brand-bg [text-wrap:pretty] lg:text-[20px]">{PAINS.afterLead}</p>
        {/* что берет PsyCont: три строки (StoryBrand value proposition), маркер лепесток знака, без иконок и заголовка */}
        <ul className="mt-4 max-w-[520px] space-y-2.5 lg:mt-6 lg:space-y-3.5">
          {PAINS.values.map((v, i) => (
            <li key={v} className="flex items-start gap-3 text-[17px] leading-[1.45] font-medium text-brand-bg lg:text-[20px]">
              <svg viewBox="-44 -44 88 106" aria-hidden="true" className={`mt-[7px] h-[11px] w-[9px] shrink-0 text-brand-lilac lg:mt-[9px] lg:h-[13px] lg:w-[11px] ${['rotate-[-12deg]', 'rotate-[6deg]', 'rotate-[-3deg]'][i % 3]}`}>
                <path d="M-40,0 C-40,38 -20,49.2 -32,58 C6,58.8 6.22,54.82 30.64,25.71 A40,40 0 1 0 -40,0 Z" fill="currentColor" />
              </svg>
              <span className="min-w-0">{v}</span>
            </li>
          ))}
        </ul>
        <p className="mt-5 max-w-[480px] text-[15px] leading-[1.5] text-brand-on-dark-muted lg:mt-8 lg:text-[16px]">{PAINS.quiet}</p>
      </div>
    </div>
  )
}
