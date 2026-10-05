// «Бумажные» приемы лендинга: волнистый край блока, рукописная стрелка, рукописное подчеркивание, вырезка-декор.
// Мера: один прием на блок. Декор только из public/dekor (настоящие вырезки), не рисуем канцелярию сами.
import Image from 'next/image'

// Волнистый край у блока на бледной сирени: svg того же цвета, что фон блока, выходит за его край.
// Блоку нужен relative z-10, чтобы соседний блок не перекрыл волну.
export function Wave({ side }: { side: 'top' | 'bottom' }) {
  return (
    <svg aria-hidden viewBox="0 0 1440 40" preserveAspectRatio="none"
      className={`pointer-events-none absolute inset-x-0 h-4 w-full text-brand-soft lg:h-7 ${side === 'top' ? 'bottom-full -mb-px' : 'top-full -mt-px rotate-180'}`}>
      <path d="M0 26 C 150 6, 290 6, 430 22 S 700 40, 860 24 S 1150 2, 1290 18 S 1400 30, 1440 24 V40 H0 Z" fill="currentColor" />
    </svg>
  )
}

// Неровный штрих зеленым под одним словом заголовка
export function HandUnderline() {
  return (
    <svg aria-hidden viewBox="0 0 200 18" preserveAspectRatio="none" className="absolute -bottom-2 left-[-4%] h-[12px] w-[108%] text-brand-accent lg:-bottom-3 lg:h-[16px]">
      <path d="M3 11 C 30 6, 62 13, 96 9 S 160 4, 197 8" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      <path d="M22 15 C 70 11, 120 14, 176 11" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" opacity=".7" />
    </svg>
  )
}

// Рукописная стрелка вниз и вправо, от подписи к примеру
export function HandArrow({ className = '' }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 80 64" className={`text-brand-text ${className}`}>
      <path d="M6 6 C 22 2, 44 6, 54 22 S 60 46, 58 56" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M47 47 L 58 58 L 67 45" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

const DEKOR = {
  'knopka-derevo': { w: 141, h: 194 },
  'zazhim-sirenevyj': { w: 115, h: 140 },
  'bant-zelenyj-atlas': { w: 199, h: 104 },
} as const

// Вырезка из public/dekor. Ширина 40-120 px по CSS, крупнее вырезки мылятся.
export function Dekor({ name, className = '' }: { name: keyof typeof DEKOR; className?: string }) {
  const { w, h } = DEKOR[name]
  return <Image src={`/dekor/${name}.webp`} alt="" aria-hidden width={w} height={h} sizes="120px" className={`pointer-events-none absolute h-auto select-none ${className}`} />
}
