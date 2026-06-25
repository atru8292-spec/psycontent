import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateWithWebSearch } from '@/lib/openrouter'
import { buildProfileContext } from '@/lib/profile-context'
import { getSessionUser } from '@/lib/auth'

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function safeParseJSON(raw: string) {
  let s = raw.trim()

  if (s.startsWith('```')) {
    const firstBracket = s.indexOf('[')
    const lastBracket = s.lastIndexOf(']')
    if (firstBracket >= 0 && lastBracket > firstBracket) {
      s = s.slice(firstBracket, lastBracket + 1)
    }
  }

  return JSON.parse(s)
}

function getApproachResearchFocus(approaches: string[]): string {
  const focus: Record<string, string> = {
    'КПТ': `КПТ-фокус для ресёрча:
- Свежие исследования эффективности КПТ при конкретных расстройствах
- Новые протоколы и техники (третья волна: ACT, CFT, DBT)
- Когнитивные искажения: новые данные о том как они формируются
- Исследования Аарона Бека, Джудит Бек, Дэвида Бернса, Стивена Хайеса
- Свежие мета-анализы КПТ vs другие подходы
- Цитаты: Бек, Эллис, Бернс, Хайес, Кристин Нефф`,

    'Психоанализ': `Психоаналитический фокус:
- Современный психоанализ: новые данные о бессознательных процессах
- Нейропсихоанализ (Марк Солмс) — мост между мозгом и бессознательным
- Исследования привязанности (Боулби, Мэри Эйнсворт, Питер Фонаги)
- Исследования защитных механизмов и их адаптивности
- Свежие данные о переносе и контрпереносе
- Цитаты: Винникотт, Юнг, Фромм, Мак-Вильямс, Кохут, Кернберг`,

    'Гештальт': `Гештальт-фокус:
- Исследования осознанности и телесного опыта
- Связь гештальт-подхода с mindfulness и нейронаукой
- Исследования "незавершённых ситуаций" и их влияния
- Контакт и его прерывания: свежие данные
- Цитаты: Фриц Перлз, Лаура Перлз, Ирвин Ялом, Клаудио Наранхо, Серж Гингер`,

    'Схема-терапия': `Схема-терапия фокус:
- Исследования Джеффри Янга и последователей
- Эффективность схема-терапии при расстройствах личности
- Ранние дезадаптивные схемы: новые данные о формировании
- "Химия схем" в парах — исследования
- Режимы: новые модели и исследования
- Цитаты: Янг, Арнтц, Бехари`,

    'ACT': `ACT-фокус:
- Исследования психологической гибкости (Стивен Хайес)
- Дефьюзия: как работает и почему эффективна
- ACT vs классическая КПТ: свежие сравнения
- Ценностно-ориентированное поведение: исследования
- Цитаты: Хайес, Расс Хэррис, Стросал`,

    'Экзистенциальный': `Экзистенциальный фокус:
- Исследования смысла жизни и его влияния на здоровье
- Экзистенциальная тревога vs клиническая тревога
- Посттравматический рост: свежие данные
- Одиночество как экзистенциальная данность: исследования
- Цитаты: Ялом, Франкл, Ролло Мэй, ван Дорцен, Бьюдженталь`,

    'ЭФТ': `ЭФТ-фокус:
- Исследования Сью Джонсон и эффективности ЭФТ для пар
- Нейробиология привязанности в паре
- Деструктивные циклы: данные исследований
- Эмоциональная доступность: как измеряется
- Цитаты: Сью Джонсон, Лесли Гринберг`,

    'EMDR': `EMDR-фокус:
- Свежие исследования эффективности EMDR
- Механизм действия: что говорят нейроисследования
- EMDR при тревоге (не только ПТСР)
- Сравнение EMDR с другими методами работы с травмой
- Цитаты: Франсин Шапиро, ван дер Колк`,

    'Нарративная терапия': `Нарративный фокус:
- Исследования экстернализации и её эффектов
- Нарративная идентичность: свежие данные
- Доминирующие истории и их влияние на поведение
- Цитаты: Майкл Уайт, Дэвид Эпстон`,

    'Телесно-ориентированная': `Телесный фокус:
- Поливагальная теория Стивена Порджеса: свежие данные
- Исследования соматического переживания (Питер Левин)
- Связь тело-психика: интероцепция, фасциальная память
- Мышечный панцирь: современные исследования
- Цитаты: Райх, Лоуэн, Левин, ван дер Колк, Порджес, Габор Матэ`,

    'Арт-терапия': `Арт-терапия фокус:
- Исследования эффективности арт-терапии при тревоге, травме, депрессии
- Нейробиология творческого процесса
- Проективные техники: что говорят свежие данные
- Цитаты: Эдит Крамер, Наумбург`,
  }

  const parts: string[] = []
  for (const approach of approaches) {
    const key = Object.keys(focus).find(
      k =>
        approach.toLowerCase().includes(k.toLowerCase()) ||
        k.toLowerCase().includes(approach.toLowerCase())
    )
    if (key) parts.push(focus[key])
  }

  return parts.length > 0
    ? parts.join('\n\n')
    : `Интегративный подход: ищи исследования по основным методам терапии, привязанности, самосостраданию, нейробиологии эмоций.`
}

