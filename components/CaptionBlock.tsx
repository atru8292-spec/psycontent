'use client'
// Описание к публикации (у модели метка «Подпись:» в конце текста). Показываем отдельно от самого текста
// рилса, карусели или поста и копируем отдельной кнопкой: в Instagram его вставляют в другое поле.
import { track } from '@/lib/track'
import { normFormat } from '@/lib/analytics/events'
import { useState, type ReactNode } from 'react'
import { Copy, Check } from 'lucide-react'

export function splitCaption(text: string): { body: string; caption: string } {
  const m = text.match(/(^|\n)\s*Подпись\s*:\s*/u)
  if (!m || m.index === undefined) return { body: text, caption: '' }
  return { body: text.slice(0, m.index).trimEnd(), caption: text.slice(m.index + m[0].length).trim() }
}

export default function CaptionBlock({ caption, title = 'Описание', mark, format, postId }: { caption: string; title?: string; mark?: (s: string) => ReactNode; format?: string; postId?: string | null }) {
  const [copied, setCopied] = useState(false)
  if (!caption) return null
  const copy = () => {
    navigator.clipboard.writeText(caption)
    track('material_take', { how: 'copy_caption', format: normFormat(format), ...(postId ? { post: postId } : {}) })
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <div className="rounded-2xl bg-brand-soft-2 px-4 py-3 space-y-1.5 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 text-[14px] font-semibold text-brand-text">{title}</p>
        <button type="button" onClick={copy}
          className="min-h-11 -my-3 shrink-0 inline-flex items-center gap-1.5 text-[13px] font-medium text-brand-accent hover:text-brand-accent-hover cursor-pointer">
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} {copied ? 'Скопировано' : 'Скопировать описание'}
        </button>
      </div>
      <p className="text-[15px] leading-relaxed text-brand-text-secondary whitespace-pre-wrap break-words">{mark ? mark(caption) : caption}</p>
    </div>
  )
}
