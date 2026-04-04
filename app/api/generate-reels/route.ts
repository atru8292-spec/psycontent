import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateWithAI } from '@/lib/openrouter'

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

const SYSTEM_PROMPT = `Ты — видео-продюсер и контент-стратег для психологов в Instagram/TikTok.
Твоя цель: создавать сценарии (скрипты) коротких видео (Reels / Shorts), которые цепляют с 1-й секунды, удерживают внимание и приводят клиентов, сохраняя при этом бережность и экспертность психолога.

ПРАВИЛА И ОГРАНИЧЕНИЯ (КРИТИЧНО!):
1. Никаких шаблонных фраз: "вы не одиноки", "путешествие к себе", "обретите гармонию", "поделитесь в комментариях".
2. Говори как живой человек, а не как учебник по психологии.
3. Текст должен быть коротким. Люди не слушают длинные монологи. 1 секунда = 2-3 слова.
4. Обязательное использование конкретных "болей" и ощущений. "Когда крутит живот перед звонком" вместо "При социофобии".
`

const getLengthInstruction = (length: string) => {
  if (length === '30s') {
    return 'Длительность: Около 30 секунд. Это быстрый, динамичный формат. Быстрый хук, короткая суть, призыв.'
  }
  return 'Длительность: Около 60 секунд. Глубокий формат. Цепляющее начало, микро-история или подробное описание механизма, вывод и призыв.'
}

const getStyleInstruction = (style: string) => {
  if (style === 'talking_head') {
    return `Формат: Говорящая голова.
Инструкция: Пиши текст так, чтобы психолог мог произнести его на камеру. Укажи эмоции, паузы (в скобках). Используй естественные речевые обороты.`
  }
  if (style === 'text_on_screen') {
    return `Формат: Текст на экране (без лица или атмосферное видео).
Инструкция: Психолог молчит. Будет только атмосферое видео или действия. Твоя задача разбить текст на короткие фразы (плашки), которые будут появляться на экране. Добавь описание того, что должно быть в кадре (атмосфера).`
  }
  return `Формат: Закадровый голос (Voiceover).
Инструкция: Напиши текст для начитки диктором + предложи идеи для видеоряда (что показывать на экране, пока звучит голос).`
}

export async function POST(req: NextRequest) {
  try {
    const { userId, topic, customTopic, videoLength, videoStyle, pillar } = await req.json()

    if (!userId) {
      return NextResponse.json({ error: 'Не указан userId' }, { status: 400 })
    }

    const finalTopic = customTopic || topic
    if (!finalTopic) {
      return NextResponse.json({ error: 'Не указана тема видео' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()

    // Retrieve context
    const [profileRes, passportRes] = await Promise.all([
      supabase.from('onboarding_profiles').select('*').eq('user_id', userId).single(),
      supabase.from('brand_passports').select('content').eq('user_id', userId).single()
    ])

    const profile = profileRes.data || {}
    const passport = passportRes.data?.content || 'Нет данных паспорта'

    const targetTopicInfo = pillar ? `Тема видео (${pillar}): ${finalTopic}` : `Тема видео: ${finalTopic}`

    const prompt = `
Сценарий для нового видео.

ПРОФИЛЬ ПСИХОЛОГА:
Имя: ${profile.full_name || 'Психолог'}
Опыт: ${profile.experience || 'не указан'}
Подходы: ${Array.isArray(profile.approaches) ? profile.approaches.join(', ') : (profile.approaches || 'интегративный')}
Специализация: ${Array.isArray(profile.niches) ? profile.niches.join(', ') : (profile.niches || 'не указана')}
Стиль общения: ${profile.tone_formal || 0}% формальный, ${profile.tone_serious || 0}% серьёзный, ${profile.tone_cautious || 0}% осторожный.

ПАСПОРТ БРЕНДА (Цитаты/Стратегия):
${passport.substring(0, 500)}...

${targetTopicInfo}

${getLengthInstruction(videoLength)}

${getStyleInstruction(videoStyle)}

ТРЕБОВАНИЯ К ОФОРМЛЕНИЮ СЦЕНАРИЯ:
Сформируй вывод СЦЕНАРИЯ строго, разделяя блоки в квадратных скобках. Никакого мусора вне этих скобок или текста, просто блоки друг за другом.
Пример 1 (Говорящая голова):
[Кадр/Реквизит] Вы сидите в кресле (свет теплый)
[Хук (0-3 сек)] Знаете, что общего между...
[Суть (3-20 сек)] Ваш мозг обманывает вас...
[CTA (конец)] Подпишитесь, я рассказываю о...

Пример 2 (Текст на экране):
[Кадр/Реквизит] Идёте по улице, смотрите под ноги
[Плашка 1 (0-3 сек)] Вы не ленивые.
[Плашка 2 (3-7 сек)] У вас просто кончился дофамин.
[CTA (конец)] В описании рассказал как вернуть.

Выдай готовый скрипт, опираясь на эти примеры, используя квадратные скобки для логических блоков.
`

    const script = await generateWithAI(SYSTEM_PROMPT, prompt, {
      temperature: 0.7,
      max_tokens: 1000
    })

    // Optionally save to generated_posts (using type: 'reels')
    await supabase.from('generated_posts').insert({
      user_id: userId,
      topic: finalTopic,
      format: `reels (${videoLength}, ${videoStyle})`,
      content: script,
      category: pillar || 'Своя тема'
    })

    return NextResponse.json({ script })
  } catch (error: any) {
    console.error('Ошибка в API Reels:', error)
    return NextResponse.json(
      { error: 'Не удалось сгенерировать скрипт' },
      { status: 500 }
    )
  }
}
