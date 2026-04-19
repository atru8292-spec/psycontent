'use client'

import { useState, useEffect, useRef } from 'react'
import { ChevronDown, Cpu } from 'lucide-react'
import { AI_MODELS, DEFAULT_MODEL, type ModelId } from '@/lib/openrouter'

const MODEL_LABELS: Record<string, { short: string; hint: string; emoji: string }> = {
  'anthropic/claude-sonnet-4-5': {
    short: 'Claude — умный',
    hint: 'Лучше всего чувствует психологический контекст, пишет тонко',
    emoji: '🧠',
  },
  'anthropic/claude-haiku-3-5': {
    short: 'Claude — быстрый',
    hint: 'Тот же Claude, но быстрее. Хорошо для простых постов',
    emoji: '⚡',
  },
  'openai/gpt-4o': {
    short: 'ChatGPT — мощный',
    hint: 'Чёткий, структурированный, хорошо следует инструкциям',
    emoji: '💬',
  },
  'openai/gpt-4o-mini': {
    short: 'ChatGPT — лёгкий',
    hint: 'Быстрая версия ChatGPT. Для черновиков и быстрых идей',
    emoji: '✉️',
  },
  'google/gemini-2.0-flash-001': {
    short: 'Gemini — быстрый',
    hint: 'Модель от Google. Молниеносная, хороша с длинными текстами',
    emoji: '🔮',
  },
  'meta-llama/llama-4-scout': {
    short: 'Llama — бесплатно',
    hint: 'Бесплатная open-source модель',
    emoji: '🦙',
  },
}

interface Props {
  value: ModelId
  onChange: (model: ModelId) => void
}

export default function ModelPicker({ value, onChange }: Props) {
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
      {/* Триггер-кнопка */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-brand-border bg-white hover:border-brand-accent/50 hover:bg-brand-bg transition text-xs cursor-pointer max-w-[180px]"
      >
        <span className="shrink-0">{current.emoji}</span>
        <span className="text-brand-text font-medium truncate">{current.short}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-brand-text-secondary shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Дропдаун — открывается влево чтобы не вылезти за правый край на мобиле */}
      {open && (
        <div className="absolute z-50 top-full mt-2 right-0 w-72 bg-white border border-brand-border rounded-2xl shadow-xl overflow-hidden">
          <div className="px-3 py-2 border-b border-brand-border">
            <p className="text-xs text-brand-text-secondary font-medium">Выберите AI-модель</p>
          </div>
          <div className="p-2 flex flex-col gap-0.5 max-h-64 overflow-y-auto">
            {AI_MODELS.map((m) => {
              const label = MODEL_LABELS[m.id]
              const active = value === m.id
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => { onChange(m.id as ModelId); setOpen(false) }}
                  className={`w-full text-left px-3 py-2 rounded-xl transition cursor-pointer ${
                    active ? 'bg-brand-highlight border border-brand-accent/30' : 'hover:bg-brand-bg'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm leading-none shrink-0">{label?.emoji}</span>
                    <span className={`text-xs font-semibold leading-tight ${active ? 'text-brand-accent' : 'text-brand-text'}`}>
                      {label?.short}
                    </span>
                    {m.badge && (
                      <span className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-brand-accent/10 text-brand-accent shrink-0">
                        {m.badge}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-brand-text-secondary pl-5 leading-snug">{label?.hint}</p>
                </button>
              )
            })}
          </div>
          <div className="px-3 py-2 border-t border-brand-border bg-brand-bg">
            <p className="text-[11px] text-brand-text-secondary">
              💡 Дефолт — в{' '}
              <a href="/dashboard/settings" className="text-brand-accent hover:underline">настройках AI</a>
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
