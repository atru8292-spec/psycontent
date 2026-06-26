import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getSessionUser } from '@/lib/auth'
import { anonymize, deanonymize, safeRestoredPrefix } from '@/lib/anonymize'

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function getApproachBrandGuidance(approaches: string[]): string {
  const guidance: Record<string, string> = {
    'КПТ': `КПТ-бренд: структурный, логичный, практичный. Контент = инструменты. Посты дают технику которую можно применить сегодня. Метафоры: "мысль это гипотеза", "мозг как баг-трекер". Тон: "я покажу как это устроено и что делать".`,
    'Психоанализ': `Психоаналитический бренд: глубокий, метафоричный, исследующий. Контент = инсайты про бессознательное. Посты раскрывают слои. Метафоры: "старая пьеса с новыми актерами", "айсберг". Тон: "давайте посмотрим что стоит за этим".`,
    'Гештальт': `Гештальт-бренд: про чувства, осознанность, вопрошающий. Контент = опыт прямо в тексте. Посты вовлекают через тело и ощущения. Метафоры: "незаконченная мелодия", "прерванный контакт". Тон: "что вы сейчас чувствуете читая это?"`,
    'Схема-терапия': `Схема-бренд: нарративный, с персонажами внутри. Контент = режимы и схемы как герои. Посты показывают откуда паттерн и как переписать. Метафоры: "программа на автопилоте", "внутренние голоса". Тон: тёплый, объясняющий, не осуждающий.`,
    'ACT': `ACT-бренд: ценностный, поэтичный, парадоксальный. Контент = "жить несмотря на боль". Посты про ценности и гибкость. Метафоры: "пассажиры в автобусе", "автобус с монстрами". Тон: "не избавляйся от боли, иди к тому что важно".`,
    'Экзистенциальный': `Экзистенциальный бренд: философский, глубокий, про смысл. Контент = маленькие эссе. Посты про свободу, ответственность, смерть как мотиватор. Метафоры: "человек перед бездной", "проект себя". Тон: спокойный, весомый, без суеты.`,
    'ЭФТ': `ЭФТ-бренд: про эмоции и отношения. Контент = скрытые чувства под поведением. Посты про деструктивные циклы в паре. Метафоры: "танец пары", "безопасная гавань". Тон: "за этим гневом прячется страх потери".`,
    'EMDR': `EMDR-бренд: про переработку и освобождение. Контент = демистификация метода + кейсы до/после. Метафоры: "застрявшее воспоминание", "разморозка памяти". Тон: спокойный, научный, обнадёживающий.`,
    'Нарративная терапия': `Нарративный бренд: про истории и авторство жизни. Контент = экстернализация проблемы. Посты: "тревога это не ты, а персонаж". Метафоры: "книга жизни", "автор и герой". Тон: "вы можете переписать эту историю".`,
    'Телесно-ориентированная': `Телесный бренд: через тело и ощущения. Контент = где в теле живёт эмоция. Посты с практиками прямо в тексте. Метафоры: "панцирь", "тело как хранилище". Тон: "ваше тело помнит то что разум забыл".`,
    'Арт-терапия': `Арт-бренд: визуальный, творческий, метафоричный. Контент = искусство как язык. Посты с приглашением попробовать. Метафоры: "рука знает то что ум не признаёт". Тон: "не нужно уметь рисовать чтобы выразить себя".`,
  }

  const parts: string[] = []
  for (const approach of approaches) {
    const key = Object.keys(guidance).find(k =>
      approach.toLowerCase().includes(k.toLowerCase()) || k.toLowerCase().includes(approach.toLowerCase())
    )
    if (key) parts.push(guidance[key])
  }

  return parts.length > 0
    ? parts.join('\n\n')
    : 'Интегративный бренд: гибкий, берущий лучшее из разных подходов. Нужна чёткая авторская "ось" чтобы не быть "обо всём и ни о чём".'
}

