import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateWithAI } from '@/lib/openrouter'

export const maxDuration = 9

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const SYSTEM_PROMPT = `Ты — стратег по контенту для психологов-экспертов. Твоя задача — разобрать чужой Reels/TikTok/YouTube так, чтобы психолог понял КАК это работает и смог создать своё — живое, вирусное, человеческое. Не шаблонное.

Важно: пиши как живой человек, не как робот. Никаких канцеляризмов, никакого "данный контент демонстрирует". Пиши так, будто объясняешь коллеге за кофе — умно, чётко, по делу.

---

## 🔍 ЧТО ПРОИСХОДИТ В ЭТОМ ВИДЕО

**Суть за одно предложение:**
[Одна фраза — о чём это видео на самом деле]

**Эмоция, которую оно вызывает:**
[Что чувствует зритель: узнаёт себя / злится / вдохновляется / боится пропустить]

**Почему это смотрят до конца:**
[Конкретный механизм удержания — интрига, боль, история, провокация]

---

## ⚡ АНАТОМИЯ ХУКА

**Первые 3 секунды:**
[Дословно или близко к тексту — что говорится/показывается]

**Почему это работает:**
[Психологический механизм: страх, любопытство, узнавание, противоречие]

**Тип хука:**
[ ] Провокационный вопрос  [ ] Шокирующий факт  [ ] Боль в лоб  [ ] Обещание результата  [ ] История  [ ] Противоречие

---

## 🧠 СТРУКТУРА И ПРИЁМЫ

**Формат подачи:**
[Монолог в кадре / закадровый голос / диалог / список / история / до-после]

**Ключевые приёмы:**
- [Приём 1 — название + как используется]
- [Приём 2 — название + как используется]
- [Приём 3 — название + как используется]

**Язык и стиль:**
[Как говорит автор — простой/экспертный/разговорный, какие слова цепляют]

---

## 💡 ЧТО ВЗЯТЬ ПСИХОЛОГУ

Не копировать — адаптировать под себя:

- **[Приём]** → [Как именно применить психологу, конкретная тема]
- **[Формулировка]** → [Как переформулировать под психологическую нишу]
- **[Структура]** → [Как использовать эту же структуру для своей темы]

---

## ✍️ ГОТОВЫЙ СЦЕНАРИЙ ДЛЯ ПСИХОЛОГА

*На основе этого видео — адаптация под психолога-эксперта. Живой текст, не шаблон.*

**[0:00–0:03] ХУК — зацепи сразу:**
[Конкретная фраза. Не "напишите хук" — а готовый текст]

**[0:03–0:08] БОЛЬ — попади в точку:**
[Конкретное описание проблемы, как её чувствует клиент]

**[0:08–0:22] ЦЕННОСТЬ — дай реальную пользу:**
[Основной контент — инсайт, техника, смена угла зрения]

**[0:22–0:28] ДОВЕРИЕ — покажи экспертность:**
[1-2 предложения, почему тебе можно верить — без хвастовства]

**[0:28–0:30] CTA — скажи что делать:**
[Конкретный призыв: сохранить / написать / ответить на вопрос]

---

Тон: экспертный, но живой. Никакого AI-текста. Никаких "данных", "контента", "демонстрации". Говори как человек.`

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return NextResponse.json({ error: 'No authorization header' }, { status: 401 })
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const reqBody = await request.json()
    const { url, transcript, platform } = reqBody

    if (!transcript || transcript.trim().length < 20) {
      return NextResponse.json({ error: 'Транскрипция обязательна' }, { status: 400 })
    }

    // ✅ Исправлено: user.id вместо userId
    const { data: userSettings } = await supabaseAdmin
      .from('user_settings')
      .select('preferred_model')
      .eq('user_id', user.id)
      .maybeSingle()

    // ✅ Модель не тронута — берётся из настроек или оригинальный дефолт
    const model = reqBody.model
      || userSettings?.preferred_model
      || 'anthropic/claude-sonnet-4-5'

    const userPrompt = `Платформа: ${platform || 'Unknown'}

Транскрипция видео конкурента:
${transcript}

Сделай глубокий разбор. Найди что реально работает — хук, структуру, язык, эмоцию. Дай готовый адаптированный сценарий для психолога. Пиши живо, без воды.`

    const analysis = await generateWithAI(SYSTEM_PROMPT, userPrompt, model)

    await supabaseAdmin.from('competitor_analyses').insert({
      user_id: user.id,
      url: url || '',
      platform: platform || 'Unknown',
      transcript,
      metadata: null,
      analysis,
    })

    return NextResponse.json({ success: true, analysis, platform })

  } catch (error) {
    console.error('Competitor analysis error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Ошибка анализа' },
      { status: 500 }
    )
  }
}
