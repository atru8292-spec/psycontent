'use client'
// Картинка карточки вида на «Сделать» (zh6). Три варианта:
//   a: схемы-иконки SVG в цветах сайта (линия шоколадом 2 px, заливки сиренью и шалфеем, без градиентов);
//   b: позы Веры из готовых стикеров (public/vera/vid, обрезаны по прозрачным краям), где позы нет, схема из a;
//   c: картинки с Верой под каждую карточку (public/vera/vid-ikonki, файл reels-kamera.webp на ключ 'reels:kamera',
//      auto.webp общий для всех «подобрать под тему»), на кремовом фоне; неизвестный ключ: схема из a.
// В проде всегда VID_KARTINKI_PROD; в разработке можно переключить адресом ?kartinki=a|b|c.
import { useEffect, useState } from 'react'

export type Kartinki = 'a' | 'b' | 'c'
export const VID_KARTINKI_PROD: Kartinki = 'c' // выбор Арины 10.11: картинки с Верой

export function useVidKartinki(): Kartinki {
  const [k, setK] = useState<Kartinki>(VID_KARTINKI_PROD)
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return
    const q = new URLSearchParams(window.location.search).get('kartinki')
    if (q === 'a' || q === 'b' || q === 'c') setK(q)
  }, [])
  return k
}

// ключ картинки: тип формата и карточка ('reels:scenka'); auto у всех свой
const VERA: Record<string, string> = {
  'reels:kamera': 'podskazyvaet', 'reels:nadpisi': 'telefon', 'reels:spisok': 'plan', 'reels:otvet': 'slushaet',
  'carousel:spisok': 'plan', 'carousel:mysl': 'pokazyvaet', 'carousel:razbor': 'dumaet',
  'post:korotko': 'zapisyvaet', 'post:istoriya': 'otdyhaet', 'post:otvet': 'slushaet', 'post:spor': 'dumaet',
}

