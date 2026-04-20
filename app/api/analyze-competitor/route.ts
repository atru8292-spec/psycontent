import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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
[Конкретная фраза — готовый текст]

**[0:03–0:08] БОЛЬ — попади в точку:**
[Конкретное описание проблемы, как её чувствует клиент]

**[0:08–0:22] ЦЕННОСТЬ — дай реальную пользу:**
[Основной контент — инсайт, техника, смена угла зрения]

**[0:22–0:28] ДОВЕРИЕ — покажи экспертность:**
[1-2 предложения, почему тебе можно верить — без хвастовства]

**[0:28–0:30] CTA — скажи что делать:**
[Конкретный призыв: сохранить / написать / ответить на вопрос]

---

Тон: экспертный, но живой. Никакого AI-текста. Говори как человек.`

export async function POST(request: NextRequest) {
  try {
    // 1. Авторизация
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), { 
        status: 401 
      })
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
    }

    // 2. Парсим тело
    const reqBody = await request.json()
    const { url, transcript, platform } = reqBody

    if (!transcript || transcript.trim().length < 20) {
      return new Response(JSON.stringify({ error: 'Транскрипция обязательна' }), { 
        status: 400 
      })
    }

    // 3. Настройки пользователя
    const { data: userSettings } = await supabaseAdmin
      .from('user_settings')
      .select('preferred_model')
      .eq('user_id', user.id)
      .maybeSingle()

    const model = reqBody.model
      || userSettings?.preferred_model
      || 'anthropic/claude-sonnet-4-5'

    const userPrompt = `Платформа: ${platform || 'Unknown'}

Транскрипция видео конкурента:
${transcript}

Сделай глубокий разбор. Найди что реально работает — хук, структуру, язык, эмоцию. Дай готовый адаптированный сценарий для психолога. Пиши живо, без воды.`

    // 4. Стриминг-запрос к OpenRouter
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
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt }
        ]
      })
    })

    if (!openRouterRes.ok) {
      const errText = await openRouterRes.text()
      return new Response(JSON.stringify({ error: `OpenRouter error: ${errText}` }), { 
        status: 500 
      })
    }

    // 5. Стримим ответ клиенту + собираем полный текст для сохранения
    const encoder = new TextEncoder()
    let fullText = ''

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
                  fullText += content
                  // Отправляем клиенту в формате SSE
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content })}\n\n`))
                }
              } catch {
                // пропускаем битые чанки
              }
            }
          }

          // Сохраняем в БД после завершения стрима
          if (fullText) {
            await supabaseAdmin.from('competitor_analyses').insert({
              user_id: user.id,
              url: url || '',
              platform: platform || 'Unknown',
              transcript,
              metadata: null,
              analysis: fullText,
            }).then(({ error }) => {
              if (error) console.error('DB save error:', error)
            })
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
