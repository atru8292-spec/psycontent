import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateWithAI } from '@/lib/openrouter'
import { buildProfileContext } from '@/lib/profile-context'
import { getSessionUser } from '@/lib/auth'

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function getApproachReelsStyle(approaches: string[]): string {
  const styles: Record<string, string> = {
    'КПТ': 'КПТ-рилс: покажи когнитивное искажение в действии. "Ты думаешь X → чувствуешь Y → делаешь Z. А если подумать иначе?" Структура, конкретика, цепочка.',
    'Психоанализ': 'Психоаналитический рилс: медленный, глубокий, с вопросом без ответа. "Ты выбираешь его не потому что любишь. А потому что он похож на того, кто не долюбил." Пауза.',
    'Гештальт': 'Гештальт-рилс: через тело и ощущения. "Где у тебя напряжение прямо сейчас? Вот. Это и есть ответ." Вовлечение зрителя в опыт.',
    'Схема-терапия': 'Схема-рилс: покажи режим как персонажа. "Внутренний Критик говорит: ты недостаточен. Заботливый Взрослый отвечает: ты сделал что мог."',
    'ACT': 'ACT-рилс: парадокс. "Чем сильнее пытаешься не тревожиться, тем больше тревога. Перестань бороться. Иди туда, где важно."',
    'Экзистенциальный': 'Экзистенциальный рилс: большой вопрос + тишина. "А что если кризис не конец? Что если это единственный шанс стать собой?"',
    'ЭФТ': 'ЭФТ-рилс: про скрытые эмоции в паре. "Он молчит. Она думает ему все равно. На самом деле он в ужасе что она уйдет."',
    'EMDR': 'EMDR-рилс: застрявшее воспоминание. "5 лет прошло. Но тело реагирует так, будто это сейчас. Вот почему."',
    'Нарративная терапия': 'Нарративный рилс: "Тревога это не ты. Это персонаж в твоей истории, и ты можешь переписать сценарий."',
    'Телесно-ориентированная': 'ТОТ-рилс: через тело. "Твоя челюсть сжата. С 7 лет. Тогда плакать было нельзя. Сейчас можно." + дыхательная практика.',
    'Арт-терапия': 'Арт-рилс: покажи процесс. "Она не знала что сказать. Я дала ей краски. Она нарисовала черное. Вся правда на бумаге."',
  }

  const parts: string[] = []
  for (const approach of approaches) {
    const key = Object.keys(styles).find(k =>
      approach.toLowerCase().includes(k.toLowerCase()) || k.toLowerCase().includes(approach.toLowerCase())
    )
    if (key) parts.push(styles[key])
  }

  return parts.length > 0 ? parts.join('\n') : 'Интегративный: комбинируй подходы, сохраняя авторский голос.'
}

const getLengthInstruction = (length: string) => {
  if (length === '30s') {
    return `ХРОНОМЕТРАЖ: ~30 секунд (максимум 80 слов произносимого текста)
Структура: Хук → Суть → Финал
Темп: быстрый, динамичный, каждое слово на вес золота.`
  }
  return `ХРОНОМЕТРАЖ: ~60 секунд (максимум 160 слов произносимого текста)
Структура: Хук → Микро-история или разбор механизма → Инсайт → Финал
Темп: можно глубже, с паузами, с историей.`
}

const getStyleInstruction = (style: string) => {
  if (style === 'talking_head') {
    return `ФОРМАТ СЪЕМКИ: Говорящая голова
- Пиши так, чтобы психолог произнес это на камеру ЕСТЕСТВЕННО
- Укажи эмоции и паузы в скобках: (пауза), (тише), (смотрит в камеру), (улыбается)
- Речевые обороты должны быть УСТНЫМИ, не письменными
- Не пиши то, что неудобно произнести вслух`
  }
  if (style === 'text_on_screen') {
    return `ФОРМАТ СЪЕМКИ: Текст на экране (без лица)
- Психолог НЕ говорит. Атмосферное видео + плашки с текстом
- Каждая плашка: 3-7 слов максимум
- Опиши что в кадре (атмосфера, действия, свет)
- Текст появляется ритмично, с паузами между плашками`
  }
  return `ФОРМАТ СЪЕМКИ: Закадровый голос (Voiceover)
- Текст для начитки голосом за кадром
- Отдельно: описание видеоряда (что показывать пока звучит голос)
- Голос спокойный, интимный, как будто говоришь на ухо`
}

