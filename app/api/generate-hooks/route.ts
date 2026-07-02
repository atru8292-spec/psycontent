import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateWithAI } from '@/lib/openrouter'
import { ANTI_SLOP_RULES } from '@/lib/anti-slop'
import { buildProfileContext } from '@/lib/profile-context'
import { getArchetypeContextFromProfile } from '@/lib/archetypes'
import { getSessionUser } from '@/lib/auth'

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env variables')
  return createClient(url, key)
}

const HOOKS_SYSTEM_PROMPT = `Ты помогаешь психологу находить честное цепляющее начало через узнавание (зеркало для читателя), не через фальшивую приманку. Хук в его голосе и под его нишу, одно неожиданное, не дежурное слово. Хуки пиши от первого лица самого психолога, он автор, а не герой. Не упоминай его в третьем лице (по имени, «психолог», «она»). Пиши букву «е» вместо «ё», без тире.

═══════════════════════════════════════════
ЧТО ТАКОЕ ХУК
═══════════════════════════════════════════

Хук это первая фраза, которая ОСТАНАВЛИВАЕТ скролл. У тебя 1.5 секунды.
Хук ≠ цепляющий слоган. Хук это крючок, который создает РАЗРЫВ ЛЮБОПЫТСТВА:
мозг не может НЕ узнать, что дальше.

Психолог Канеман описал две системы мышления:
- Система 1: быстрая, эмоциональная, инстинктивная (реагирует на хуки)
- Система 2: медленная, логическая (включается ПОСЛЕ того, как хук сработал)

Хук должен бить в Систему 1. Три триггера:
✦ ЛЮБОПЫТСТВО: мозг стремится закрыть информационный пробел
✦ ЭМОЦИЯ: радость, боль, удивление, страх упустить (FOMO)
✦ УЗНАВАНИЕ: "это же про меня", социальное доказательство

═══════════════════════════════════════════
12 ТИПОВ ХУКОВ (используй ВСЕ разные)
═══════════════════════════════════════════

1. ПАРАДОКС: переворачивает ожидание
   "Чем больше ты стараешься, тем хуже становится"
   "Самые сильные люди чаще всего в терапии"

2. БОЛЬ / УЗНАВАНИЕ: попадает в нерв, "это про меня"
   "Ты снова извинилась за то, что чувствуешь"
   "Ты не ленивая. Ты просто задолбалась"

3. ВОПРОС: заставляет остановиться и задуматься
   "А что если твоя тревога не враг?"
   "Что бы ты сделала, если бы не боялась осуждения?"

4. ИСТОРИЯ / ИНТРИГА: затягивает, хочется узнать продолжение
   "Вчера клиентка сказала фразу, от которой я замолчала на 10 секунд"
   "Я сделала одну вещь, и очередь из клиентов выстроилась за сутки"

5. ПРОВОКАЦИЯ / УДАРНАЯ ПРАВДА: вызывает реакцию, ломает ментальные сценарии
   "Позитивное мышление разрушает жизни"
   "Богатые не работают больше. Они просто перестали быть удобными"

6. САМОИДЕНТИЧНОСТЬ: "это для таких как я"
   "Если ты из тех, кто все переосмысливает, прочитай это"
   "Это для тихих лидеров"
   "Для тех, кто отказывается сдаваться (даже если устали)"

7. ЦИФРА / ФАКТ: вызывает доверие через конкретику
   "73% женщин в отношениях не могут назвать свои потребности"
   "8 секунд, столько у тебя есть, чтобы зацепить внимание"

8. МЕТАФОРА: создает образ, который не забыть
   "Тревога это пожарная сигнализация, которая сработала в пустой комнате"
   "Ты живешь в режиме «выживание», а называешь это «ответственность»"

9. ПОСТ-ПЕРЕВОРОТ: ломает логику, вызывает внутренний "щелчок"
   "Тебе не нужен план. Тебе нужно разрешение"
   "Не работайте над отношениями. Серьезно"

10. ЛОМАЮЩИЙ ШАБЛОН: запрещающий или предупреждающий
    "Не сохраняй это, ты еще не готова"
    "Забудь все, что тебе говорили об этом"
    "Об этом месте тебя никто не предупреждает"

11. ПРИЗНАНИЕ: личное, уязвимое, шепотом
    "Мне надоело быть сильной"
    "Мне страшно. И я все равно делаю"
    "Я думала, что выгорела. А оказалось, выросла"

12. ПОСТ-ДИАГНОСТИКА: "проверь себя"
    "Если ты часто злишься на успешных, ты просто боишься своей силы"
    "Когда ты извиняешься за себя, деньги не идут"

═══════════════════════════════════════════
ПРАВИЛА СОЗДАНИЯ
═══════════════════════════════════════════

✅ ДА:
- Максимум 12-15 слов в хуке
- Должен работать БЕЗ контекста (увидел в ленте, остановился)
- Каждый хук РАЗНОГО типа из 12 категорий выше
- Писать живым языком, как будто говоришь подруге
- Использовать конкретику вместо абстракций
- Бить в Систему 1 (эмоция, любопытство, узнавание)

❌ НЕТ:
- Без клише ("токсичный", "экологично", "ресурсное состояние", "нутром чую")
- Без канцелярита ("в рамках данного", "на сегодняшний день")
- Без общих фраз ("Все мы знаем...", "В современном мире...")
- Без ChatGPT-штампов ("Давайте разберемся", "Важно отметить")
- Без кликбейта, который не выполняет обещание

═══════════════════════════════════════════
ГДЕ ИСПОЛЬЗОВАТЬ КАЖДЫЙ ХУК
═══════════════════════════════════════════

- REELS: первые 3 секунды (произнести вслух / текст на экране)
- ПОСТ: первая строка (до "еще...")
- КАРУСЕЛЬ: первый слайд (крупно, 5-7 слов)
- STORIES: текст на плашке + стикер-реакция

Один хук может работать в нескольких форматах, укажи ЛУЧШИЙ.

═══════════════════════════════════════════
ФОРМАТ ОТВЕТА: СТРОГО JSON
═══════════════════════════════════════════

[
  {
    "type": "парадокс",
    "hook": "текст хука",
    "use": "reels",
    "why": "почему этот хук работает (1 предложение)"
  },
  ...
]

Генерируй РОВНО 12 хуков, по одному каждого типа.
ТОЛЬКО JSON массив. Без markdown-оберток. Без пояснений до/после JSON.`

