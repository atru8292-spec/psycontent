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
  post: 'текстовый пост для Instagram/Telegram. 500-800 символов. Много пустых строк — так читают в мобильном.',
  carousel: 'карусель из 5-7 слайдов. Для каждого: [Слайд N] заголовок (≤7 слов) + 2-3 предложения. Последний слайд — сильный призыв.',
  reels: 'сценарий для Reels 30-45 сек.\n🎬 ХУК (0-3 сек): [что говорить]\n📝 ОСНОВНАЯ ЧАСТЬ: [по секундам]\n🎯 ФИНАЛ: [призыв]\n📌 ВИЗУАЛ: [что показывать]',
  stories: 'серия из 4-5 stories.\nStory 1: [текст ≤80 символов] + [действие/вопрос]\nStory 2: ...',
}

const HOOK_FORMULAS = `
ФОРМУЛЫ ЦЕПЛЯЮЩИХ ХУКОВ — используй ОДНУ из них для первых 2 строк:
1. БОЛЬ → «Ты пьёшь третий кофе в 14:00 и всё равно не можешь сосредоточиться?»
2. ПРОВОКАЦИЯ → «КПТ не работает. Вот почему.»
3. ЧИСЛО → «3 признака тревоги которые все принимают за лень»
4. ЛИЧНОЕ → «Я сорвалась на ребёнка вчера. Хочу рассказать почему.»
5. ПРОТИВОРЕЧИЕ → «Все говорят "думай позитивно". Я против.»
6. КОНКРЕТИКА → «После 5 лет работы с тревогой вот что я вижу у каждого второго»
7. ВОПРОС-ЗЕРКАЛО → «Ты когда-нибудь извинялся за то что ты расстроен?»
8. СТОП-ФАКТ → «Выгорание — это не усталость. Это выученная беспомощность.»
`

const SYSTEM_PROMPT = `Ты — топовый SMM-копирайтер для психологов в рунете. Пишешь контент который набирает 10к+ просмотров.

ГЛАВНОЕ ПРАВИЛО: Первые 2 строки — это ВСЁ. Если не зацепили — пост не читают.

${HOOK_FORMULAS}

ПРАВИЛА ТЕКСТА:
✓ Короткие предложения. Разрыв строки = пауза = драма
✓ Говори "ты", не "вы" (если тон не официальный)  
✓ Конкретные детали вместо общих слов
✓ Личное > экспертное
✓ Заканчивай неожиданно или вопросом который задевает

ЗАПРЕЩЕНО:
✗ Начинать с "Тревога — это..." / "Сегодня хочу поговорить..." / "Привет!"
✗ "Поделитесь в комментариях" — это 2015 год
✗ Больше 3 строк подряд без пустой строки (в посте)
✗ "пространство", "путешествие к себе", "каждый из нас", "мы все знаем"

Учитывай подход психолога в ПОДАЧЕ:
- КПТ: структура + конкретные техники + "проверь себя"
- Гештальт: вопросы к себе + чувства + парадоксы
- Психоанализ: глубина + "а что за этим стоит"
- Интегративный: гибкость + разные углы`

export async function POST(request: NextRequest) {
  try {
    const { userId, topic, format, pillar, customTopic } = await request.json()

    if (!userId) {
      return NextResponse.json({ error: 'userId required' }, { status: 400 })
    }

    const supabaseAdmin = getSupabaseAdmin()

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('onboarding_profiles')
      .select('*')
      .eq('user_id', userId)
      .single()

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    const { data: passport } = await supabaseAdmin
      .from('brand_passports')
      .select('content')
      .eq('user_id', userId)
      .single()

    const actualTopic = customTopic || topic
    const formatDesc = FORMAT_DESCRIPTIONS[format] || FORMAT_DESCRIPTIONS.post

    const userPrompt = `ПРОФИЛЬ ПСИХОЛОГА:
Имя: ${profile.full_name}
Подход: ${(profile.approach || []).join(', ')}
Ниша: ${(profile.niche || []).join(', ')}
Тон: ${profile.tone}
Ценности: ${profile.values_text || '—'}
Что раздражает в индустрии: ${profile.what_annoys || '—'}
Площадки: ${(profile.platforms || []).join(', ')}

${passport?.content ? `ПАСПОРТ БРЕНДА (тон и позиционирование):
${passport.content.substring(0, 2000)}` : ''}

ЗАДАНИЕ:
Рубрика: ${pillar || 'Общий контент'}
Тема: ${actualTopic}
Формат: ${formatDesc}

Напиши контент. Первые 2 строки — убойный хук по одной из формул выше.
Контент должен звучать как ${profile.full_name}, а не как AI.`

    const result = await generateWithAI(SYSTEM_PROMPT, userPrompt)

    return NextResponse.json({ post: result })

  } catch (error: any) {
    console.error('Generate post error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