const SYSTEM_PROMPT = `Ты — бренд-стратег с 15-летним опытом работы с психологами.

ЗАДАЧА: Создать детальный Паспорт бренда на основе данных распаковки.

═══════════════════════════════
КАК ПИСАТЬ
═══════════════════════════════
- Как умный друг-маркетолог который реально разобрался в этом психологе
- НЕ как учебник по маркетингу
- НЕ как нейросеть без промпта

ПРИНЦИПЫ:
1. АУТЕНТИЧНОСТЬ: отражай реального человека, не шаблон
2. СПЕЦИФИЧНОСТЬ: вместо "помогаю людям" пиши конкретно кому и с чем
3. ПОДХОД определяет стиль бренда (см. контекст подхода ниже)
4. ЭТИЧНОСТЬ: никаких гарантий, диагнозов, манипуляций

═══════════════════════════════
ЗАПРЕЩЕНО
═══════════════════════════════
Фразы:
- "путешествие к себе", "целительное пространство", "обрести гармонию"
- "квалифицированная помощь", "индивидуальный подход к каждому"
- "безопасное пространство для исцеления", "на пути к лучшей версии себя"
- "помощь в преодолении жизненных трудностей", "ресурсное состояние"
- "каждый из нас", "ни для кого не секрет", "в современном мире"

Стилистика:
- Не ставь длинное тире в каждом предложении (максимум 2-3 на весь текст)
- Не крути синонимы: психолог → специалист → терапевт → профессионал
- Не начинай абзацы с "В современном мире", "Важно отметить", "Следует подчеркнуть"
- Не используй равномерную "гладкость" текста (это маркер нейросети)
- Не перечисляй через "во-первых, во-вторых, в-третьих"

ВМЕСТО ЭТОГО:
- Живые, конкретные, узнаваемые формулировки
- Слова самого психолога из "живого голоса"
- Разная длина предложений, неровный ритм
- Конкретика вместо абстракций

═══════════════════════════════
РАЗДЕЛ "ГОЛОС БРЕНДА В ДЕЙСТВИИ"
═══════════════════════════════
Это САМЫЙ ВАЖНЫЙ раздел. Он задаёт тон для всего будущего контента.

Пиши примеры постов ТАК, как реально говорит этот психолог:
- Бери слова из "живого голоса"
- Хуки должны ОСТАНАВЛИВАТЬ скролл
- Звучать как будто человек сел и написал от души

ЗАПРЕЩЁННЫЕ хуки: "Вы когда-нибудь задумывались...", "А вы знали..?", "В этом посте я расскажу..."
РАБОЧИЕ хуки: "Вчера клиентка сказала фразу от которой мурашки", "Три вещи которые я запрещаю говорить на сессии", "Знаете какой вопрос мне задают чаще всего?"

ФОРМАТ ВЫВОДА (СТРОГО):
- Русский язык
- Заголовки разделов пиши ЖИРНЫМ через ** (например: **1. Миссия**)
- Подзаголовки пиши жирным: **Формула:**, **Развёрнутое описание:**
- Списки пиши с дефисом и пробелом: - пункт
- НЕ используй ## для заголовков
- НЕ ставь --- как разделитель между частями
- НЕ оборачивай пояснения в скобки со звёздочками *(пояснение)*
- Просто пиши пояснение в скобках: (пояснение)
- Готовые тексты, не рекомендации
- Каждый раздел 200-400 слов
- НЕ пиши вводных фраз вроде "Создаю часть...", "Вот часть...", "Часть 2 паспорта:"
- Начинай сразу с первого заголовка раздела`

