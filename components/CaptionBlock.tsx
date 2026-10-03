'use client'
// Описание к публикации (у модели метка «Подпись:» в конце текста). Показываем отдельно от самого текста
// рилса, карусели или поста и копируем отдельной кнопкой: в Instagram его вставляют в другое поле.
import { useState, type ReactNode } from 'react'
import { Copy, Check } from 'lucide-react'

export function splitCaption(text: string): { body: string; caption: string } {
  const m = text.match(/(^|\n)\s*Подпись\s*:\s*/u)
  if (!m || m.index === undefined) return { body: text, caption: '' }
  return { body: text.slice(0, m.index).trimEnd(), caption: text.slice(m.index + m[0].length).trim() }
}

export default function CaptionBlock({ caption, title = 'Описание к публикации', mark }: { caption: string; title?: string; mark?: (s: string) => ReactNode }) {
  const [copied, setCopied] = useState(false)
  if (!caption) return null
  const copy = () => {
    navigator.clipboard.writeText(caption)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <div className="rounded-xl border border-brand-soft px-4 py-3 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-muted">{title}</p>
        <button type="button" onClick={copy}
          className="inline-flex items-center gap-1.5 text-xs text-brand-muted hover:text-brand-accent cursor-pointer">
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} {copied ? 'Скопировала' : 'Скопировать описание'}
        </button>
      </div>
      <p className="text-[15px] leading-relaxed text-brand-text-secondary whitespace-pre-wrap">{mark ? mark(caption) : caption}</p>
    </div>
  )
}
