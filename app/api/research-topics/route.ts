import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateWithWebSearch } from '@/lib/openrouter'

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

    const prompt = `Я психолог с такими данными:
Подход: ${(profile.approach || []).join(', ')}
Ниша: ${(profile.niche || []).join(', ')}
Целевая аудитория: люди с проблемами ${(profile.niche || []).join(', ')}
Тон общения: ${profile.tone}

${passport?.content ? `Мои контентные столбы:
${passport.content.substring(0, 800)}` : ''}

Найди в русскоязычном Instagram, Telegram и интернете 30 актуальных тем для постов психолога в моей нише которые:
1. Активно обсуждаются прямо сейчас (2024-2025)
2. Вызывают сильный эмоциональный отклик у моей аудитории
3. НЕ заезженные — не "как справиться со стрессом" и не "10 советов по тревоге"
4. Конкретные, с провокационным углом

Верни ТОЛЬКО JSON массив из 30 объектов, без пояснений:
[
  {
    "id": 1,
    "topic": "Конкретная тема поста",
    "hook": "Первые 2 строки поста которые остановят скролл",
    "pillar": "одно из: Психообразование / Личное / Практика / Истории / Позиционирование",
    "why": "1 предложение — почему это зайдёт моей аудитории",
    "format": "post или carousel или reels или stories",
    "trend": "откуда эта тема (например: обсуждается в Telegram, тренд TikTok, запрос в поиске)"
  }
]`

    const result = await generateWithWebSearch(prompt)

    // Extract JSON
    const jsonMatch = result.match(/\[[\s\S]*\]/)
    if (!jsonMatch) throw new Error('Invalid JSON from Perplexity')

    const topics = JSON.parse(jsonMatch[0])

    return NextResponse.json({ topics })

  } catch (error: any) {
    console.error('Research topics error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
