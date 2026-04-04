import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateWithAI } from '@/lib/openrouter'

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

const SYSTEM_PROMPT = `Ты — старший fullstack-копирайтер и эксперт по контент-маркетингу ТОЛЬКО для психологов.
Твоя задача — взять сырой текст психолога (черновик, голосовую расшифровку или старый пост) и переписать его так, чтобы он работал как микро-сессия, вызывал опыт узнавания и мягко приводил клиентов.

ГЛАВНОЕ ПРАВИЛО (БАЗА):
Никакого generic-мусора. Никаких "5 способов справиться со стрессом". Контент должен читаться так, словно человек побыл на сессии и его ПОНЯЛИ.
Действуй ОЧЕНЬ аккуратно с фактами: сохраняй смысл исходного текста, примеры и случаи. НЕ ПРИДУМЫВАЙ новые факты или кейсы, если их нет в исходнике, просто улучши форму подачи того, что уже есть.

КАТЕГОРИЧЕСКИ ЗАПРЕЩЕННЫЕ СЛОВА И ФРАЗЫ:
- "путешествие к себе", "обрести внутреннюю гармонию", "целительное пространство", "в потоке"
- "каждый из нас", "ни для кого не секрет", "мы все знаем", "согласно статистике"
- "индивидуальный подход к каждому", "помощь в преодолении трудностей"
- "квалифицированная психологическая помощь", "безопасное пространство для исцеления"
- "Тревога — это...", "Депрессия возникает когда..." (скучные академические определения)
- "Делитесь в комментариях/Поделитесь вашим мнением" (устаревшее)
- "А вы знали что...?", "В этом посте я расскажу..."

РЕКОМЕНДОВАННАЯ АРХИТЕКТУРА ТЕКСТА (ВОРОНКА):
1. ХУК (ОСТАНОВИТЬ СКРОЛЛ). Парадокс, боль клиента, наблюдение.
2. ДОВЕРИЕ И НОРМАЛИЗАЦИЯ. Механизм, почему так происходит, валидация чувств ("вы не сломаны, просто ваш мозг...").
3. МЯГКИЙ CTA (ФИНАЛ). Никакого давления. Пример: "сохраните, чтобы перечитать когда накроет".`

const getFormatInstruction = (format: string) => {
  if (format === 'post') return 'Текстовый пост (Instagram/Telegram). Абзацы короткие (1-3 строки максимум). Много воздуха. Разбей текст на смысловые блоки.'
  if (format === 'carousel') return 'Карусель (слайды). Для каждого: [Слайд 1] Цепляющий заголовок. [Слайд 2-6] По одному факту/тезису (2-3 предложения). [Последний слайд] Мягкий CTA. Обязательно используй пометки вроде [Слайд 1] перед каждым экраном.'
  if (format === 'reels') return 'Сценарий для Reels (30-60 сек). Включает: [Кадр] что показывать, [Текст на экране / Хук], [Суть] и [Финал]. Обязательно используй квадратные скобки.'
  if (format === 'stories') return 'Сторис-цепочка. Структура: 1) Вводная с опросом. 2-4) Развитие. 5) Инсайт. 6) CTA. Пиши коротко, для чтения с экрана телефона за 5 секунд.'
  return 'Обычный текстовый пост.'
}

const getGoalInstruction = (goal: string) => {
  if (goal === 'clearer') return 'Цель: СДЕЛАТЬ ПРОЩЕ. Переведи с "психологического" на "человеческий". Убери сложные термины, замени их на метафоры из реальной жизни.'
  if (goal === 'engaging') return 'Цель: ВОВЛЕЧЕНИЕ. Добавь мощный хук в начало (парадокс или острую боль). Заставь читателя кивать головой и думать "это же точно про меня!"'
  if (goal === 'expert') return 'Цель: ЭКСПЕРТНОСТЬ. Добавь глубины. Объясни "почему" так происходит (работа мозга, защитные механизмы, детские паттерны).'
  if (goal === 'sales') return 'Цель: ПРОДАЖА (НАМЕК). В конце текста нативно подведи к тому, что это можно и нужно прорабатывать в терапии, и что ты именно тот специалист, который с этим работает.'
  return 'Стиль: Улучшить общий вид текста.'
}

export async function POST(req: NextRequest) {
  try {
    const { userId, sourceText, format, goal } = await req.json()

    if (!userId || !sourceText) {
      return NextResponse.json({ error: 'Не указаны userId или исходный текст' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()

    const [profileRes, passportRes] = await Promise.all([
      supabase.from('onboarding_profiles').select('*').eq('user_id', userId).single(),
      supabase.from('brand_passports').select('content').eq('user_id', userId).single()
    ])

    const profile = profileRes.data || {}
    const passport = passportRes.data?.content || 'Нет данных паспорта'

    const prompt = `
Твоя задача — ВЗЯТЬ ИСХОДНЫЙ ТЕКСТ И ПЕРЕПИСАТЬ ЕГО согласно настройкам, сохраняя стиль психолога.

ПРОФИЛЬ ПСИХОЛОГА (Для Tone of Voice):
Имя: ${profile.full_name || 'Психолог'}
Подходы: ${Array.isArray(profile.approaches) ? profile.approaches.join(', ') : (profile.approaches || 'интегративный')}
Специализация: ${Array.isArray(profile.niches) ? profile.niches.join(', ') : (profile.niches || 'не указана')}
Стиль общения: ${profile.tone_formal || 0}% формальный, ${profile.tone_serious || 0}% серьёзный, ${profile.tone_cautious || 0}% осторожный.

ПАСПОРТ БРЕНДА (Ключевые сообщения):
${passport.substring(0, 400)}

---

НАСТРОЙКИ ФОРМАТА РЕЗУЛЬТАТА:
${getFormatInstruction(format)}

ГЛАВНАЯ ЦЕЛЬ ПЕРЕПИСЫВАНИЯ:
${getGoalInstruction(goal)}

---

ИСХОДНЫЙ ТЕКСТ (Преврати это в готовый контент):
"""
${sourceText}
"""

Сгенерируй ГОТОВЫЙ РЕЗУЛЬТАТ (без лишних предисловий).
`

    const post = await generateWithAI(SYSTEM_PROMPT, prompt, {
      temperature: 0.7,
      max_tokens: 1500
    })

    // Optionally record to history
    await supabase.from('generated_posts').insert({
      user_id: userId,
      topic: 'Переписанный текст',
      format: `rewrite_${format}`,
      content: post,
      category: 'Rewrite'
    })

    return NextResponse.json({ post })
  } catch (error: any) {
    console.error('Ошибка в API Rewrite:', error)
    return NextResponse.json(
      { error: 'Не удалось переписать текст' },
      { status: 500 }
    )
  }
}
