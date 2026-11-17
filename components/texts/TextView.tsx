'use client'

// Открытый текст справа в «Моих текстах» на компьютере (вариант А, макет A7): белая карточка,
// вкладки форматов одной мысли, заголовок, текст, под ним «Скопировать текст», «Поправить», «Уже в блоге».
// «Поправить» и «Еще из этой мысли» ведут на экран результата (/dashboard/make?post=<id>&f=<формат>):
// там живут правки, «Другой вариант» и добавление формата.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Copy, Plus, PenTool } from 'lucide-react'
import { track } from '@/lib/track'
import { normFormat } from '@/lib/analytics/events'
import { splitPostTitle } from '@/lib/post-format'
import CaptionBlock, { splitCaption } from '@/components/CaptionBlock'
import ReelsScript from '@/components/ReelsScript'
import { formatLabel, toMakeFormat } from '@/components/make/formats'
import type { TextRow } from './MyTexts'

const longDay = (iso: string) => new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
// служебная строка [смена] (смена надписи в беззвучном рилсе) в Instagram не нужна, как в FormatPane
const cleanForCopy = (t: string) => t.replace(/^[ \t]*\[\s*смена\s*\][ \t]*$/gimu, '').replace(/\n{3,}/g, '\n\n')

export default function TextView({ rows, activeId, onActive, onTogglePublished }: {
  rows: TextRow[]
  activeId: string
  onActive: (id: string) => void
  onTogglePublished: (row: TextRow) => void
}) {
  const router = useRouter()
  const [copied, setCopied] = useState<string | null>(null)
  const [copyFail, setCopyFail] = useState(false)
  const row = rows.find(r => r.id === activeId) || rows[0]
  if (!row) return null

  const code = String(row.format || 'post')
  const f = toMakeFormat(code)
  const text = row.content || ''
  const parsed = splitPostTitle(text, code)
  const body = parsed?.body ?? text
  const { body: main, caption } = splitCaption(body)
  const open = () => router.push(`/dashboard/make?post=${row.id}&f=${f}`)
  // «Еще из этой мысли»: сразу лист «Что написать еще?» (ревью 17.11)
  const openMore = () => router.push(`/dashboard/make?post=${row.id}&f=${f}&more=1`)

  const copy = () => {
    track('material_take', { how: 'copy', format: normFormat(code), post: row.id })
    setCopyFail(false)
    navigator.clipboard.writeText(cleanForCopy(text))
      .then(() => { setCopied(row.id); setTimeout(() => setCopied(null), 2000) })
      .catch(() => setCopyFail(true))
  }

  return (
    <article className="rounded-3xl bg-brand-card p-8 max-w-[700px]" aria-label="Открытый текст">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-2 min-w-0 flex-1" role={rows.length > 1 ? 'tablist' : undefined} aria-label="Форматы этой мысли">
          {rows.map(r => {
            const on = r.id === row.id
            const label = formatLabel(toMakeFormat(String(r.format || 'post')))
            return rows.length > 1 ? (
              <button key={r.id} type="button" role="tab" aria-selected={on} onClick={() => onActive(r.id)}
                className={`h-10 px-4 rounded-full text-[15px] cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent ${on ? 'bg-brand-soft border-[1.5px] border-brand-border-soft text-brand-text font-semibold' : 'border border-brand-border text-brand-text hover:border-brand-muted'}`}>
                {label}
              </button>
            ) : (
              <span key={r.id} className="h-10 px-4 inline-flex items-center rounded-full bg-brand-soft text-[15px] font-semibold text-brand-text">{label}</span>
            )
          })}
        </div>
        <span className="text-[13px] text-brand-muted shrink-0">{longDay(row.created_at)}</span>
        <button type="button" onClick={openMore}
          className="h-10 px-4 shrink-0 inline-flex items-center gap-2 rounded-xl border border-brand-text/70 text-[14px] font-semibold text-brand-text hover:bg-brand-bg cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent">
          <Plus className="w-4 h-4" aria-hidden="true" />Еще из этой мысли
        </button>
      </div>

      {parsed?.title && <h2 className="mt-6 text-[24px] leading-[30px] font-bold text-brand-text break-words">{parsed.title}</h2>}

      <div className={parsed?.title ? 'mt-3' : 'mt-6'}>
        {f === 'reels' ? (
          <ReelsScript text={text} format={code} postId={row.id} mark={t => t} />
        ) : (
          <div className="space-y-3">
            {main.split(/\n{2,}/).map((p, i) => (
              <p key={i} className="text-[16px] leading-[28px] text-brand-text whitespace-pre-wrap break-words">{p}</p>
            ))}
            <CaptionBlock caption={caption} format={code} postId={row.id} title="Описание" />
          </div>
        )}
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <button type="button" onClick={copy}
          className="h-12 px-6 inline-flex items-center gap-2 rounded-2xl bg-brand-accent text-white font-semibold hover:bg-brand-accent-hover cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent">
          {copied === row.id ? <Check className="w-4 h-4" aria-hidden="true" /> : <Copy className="w-4 h-4" aria-hidden="true" />}
          {copied === row.id ? 'Скопировано' : 'Скопировать текст'}
        </button>
        <button type="button" onClick={open}
          className="h-12 px-6 inline-flex items-center gap-2 rounded-2xl border border-brand-text/70 text-brand-text font-semibold hover:bg-brand-bg cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent">
          <PenTool className="w-4 h-4" aria-hidden="true" />Поправить
        </button>
        <button type="button" role="switch" aria-checked={!!row.published_at} onClick={() => onTogglePublished(row)}
          className={`h-12 px-6 inline-flex items-center gap-2 rounded-2xl font-semibold cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent ${row.published_at ? 'bg-brand-bg text-brand-text border border-brand-border' : 'border border-brand-text/70 text-brand-text hover:bg-brand-bg'}`}>
          <Check className="w-4 h-4" aria-hidden="true" />
          {row.published_at ? `Опубликовано ${longDay(row.published_at)}` : 'Уже в блоге'}
        </button>
      </div>
      {copyFail && <p className="mt-3 text-[14px] text-brand-text" role="status">Не получилось скопировать. Выдели текст и скопируй вручную</p>}
    </article>
  )
}
