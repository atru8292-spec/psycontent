export type AiModelOption = {
  id: string
  label: string
  openrouterModel: string
  badge: 'Рекомендуем' | 'Быстрее' | 'Качественнее'
  about: string
  bestFor: string
}

export const AI_MODEL_OPTIONS: AiModelOption[] = [
  {
    id: 'claude_sonnet',
    label: 'Claude Sonnet',
    openrouterModel: 'anthropic/claude-sonnet-4.5',
    badge: 'Рекомендуем',
    about: 'Claude обычно аккуратнее в длинных структурированных текстах.',
    bestFor: 'Посты, карусели и сложные смысловые тексты.',
  },
  {
    id: 'gpt_4o',
    label: 'GPT-4o',
    openrouterModel: 'openai/gpt-4o',
    badge: 'Качественнее',
    about: 'GPT-4o даёт более вариативные формулировки и креативные заходы.',
    bestFor: 'Рилс-сценарии, переписывание и креативные хуки.',
  },
  {
    id: 'gpt_4o_mini',
    label: 'GPT-4o mini',
    openrouterModel: 'openai/gpt-4o-mini',
    badge: 'Быстрее',
    about: 'Быстрее отвечает и подходит для черновых итераций.',
    bestFor: 'Быстрые версии и черновики.',
  },
]

export const DEFAULT_AI_MODEL_ID = AI_MODEL_OPTIONS[0].id

export function getModelById(modelId: string | null | undefined): AiModelOption {
  return AI_MODEL_OPTIONS.find((m) => m.id === modelId) || AI_MODEL_OPTIONS[0]
}
