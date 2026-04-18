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

    const approaches = Array.isArray(profile.approaches) ? profile.approaches : []
    const niches = Array.isArray(profile.niches) ? profile.niches : []
    const toneSummary = profile.tone_verbal
      ? `${profile.tone_verbal}. Формальность: ${profile.tone_formal ?? 50}%, серьёзность: ${profile.tone_serious ?? 50}%, осторожность: ${profile.tone_cautious ?? 50}%`
      : `${profile.tone_formal ?? 50}% формальный, ${profile.tone_serious ?? 50}% серьёзный, ${profile.tone_cautious ?? 50}% осторожный`

    const systemPrompt = `Ты — топовый контент-стратег для психологов. Твоя задача: составить контент-план на 30 дней, который не просто дает советы, а РЕАЛЬНО приводит клиентов.

КЛЮЧЕВАЯ ИДЕЯ: Каждый пост — это микро-сессия. Человек читает и понимает "Она/он меня видит насквозь".

ПРАВИЛА И ПРОПОРЦИИ:
Создай ровно 30 дней контента со следующим распределением (Примерно):
- 30% (9 дней): Психообразование (Объясни, ЧТО болит и механизм)
- 25% (8 дней): Истории / Вовлекающие (Случаи из практики, собирательные образы, мифы)
- 20% (6 дней): Личное (Бэкстейдж, рефлексия, почему я здесь)
- 15% (4 дня): Практика (Техники, ритуалы, заземление)
- 10% (3 дня): Позиционирование / Продажи (Мягкое приглашение: "Как я работаю", "С чем можно прийти")

ЧЕРЕДОВАНИЕ ФОРМАТОВ:
Постоянно чередуй форматы для алгоритмов Instagram/Telegram:
- post (глубокий текст)
- carousel (схемы, списки, механики)
- reels (динамика хук-проблема-инсайт)
- stories (прогрев из 5-7 сторис)

ХУКИ (Архи-важно!):
- НЕ используй: "Как справиться...", "5 признаков...", "А вы знали...?" — это мусор.
- ИСПОЛЬЗУЙ: Парадоксы ("Чем больше вы расслабляетесь..."), Узнавание тела/быта ("Третий кофе в 14:00..."), Провокацию ("Остановитесь лечить мужа...").

ФОРМАТ ОТВЕТА — строго JSON массив из 30 объектов (без текста вне массива, без markdown-кавычек):
[
  {
    "day": 1,
    "pillar": "Психообразование",
    "topic": "Механизм тревоги по вечерам",
    "format": "post",
    "hook": "Тревога по ночам — это не сумасшествие. Это когда днём вы держитесь, а ночью тело обрабатывает стресс.",
    "tip": "Опиши конкретные телесные проявления, адекватизируй их, и сделай мягкий CTA сохранить пост."
  }
]
`

    const userPrompt = `ПРОФИЛЬ ПСИХОЛОГА:
Имя: ${profile.full_name}
Терапевтический подход: ${approaches.join(', ')}
Ниша: ${niches.join(', ')}
Тон общения: ${toneSummary}
Цель в блоге: ${profile.goal_3_months || profile.dream_blog || 'Получать заявки'}

${passport?.content ? `Выжимка из Паспорта (Используй эти боли и аватары):
${passport.content.substring(0, 1500)}` : ''}

Строго следуй правилу: никакого академического языка. Твоя задача выдать JSON с готовым планом на 30 дней для конкретного человека выше.`

    const result = await generateWithAI(systemPrompt, userPrompt)

    // Parse JSON
    const jsonMatch = result.match(/\[[\s\S]*\]/)
    if (!jsonMatch) throw new Error('Invalid JSON response from AI')

    const plan = JSON.parse(jsonMatch[0])

    // Save
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