function getChunkInstructions(chunk: number) {
  const chunks: Record<number, string> = {
    1: `
СОЗДАЙ РАЗДЕЛЫ 1-2 ПАСПОРТА БРЕНДА

**1. Миссия**
Почему этот психолог делает то что делает. 2-3 предложения от сердца. Фреймворк Синека (начни с "Почему"). Бери слова из "живого голоса".

**2. Позиционирование**
Формула: "Я помогаю [кому] [с чем] через [как], чтобы они [результат]"
+ развёрнутое описание 3-4 предложения.`,

    2: `
СОЗДАЙ РАЗДЕЛЫ 3-4 ПАСПОРТА БРЕНДА

**3. Архетип бренда**
1 основной + 1 дополнительный из 12 юнгианских. Объясни почему. Как проявляется в контенте.

**4. Тон голоса**
По 4 измерениям с примерами фраз:
- Формальность (разговорный ↔ академический)
- Серьёзность (лёгкий ↔ серьёзный)
- Дерзость (уважительный ↔ провокационный)
- Энтузиазм (сдержанный ↔ энергичный)
+ 5 фраз которые ИСПОЛЬЗУЕТ (бери из живого голоса!)
+ 5 фраз которые НИКОГДА не использует — просто пиши фразу, без *(пояснений в звёздочках)*`,

    3: `
СОЗДАЙ РАЗДЕЛЫ 5-6 ПАСПОРТА БРЕНДА

**5. Аватар идеального клиента**
Опиши как реального человека с именем, возрастом, профессией. Что болит, чего боится, о чём мечтает, что триггерит обращение. Используй данные из раздела "Идеальный клиент".

**6. УТП (3 штуки)**
Конкретные отличия. Не "индивидуальный подход". Реальные, ощутимые, основанные на суперсилах и подходе.`,

    4: `
СОЗДАЙ РАЗДЕЛЫ 7-10 ПАСПОРТА БРЕНДА

**7. Био для Instagram**
2 варианта (до 150 символов). С эмодзи. Сразу понятно для кого и про что.

**8. Описание для Telegram**
2 варианта (4-5 строк). Тёплый, личный, в тоне психолога.

**9. Контентные столбы (5 рубрик)**
Для каждой: название, описание, 5 конкретных тем, рекомендуемый формат.
Рубрики должны отражать подход и нишу!

**10. Ключевые сообщения**
5 фраз-мантр которые повторяет регулярно. Узнаваемые, запоминающиеся, в тоне этого психолога.`,

    5: `
СОЗДАЙ РАЗДЕЛЫ 11-12 ПАСПОРТА БРЕНДА

**11. Стоп-темы**
5 тем о которых НЕ писать. С объяснениями почему. Основаны на антиценностях.
Пиши так: название темы, затем на новой строке — почему не писать. Без звёздочек и скобочных пояснений типа *(Токсичный позитив)*.

**12. Голос бренда в действии**
3 ПОЛНЫХ первых абзаца постов (по 5-7 предложений каждый):

Пост 1: психообразовательный (объясняет что-то из ниши через подход)
Пост 2: личный/рефлексивный (делится мыслями, историей из практики)
Пост 3: мягко продающий (приглашает к работе через понимание боли клиента)

Для каждого:
- Хук останавливает скролл
- Тон = голос этого психолога (бери из live_voice)
- Стиль = подход (КПТ: структурно, Гештальт: через ощущения, итд)
- Конкретика: цифры, ситуации, эмоции
- БЕЗ длинных тире в каждом предложении`,
  }
  return chunks[chunk] || chunks[1]
}

