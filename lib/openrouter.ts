// ВНИМАНИЕ: файл исторически назван openrouter.ts, но теперь работает напрямую
// с OpenAI (по ТЗ). Имя файла и экспортов оставлены прежними, чтобы не трогать
// импорты во всех экранах/роутах. Переименование и удаление виджета выбора модели
// — на шаге бренда/UI (Шаг 9).

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions'

// Единая модель для всего продукта. Меняется одной строкой.
export const DEFAULT_MODEL = 'gpt-4o' as const

function getOpenAIHeaders() {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set')
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  }
}

async function extractContent(response: Response) {
  const rawText = await response.text()
  if (!response.ok) throw new Error(`OpenAI error ${response.status}: ${rawText}`)

  let data: any
  try {
    data = JSON.parse(rawText)
  } catch {
    throw new Error(`OpenAI returned invalid JSON: ${rawText}`)
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

async function callOpenAI(body: Record<string, unknown>, timeoutMs = 55000) {
  const response = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: getOpenAIHeaders(),
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify(body),
  })
  return extractContent(response)
}

// Виджет выбора модели схлопнут до одной GPT (полное удаление — Шаг 9).
export const AI_MODELS = [
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    provider: 'OpenAI',
    desc: 'Основная модель генерации текста',
    badge: 'Рекомендуем',
    speed: 'Средняя',
    quality: 5,
  },
] as const

export type ModelId = typeof AI_MODELS[number]['id']

// Основная генерация текста. Параметр model игнорируется — всегда одна модель
// (выбор модели у пользователя убран по ТЗ).
export async function generateWithAI(
  systemPrompt: string,
  userPrompt: string,
  _model?: string
) {
  return callOpenAI(
    {
      model: DEFAULT_MODEL,
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

// Подбор тем. Раньше использовался веб-поиск (Perplexity через OpenRouter) — по
// решению от 26 июня живой веб-поиск убран: GPT подбирает темы из паспорта (он
// передаётся в userPrompt) и своих знаний. Настоящий веб-поиск добавим позже.
export async function generateWithWebSearch(userPrompt: string) {
  return callOpenAI(
    {
      model: DEFAULT_MODEL,
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
