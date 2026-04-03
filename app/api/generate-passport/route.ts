import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateWithAI } from '@/lib/openrouter'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const SYSTEM_PROMPT = `Ты — эксперт по личному бренду и контент-стратегии для психологов.
Ты глубоко понимаешь специфику продвижения психологов в социальных сетях: этику, границы, тон коммуникации.

Твоя задача — на основе данных распаковки психолога создать детальный "Паспорт бренда".

ВАЖНО:
- Пиши на русском языке
- Учитывай подход психолога (КПТ, гештальт, психоанализ и тд) — это влияет на тон
- Учитывай нишу — это определяет темы контента
- Учитывай тон общения — это определяет стиль текстов
- Будь конкретным, давай готовые формулировки, а не абстрактные советы
- Формат ответа: используй заголовки с ## и списки с -`

export async function POST(request: NextRequest) {
  try {
    const { userId } = await request.json()

    if (!userId) {
      return NextResponse.json({ error: 'userId required' }, { status: 400 })
    }

    // Get onboarding profile
    const { data: profile, error: profileError } = await supabase
      .from('onboarding_profiles')
      .select('*')
      .eq('user_id', userId)
      .single()

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    const userPrompt = `Вот данные распаковки психолога:

ИМЯ: ${profile.full_name}
ПОДХОД: ${(profile.approach || []).join(', ')}
НИША (с чем работает): ${(profile.niche || []).join(', ')}
ОПЫТ: ${profile.experience}
ТОН ОБЩЕНИЯ: ${profile.tone}
ЦЕННОСТИ: ${profile.values_text}
ЧТО БЕСИТ В ИНДУСТРИИ: ${profile.what_annoys}
ПОДПИСЧИКОВ: ${profile.current_followers}
ПЛОЩАДКИ: ${(profile.platforms || []).join(', ')}
КЛИЕНТОВ В МЕСЯЦ: ${profile.current_clients}
ИСТОЧНИК КЛИЕНТОВ: ${profile.client_source}
ГЛАВНАЯ БОЛЬ: ${profile.biggest_pain}
ЦЕЛЬ НА 3 МЕСЯЦА: ${profile.goal}
ВРЕМЯ НА КОНТЕНТ: ${profile.time_available}
МЕЧТА О БЛОГЕ: ${profile.dream_blog}

На основе этих данных создай ПАСПОРТ БРЕНДА:

## 1. Позиционирование
Кто этот психолог, для кого, чем отличается. Одно предложение-формула: "Я помогаю [кому] [с чем] через [как]"

## 2. Тон голоса
Детальное описание: как этот психолог должен звучать в текстах. 5-7 характеристик тона с примерами фраз.

## 3. Целевая аудитория (аватар клиента)
Кто идеальный клиент: возраст, пол, ситуация, боли, страхи, мечты. Конкретно, как реальный человек.

## 4. Уникальное ценностное предложение
Чем этот психолог отличается от тысяч других. 3 пункта.

## 5. Био для Instagram
Готовый текст для шапки профиля Instagram (до 150 символов, с эмодзи)

## 6. Описание для Telegram
Готовый текст для описания Telegram-канала (3-4 строки)

## 7. Контентные столбы
5 рубрик/тем для регулярного контента. Для каждой: название + описание + 3 примера тем постов.

## 8. Стоп-темы
О чём этому психологу НЕ стоит писать (с учётом этики и подхода). 3-5 пунктов.

## 9. Голос бренда: примеры
Напиши 3 примера первых строк постов в тоне этого психолога. Каждая должна цеплять и быть узнаваемой.`

    const result = await generateWithAI(SYSTEM_PROMPT, userPrompt)

    // Save to database
    const { error: saveError } = await supabase
      .from('brand_passports')
      .upsert({
        user_id: userId,
        content: result,
        generated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id'
      })

    if (saveError) {
      console.error('Save error:', saveError)
    }

    return NextResponse.json({ passport: result })

  } catch (error: any) {
    console.error('Generate error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
