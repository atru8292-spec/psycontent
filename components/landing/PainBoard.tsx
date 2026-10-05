// Доска болей на шоколаде (реф _знания/lending-refy/04): у каждой заметки своя бумага (классы paper-* в globals.css)
// и свой держатель-вырезка из public/dekor. Здесь держатели часть заметок, правило «один декор на блок» не действует.
// Десктоп: свободная сетка, первая заметка крупнее, соседи заходят друг на друга на 12-16 px.
// Мобилка: лента вбок со scroll-snap, заметки одной высоты, сверху запас под держатели.
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
    holder: 'knopka-sirenevaya', holderAt: '-top-5 right-8 w-[40px] rotate-[12deg]' },
  { paper: 'paper-grid rounded-[4px]', pad: 'px-6 pt-8 pb-8 lg:px-8 lg:pt-10 lg:pb-10', rot: 'rotate-[-1.5deg]', grid: 'lg:col-span-6 lg:col-start-7 lg:-ml-4 lg:mt-8',
    holder: 'knopka-derevo-2', holderAt: '-top-6 left-10 w-[40px] rotate-[-10deg]' },
]

export default function PainBoard() {
  return (
    <ul tabIndex={0} aria-label={PAINS.title.replace(' ', ' ')}
      className="-mx-4 mt-2 flex snap-x snap-mandatory scroll-px-4 gap-5 overflow-x-auto px-4 pt-10 pb-6 [scrollbar-width:none] focus-visible:outline-2 focus-visible:outline-brand-on-dark lg:mx-0 lg:mt-8 lg:grid lg:grid-cols-12 lg:items-start lg:gap-x-0 lg:gap-y-10 lg:overflow-visible lg:px-0 lg:pb-4">
      {PAINS.items.map((p, i) => {
        const n = NOTES[i % NOTES.length]
        return (
          <li key={p.head} className={`relative w-[80%] max-w-[320px] shrink-0 snap-start lg:w-auto lg:max-w-none ${n.grid}`}>
            <div className={`note-shadow relative h-full lg:h-auto ${n.rot}`}>
              <div className={`h-full text-brand-text lg:h-auto ${n.paper} ${n.pad}`}>
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
