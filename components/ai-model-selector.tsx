'use client'

import { AI_MODEL_OPTIONS, DEFAULT_AI_MODEL_ID, getModelById } from '@/lib/ai-models'

type Props = {
  value: string
  onChange: (next: string) => void
}

const badgeClass: Record<string, string> = {
  Рекомендуем: 'bg-green-100 text-green-700',
  Быстрее: 'bg-blue-100 text-blue-700',
  Качественнее: 'bg-purple-100 text-purple-700',
}

export default function AiModelSelector({ value, onChange }: Props) {
  const selected = getModelById(value || DEFAULT_AI_MODEL_ID)

  return (
    <div className="bg-white rounded-2xl border border-brand-border p-6">
      <h2 className="font-bold text-brand-text mb-3">AI-модель</h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
        {AI_MODEL_OPTIONS.map((option) => {
          const active = selected.id === option.id
          return (
            <button
              key={option.id}
              onClick={() => onChange(option.id)}
              className={`p-3 rounded-xl border text-left transition cursor-pointer ${active ? 'border-brand-accent bg-brand-highlight' : 'border-brand-border hover:border-brand-accent/40'}`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className={`text-sm font-semibold ${active ? 'text-brand-text' : 'text-brand-text-secondary'}`}>
                  {option.label}
                </p>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${badgeClass[option.badge]}`}>
                  {option.badge}
                </span>
              </div>
              <p className="text-xs text-brand-text-secondary mt-1">{option.bestFor}</p>
            </button>
          )
        })}
      </div>

      <div className="text-xs text-brand-text-secondary leading-relaxed">
        <p>{selected.about}</p>
        <p className="mt-1">
          Claude лучше для структурных длинных текстов, GPT чаще быстрее и вариативнее по идеям.
        </p>
      </div>
    </div>
  )
}
