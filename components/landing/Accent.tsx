'use client'
// Выделение слова плашкой-маркером (решение Арины 16.11: маркер вместо рукописной линии, заметнее прежнего).
// Полоса закрывает нижнюю часть слова: тень внутрь (без градиента), ровно от первой до последней буквы (без отступов),
// в соседние строки не выходит (рисуется внутри строки слова), при переносе каждая строка получает свою целую полосу
// (box-decoration-break: clone), концы чуть скруглены (border-radius). Текст поверх шоколадный.
// Цвета: на креме сирень знака, на бледной сирени сирень темнее (токены brand-lilac-mid и brand-lilac-deep), контраст текста от 4.8.
// Сила для показа выбирается адресом ?marker=obych | sochno (по умолчанию obych). После выбора Арины переключатель убрать.
import { useEffect, useState } from 'react'

type Sila = 'obych' | 'sochno'

const COLOR: Record<'title' | 'label', Record<Sila, string>> = {
  // заголовок первого экрана стоит на креме
  title: { obych: 'var(--color-brand-lilac)', sochno: 'var(--color-brand-lilac-deep)' },
  // подписи манер стоят на бледной сирени: обычная сирень там почти не видна
  label: { obych: 'var(--color-brand-lilac-mid)', sochno: 'var(--color-brand-lilac-deep)' },
}
// какую часть высоты строки слова закрывает полоса
const HEIGHT: Record<Sila, string> = { obych: '0.42em', sochno: '0.5em' }

export default function Accent({ children, where }: { children: React.ReactNode; where: 'title' | 'label' }) {
  const [sila, setSila] = useState<Sila>('obych')
  useEffect(() => {
    try {
      const m = new URLSearchParams(window.location.search).get('marker')
      if (m === 'obych' || m === 'sochno') setSila(m)
    } catch {}
  }, [])
  return (
    <mark className="rounded-[0.18em] bg-transparent text-brand-text [-webkit-box-decoration-break:clone] [box-decoration-break:clone]"
      style={{ boxShadow: `inset 0 -${HEIGHT[sila]} 0 ${COLOR[where][sila]}` }}>{children}</mark>
  )
}