const SYSTEM_PROMPT = `Ты пишешь сценарии Reels за практикующего психолога, его голосом, чтобы цепляло с первой секунды через узнавание, а не приманку. Психолог может не любить камеру, предлагай форматы без лица. Опирайся на его голос из паспорта. Текст и реплики пиши от первого лица самого психолога, он автор, а не герой. Не упоминай его в третьем лице (по имени, «психолог», «она»). Пиши букву «е» вместо «ё», без тире.

═══════════════════════════════
ЖЕЛЕЗНЫЕ ПРАВИЛА
═══════════════════════════════

1. 1 секунда видео = 2-3 слова. НЕ ПИШИ ДЛИННЫЕ МОНОЛОГИ.
2. Хук в первые 3 секунды, иначе зритель свайпнет.
3. Пиши в ТОЧНОМ тоне психолога из профиля.
4. Обращайся так, как указано (ты/вы).

ЗАПРЕЩЕНО:
- "вы не одиноки", "путешествие к себе", "обретите гармонию"
- "поделитесь в комментариях", "подпишитесь чтобы не пропустить"
- "в современном мире", "каждый из нас"
- Абстрактные формулировки. Только конкретика: "когда крутит живот перед звонком" вместо "при социофобии"

ФОРМУЛЫ ХУКОВ ДЛЯ REELS:
- Парадокс: "Чем больше стараешься уснуть, тем хуже спишь"
- Узнавалка: "Третий раз проверяешь закрыта ли дверь? Это не забывчивость"
- Провокация: "Психолог не сделает тебе лучше. Вот что он сделает на самом деле"
- Шок-факт: "Твой мозг прямо сейчас врет тебе. И ты ему веришь"
- Вопрос: "Почему ты выбираешь людей, которые причиняют боль?"

ФИНАЛ (мягкое приглашение):
- "Сохрани, пригодится в 3 часа ночи"
- Просто вопрос: "А у тебя так было?"
- "Отзовись, если это про тебя"
- "Напиши, как у тебя с этим"

ФОРМАТ ВЫВОДА:
Строго блоки в квадратных скобках. Без текста вне блоков, без предисловий.`

export async function POST(req: NextRequest) {
  try {
    const reqBody = await req.json()
    const { topic, customTopic, videoLength, videoStyle, pillar } = reqBody

    // userId берём ТОЛЬКО из проверенной сессии в куках, не из тела запроса.
    const user = await getSessionUser()
    if (!user) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
    const userId = user.id

    const finalTopic = customTopic || topic
    if (!finalTopic) return NextResponse.json({ error: 'Не указана тема видео' }, { status: 400 })

    const supabase = getSupabaseAdmin()

    const [profileRes, passportRes] = await Promise.all([
      supabase.from('onboarding_profiles').select('*').eq('user_id', userId).single(),
      supabase.from('brand_passports').select('content').eq('user_id', userId).single()
    ])

    const profile = profileRes.data || {}
    const passport = typeof passportRes.data?.content === 'string' ? passportRes.data.content : (passportRes.data?.content ? JSON.stringify(passportRes.data.content) : '')
    const approaches = Array.isArray(profile.approaches) ? profile.approaches : []

    const profileContext = buildProfileContext(profile)
    const approachStyle = getApproachReelsStyle(approaches)

    const prompt = `${profileContext}

${passport ? `ПАСПОРТ БРЕНДА:\n${passport.substring(0, 600)}` : ''}

═══════════════════════════════
СТИЛЬ ПОДХОДА
═══════════════════════════════
${approachStyle}

═══════════════════════════════
ЗАДАНИЕ: СЦЕНАРИЙ ВИДЕО
═══════════════════════════════

${pillar ? `Рубрика: ${pillar}` : ''}
Тема: ${finalTopic}

${getLengthInstruction(videoLength)}

${getStyleInstruction(videoStyle)}

ВАЖНО:
- Обращение к читателю: на ты или на вы по тону психолога, НЕ по имени (имя в профиле это автор, а не читатель)
- Голос бренда: ${profile.live_voice || ''}
- Антиценности (ИЗБЕГАЙ): ${Array.isArray(profile.anti_values) ? profile.anti_values.join(', ') : ''}
- Боли клиента (ИСПОЛЬЗУЙ в хуке): ${profile.client_pain_phrases || ''}

ПРИМЕРЫ ОФОРМЛЕНИЯ:

Говорящая голова:
[Кадр] Сидите в кресле, теплый свет, камера на уровне глаз
[Хук] (смотрит в камеру) Знаете что общего между вашей тревогой и сигнализацией?
[Суть] (спокойно, чуть наклонившись) Оба срабатывают когда нет реальной угрозы...
[Финал] (пауза, улыбка) Сохрани. Пригодится в 3 часа ночи.

Текст на экране:
[Кадр] Идете по улице в наушниках, камера сзади
[Плашка 1] Ты не ленивый.
[Плашка 2] У тебя просто кончился дофамин.
[Плашка 3] И вот почему.
[Финал] Знакомо? Напиши, как у тебя.

Закадровый голос:
[Видеоряд] Чашка кофе, пар, рука листает телефон
[Голос] Если ты читаешь это в 2 часа ночи...
[Видеоряд] Темная комната, свет экрана
[Голос] ...значит твой мозг не может остановиться...
[Финал] Сохрани. Утром перечитаешь.

Выдай готовый скрипт. Без предисловий.`
    // Получаем предпочитаемую модель пользователя
    const { data: userSettings } = await supabase
      .from('user_settings')
      .select('preferred_model')
      .eq('user_id', userId)
      .maybeSingle()
    const model = reqBody.model || userSettings?.preferred_model || 'anthropic/claude-sonnet-4-5'


    const script = await generateWithAI(SYSTEM_PROMPT, prompt, { userId, operation: 'generate_reels', knownNames: profile?.full_name ? [profile.full_name] : undefined })

    try {
      await supabase.from('generated_posts').insert({
        user_id: userId,
        topic: finalTopic,
        format: `reels (${videoLength}, ${videoStyle})`,
        content: script,
        category: pillar || 'Своя тема'
      })
    } catch (_) {}

    return NextResponse.json({ script })
  } catch (error: any) {
    console.error('Reels API error:', error)
    return NextResponse.json({ error: `Не удалось сгенерировать скрипт: ${error?.message || error}` }, { status: 500 })
  }
}
