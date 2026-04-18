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
    const { userId, action } = await request.json()
    if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })

    const supabaseAdmin = getSupabaseAdmin()

    // 1. Fetching existing researched topics
    if (action === 'fetch') {
      const { data } = await supabaseAdmin
        .from('researched_topics')
        .select('topics')
        .eq('user_id', userId)
        .single()
      
      return NextResponse.json({ topics: data?.topics || [] })
    }

    // 2. Generating new topics via Perplexity
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
    
    // We just map simple things if not filled specifically
    const approachTerms = approaches.join(', ')
    const nicheTerms = niches.join(', ')
    const toneDesc = profile.tone_verbal
      ? `${profile.tone_verbal}. Формальность: ${profile.tone_formal ?? 50}%, серьёзность: ${profile.tone_serious ?? 50}%, осторожность: ${profile.tone_cautious ?? 50}%`
      : `${profile.tone_formal ?? 50}% формальный, ${profile.tone_serious ?? 50}% серьёзный, ${profile.tone_cautious ?? 50}% осторожный`
    const annoys = [Array.isArray(profile.anti_values) ? profile.anti_values.join(', ') : '', profile.anti_values_custom || '']
      .filter(Boolean)
      .join('. ')
    const values = [Array.isArray(profile.values) ? profile.values.join(', ') : '', profile.values_custom || '']
      .filter(Boolean)
      .join('. ')
    const hasApproach = (needle: string) => approaches.some((item: string) => item.toLowerCase().includes(needle.toLowerCase()))

    const prompt = `Ты — исследователь контент-трендов в русскоязычном сегменте психологии и mental health.
Текущий период: 2025-2026 год.

КОНТЕКСТ ЗАПРОСА:
Я — практикующий психолог, мне нужны темы для постов в Instagram и Telegram.

МОЙ ПРОФИЛЬ:
- Имя: ${profile.full_name}
- Терапевтический подход: ${approaches.join(', ')}
  (ключевые термины и методы: ${approachTerms})
- Специализация (ниша): ${niches.join(', ')}
  (конкретные проблемы моих клиентов: ${nicheTerms})
- Тон общения: ${toneDesc}
- Опыт: ${profile.experience || 'от 3 лет'}
- Площадки: ${(profile.platforms || []).join(', ')}
- Цель: ${profile.goal_3_months || 'Привлечение клиентов'}
${annoys ? `- Что меня бесит в индустрии: ${annoys}` : ''}
${values ? `- Мои ценности: ${values}` : ''}

${passport?.content ? `ВЫЖИМКА ИЗ МОЕГО ПАСПОРТА БРЕНДА (контентные столбы, позиционирование, аватар клиента):
${passport.content.substring(0, 1200)}` : ''}

ЗАДАНИЕ:
Проведи глубокий ресёрч за период 2025-2026 года в русскоязычном Instagram, Telegram, TikTok, Яндекс.Дзен, YouTube Shorts и поисковых запросах Яндекс/Google.

Найди 30 тем для постов, разделённых на 3 БЛОКА:

═══════════════════════════════════════
БЛОК А: ТРЕНДОВЫЕ ТЕМЫ (15 тем)
═══════════════════════════════════════
Темы, которые активно обсуждаются ПРЯМО СЕЙЧАС в 2025-2026:
- Вирусные обсуждения в Telegram-каналах психологов
- Тренды Reels/TikTok в нише mental health
- Горячие запросы в Яндекс Wordstat по теме "${niches.join(' + ')}"
- Резонансные события, статьи, подкасты последних месяцев
- Новые термины и концепции, которые набирают популярность (doom scrolling, bed rotting, soft life, delulu, brain rot, и т.д. — но только те, что реально актуальны в 2025-2026)

═══════════════════════════════════════
БЛОК Б: НАУЧНЫЕ ИССЛЕДОВАНИЯ (8 тем)
═══════════════════════════════════════
Найди РЕАЛЬНЫЕ, СУЩЕСТВУЮЩИЕ научные исследования 2023-2026 годов, которые:
- Опубликованы в рецензируемых журналах (Nature, The Lancet Psychiatry, JAMA Psychiatry, Psychological Science, Journal of Clinical Psychology, Frontiers in Psychology и др.)
- Связаны с моей нишой (${niches.join(', ')}) и/или подходом (${approaches.join(', ')})
- Имеют интересный, неожиданный или контринтуитивный вывод
- Могут быть превращены в захватывающий пост для неспециалистов

Для каждого исследования ОБЯЗАТЕЛЬНО укажи:
- Авторов или университет
- Год публикации
- Журнал
- Главный вывод

═══════════════════════════════════════
БЛОК В: ЦИТАТЫ И ИДЕИ ВЕЛИКИХ ПСИХОЛОГОВ (7 тем)
═══════════════════════════════════════
Найди мощные, малоизвестные (НЕ заезженные!) цитаты и идеи от признанных психологов и психотерапевтов, которые:
- Напрямую связаны с моей нишой или подходом
- Звучат провокационно, вдохновляюще или парадоксально
- Могут стать отправной точкой для целого поста
- Из ЭТИХ авторов (приоритет по подходу):

${hasApproach('КПТ') ? `КПТ-подход: Аарон Бек, Джудит Бек, Альберт Эллис, Дэвид Бернс, Стивен Хайес (ACT), Кристин Нефф (self-compassion)` : ''}
${hasApproach('Гештальт') ? `Гештальт: Фриц Перлз, Лаура Перлз, Ирвин Ялом, Клаудио Наранхо, Джон Энрайт` : ''}
${hasApproach('Психоанализ') ? `Психоанализ: Зигмунд Фрейд, Карл Юнг, Дональд Винникотт, Мелани Кляйн, Хайнц Кохут, Нэнси Мак-Вильямс` : ''}
${hasApproach('Экзистенциаль') ? `Экзистенциальный: Ирвин Ялом, Виктор Франкл, Ролло Мэй, Эмми ван Дорцен, Джеймс Бьюдженталь` : ''}
Универсальные (подходят всем): Карл Роджерс, Ирвин Ялом, Виктор Франкл, Карл Юнг, Эрих Фромм, Дональд Винникотт, Вирджиния Сатир, Габор Матэ (Gabor Maté), Бессел ван дер Колк, Брене Браун

Требования к цитатам:
- Укажи ТОЧНУЮ цитату на русском (или качественный перевод)
- Укажи автора и источник (книга, лекция, интервью)

КРИТЕРИИ ОТБОРА:
1. АКТУАЛЬНОСТЬ 2025-2026 — даже исследования и цитаты через актуальную линзу
2. УНИКАЛЬНЫЙ УГОЛ — НЕ банальные темы
3. ЭТИЧНОСТЬ — никаких диагнозов, гарантий

ТРЕБОВАНИЯ К ХУКАМ:
- НЕ начинай с "А вы знали что...?" / "5 признаков..." / "10 способов..."
- ИСПОЛЬЗУЙ: парадокс, провокацию, цитату, личное обращение, шокирующий факт
- Хук должен быть 2-3 строки максимум

ФОРМАТ ОТВЕТА:
Верни ТОЛЬКО валидный JSON массив из 30 объектов (без текста вне массива, без markdown-оберток):
[
  {
    "id": 1,
    "block": "trend" (для трендовых) / "science" (для исследований) / "quote" (для цитат),
    "topic": "Конкретная, чёткая тема поста",
    "hook": "Первые 2-3 строки которые ОСТАНОВЯТ скролл",
    "pillar": "Психообразование / Личное / Практика / Истории / Позиционирование",
    "why": "1 предложение — почему это зайдёт моей аудитории",
    "format": "post / carousel / reels / stories",
    "source": "Для trend: откуда тренд. Для science: авторы, журнал, год. Для quote: автор, точная цитата",
    "cta": "сохранить / переслать / написать в комментарии / записаться"
  }
]`

    const result = await generateWithWebSearch(prompt)

    // Extract JSON
    const jsonMatch = result.match(/\[[\s\S]*\]/)
    if (!jsonMatch) throw new Error('Invalid JSON from Perplexity: ' + result)

    let topics = []
    try {
      topics = JSON.parse(jsonMatch[0])
    } catch (e) {
      throw new Error('Failed to parse JSON string returned by AI')
    }

    // Save to database
    await supabaseAdmin
      .from('researched_topics')
      .upsert({ 
        user_id: userId, 
        topics: topics,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' })

    return NextResponse.json({ topics })

  } catch (error: any) {
    console.error('Research topics error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