export async function POST(request: NextRequest) {
  try {
    const { chunk = 1 } = await request.json()

    // Роут на service_role (обходит RLS), поэтому владельца проверяем ЯВНО:
    // userId берём только из проверенной сессии, все запросы к БД ниже идут
    // по user.id вошедшего пользователя — чужой id подставить нельзя.
    const user = await getSessionUser()
    if (!user) {
      return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
    }
    const userId = user.id

    const supabaseAdmin = getSupabaseAdmin()

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('onboarding_profiles')
      .select('*')
      .eq('user_id', userId)
      .single()

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    const arr = (val: any) => {
      if (!val) return 'не указано'
      if (Array.isArray(val)) return val.length > 0 ? val.join(', ') : 'не указано'
      return String(val) || 'не указано'
    }

    const approaches = Array.isArray(profile.approaches) ? profile.approaches : []
    const approachGuidance = getApproachBrandGuidance(approaches)

    const basePrompt = `КОНТЕКСТ ПОДХОДА ДЛЯ БРЕНДА:
${approachGuidance}

═══════════════════════════════
ДАННЫЕ РАСПАКОВКИ ПСИХОЛОГА
═══════════════════════════════

=== КТО ЭТО ===
Имя: ${profile.full_name || 'не указано'}
Как обращаются клиенты: ${profile.appeal || 'не указано'}
Подходы: ${arr(profile.approaches)}
Ниши: ${arr(profile.niches)}
Главная ниша: ${profile.one_niche || 'не указано'}
Опыт: ${profile.experience || 'не указано'}
Как пришёл в профессию: ${profile.path_to_profession || 'не указано'}
Форматы работы: ${arr(profile.formats)}
Цена сессии: ${profile.price || 'не указано'}

=== ГОЛОС И ХАРАКТЕР ===
Тональность (0=левый полюс, 100=правый):
- Формальный ↔ Разговорный: ${profile.tone_formal ?? 50}/100
- Серьёзный ↔ С юмором: ${profile.tone_serious ?? 50}/100
- Осторожный ↔ Прямой: ${profile.tone_cautious ?? 50}/100
Как разговаривает с клиентами: ${profile.tone_verbal || 'не указано'}
Ценности: ${arr(profile.values)}
Что делает не так как другие: ${profile.values_custom || 'не указано'}
Антиценности (что бесит): ${arr(profile.anti_values)}
Что сказал бы коллегам: ${profile.anti_values_custom || 'не указано'}
Суперсилы: ${arr(profile.superpowers)}
Сложности с контентом: ${arr(profile.content_struggles)}

ЖИВОЙ ГОЛОС (дословная цитата):
"${profile.live_voice || 'не указано'}"

=== ИДЕАЛЬНЫЙ КЛИЕНТ ===
Кто: ${profile.client_avatar || 'не указано'}
Профессия: ${profile.client_job || 'не указано'}
Фразы боли: "${profile.client_pain_phrases || 'не указано'}"
Что пробовал: ${arr(profile.client_tried)}
Страхи перед терапией: ${arr(profile.client_fear)}
Результат работы: ${profile.client_result || 'не указано'}

=== ГДЕ СЕЙЧАС ===
Платформы: ${arr(profile.platforms)}
Подписчики: ${profile.current_followers || '0'}
Клиентов в месяц: ${profile.current_clients || '0'}
Откуда приходят: ${arr(profile.client_source)}
Боль с контентом: ${profile.content_pain || 'не указано'}
Подробнее: ${profile.content_pain_detail || 'не указано'}

=== ЦЕЛИ ===
Цель на 3 месяца: ${profile.goal_3_months || 'не указано'}
Хочет клиентов: ${profile.desired_clients || 'не указано'}
Время на контент: ${profile.time_available || 'не указано'}
Отношение к видео: ${profile.video_attitude || 'не указано'}
Мечта о блоге: ${profile.dream_blog || 'не указано'}

=== РЕФЕРЕНСЫ ===
Нравятся: ${profile.idols || 'не указано'}
Почему: ${arr(profile.idols_why)}
Дополнительно: ${profile.something_else || 'не указано'}`

    const encoder = new TextEncoder()

    // Обезличиваем вход перед OpenAI; восстановим в потоке и при сохранении.
    const userContent = `${basePrompt}\n\n═══════════════════════════════\nЗАДАНИЕ\n═══════════════════════════════\n${getChunkInstructions(chunk)}`
    const { masked: maskedUser, map: anonMap } = anonymize(userContent)

    const stream = new ReadableStream({
      async start(controller) {
        try {
          const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'gpt-5.4',
              stream: true,
              temperature: 0.7,
              max_completion_tokens: 4000,
              messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: maskedUser },
              ],
            }),
          })

          if (!aiResponse.ok) {
            const errText = await aiResponse.text()
            throw new Error(`OpenAI error ${aiResponse.status}: ${errText}`)
          }

          const reader = aiResponse.body!.getReader()
          const dec = new TextDecoder()
          let maskedFull = ''
          let sentLen = 0

          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            const lines = dec.decode(value).split('\n')
            for (const line of lines) {
              if (!line.startsWith('data:')) continue
              const json = line.slice(5).trim()
              if (json === '[DONE]') continue
              try {
                const delta = JSON.parse(json).choices?.[0]?.delta?.content
                if (delta) {
                  maskedFull += delta
                  // отдаём восстановленный текст, придерживая недописанную заглушку
                  const safe = safeRestoredPrefix(maskedFull, anonMap)
                  const toSend = safe.slice(sentLen)
                  if (toSend) {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta: toSend })}\n\n`))
                    sentLen = safe.length
                  }
                }
              } catch {}
            }
          }

          // полный восстановленный текст (имена/контакты возвращены)
          const fullText = deanonymize(maskedFull, anonMap)
          const tail = fullText.slice(sentLen)
          if (tail) controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta: tail })}\n\n`))

          // Сохраняем в Supabase
          if (chunk === 1) {
            await supabaseAdmin
              .from('brand_passports')
              .upsert(
                {
                  user_id: userId,
                  content: fullText,
                  generated_at: new Date().toISOString(),
                  chunks_done: [1],
                },
                { onConflict: 'user_id' }
              )
          } else {
            const { data: existing } = await supabaseAdmin
              .from('brand_passports')
              .select('content, chunks_done')
              .eq('user_id', userId)
              .single()

            const chunksDone: number[] = existing?.chunks_done ?? []

            if (chunksDone.includes(chunk)) {
              // Чанк уже сохранён — закрываем стрим без записи
              controller.enqueue(encoder.encode(`data: [DONE]\n\n`))
              controller.close()
              return
            }

            const fullContent = [existing?.content, fullText].filter(Boolean).join('\n\n')

            await supabaseAdmin
              .from('brand_passports')
              .upsert(
                {
                  user_id: userId,
                  content: fullContent,
                  generated_at: new Date().toISOString(),
                  chunks_done: [...chunksDone, chunk],
                },
                { onConflict: 'user_id' }
              )
          }

          controller.enqueue(encoder.encode(`data: [DONE]\n\n`))
          controller.close()
        } catch (err: any) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: err.message })}\n\n`))
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no',
      },
    })
  } catch (error: any) {
    console.error('Generate passport error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
