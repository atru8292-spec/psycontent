// app/api/generate-carousel/route.ts

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

const CAROUSEL_SYSTEM_PROMPT = `Ты — эксперт по созданию виральных каруселей для Instagram. Специализация — психологический контент.

═══════════════════════════════
СТРУКТУРА КАРУСЕЛИ (8-10 слайдов)
═══════════════════════════════

СЛАЙД 1 — ХУК (останавливает скролл)
- Боль или парадокс крупным текстом
- Максимум 10-15 слов
- Заканчивается: "Листай →"
- Примеры:
  • "Ты терпишь не потому что сильная. Ты терпишь потому что мозг врёт"
  • "Чем больше стараешься — тем хуже становится"
  • "Ты не ленивая. Ты в заморозке"

СЛАЙД 2 — УЗНАВАНИЕ
- Конкретная ситуация из жизни
- Читатель думает "это про меня"
- 2-4 коротких предложения

СЛАЙДЫ 3-7 — РАЗВИТИЕ (по 1 мысли на слайд)
- Каждый слайд = 1 идея
- Короткие предложения (2-4 строки)
- Заканчивается незавершённостью → хочется листать
- Чередуй: факт → пример → инсайт → вопрос

СЛАЙД 8-9 — ИНСАЙТ / РЕШЕНИЕ
- Главная мысль поста
- Что с этим делать (мягко, без приказов)
- Можно разбить на 2 слайда

СЛАЙД 10 — CTA
- Вопрос к аудитории ИЛИ
- Призыв сохранить/переслать ИЛИ
- Анонс (запись открыта / ссылка в шапке)

═══════════════════════════════
ПРАВИЛА ТЕКСТА ДЛЯ СЛАЙДОВ
═══════════════════════════════

1. КРАТКОСТЬ
- Максимум 30-40 слов на слайд
- Одна мысль = один слайд
- Если не влезает — раздели

2. ФОРМАТИРОВАНИЕ
- Короткие строки (3-6 слов)
- Много воздуха между строками
- Можно использовать переносы для акцента

3. ЯЗЫК
- Простые слова
- Без терминов (или с пояснением)
- Разговорный, но не панибратский
- Эмоционально, но не истерично

4. ВИЗУАЛЬНОСТЬ
- Текст должен хорошо смотреться на плашке
- Учитывай что будет фон/фото
- Важные слова можно ВЫДЕЛИТЬ

═══════════════════════════════
ФОРМАТ ОТВЕТА
═══════════════════════════════

Выдай СТРОГО в таком формате (JSON массив):

[
  {"slide": 1, "text": "текст первого слайда"},
  {"slide": 2, "text": "текст второго слайда"},
  ...
]

БЕЗ markdown, БЕЗ пояснений, ТОЛЬКО JSON массив.`

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { userId, topic, pillar } = body

    if (!userId) {
      return NextResponse.json({ error: 'userId required' }, { status: 400 })
    }

    if (!topic) {
      return NextResponse.json({ error: 'Тема не указана' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()

    const [profileRes, passportRes] = await Promise.all([
      supabase.from('onboarding_profiles').select('*').eq('user_id', userId).single(),
      supabase.from('brand_passports').select('content').eq('user_id', userId).single()
    ])

    const profile = profileRes.data || {}
    const passport = typeof passportRes.data?.content === 'string' ? passportRes.data.content : (passportRes.data?.content ? JSON.stringify(passportRes.data.content) : '')

    let profileContext = ''
    try {
      profileContext = buildProfileContext(profile)
    } catch {
      profileContext = 'Профиль психолога не заполнен.'
    }

    const prompt = `
${profileContext}

${passport ? `ПАСПОРТ БРЕНДА:\n${passport.substring(0, 600)}` : ''}

═══════════════════════════════
ЗАДАНИЕ
═══════════════════════════════
${pillar ? `Рубрика: ${pillar}` : ''}
Тема карусели: ${topic}

ТРЕБОВАНИЯ:
- Обращение: ${profile.appeal || 'на ты'}
- Тон: эмпатичный, но не сюсюкающий
- Избегай: ${Array.isArray(profile.anti_values) ? profile.anti_values.join(', ') : 'шаблонность'}

Создай карусель из 8-10 слайдов. Ответ ТОЛЬКО в формате JSON массива.`
    // Получаем предпочитаемую модель пользователя
    const { data: userSettings } = await supabase
      .from('user_settings')
      .select('preferred_model')
      .eq('user_id', userId)
      .maybeSingle()
    const model = (body as any).model || userSettings?.preferred_model || 'anthropic/claude-sonnet-4-5'


    const response = await generateWithAI(CAROUSEL_SYSTEM_PROMPT, prompt, model)

    if (!response) {
      throw new Error('AI returned empty response')
    }

    // Парсим JSON
    let slides: Array<{ slide: number; text: string }>
    
    try {
      // Ищем JSON в ответе
      const jsonMatch = response.match(/\[[\s\S]*\]/)
      if (!jsonMatch) {
        throw new Error('No JSON found in response')
      }
      slides = JSON.parse(jsonMatch[0])
    } catch (parseError) {
      console.error('JSON parse error:', parseError)
      console.log('Raw response:', response)
      
      // Fallback: пробуем разбить по слайдам старым способом
      const slideTexts = response.split(/\[?Слайд\s*\d+\]?:?/i).filter(s => s.trim())
      slides = slideTexts.map((text, i) => ({ slide: i + 1, text: text.trim() }))
    }

    if (!slides || slides.length < 3) {
      throw new Error('Failed to generate carousel slides')
    }

    // Сохраняем в БД
    const { error: insertError } = await supabase.from('generated_posts').insert({
      user_id: userId,
      topic,
      format: 'carousel',
      content: JSON.stringify(slides),
      category: pillar || 'Карусель'
    })

    if (insertError) {
      console.warn('Failed to save carousel:', insertError.message)
    }

    return NextResponse.json({ slides })

  } catch (error: any) {
    console.error('Generate carousel error:', error)
    return NextResponse.json(
      { error: error?.message || 'Не удалось сгенерировать карусель' },
      { status: 500 }
    )
  }
}