function getApproachAuthors(approaches: string[]): string {
  const authors: Record<string, string> = {
    'КПТ': 'Аарон Бек, Джудит Бек, Альберт Эллис, Дэвид Бернс, Стивен Хайес, Кристин Нефф, Расс Хэррис',
    'Психоанализ': 'Фрейд, Юнг, Винникотт, Кляйн, Кохут, Мак-Вильямс, Кернберг, Фромм',
    'Гештальт': 'Фриц Перлз, Лаура Перлз, Ирвин Ялом, Клаудио Наранхо, Серж Гингер',
    'Схема-терапия': 'Джеффри Янг, Арнуд Арнтц, Венди Бехари',
    'ACT': 'Стивен Хайес, Расс Хэррис, Стросал',
    'Экзистенциальный': 'Ялом, Франкл, Ролло Мэй, ван Дорцен, Бьюдженталь',
    'ЭФТ': 'Сью Джонсон, Лесли Гринберг',
    'EMDR': 'Франсин Шапиро, ван дер Колк',
    'Нарративная терапия': 'Майкл Уайт, Дэвид Эпстон',
    'Телесно-ориентированная': 'Райх, Лоуэн, Питер Левин, Порджес, Габор Матэ',
    'Арт-терапия': 'Эдит Крамер, Наумбург',
  }

  const parts: string[] = []
  for (const approach of approaches) {
    const key = Object.keys(authors).find(
      k =>
        approach.toLowerCase().includes(k.toLowerCase()) ||
        k.toLowerCase().includes(approach.toLowerCase())
    )
    if (key) parts.push(authors[key])
  }

  parts.push(
    'Универсальные: Карл Роджерс, Ирвин Ялом, Виктор Франкл, Эрих Фромм, Габор Матэ, Бессел ван дер Колк, Брене Браун'
  )

  return parts.join('\n')
}

