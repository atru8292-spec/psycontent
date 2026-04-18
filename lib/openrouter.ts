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

// Claude Sonnet — для генерации текстов (posts, reels, rewrite, content plan, passport, анализ конкурентов)
export async function generateWithAI(systemPrompt: string, userPrompt: string) {
  return callOpenRouter(
    {
      model: 'anthropic/claude-sonnet-4-5',
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
