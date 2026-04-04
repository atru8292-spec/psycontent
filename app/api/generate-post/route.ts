import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateWithAI } from '@/lib/openrouter'

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

const FORMAT_DESCRIPTIONS: Record<string, string> = {
  post: 'текстовый пост для Instagram/Telegram (600-900 символов, с абзацами, живой язык)',
  carousel: 'карусель из 5-7 слайдов (для каждого слайда: заголовок + 2-3 предложения контента)',
  reels: 'сценарий для Reels/shorts (30-60 секунд): хук 3 секунды + основная часть + призыв к действию',
  stories: 'серия из 4-5 stories (для каждой: короткий текст + вопрос или действие для вовлечения)',
}

export async function POST(request: NextRequest) {
  try {
    const { userId, topic, format, pillar, customTopic } = await request.json()

    if (!userId) {
      return NextResponse.json({ error: 'userId required' }, { status: 400 })
    }

    const supabaseAdmin = getSupabaseAdmin()

    // Get profile
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('onboarding_profiles')
      .select('*')
      .eq('user_id', userId)
      .single()

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    // Get passport for content pillars context
    const { data: passport } = await supabaseAdmin
      .from('brand_passports')
      .select('content')
      .eq('user_id', userId)
      .single()

    const actualTopic = customTopic || topic

    const systemPrompt = `Ты — опытный SMM-копирайтер, специализирующийся на контенте для психологов. 
Ты знаешь тонкости этики в психологии, разбираешься в разных терапевтических подходах и умеешь писать контент, который звучит как живой человек — не как ChatGPT.

КЛЮЧЕВЫЕ ПРАВИЛА:
1. Пиши в тоне и голосе конкретного психолога (данные ниже)
2. Используй конкретные детали, избегай банальностей
3. Цепляющий хук в начале — первые 2 строки должны заставить остановить скролл
4. Учитывай подход психолога в подаче материала
5. Этические границы: никаких гарантий «вылечу», никаких диагнозов
6. Заканчивай призывом к действию или вопросом к аудитории
7. Пиши на русском, живым разговорным языком

ЗАПРЕЩЕНО:
- «путешествие к себе», «безопасное пространство для исцеления»
- обещания мгновенного результата
- академический сухой язык
- начинать с «Привет!» или «Давно хотела написать...»`

    const userPrompt = `ПРОФИЛЬ ПСИХОЛОГА:
Имя: ${profile.full_name}
Подход: ${(profile.approach || []).join(', ')}
Ниша: ${(profile.niche || []).join(', ')}
Тон общения: ${profile.tone}
Ценности: ${profile.values_text || '—'}
Что бесит в индустрии: ${profile.what_annoys || '—'}
Площадки: ${(profile.platforms || []).join(', ')}

${passport?.content ? `ПАСПОРТ БРЕНДА (контекст для тона и позиционирования):
${passport.content.substring(0, 2000)}...` : ''}

ЗАДАНИЕ:
Рубрика: ${pillar || 'Общий контент'}
Тема поста: ${actualTopic}
Формат: ${FORMAT_DESCRIPTIONS[format] || FORMAT_DESCRIPTIONS.post}

Напиши ${FORMAT_DESCRIPTIONS[format] || 'пост'}.

${format === 'carousel' ? `
ФОРМАТ КАРУСЕЛИ:
Слайд 1 (Обложка): [цепляющий заголовок]
Слайд 2-6: [Заголовок слайда]
[Контент 2-3 предложения]
Слайд последний: [Призыв к действию]` : ''}

${format === 'reels' ? `
ФОРМАТ СЦЕНАРИЯ:
🎬 ХУК (0-3 сек): [что говорить/делать]
📝 ОСНОВНАЯ ЧАСТЬ: [текст по секундам]
🎯 ФИНАЛ (призыв): [что говорить]
📌 ВИЗУАЛЬНЫЕ ПОДСКАЗКИ: [что показывать на экране]` : ''}

${format === 'stories' ? `
ФОРМАТ STORIES:
Story 1: [текст + действие]
Story 2: [текст + действие]
...` : ''}

Важно: контент должен звучать как ${profile.full_name}, а не как шаблонный AI.`

    const result = await generateWithAI(systemPrompt, userPrompt)

    return NextResponse.json({ post: result })

  } catch (error: any) {
    console.error('Generate post error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