export async function POST(request: NextRequest) {
  try {
    const { action } = await request.json()

    // Роут на service_role (обходит RLS), поэтому владельца проверяем ЯВНО:
    // userId берём только из проверенной сессии — все запросы к БД идут по user.id.
    const user = await getSessionUser()
    if (!user) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
    const userId = user.id

    const supabaseAdmin = getSupabaseAdmin()

    if (action === 'fetch') {
      const { data } = await supabaseAdmin
        .from('researched_topics')
        .select('topics')
        .eq('user_id', userId)
        .single()
      return NextResponse.json({ topics: data?.topics || [] })
    }

    const [profileRes, passportRes] = await Promise.all([
      supabaseAdmin.from('onboarding_profiles').select('*').eq('user_id', userId).single(),
      supabaseAdmin.from('brand_passports').select('content').eq('user_id', userId).single(),
    ])

    const profile = profileRes.data
    if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

    const passport = passportRes.data?.content || ''
    const approaches = Array.isArray(profile.approaches) ? profile.approaches : []
    const niches = Array.isArray(profile.niches) ? profile.niches : []

    const profileContext = buildProfileContext(profile)
    const approachFocus = getApproachResearchFocus(approaches)
    const authorsList = getApproachAuthors(approaches)

    const prompt = `Ты — глубокий исследователь контента для практикующего психолога. Текущий период: 2026 год.

${profileContext}

${passport ? `ПАСПОРТ БРЕНДА:\n${passport.substring(0, 1000)}` : ''}

═══════════════════════════════════════
ЗАДАНИЕ: Найди 30 тем для контента
═══════════════════════════════════════

Проведи веб-поиск и найди 30 тем, разделённых на 3 блока:

═══════════════════════════════════════
БЛОК А: ТРЕНДОВЫЕ ТЕМЫ (12 тем)
═══════════════════════════════════════
Темы которые ПРЯМО СЕЙЧАС обсуждаются в 2026:
- Вирусные обсуждения в Telegram-каналах психологов
- Тренды Reels/TikTok в нише mental health
- Горячие запросы по теме "${niches.join(' + ')}"
- Резонансные события, статьи, подкасты последних месяцев
- Новые термины (doom scrolling, bed rotting, brain rot, delulu — только актуальные)

ПРИВЯЖИ к нише психолога: ${niches.join(', ')}
ПРИВЯЖИ к подходу: ${approaches.join(', ')}

═══════════════════════════════════════
БЛОК Б: ИССЛЕДОВАНИЯ И СВЕЖИЕ ДАННЫЕ ПО ПОДХОДУ (10 тем)
═══════════════════════════════════════

Найди РЕАЛЬНЫЕ, ПРОВЕРЯЕМЫЕ данные по подходу этого психолога:

${approachFocus}

Для каждого:
- Авторы или университет
- Год публикации и журнал (если есть)
- Главный вывод
- Как подать для неспециалистов (угол для поста)

Ищи в рецензируемых журналах: Nature, Lancet Psychiatry, JAMA Psychiatry, Psychological Science, Frontiers in Psychology, Journal of Clinical Psychology, Psychotherapy Research и др.

Также ищи:
- Свежие мета-анализы по подходу
- Новые данные об эффективности метода
- Контринтуитивные находки
- Исследования которые РАЗРУШАЮТ мифы

═══════════════════════════════════════
БЛОК В: ЦИТАТЫ И ИДЕИ ВЕЛИКИХ (8 тем)
═══════════════════════════════════════

Найди МАЛОИЗВЕСТНЫЕ (не заезженные!) цитаты от:

${authorsList}

Требования:
- ТОЧНАЯ цитата на русском (или качественный перевод)
- Автор и источник (книга, лекция, год)
- НЕ заезженные цитаты
- Провокационные, парадоксальные, вдохновляющие
- Которые можно превратить в целый пост
- Связанные с нишой: ${niches.join(', ')}

═══════════════════════════════════════
КРИТЕРИИ ОТБОРА ВСЕХ 30 ТЕМ
═══════════════════════════════════════
1. УНИКАЛЬНЫЙ УГОЛ — не банальные темы которые все пишут
2. ПРИВЯЗКА к подходу ${approaches.join(', ')} и нише ${niches.join(', ')}
3. ЭТИЧНОСТЬ — никаких диагнозов, гарантий
4. ПРИМЕНИМОСТЬ — тема должна превращаться в конкретный пост

ХУКИ:
- НЕ "А вы знали...?", НЕ "5 признаков...", НЕ "10 способов..."
- ИСПОЛЬЗУЙ: парадокс, провокация, узнавалка, шокирующий факт, вопрос-зеркало

ФОРМАТ ОТВЕТА — строго JSON массив из 30 объектов (без текста вне массива, без markdown):
[
  {
    "id": 1,
    "block": "trend",
    "topic": "Конкретная тема",
    "hook": "Готовый хук — первые 2-3 строки поста",
    "pillar": "Психообразование / Истории / Личное / Практика / Позиционирование",
    "why": "Почему зайдёт аудитории этого психолога",
    "format": "post / carousel / reels / stories",
    "source": "trend: откуда тренд. science: авторы, журнал, год, вывод. quote: автор, точная цитата, источник",
    "cta": "сохранить / переслать / обсудить / записаться"
  }
]

Block строго: "trend" (12 штук), "science" (10 штук), "quote" (8 штук)`

    const result = await generateWithWebSearch(prompt)

    let topics: any[] = []
    try {
      topics = safeParseJSON(result)
    } catch (e: any) {
      console.error('RAW AI RESULT:', result)
      throw new Error('Не удалось распарсить JSON от AI')
    }

    if (!Array.isArray(topics) || topics.length < 15) {
      throw new Error(`AI вернул ${topics?.length || 0} тем вместо 30`)
    }

    await supabaseAdmin
      .from('researched_topics')
      .upsert(
        {
          user_id: userId,
          topics,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      )

    return NextResponse.json({ topics })
  } catch (error: any) {
    console.error('Research topics error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