const INK = '#3B2A22', LILAC = '#EDE4F7', LILAC2 = '#C3A6E6', SAGE = '#8F9D68', CREAM = '#F5EFE4'
const line = { stroke: INK, strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' }

// телефон 24x40 в точке (x, y)
const Phone = ({ x = 20, y = 12, fill = CREAM }: { x?: number; y?: number; fill?: string }) => (
  <rect x={x} y={y} width={24} height={40} rx={4} fill={fill} stroke={INK} strokeWidth={2} />
)
// человек: голова и плечи
const Person = ({ cx, cy, r = 4.5, body = SAGE }: { cx: number; cy: number; r?: number; body?: string }) => (
  <g>
    <circle cx={cx} cy={cy} r={r} fill={CREAM} stroke={INK} strokeWidth={2} />
    <path d={`M${cx - r * 1.9} ${cy + r * 3.2} q0 -${r * 1.9} ${r * 1.9} -${r * 1.9} q${r * 1.9} 0 ${r * 1.9} ${r * 1.9}`} fill={body} stroke={INK} strokeWidth={2} strokeLinejoin="round" />
  </g>
)
// слайд карусели
const Slide = ({ x, y, w = 26, h = 32, fill = '#FFFFFF' }: { x: number; y: number; w?: number; h?: number; fill?: string }) => (
  <rect x={x} y={y} width={w} height={h} rx={3} fill={fill} stroke={INK} strokeWidth={2} />
)

function Shema({ id }: { id: string }) {
  switch (id) {
    case 'reels:auto': case 'carousel:auto': case 'post:auto':
      // подберу под тему: кубик с точками, «выпадет подходящее»
      return <g><rect x={18} y={18} width={28} height={28} rx={6} fill={LILAC} stroke={INK} strokeWidth={2} />
        {[[25, 25], [39, 25], [32, 32], [25, 39], [39, 39]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r={2.2} fill={INK} />)}</g>
    case 'reels:kamera':
      return <g><Phone /><Person cx={32} cy={27} /><circle cx={32} cy={17} r={1.2} fill={INK} /></g>
    case 'reels:scenka':
      // рилс это всегда телефон: внутри два человечка, у второго очки
      return <g><rect x={16} y={12} width={32} height={40} rx={4} fill={CREAM} stroke={INK} strokeWidth={2} />
        <Person cx={25} cy={29} r={3.6} body={SAGE} /><Person cx={39} cy={29} r={3.6} body={LILAC2} />
        <path d="M36 29h2m1.5 0h2" {...line} strokeWidth={1.4} /><path d="M29 21q3 -3 6 0" {...line} strokeWidth={1.6} strokeDasharray="2 2.5" /></g>
    case 'reels:nadpisi':
      return <g><Phone fill={SAGE} /><rect x={24} y={20} width={16} height={6} rx={2} fill="#FFFFFF" stroke={INK} strokeWidth={1.6} />
        <rect x={24} y={30} width={16} height={6} rx={2} fill="#FFFFFF" stroke={INK} strokeWidth={1.6} /><rect x={24} y={40} width={11} height={6} rx={2} fill="#FFFFFF" stroke={INK} strokeWidth={1.6} /></g>
    case 'reels:spisok':
      return <g><Phone /><Person cx={32} cy={21} r={3.5} />{[33, 39, 45].map(y => <g key={y}><circle cx={25} cy={y} r={1.3} fill={INK} /><path d={`M28 ${y}h11`} {...line} strokeWidth={1.6} /></g>)}</g>
    case 'reels:otvet':
      return <g><Phone /><Person cx={32} cy={34} r={4} /><rect x={22} y={16} width={20} height={9} rx={3} fill={LILAC} stroke={INK} strokeWidth={1.6} /><path d="M26 20.5h12" {...line} strokeWidth={1.4} /></g>
    case 'carousel:spisok':
      return <g><Slide x={26} y={14} fill={LILAC} /><Slide x={20} y={18} />{[26, 32, 38].map(y => <g key={y}><path d={`M24 ${y}l2 2l3 -4`} {...line} strokeWidth={1.6} /><path d={`M32 ${y}h9`} {...line} strokeWidth={1.6} /></g>)}</g>
    case 'carousel:istoriya':
      return <g><Slide x={26} y={14} fill={LILAC} /><Slide x={20} y={18} /><rect x={23} y={22} width={14} height={7} rx={3} fill={LILAC} stroke={INK} strokeWidth={1.6} /><rect x={27} y={33} width={14} height={7} rx={3} fill={SAGE} stroke={INK} strokeWidth={1.6} /></g>
    case 'carousel:mysl':
      return <g><Slide x={26} y={14} fill={LILAC} /><Slide x={20} y={18} /><path d="M24 28h18M24 34h14" stroke={INK} strokeWidth={3.5} strokeLinecap="round" /></g>
    case 'carousel:razbor':
      return <g><Slide x={26} y={14} fill={LILAC} /><Slide x={20} y={18} /><path d="M24 26h16" {...line} strokeWidth={1.6} /><path d="M23 25l18 3" {...line} strokeWidth={1.6} /><path d="M24 35h16M24 41h10" {...line} strokeWidth={1.6} /></g>
    case 'post:korotko':
      return <g><rect x={18} y={14} width={28} height={36} rx={4} fill="#FFFFFF" stroke={INK} strokeWidth={2} /><path d="M23 22h14M23 29h18M23 36h10" {...line} strokeWidth={1.8} /></g>
    case 'post:istoriya':
      return <g><rect x={18} y={14} width={28} height={36} rx={4} fill="#FFFFFF" stroke={INK} strokeWidth={2} /><Person cx={32} cy={23} r={3.5} /><path d="M23 38h18M23 43h12" {...line} strokeWidth={1.6} /></g>
    case 'post:otvet':
      return <g><rect x={14} y={16} width={24} height={14} rx={4} fill={LILAC} stroke={INK} strokeWidth={2} /><path d="M20 23h12" {...line} strokeWidth={1.6} />
        <rect x={26} y={34} width={24} height={14} rx={4} fill="#FFFFFF" stroke={INK} strokeWidth={2} /><path d="M31 41h14" {...line} strokeWidth={1.6} /></g>
    case 'post:spor':
      return <g><rect x={12} y={18} width={20} height={12} rx={4} fill="#FFFFFF" stroke={INK} strokeWidth={2} /><path d="M16 24h12" {...line} strokeWidth={1.6} /><path d="M15 21l14 6" {...line} strokeWidth={1.6} />
        <rect x={32} y={34} width={20} height={12} rx={4} fill={SAGE} stroke={INK} strokeWidth={2} /><path d="M36 40h12" {...line} strokeWidth={1.6} /></g>
    default:
      return <g><rect x={18} y={14} width={28} height={36} rx={4} fill="#FFFFFF" stroke={INK} strokeWidth={2} /></g>
  }
}

// вариант c: ключ карточки → файл в public/vera/vid-ikonki
const IKONKI = new Set(['reels:kamera', 'reels:scenka', 'reels:nadpisi', 'reels:spisok', 'reels:otvet',
  'carousel:spisok', 'carousel:istoriya', 'carousel:mysl', 'carousel:razbor',
  'post:korotko', 'post:istoriya', 'post:otvet', 'post:spor'])
const ikonkaOf = (id: string): string | undefined =>
  /:auto$/.test(id) ? 'auto' : IKONKI.has(id) ? id.replace(':', '-') : undefined
// кремовый фон картинок варианта c (средний цвет их краев), квадрат того же цвета, чтобы края не были видны
const IKONKA_FON = '#FCF3E6'

// boxClass: размер квадрата классами (адаптивно), только для картинок варианта c; size тогда наибольший размер
export default function VidKartinka({ id, k, size = 64, boxClass }: { id: string; k: Kartinki; size?: number; boxClass?: string }) {
  const ikonka = k === 'c' ? ikonkaOf(id) : undefined
  if (ikonka) {
    // картинки разной пропорции (телефон, квадрат, лист): вписываем в квадрат целиком, без обрезки
    return (
      <span aria-hidden="true" className={`shrink-0 rounded-xl overflow-hidden inline-flex items-center justify-center ${boxClass || ''}`}
        style={{ ...(boxClass ? {} : { width: size, height: size }), background: IKONKA_FON }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/vera/vid-ikonki/${ikonka}.webp`} alt="" aria-hidden="true" width={size} height={size} loading="lazy"
          className="block w-full h-full object-contain" />
      </span>
    )
  }
  const vera = k === 'b' ? VERA[id] : undefined
  if (vera) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={`/vera/vid/${vera}.webp`} alt="" aria-hidden="true" width={size} height={size} className="object-contain shrink-0" style={{ width: size, height: size }} />
  }
  return (
    <svg viewBox="8 8 48 48" width={size} height={size} aria-hidden="true" className="shrink-0 rounded-xl bg-brand-bg">
      <Shema id={id} />
    </svg>
  )
}
