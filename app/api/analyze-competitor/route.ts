import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { canConsume, commitConsume, recordFailure, recordRefusal, logAiUsage, type Decision } from '@/lib/energy'
import { anonymize, deanonymize, safeRestoredPrefix } from '@/lib/anonymize'
import { iterateSSEData } from '@/lib/sse-stream'
import { checkContinuation, hashTranscript, supabaseRunStore, RUN_TEXTS, type ContinuationStep } from '@/lib/competitor-run'
import { errTag } from '@/lib/limit-gate'

// Мягкий текст сбоя модели (12.11): сырой ответ OpenAI и текст исключения человеку не уходят.
const SOFT_FAIL = 'Разбор не получился из-за сбоя. Попробуй еще раз через минуту.'
const json = (body: Record<string, unknown>, status: number, headers?: Record<string, string>) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...(headers || {}) } })

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
    const { url, transcript, platform, step, collectedAnalysis = '', analysisId } = reqBody

    // 3. Валидация
    if (typeof transcript !== 'string' || transcript.trim().length < 20) {
      return new Response(JSON.stringify({ error: 'Транскрипция обязательна' }), { status: 400 })
    }

    const stepNum = Number(step)
    if (!stepNum || !STEP_PROMPTS[stepNum]) {
      return new Response(JSON.stringify({ error: 'Неверный шаг. Передай step: 1 | 2 | 3 | 4' }), { status: 400 })
    }

    // Энергия: один анализ = одно списание, делаем его на шаге 1 (шаги 2-4 — продолжение).
    // Шаги 2-4 только с id оплаченного шага 1 этого же разбора (lib/competitor-run.ts, 12.11).
    const runs = supabaseRunStore(supabaseAdmin)
    let energyDecision: Decision | null = null
    let runId: string | null = null
    let claimedStep: ContinuationStep | null = null
    if (stepNum === 1) {
      energyDecision = await canConsume(user.id, 'competitor_deep')
      if (!energyDecision.ok) {
        await recordRefusal(user.id, 'competitor_deep')
        return json({ error: energyDecision.message, code: energyDecision.reason || 'limit' }, 402)
      }
      // строка разбора до модели: без нее продолжения не будет, поэтому и энергию не берем
      runId = await runs.create(user.id, hashTranscript(transcript))
      if (!runId) return json({ error: RUN_TEXTS.startFailed, code: 'run_start_failed' }, 503)
    } else {
      const check = await checkContinuation(runs, { runId: analysisId, userId: user.id, transcript, step: stepNum as ContinuationStep })
      if (!check.ok) return json({ error: check.message, code: check.code, limit: check.status === 402 || check.status === 403 }, check.status)
      runId = analysisId as string
      claimedStep = stepNum as ContinuationStep
    }
    // модель упала: энергию не берем, факт в журнал, занятый шаг освобождаем (повтор с тем же id пройдет)
    const onModelFail = async () => {
      try { await recordFailure(user.id, 'competitor_deep') } catch (e) { console.warn('recordFailure:', errTag(e)) }
      if (claimedStep && runId) await runs.releaseStep(runId, user.id, claimedStep)
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

    // 5. Формируем промт + обезличиваем перед OpenAI (восстановим в потоке/сохранении)
    const userPrompt = `Платформа: ${platform || 'Unknown'}\n\nТранскрипция видео:\n${transcript}\n\n${STEP_PROMPTS[stepNum]}`
    const { masked: maskedUserPrompt, map: anonMap } = anonymize(userPrompt)

    // 6. Запрос к OpenRouter
    // сеть до OpenAI упала (fetch бросил): тот же мягкий сбой, шаг освобождаем
    let openRouterRes: Response
    try {
      openRouterRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          stream: true,
          stream_options: { include_usage: true },
          messages: [
            { role: 'system', content: SYSTEM_BASE },
            { role: 'user', content: maskedUserPrompt }
          ]
        })
      })
    } catch (e) {
      console.error('Competitor analysis fetch error:', errTag(e))
      await onModelFail()
      return json({ error: SOFT_FAIL, code: 'model_error' }, 502)
    }

    if (!openRouterRes.ok) {
      console.error('Competitor analysis model error:', openRouterRes.status)
      await onModelFail()
      return json({ error: SOFT_FAIL, code: 'model_error' }, 502)
    }

    // 7. Стримим ответ + на шаге 4 сохраняем в БД
    const encoder = new TextEncoder()
    const isLastStep = stepNum === 4
    let stepText = ''

    const stream = new ReadableStream({
      async start(controller) {
        const reader = openRouterRes.body!.getReader()
        let maskedStep = ''
        let sentLen = 0
        let usage: any = undefined

        try {
          // Буферизованный разбор SSE: символы и дельты не теряются на стыках кусков.
          for await (const data of iterateSSEData(reader)) {
            try {
              const parsed = JSON.parse(data)
              if (parsed.usage) usage = parsed.usage
              const content = parsed.choices?.[0]?.delta?.content || ''
              if (content) {
                maskedStep += content
                const safe = safeRestoredPrefix(maskedStep, anonMap)
                const toSend = safe.slice(sentLen)
                if (toSend) {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: toSend })}\n\n`))
                  sentLen = safe.length
                }
              }
            } catch {
              // пропускаем битые чанки
            }
          }

          // восстановленный текст шага (имена/контакты возвращены)
          stepText = deanonymize(maskedStep, anonMap)
          const tail = stepText.slice(sentLen)
          if (tail) controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: tail })}\n\n`))

          // запись реального расхода токенов LLM-шага
          await logAiUsage(user.id, 'competitor_deep', 'gpt-5.4', usage)

          // успех шага 1 = анализ отработал → списываем энергию один раз за весь анализ
          // оплачен = списание прошло; только тогда шаги 2-4 пустят по этому id
          if (stepNum === 1 && energyDecision && runId) {
            const paid = await commitConsume(user.id, 'competitor_deep', energyDecision)
            if (paid.ok) {
              if (!(await runs.markPaid(runId, user.id))) console.warn('competitor_runs: оплата не отмечена')
            } else {
              console.warn('competitor_deep: списание не прошло, продолжения не будет')
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

            if (dbError) console.error('DB save error:', errTag(dbError))
          }

          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          controller.close()

        } catch (err) {
          console.error('Stream error:', errTag(err))
          await onModelFail()
          controller.error(err)
        }
      }
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        ...(stepNum === 1 && runId ? { 'X-Analysis-Id': runId } : {}),
      }
    })

  } catch (error) {
    console.error('Competitor analysis error:', errTag(error))
    return json({ error: SOFT_FAIL, code: 'server_error' }, 500)
  }
}
