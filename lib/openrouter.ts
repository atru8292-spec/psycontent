const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'

function getOpenRouterHeaders() {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is not set')
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': 'https://psycontent.vercel.app',
    'X-Title': 'PsyContent',
  }
}

async function extractContent(response: Response) {
  const rawText = await response.text()
  if (!response.ok) throw new Error(`OpenRouter error ${response.status}: ${rawText}`)

  let data: any
  try {
    data = JSON.parse(rawText)
  } catch {
    throw new Error(`OpenRouter returned invalid JSON: ${rawText}`)
  }

  const content = data?.choices?.[0]?.message?.content
  if (typeof content === 'string' && content.trim()) return content.trim()
  if (Array.isArray(content)) {
    const joined = content.map((item: any) => {
      if (typeof item === 'string') return item
      if (typeof item?.text === 'string') return item.text
      return ''
    }).join('').trim()
    if (joined) return joined
  }

  throw new Error(`Empty model response: ${rawText}`)
}

async function callOpenRouter(body: Record<string, unknown>, timeoutMs = 55000) {
  const response = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: getOpenRouterHeaders(),
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify(body),
  })
  return extractContent(response)
}

// Доступные модели для выбора пользователем
export const AI_MODELS = [
  {
    id: 'anthropic/claude-sonnet-4-5',
    name: 'Claude Sonnet 4.5',
    provider: 'Anthropic',
    desc: 'Лучшее качество текста, глубокое понимание контекста',
    badge: 'Рекомендуем',
    speed: 'Средняя',
    quality: 5,
  },
  {
    id: 'anthropic/claude-haiku-3-5',
    name: 'Claude Haiku 3.5',
    provider: 'Anthropic',
    desc: 'Быстрее и дешевле, хорошо для простых постов',
    badge: 'Быстрый',
    speed: 'Быстрая',
    quality: 4,
  },
  {
    id: 'openai/gpt-4o',
    name: 'GPT-4o',
    provider: 'OpenAI',
    desc: 'Мощная модель OpenAI, отлично с инструкциями',
    badge: null,
    speed: 'Средняя',
    quality: 5,
  },
  {
    id: 'openai/gpt-4o-mini',
    name: 'GPT-4o mini',
    provider: 'OpenAI',
    desc: 'Быстрый и экономичный вариант от OpenAI',
    badge: null,
    speed: 'Быстрая',
    quality: 3,
  },
  {
    id: 'google/gemini-2.0-flash-001',
    name: 'Gemini 2.0 Flash',
    provider: 'Google',
    desc: 'Очень быстрый, хорошо справляется с длинными промптами',
    badge: 'Новый',
    speed: 'Очень быстрая',
    quality: 4,
  },
  {
    id: 'meta-llama/llama-4-scout',
    name: 'Llama 4 Scout',
    provider: 'Meta',
    desc: 'Бесплатная open-source модель от Meta',
    badge: 'Бесплатно',
    speed: 'Быстрая',
    quality: 3,
  },
] as const

export type ModelId = typeof AI_MODELS[number]['id']

export const DEFAULT_MODEL: ModelId = 'anthropic/claude-sonnet-4-5'

// Claude Sonnet — основная функция генерации текстов
export async function generateWithAI(
  systemPrompt: string,
  userPrompt: string,
  model: string = DEFAULT_MODEL
) {
  return callOpenRouter(
    {
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 4000,
    },
    55000
  )
}

// Perplexity — веб-поиск (исследование тем)
export async function generateWithWebSearch(userPrompt: string) {
  return callOpenRouter(
    {
      model: 'perplexity/sonar',
      messages: [
        {
          role: 'system',
          content: 'Ты — эксперт по контент-стратегии для психологов в Instagram. Отвечай только на русском языке. Возвращай только валидный JSON без markdown-оберток.',
        },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 3000,
    },
    45000
  )
}
