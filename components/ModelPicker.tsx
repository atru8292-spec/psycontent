'use client'

import { useState, useEffect, useRef } from 'react'
import { ChevronDown, Cpu } from 'lucide-react'
import { AI_MODELS, DEFAULT_MODEL, type ModelId } from '@/lib/openrouter'

// Подписи понятные психологам (не технические)
const MODEL_LABELS: Record<string, { short: string; hint: string; emoji: string }> = {
  'anthropic/claude-sonnet-4-5': {
    short: 'Claude — умный и глубокий',
    hint: 'Лучше всего чувствует психологический контекст, пишет тонко и по-человечески',
    emoji: '🧠',
  },
  'anthropic/claude-haiku-3-5': {
    short: 'Claude — быстрый',
    hint: 'Тот же Claude, но быстрее. Хорошо для простых постов и хуков',
    emoji: '⚡',
  },
  'openai/gpt-4o': {
    short: 'ChatGPT — мощный',
    hint: 'Популярный ChatGPT. Чёткий, структурированный, хорошо следует инструкциям',
    emoji: '💬',
  },
  'openai/gpt-4o-mini': {
    short: 'ChatGPT — лёгкий',
    hint: 'Быстрая версия ChatGPT. Подходит для черновиков и быстрых идей',
    emoji: '✉️',
  },
  'google/gemini-2.0-flash-001': {
    short: 'Gemini — очень быстрый',
    hint: 'Модель от Google. Молниеносная, хорошо работает с длинными текстами',
    emoji: '🔮',
  },
  'meta-llama/llama-4-scout': {
    short: 'Llama — бесплатно',
    hint: 'Бесплатная open-source модель. Попробуйте если хотите сэкономить',
    emoji: '🦙',
  },
}

interface Props {
  value: ModelId
  onChange: (model: ModelId) => void
  saving?: boolean
}

export default function ModelPicker({ value, onChange, saving }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const current = MODEL_LABELS[value] ?? MODEL_LABELS[DEFAULT_MODEL]

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-3 py-2 rounded-xl border border-brand-border bg-white hover:border-brand-accent/50 hover:bg-brand-bg transition text-sm cursor-pointer"
      >
        <Cpu className="w-4 h-4 text-brand-accent shrink-0" />
        <span className="text-brand-text font-medium">{current.emoji} {current.short}</span>
        <ChevronDown className={`w-4 h-4 text-brand-text-secondary transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-50 top-full mt-2 left-0 w-80 bg-white border border-brand-border rounded-2xl shadow-lg overflow-hidden">
          <div className="p-2 border-b border-brand-border">
            <p className="text-xs text-brand-text-secondary px-2 py-1 font-medium">Выберите AI-модель</p>
          </div>
          <div className="p-2 flex flex-col gap-1 max-h-72 overflow-y-auto">
            {AI_MODELS.map((m) => {
              const label = MODEL_LABELS[m.id]
              const active = value === m.id
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => { onChange(m.id as ModelId); setOpen(false) }}
                  className={`w-full text-left px-3 py-2.5 rounded-xl transition cursor-pointer ${
                    active ? 'bg-brand-highlight border border-brand-accent/30' : 'hover:bg-brand-bg'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-base leading-none">{label?.emoji}</span>
                    <span className={`text-sm font-semibold ${active ? 'text-brand-accent' : 'text-brand-text'}`}>
                      {label?.short}
                    </span>
                    {m.badge && (
                      <span className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-brand-accent/10 text-brand-accent">
                        {m.badge}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-brand-text-secondary pl-6 leading-snug">{label?.hint}</p>
                </button>
              )
            })}
          </div>
          <div className="px-4 py-2.5 border-t border-brand-border bg-brand-bg">
            <p className="text-xs text-brand-text-secondary">
              💡 Сохранить модель по умолчанию можно в{' '}
              <a href="/dashboard/settings" className="text-brand-accent hover:underline">настройках AI</a>
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
