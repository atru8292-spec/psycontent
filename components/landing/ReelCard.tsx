'use client'
// Рилс генератора как готовый ролик (designer-psycont 11.11, стили экрана результата в кабинете, components/ReelsScript.tsx):
// надпись на видео плашкой, реплики с именем говорящего (без «Речь:»), подпись отдельно мельче.
// «Я» всегда у левого края, собеседник со сдвигом и линией слева; уточнение роли («обычная реакция») курсивом.
// collapse: свернутый вид для примеров (надпись видна всегда, реплики первые две, монолог три строки, подпись скрыта).
// Свернутое лежит в HTML и скрыто только стилями (SEO). land_more_open только на раскрытие.
import { useId, useState, type ReactNode } from 'react'
import { track } from '@/lib/track'
import { parseReel } from './reel'
import { EXAMPLE, REEL } from './content'

// ремарки в скобках «(смеется)» тише основного текста
function withRemarks(s: string): ReactNode {
  const parts = s.split(/(\([^()]{1,60}\))/u)
  if (parts.length === 1) return s
  return parts.map((p, i) => (/^\(.*\)$/u.test(p) ? <span key={i} className="italic text-brand-muted">{p}</span> : <span key={i}>{p}</span>))
}

export default function ReelCard({ text, collapse = false, place }: { text: string; collapse?: boolean; place?: string }) {
  const r = parseReel(text)
  const [open, setOpen] = useState(!collapse)
  const id = useId()
  const left = r.lines.some(l => l.role === 'Я') ? 'Я' : r.lines[0]?.role
  const first = r.lines[0]?.text
  const hasMore = collapse && (r.lines.length > 2 || !!r.speech || !!r.caption)
  const onlyCaption = collapse && !r.lines.length && !r.speech
  const hide = (cond: boolean) => (cond && !open ? 'hidden' : '')

  return (
    <div id={id}>
      {r.screen.length > 0 && (
        <div className="rounded-xl border border-brand-border-soft bg-brand-soft-2 px-4 py-3">
          <p className="text-[12px] font-semibold text-brand-muted">{REEL.screen}</p>
          {r.screen.map((s, i) => <p key={i} className="mt-0.5 text-[17px] font-semibold leading-[1.35] text-brand-text">{s}</p>)}
        </div>
      )}

      {r.lines.length > 0 && (
        <div className="mt-3 space-y-2">
          {r.lines.map((l, i) => {
            const shift = l.role !== left
            const back = i > 0 && i === r.lines.length - 1 && l.text === first
            return (
              <p key={i} className={`text-[15px] leading-[1.5] text-brand-text lg:text-[16px] ${shift ? 'ml-3 border-l-2 border-brand-border pl-3' : ''} ${back ? '!mt-3' : ''} ${hide(i >= 2)}`}>
                <span className="font-semibold text-brand-accent">{l.role}{l.note ? ',' : ':'}</span>
                {l.note && <span className="italic text-brand-muted"> {l.note}:</span>}{' '}
                {withRemarks(l.text)}
              </p>
            )
          })}
        </div>
      )}

      {r.speech && (
        <p className={`mt-3 text-[15px] leading-[1.5] text-brand-text lg:text-[16px] ${collapse && !open ? 'line-clamp-3' : ''}`}>{withRemarks(r.speech)}</p>
      )}

      {r.caption && (
        <div className={`mt-4 border-t border-brand-border pt-3 ${hide(true)}`}>
          <p className="text-[13px] font-semibold text-brand-muted">{REEL.caption}</p>
          <p className="mt-0.5 whitespace-pre-line text-[15px] leading-[1.5] text-brand-text-secondary">{r.caption}</p>
        </div>
      )}

      {hasMore && (
        <button type="button" aria-expanded={open} aria-controls={id}
          onClick={() => { if (!open && place) track('land_more_open', { place }); setOpen(v => !v) }}
          className="-mx-2 mt-2 h-11 cursor-pointer rounded-full px-3 font-semibold text-brand-accent transition-colors hover:bg-brand-soft focus-visible:outline-2 focus-visible:outline-brand-accent">
          {open ? EXAMPLE.less : onlyCaption ? EXAMPLE.moreCaption : EXAMPLE.more}
        </button>
      )}
    </div>
  )
}
