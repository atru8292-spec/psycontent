'use client'
// Выделение слова: рукописная линия или плашка-маркер под нижней частью слова (задача Арины 16.11, показ вариантов).
// Вариант для показа выбирается адресом ?podch=liniya | marker | smes (по умолчанию smes: на первом экране линия,
// под подписями манер маркер, так советует designer-psycont). После выбора Арины переключатель убрать.
// Маркер: тень внутрь (без градиента) на нижние 0.4em, ровно по краям слова; box-decoration-break clone держит перенос.
import { useEffect, useState } from 'react'
import { HandUnderline } from './Paper'

type Mode = 'liniya' | 'marker' | 'smes'

export default function Accent({ children, where }: { children: React.ReactNode; where: 'title' | 'label' }) {
  const [mode, setMode] = useState<Mode>('smes')
  useEffect(() => {
    try {
      const m = new URLSearchParams(window.location.search).get('podch')
      if (m === 'liniya' || m === 'marker' || m === 'smes') setMode(m)
    } catch {}
  }, [])
  const marker = mode === 'marker' || (mode === 'smes' && where === 'label')
  if (marker) {
    // на креме (первый экран) сирень под темным текстом; на бледной сирени (подписи манер) шалфей, текст шоколадный
    const color = where === 'title' ? 'var(--color-brand-lilac)' : 'color-mix(in srgb, var(--color-brand-sage) 55%, transparent)'
    return (
      <mark className="bg-transparent text-brand-text [-webkit-box-decoration-break:clone] [box-decoration-break:clone]"
        style={{ boxShadow: `inset 0 -0.4em 0 ${color}` }}>{children}</mark>
    )
  }
  return (
    <span className="relative inline-block whitespace-nowrap pb-[0.24em]">
      {children}<HandUnderline draw={where === 'title'} size={where} />
    </span>
  )
}
