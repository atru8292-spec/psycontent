export async function generateWithAI(systemPrompt: string, userPrompt: string) {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://psycontent.vercel.app',
      'X-Title': 'PsyContent',
    },
    body: JSON.stringify({
      model: 'openai/gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 4000,
      temperature: 0.7,
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`OpenRouter error: ${error}`)
  }

  const data = await response.json()
  return data.choices[0].message.content
}

// Perplexity with web search — for research & trending topics
export async function generateWithWebSearch(userPrompt: string) {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://psycontent.vercel.app',
      'X-Title': 'PsyContent',
    },
    body: JSON.stringify({
      model: 'perplexity/sonar',
      messages: [
        {
          role: 'system',
          content: 'Ты — эксперт по контент-стратегии для психологов в Instagram. Отвечай только на русском языке. Возвращай только валидный JSON без markdown-оберток.',
        },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 6000,
      temperature: 0.3,
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Perplexity error: ${error}`)
  }

  const data = await response.json()
  return data.choices[0].message.content
}
