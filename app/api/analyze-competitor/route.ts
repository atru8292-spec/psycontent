import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { canConsume, commitConsume, recordFailure, recordRefusal, type Decision } from '@/lib/energy'

export const maxDuration = 60

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const SYSTEM_BASE = `Ты — стратег по контенту для психологов-экспертов. Пиши как живой человек, не как робот. Никаких канцеляризмов. Пиши так, будто объясняешь коллеге за кофе — умно, чётко, по делу.`

const STEP_PROMPTS: Record<number, string> = {
  1: `Проанализируй видео и напиши ТОЛЬКО эти два раздела. Больше ничего не добавляй.\n\n## 🔍 ЧТО ПРОИСХОДИТ В ЭТОМ ВИДЕО\n\n**Суть за одно предложение:**\n[Одна фраза — о чём это видео на самом деле]\n\n**Эмоция, которую оно вызывает:**\n[Что чувствует зритель: узнаёт себя / злится / вдохновляется / боится пропустить]\n\n**Почему это смотрят до конца:**\n[Конкретный механизм удержания — интрига, боль, история, провокация]\n\n---\n\n## ⚡ АНАТОМИЯ ХУКА\n\n**Первые 3 секунды:**\n[Дословно или близко к тексту — что говорится/показывается]\n\n**Почему это работает:**\n[Психологический механизм: страх, любопытство, узнавание, противоречие]\n\n**Тип хука:**\n[ ] Провокационный вопрос  [ ] Шокирующий факт  [ ] Боль в лоб  [ ] Обещание результата  [ ] История  [ ] Противоречие`,

  2: `Проанализируй видео и напиши ТОЛЬКО этот раздел. Больше ничего не добавляй.\n\n## 🧠 СТРУКТУРА И ПРИЁМЫ\n\n**Формат подачи:**\n[Монолог в кадре / закадровый голос / диалог / список / история / до-после]\n\n**Ключевые приёмы:**\n- [Приём 1 — название + как используется]\n- [Приём 2 — название + как используется]\n- [Приём 3 — название + как используется]\n\n**Язык и стиль:**\n[Как говорит автор — простой/экспертный/разговорный, какие слова цепляют]`,

  3: `Проанализируй видео и напиши ТОЛЬКО этот раздел. Больше ничего не добавляй.\n\n## 💡 ЧТО ВЗЯТЬ ПСИХОЛОГУ\n\nНе копировать — адаптировать под себя:\n\n- **[Приём]** → [Как именно применить психологу, конкретная тема]\n- **[Формулировка]** → [Как переформулировать под психологическую нишу]\n- **[Структура]** → [Как использовать эту же структуру для своей темы]`,

  4: `На основе видео напиши ТОЛЬКО готовый сценарий. Больше ничего не добавляй.\n\n## ✍️ ГОТОВЫЙ СЦЕНАРИЙ ДЛЯ ПСИХОЛОГА\n\n*Адаптация под психолога-эксперта. Живой текст, не шаблон.*\n\n**[0:00–0:03] ХУК — зацепи сразу:**\n[Конкретная фраза — готовый текст]\n\n**[0:03–0:08] БОЛЬ — попади в точку:**\n[Конкретное описание проблемы, как её чувствует клиент]\n\n**[0:08–0:22] ЦЕННОСТЬ — дай реальную пользу:**\n[Основной контент — инсайт, техника, смена угла зрения]\n\n**[0:22–0:28] ДОВЕРИЕ — покажи экспертность:**\n[1-2 предложения, почему тебе можно верить — без хвастовства]\n\n**[0:28–0:30] CTA — скажи что делать:**\n[Конкретный призыв: сохранить / написать / ответить на вопрос]`,
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

    // Энергия: один анализ = одно списание, делаем его на шаге 1 (шаги 2-4 — продолжение).
    let energyDecision: Decision | null = null
    if (stepNum === 1) {
      energyDecision = await canConsume(user.id, 'competitor_deep')
      if (!energyDecision.ok) {
        await recordRefusal(user.id, 'competitor_deep')
        return new Response(JSON.stringify({ error: energyDecision.message }), { status: 402 })
      }
    }

    // 4. Модель
    const { data: userSettings } = await supabaseAdmin
      .from('user_settings')
      .select('preferred_model')
      .eq('user_id', user.id)
      .maybeSingle()

    // Одна модель OpenAI (выбор модели у пользователя убран по ТЗ)
    const model = 'gpt-5.4'
    void userSettings

    // 5. Формируем промт
    const userPrompt = `Платформа: ${platform || 'Unknown'}\n\nТранскрипция видео:\n${transcript}\n\n${STEP_PROMPTS[stepNum]}`

    // 6. Запрос к OpenRouter
    const openRouterRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
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
      if (stepNum === 1 && energyDecision) await recordFailure(user.id, 'competitor_deep')
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

          // успех шага 1 = анализ отработал → списываем энергию один раз за весь анализ
          if (stepNum === 1 && energyDecision) {
            await commitConsume(user.id, 'competitor_deep', energyDecision)
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
          if (stepNum === 1 && energyDecision) await recordFailure(user.id, 'competitor_deep')
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
