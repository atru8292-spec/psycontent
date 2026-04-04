import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateWithAI } from '@/lib/openrouter'

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await request.json()
    if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })

    const supabaseAdmin = getSupabaseAdmin()

    const { data: profile } = await supabaseAdmin
      .from('onboarding_profiles')
      .select('*')
      .eq('user_id', userId)
      .single()

    if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

    const { data: passport } = await supabaseAdmin
      .from('brand_passports')
      .select('content')
      .eq('user_id', userId)
      .single()

    const systemPrompt = `Ты — контент-стратег для психологов. Создаёшь конкретные, реалистичные планы публикаций.
Твоя задача: составить контент-план на 30 дней для конкретного психолога.

ПРАВИЛА:
- Чередуй форматы: post (текстовый пост), carousel (карусель), reels (рилс-скрипт), stories (сторис)
- Соотношение: 30% образовательные, 30% личные/рефлексия, 25% практические, 15% позиционирование/продажи
- Не делай 2 одинаковых рубрики подряд
- Темы должны быть КОНКРЕТНЫМИ, не абстрактными
- Учитывай подход и нишу психолога

ФОРМАТ ОТВЕТА — строго JSON массив из 30 объектов:
[
  {
    "day": 1,
    "pillar": "Психообразование",
    "topic": "Почему тревога — это не слабость: что происходит в мозге",
    "format": "post",
    "hook": "Первая строка поста которая цепляет",
    "tip": "Короткая подсказка по созданию этого контента"
  },
  ...
]

pillar — одно из: "Психообразование", "Личное", "Практика", "Истории", "Позиционирование"
format — одно из: "post", "carousel", "reels", "stories"`

    const userPrompt = `Психолог: ${profile.full_name}
Подход: ${(profile.approach || []).join(', ')}
Ниша: ${(profile.niche || []).join(', ')}
Тон: ${profile.tone}
Площадки: ${(profile.platforms || []).join(', ')}
Цель: ${profile.goal}
Время: ${profile.time_available}

${passport?.content ? `Контентные столбы из паспорта (используй их тематику):
${passport.content.substring(0, 1500)}` : ''}

Создай контент-план на 30 дней. Верни ТОЛЬКО JSON массив, без пояснений.`

    const result = await generateWithAI(systemPrompt, userPrompt)

    // Parse JSON from response
    const jsonMatch = result.match(/\[[\s\S]*\]/)
    if (!jsonMatch) throw new Error('Invalid JSON response from AI')

    const plan = JSON.parse(jsonMatch[0])

    // Save to supabase
    await supabaseAdmin
      .from('content_plans')
      .upsert({
        user_id: userId,
        plan: plan,
        generated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' })

    return NextResponse.json({ plan })

  } catch (error: any) {
    console.error('Content plan error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
