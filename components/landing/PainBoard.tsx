'use client'
// Доска болей на шоколаде (реф _знания/lending-refy/04): у каждой заметки своя бумага (классы paper-* в globals.css)
// и свой держатель-вырезка из public/dekor. Здесь держатели часть заметок, правило «один декор на блок» не действует.
// Десктоп: свободная сетка, первая заметка крупнее, соседи заходят друг на друга на 12-16 px.
// Мобилка: столбик, заметки по очереди сдвинуты влево и вправо и заходят друг на друга по вертикали на 12 px.
// Единственная анимация лендинга: заметка «прикалывается», когда входит в экран (класс note-pin в globals.css,
// только transform и opacity, один раз). Без JS и при reduced-motion заметки сразу стоят на месте.
import { useEffect, useRef } from 'react'
import { Dekor, type DekorName } from './Paper'
import { PAINS } from './content'

type Note = {
  paper: string    // бумага
  pad: string      // отступы под форму бумаги (рваный верх, загнутый угол)
  rot: string      // поворот, у всех разный, от -3 до 3
  grid: string     // место на десктопе
  holder: DekorName
  holderAt: string // где и как держит
  big?: boolean
}

const NOTES: Note[] = [
  // Линейка с шагом 30 px: строки текста тоже по 30 px, сдвиг фона = верхний отступ, тогда линия ложится на 3-5 px ниже базовой линии строки
  { paper: 'paper-lined rounded-[4px] [background-position:0_32px] lg:[background-position:0_48px]', pad: 'px-6 pt-8 pb-9 lg:px-10 lg:pt-12 lg:pb-16', rot: 'rotate-[-1deg]', grid: 'lg:col-span-6',
    holder: 'knopka-derevo', holderAt: '-top-6 left-1/2 w-[36px] -translate-x-1/2 rotate-[8deg] lg:w-[44px]', big: true },
  { paper: 'paper-fold', pad: 'px-6 pt-8 pb-11 pr-9 lg:px-7 lg:pt-10 lg:pb-12', rot: 'rotate-[2.5deg]', grid: 'lg:col-span-3 lg:-ml-4 lg:mt-14',
    holder: 'skotch-kraft', holderAt: '-top-3 -left-4 w-[56px] rotate-[-32deg]' },
  { paper: 'paper-torn', pad: 'px-6 pt-10 pb-8 lg:px-7', rot: 'rotate-[0.5deg]', grid: 'lg:col-span-3 lg:-ml-4 lg:mt-3',
    holder: 'skrepka', holderAt: '-top-4 left-5 w-[44px] rotate-[-12deg]' },
  { paper: 'bg-brand-sage rounded-[6px]', pad: 'px-6 pt-8 pb-8 lg:px-8 lg:pt-10 lg:pb-10', rot: 'rotate-[1.2deg]', grid: 'lg:col-span-5 lg:col-start-2 lg:-mt-2',
    holder: 'knopka-derevo', holderAt: '-top-6 right-8 w-[36px] rotate-[12deg] lg:w-[40px]' },
  { paper: 'paper-grid rounded-[4px]', pad: 'px-6 pt-8 pb-8 lg:px-8 lg:pt-10 lg:pb-10', rot: 'rotate-[-1.5deg]', grid: 'lg:col-span-6 lg:col-start-7 lg:-ml-4 lg:mt-8',
    holder: 'knopka-derevo-2', holderAt: '-top-6 left-10 w-[40px] rotate-[-10deg]' },
]

export default function PainBoard() {
  const list = useRef<HTMLUListElement>(null)

  // Заметки ниже экрана прячем и показываем по одной, когда они входят в экран. Те, что уже видны, не трогаем.
  useEffect(() => {
    const ul = list.current
    if (!ul || typeof IntersectionObserver === 'undefined') return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const items = Array.from(ul.children) as HTMLElement[]
    const later = items.filter(el => el.getBoundingClientRect().top > window.innerHeight * 0.92)
    if (!later.length) return
    later.forEach(el => { el.dataset.pin = 'wait' })
    const io = new IntersectionObserver(es => {
      es.forEach(e => {
        if (!e.isIntersecting) return
        const el = e.target as HTMLElement
        el.dataset.pin = 'in'
        io.unobserve(el)
      })
    }, { rootMargin: '0px 0px -12% 0px' })
    later.forEach(el => io.observe(el))
    return () => io.disconnect()
  }, [])

  return (
    <ul ref={list} aria-label={PAINS.title.replace(' ', ' ')}
      className="mt-8 flex flex-col lg:mt-8 lg:grid lg:grid-cols-12 lg:items-start lg:gap-x-0 lg:gap-y-10 lg:pb-4">
      {PAINS.items.map((p, i) => {
        const n = NOTES[i % NOTES.length]
        // мобилка: ширина 88%, четные чуть левее, нечетные чуть правее; со второй заметки заход на предыдущую на 12 px
        const mobile = `max-lg:w-[88%] ${i % 2 ? 'max-lg:ml-[10%]' : 'max-lg:ml-[2%]'} ${i ? 'max-lg:-mt-3' : ''}`
        return (
          <li key={p.head} className={`note-pin relative ${mobile} ${n.grid}`}>
            <div className={`note-shadow relative ${n.rot}`}>
              <div className={`text-brand-text ${n.paper} ${n.pad}`}>
                <p className={`font-bold ${n.big ? 'text-[20px] leading-[30px] lg:text-[22px]' : 'text-[19px] leading-[1.2] lg:text-[21px]'}`}>{p.head}</p>
                <p className={`text-[17px] ${n.big ? 'mt-0 leading-[30px]' : 'mt-3 leading-[1.5]'}`}>{p.text}</p>
              </div>
              <Dekor name={n.holder} className={`z-10 ${n.holderAt}`} />
            </div>
          </li>
        )
      })}
    </ul>
  )
}
