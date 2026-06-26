import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateWithAI } from '@/lib/openrouter'
import { buildProfileContext } from '@/lib/profile-context'
import { getSessionUser } from '@/lib/auth'

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env variables')
  return createClient(url, key)
}

const SYSTEM_PROMPT = `Ты — эксперт по контенту для психологов.
Твоя задача — предложить 5 цепляющих тем для Instagram-каруселей на основе профиля психолога.

Каждая тема должна быть:
1. Актуальной и острой (боль аудитории).
2. Подходящей для формата карусели (можно разложить по шагам или слайдам).
3. Интригующей (чтобы хотелось дочитать).

Формат ответа СТРОГО JSON массив объектов:
[
  { "title": "...", "description": "..." },
  { "title": "...", "description": "..." }
]
Без markdown, без пояснений, ТОЛЬКО JSON массив.`

export async function POST(req: NextRequest) {
  try {
    const reqBody = await req.json()

    // userId берём ТОЛЬКО из проверенной сессии в куках, не из тела запроса.
    const user = await getSessionUser()
    if (!user) {
      return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
    }
    const userId = user.id

    const supabase = getSupabaseAdmin()

    const { data: profile } = await supabase
      .from('onboarding_profiles')
      .select('*')
      .eq('user_id', userId)
      .single()

    const profileContext = profile 
      ? buildProfileContext(profile) 
      : 'Профиль психолога не заполнен.'

    const prompt = `${profileContext}

Предложи 5 тем для каруселей. Возвращай только JSON массив.`
    // Получаем предпочитаемую модель пользователя
    const { data: userSettings } = await supabase
      .from('user_settings')
      .select('preferred_model')
      .eq('user_id', userId)
      .maybeSingle()
    const model = reqBody.model || userSettings?.preferred_model || 'anthropic/claude-sonnet-4-5'


    const response = await generateWithAI(SYSTEM_PROMPT, prompt, { userId, operation: 'generate_carousel_topics' })

    if (!response) {
      throw new Error('AI returned empty response')
    }

    // Парсим JSON
    let topics = []
    try {
      const jsonMatch = response.match(/\[[\s\S]*\]/)
      if (jsonMatch) {
        topics = JSON.parse(jsonMatch[0])
      } else {
        topics = JSON.parse(response)
      }
    } catch (parseError) {
      console.error('JSON parse error in topics:', parseError, 'Raw:', response)
      throw new Error('Failed to parse AI response')
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
