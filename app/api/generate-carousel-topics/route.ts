// app/api/generate-carousel-topics/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateWithAI } from '@/lib/openrouter'
import { buildProfileContext } from '@/lib/profile-context'

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env variables')
  return createClient(url, key)
}

const SYSTEM_PROMPT = `Ты — эксперт по контенту для психологов в Instagram. 
Твоя задача — предложить темы для каруселей, которые:
- Цепляют внимание с первого слайда
- Раскрывают экспертность психолога
- Резонируют с целевой аудиторией
- Подходят для формата 8-10 слайдов

Отвечай ТОЛЬКО JSON массивом, без markdown и пояснений.`

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { userId } = body

    if (!userId) {
      return NextResponse.json({ error: 'userId required' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()

    // Получаем профиль пользователя
    const { data: profile } = await supabase
      .from('onboarding_profiles')
      .select('*')
      .eq('user_id', userId)
      .single()

    let profileContext = ''
    try {
      profileContext = buildProfileContext(profile || {})
    } catch {
      profileContext = 'Профиль психолога не заполнен.'
    }

    const prompt = `
${profileContext}

═══════════════════════════════
ЗАДАНИЕ
═══════════════════════════════

Предложи 5 тем для карусели в Instagram.

Каждая тема должна:
- Быть актуальной для целевой аудитории
- Иметь цепляющий заголовок (как для первого слайда)
- Раскрываться за 8-10 слайдов

Формат ответа — JSON массив:
[
  {
    "title": "Цепляющий заголовок темы",
    "description": "Краткое описание — о чём будет карусель (1 предложение)"
  }
]

ТОЛЬКО JSON, без markdown и пояснений.`

    const response = await generateWithAI(SYSTEM_PROMPT, prompt)

    if (!response) {
      throw new Error('AI returned empty response')
    }

    // Парсим JSON
    let topics: Array<{ title: string; description: string }>
    
    try {
      const jsonMatch = response.match(/\[[\s\S]*\]/)
      if (!jsonMatch) {
        throw new Error('No JSON found in response')
      }
      topics = JSON.parse(jsonMatch[0])
    } catch (parseError) {
      console.error('JSON parse error:', parseError)
      console.log('Raw response:', response)
      throw new Error('Failed to parse topics')
    }

    if (!topics || topics.length < 3) {
      throw new Error('Not enough topics generated')
    }

    return NextResponse.json({ topics })

  } catch (error: any) {
    console.error('Generate carousel topics error:', error)
    return NextResponse.json(
      { error: error?.message || 'Не удалось сгенерировать темы' },
      { status: 500 }
    )
  }
}