export const maxDuration = 45

export async function POST(req: NextRequest) {
  try {
    const reqBody = await req.json()
    const { topic } = reqBody

    // userId берём ТОЛЬКО из проверенной сессии в куках, не из тела запроса.
    const user = await getSessionUser()
    if (!user) {
      return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
    }
    const userId = user.id

    if (!topic) {
      return NextResponse.json({ error: 'Тема не указана' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()

    const [profileRes, passportRes] = await Promise.all([
      supabase.from('onboarding_profiles').select('*').eq('user_id', userId).single(),
      supabase.from('brand_passports').select('content').eq('user_id', userId).single(),
    ])

    const profile = profileRes.data || {}
    const passport = typeof passportRes.data?.content === 'string' ? passportRes.data.content : (passportRes.data?.content ? JSON.stringify(passportRes.data.content) : '')

    let profileContext = ''
    try {
      profileContext = buildProfileContext(profile)
    } catch {
      profileContext = 'Профиль психолога не заполнен.'
    }

    // Архетип автора (тест-распаковка) кормит почерк. Единый хелпер на все генераторы.
    const archetypeContext = getArchetypeContextFromProfile(profile)

    const userPrompt = `
${profileContext}

${passport ? `ПАСПОРТ БРЕНДА (кратко):\n${passport.substring(0, 500)}` : ''}
${archetypeContext ? `
═══════════════════════
АВТОРСКИЙ ПОЧЕРК
═══════════════════════
${archetypeContext}
` : ''}
═══════════════════════
ЗАДАНИЕ
═══════════════════════

ТЕМА: ${topic}

Обращение к читателю: на ты или на вы по тону психолога, НЕ по имени (имя в профиле это автор, а не читатель)

Терапевтический подход: ${
      Array.isArray(profile.approaches) ? profile.approaches.join(', ') : 'не указан'
    }

Ниша: ${profile.one_niche || (Array.isArray(profile.niches) ? profile.niches.join(', ') : 'не указана')}

Избегай: ${
      Array.isArray(profile.anti_values) ? profile.anti_values.join(', ') : 'шаблонность, менторство, поверхностность'
    }

Аватар клиента: ${profile.client_avatar || 'не указан'}
Боли клиента: ${
      Array.isArray(profile.client_pain_phrases) ? profile.client_pain_phrases.join('; ') : profile.client_pain_phrases || 'не указаны'
    }

Сгенерируй 12 хуков (по одному каждого из 12 типов) на эту тему.
Хуки должны звучать в стиле и тоне ЭТОГО психолога, а не generic.
ТОЛЬКО JSON массив.`

    console.log('Generating hooks for topic:', topic)

    const response = await generateWithAI(`${HOOKS_SYSTEM_PROMPT}\n\n${ANTI_SLOP_RULES}`, userPrompt, { userId, operation: 'generate_hooks', knownNames: profile?.full_name ? [profile.full_name] : undefined })

    // Парсим JSON
    let hooks: Array<{ type: string; hook: string; use: string; why: string }>

    try {
      const jsonMatch = response.match(/\[[\s\S]*\]/)
      if (!jsonMatch) throw new Error('No JSON array found in response')
      hooks = JSON.parse(jsonMatch[0])
    } catch (parseError) {
      console.error('Failed to parse hooks JSON:', response.substring(0, 500))
      // Fallback: попробуем разбить на строки
      const lines = response
        .split('\n')
        .filter((l) => l.trim().length > 10 && !l.trim().startsWith('{') && !l.trim().startsWith('['))
      hooks = lines.slice(0, 12).map((line, i) => ({
        type: 'хук',
        hook: line.replace(/^\d+[\.\)]\s*/, '').replace(/^["«»"]|["«»"]$/g, '').trim(),
        use: 'универсальный',
        why: '',
      }))
    }

    if (!hooks || hooks.length < 3) {
      throw new Error('Не удалось сгенерировать хуки. Попробуйте еще раз.')
    }

    // Сохраняем в историю
    try {
      await supabase.from('generated_posts').insert({
        user_id: userId,
        topic,
        format: 'hooks',
        content: JSON.stringify(hooks),
        category: 'Хуки',
      })
    } catch (saveError) {
      console.error('Failed to save hooks to history:', saveError)
      // Не блокируем ответ — хуки всё равно отдаём
    }

    return NextResponse.json({ hooks })
  } catch (error: any) {
    console.error('Generate hooks error:', error)
    return NextResponse.json(
      { error: error?.message || 'Ошибка генерации хуков' },
      { status: 500 }
    )
  }
}
