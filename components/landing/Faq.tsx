'use client'
// Аккордеон вопросов: первый открыт, остальные открываются независимо. land_faq_open только на открытие,
// в событие уходит короткий код вопроса, текст вопроса не уходит.
import { useId, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { track } from '@/lib/track'
import { FAQ } from './content'

export default function Faq() {
  const [open, setOpen] = useState<Set<number>>(() => new Set([0]))
  const base = useId()
  const toggle = (i: number) => setOpen(prev => {
    const next = new Set(prev)
    if (next.has(i)) next.delete(i)
    else { next.add(i); track('land_faq_open', { q: FAQ.items[i].code }) }
    return next
  })
  return (
    <div>
      {FAQ.items.map((it, i) => {
        const on = open.has(i)
        return (
          <div key={it.code} className="border-b border-brand-border">
            <h3>
              <button type="button" id={`${base}-q${i}`} aria-expanded={on} aria-controls={`${base}-a${i}`} onClick={() => toggle(i)}
                className="group flex min-h-[56px] w-full items-center justify-between gap-4 py-5 text-left text-[18px] font-semibold text-brand-text focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-accent rounded-lg cursor-pointer">
                <span className="transition-[color] duration-150 group-hover:text-brand-accent">{it.q}</span>
                <ChevronDown aria-hidden strokeWidth={1.5} className={`h-5 w-5 shrink-0 text-brand-muted motion-safe:transition-transform motion-safe:duration-200 ${on ? 'rotate-180' : ''}`} />
              </button>
            </h3>
            <div id={`${base}-a${i}`} role="region" aria-labelledby={`${base}-q${i}`} aria-hidden={!on}
              className={`grid motion-safe:transition-[grid-template-rows] motion-safe:duration-200 ${on ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
              <div className="overflow-hidden">
                <p className="max-w-[640px] pb-6 text-[17px] leading-[1.55] text-brand-text">{it.a}</p>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
