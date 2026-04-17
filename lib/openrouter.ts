const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'

function getHeaders() {
  const apiKey = process.env.OPENROUTER_API_KEY

  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is not set')
  }

  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': 'https://psycontent.vercel.app',
    'X-Title': 'PsyContent',
  }
}

async function parseOpenRouterResponse(response: Response) {
  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`OpenRouter error ${response.status}: ${errorText}`)
  }

  const data = await response.json()
  const content = data?.choices?.[0]?.message?.content

  if (!content) {
    throw new Error('Empty response from OpenRouter')
  }

  if (typeof content === 'string') {
    return content
  }

  if (Array.isArray(content)) {
    return content
      .map((item: any) => (typeof item?.text === 'string' ? item.text : ''))
      .join('')
      .trim()
  }

  throw new Error('Unsupported response format from OpenRouter')
}

// Claude for text generation (posts, reels, rewrite, content plan, passport)
export async function generateWithAI(systemPrompt: string, userPrompt: string) {
  const response = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: getHeaders(),
    signal: AbortSignal.timeout(30_000),
    body: JSON.stringify({
      model: 'anthropic/claude-sonnet-4.5',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 4000,
      temperature: 0.7,
    }),
  })

  return parseOpenRouterResponse(response)
}

// Perplexity for web research (research & trending topics)
export async function generateWithWebSearch(userPrompt: string) {
  const response = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: getHeaders(),
    signal: AbortSignal.timeout(45_000),
    body: JSON.stringify({
      model: 'perplexity/sonar',
      messages: [
        {
          role: 'system',
          content:
            'Ты — эксперт по контент-стратегии для психологов в Instagram. Отвечай только на русском языке. Возвращай только валидный JSON без markdown-оберток.',
        },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 3000,
      temperature: 0.3,
    }),
  })

  return parseOpenRouterResponse(response)
}
