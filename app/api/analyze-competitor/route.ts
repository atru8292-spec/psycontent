import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const maxDuration = 9

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const SYSTEM_BASE = `Ты — стратег по контенту для психологов-экспертов. Пиши как живой человек, не как робот. Никаких канцеляризмов. Пиши так, будто объясняешь коллеге за кофе — умно, чётко, по делу.`

const STEP_PROMPTS: Record<number, string> = {
  1: `Проанализируй видео и напиши ТОЛЬКО эти два раздела. Больше ничего не добавляй.

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
[ ] Провокационный вопрос  [ ] Шокирующий факт  [ ] Боль в лоб  [ ] Обещание результата  [ ] История  [ ] Противоречие`,

  2: `Проанализируй видео и напиши ТОЛЬКО этот раздел. Больше ничего не добавляй.

## 🧠 СТРУКТУРА И ПРИЁМЫ

**Формат подачи:**
[Монолог в кадре / закадровый голос / диалог / список / история / до-после]

**Ключевые приёмы:**
- [Приём 1 — название + как используется]
- [Приём 2 — название + как используется]
- [Приём 3 — название + как используется]

**Язык и стиль:**
[Как говорит автор — простой/экспертный/разговорный, какие слова цепляют]`,

  3: `Проанализируй видео и напиши ТОЛЬКО этот раздел. Больше ничего не добавляй.

## 💡 ЧТО ВЗЯТЬ ПСИХОЛОГУ

Не копировать — адаптировать под себя:

- **[Приём]** → [Как именно применить психологу, конкретная тема]
- **[Формулировка]** → [Как переформулировать под психологическую нишу]
- **[Структура]** → [Как использовать эту же структуру для своей темы]`,

  4: `На основе видео напиши ТОЛЬКО готовый сценарий. Больше ничего не добавляй.

## ✍️ ГОТОВЫЙ СЦЕНАРИЙ ДЛЯ ПСИХОЛОГА

*Адаптация под психолога-эксперта. Живой текст, не шаблон.*

**[0:00–0:03] ХУК — зацепи сразу:**
[Конкретная фраза — готовый текст]

**[0:03–0:08] БОЛЬ — попади в точку:**
[Конкретное описание проблемы, как её чувствует клиент]

**[0:08–0:22] ЦЕННОСТЬ — дай реальную пользу:**
[Основной контент — инсайт, техника, смена угла зрения]

**[0:22–0:28] ДОВЕРИЕ — покажи экспертность:**
[1-2 предложения, почему тебе можно верить — без хвастовства]

**[0:28–0:30] CTA — скажи что делать:**
[Конкретный призыв: сохранить / написать / ответить на вопрос]`,
}

export async function POST(request: NextRequest) {
  try {
    // 1. Авторизация
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), { status: 401 })
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
    }

    // 2. Парсим тело
    const reqBody = await request.json()
    const { url, transcript, platform, step, collectedAnalysis = '' } = reqBody

    // 3. Валидация
    if (!transcript || transcript.trim().length < 20) {
      return new Response(JSON.stringify({ error: 'Транскрипция обязательна' }), { status: 400 })
    }

    const stepNum = Number(step)
    if (!stepNum || !STEP_PROMPTS[stepNum]) {
      return new Response(JSON.stringify({ error: 'Неверный шаг. Передай step: 1 | 2 | 3 | 4' }), { status: 400 })
    }

    // 4. Модель
    const { data: userSettings } = await supabaseAdmin
      .from('user_settings')
      .select('preferred_model')
      .eq('user_id', user.id)
      .maybeSingle()

    const model = reqBody.model
      || userSettings?.preferred_model
      || 'anthropic/claude-sonnet-4-5'

    // 5. Формируем промт
    const userPrompt = `Платформа: ${platform || 'Unknown'}

Транскрипция видео:
${transcript}

${STEP_PROMPTS[stepNum]}`

    // 6. Запрос к OpenRouter
    const openRouterRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://psycontent.vercel.app',
        'X-Title': 'PsyContent',
      },
      body: JSON.stringify({
        model,
        stream: true,
        messages: [
          { role: 'system', content: SYSTEM_BASE },
          { role: 'user', content: userPrompt }
        ]
      })
    })

    if (!openRouterRes.ok) {
      const errText = await openRouterRes.text()
      return new Response(JSON.stringify({ error: `OpenRouter error: ${errText}` }), { status: 500 })
    }

    // 7. Стримим ответ + на шаге 4 сохраняем в БД
    const encoder = new TextEncoder()
    const isLastStep = stepNum === 4
    let stepText = ''

    const stream = new ReadableStream({
      async start(controller) {
        const reader = openRouterRes.body!.getReader()
        const decoder = new TextDecoder()

        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            const chunk = decoder.decode(value, { stream: true })
            const lines = chunk.split('\n').filter(line => line.trim())

            for (const line of lines) {
              if (!line.startsWith('data: ')) continue
              const data = line.slice(6)
              if (data === '[DONE]') continue

              try {
                const parsed = JSON.parse(data)
                const content = parsed.choices?.[0]?.delta?.content || ''
                if (content) {
                  stepText += content
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content })}\n\n`))
                }
              } catch {
                // пропускаем битые чанки
              }
            }
          }

          // Сохраняем в БД только на последнем шаге
          if (isLastStep && stepText) {
            const fullAnalysis = collectedAnalysis
              ? `${collectedAnalysis}\n\n${stepText}`
              : stepText

            const { error: dbError } = await supabaseAdmin
              .from('competitor_analyses')
              .insert({
                user_id: user.id,
                url: url || '',
                platform: platform || 'Unknown',
                transcript,
                metadata: null,
                analysis: fullAnalysis,
              })

            if (dbError) console.error('DB save error:', dbError)
          }

          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          controller.close()

        } catch (err) {
          console.error('Stream error:', err)
          controller.error(err)
        }
      }
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      }
    })

  } catch (error) {
    console.error('Competitor analysis error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Ошибка анализа' }),
      { status: 500 }
    )
  }
}
