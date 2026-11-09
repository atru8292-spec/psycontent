import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateWithAI } from '@/lib/openrouter'
import { getSessionUser } from '@/lib/auth'
import { isNewPipeline } from '@/lib/generation/context'
import { activeHyps } from '@/lib/generation/hypotheses'
import { buildAuthorSettings } from '@/lib/generation/settings'
import { loadMemory } from '@/lib/generation/memory'
import { zh6Plan } from '@/lib/generation/zh6/write'
import { formatByCode } from '@/lib/generation/zh6/formaty'

// «Пока без видео» пишет edit-profile, «Категорически нет» старый онбординг, «не снимаю» прежняя проверка
const noVideo = (v: unknown) => /без\s+видео|не\s+снима|категорически\s+нет/iu.test(String(v || ''))

// ---------- zh6 (PROMPT_HYP=zh6 и новый мозг): план тем через zh6Plan, пачки по 10 дней ----------
const ZH6_BATCH = 10
const ZH6_TOTAL_BATCHES = 3
const ZH6_PILLAR: Record<string, string> = { ohvat: 'Психообразование', doverie: 'Позиционирование', zapis: 'Практика' }
// тип формата каталога в старых кодах дня плана (post|carousel|reels|stories), чтобы старые экраны не сломались
const dayFormatOf = (kod: string): string => {
  const t = formatByCode(kod)?.for[0]
  return t === 'reels' || t === 'carousel' || t === 'stories' ? t : 'post'
}

async function zh6PlanBatch(args: { db: ReturnType<typeof getSupabaseAdmin>; userId: string; profile: any; batch: number; existingPlan: any[] }) {
  const { db, userId, profile, existingPlan } = args
  const batch = args.batch
  const startDay = (batch - 1) * ZH6_BATCH + 1
  const endDay = Math.min(batch * ZH6_BATCH, 30)
  const settings = buildAuthorSettings(profile)
  // анти-повтор только внутри своих тем: прошлые пачки этого плана и последние материалы автора (чужие темы не берем)
  const memory = await loadMemory(db, userId, settings.signatures).catch(() => null)
  const prev = batch > 1 ? existingPlan.filter((d: any) => Number(d?.day) < startDay).map((d: any) => String(d?.topic || '')).filter(Boolean) : []
  const recent = [...new Set([...prev, ...(memory?.recentTopics || [])])].slice(0, 40)

  let res: Awaited<ReturnType<typeof zh6Plan>>
  try {
    res = await zh6Plan(settings, { n: endDay - startDay + 1, recent, rotation: batch - 1, userId })
  } catch (e: any) {
    console.error('generate-content-plan zh6: plan failed', userId, e?.message || e)
    return NextResponse.json({ error: 'server_error', message: 'Что-то пошло не так на нашей стороне. Попробуй через минуту.' }, { status: 500 })
  }
  const temy = res.temy.slice(0, endDay - startDay + 1)
  if (!temy.length) {
    console.error('generate-content-plan zh6: empty plan', userId)
    return NextResponse.json({ error: 'server_error', message: 'Что-то пошло не так на нашей стороне. Попробуй через минуту.' }, { status: 500 })
  }
  // пометки кода в ответ не отдаем, только число в лог
  const pometki = temy.reduce((n, t) => n + (t.pometki?.length || 0), 0)
  if (pometki || res.smesh.length) console.info('generate-content-plan zh6: pometki', pometki, 'smesh', res.smesh.length)

  const newDays = temy.map((t, i) => {
    const kod = formatByCode(t.format)?.code || ''
    return {
      day: startDay + i,
      pillar: ZH6_PILLAR[t.zadacha] || ZH6_PILLAR.ohvat,
      topic: t.tema,
      format: dayFormatOf(kod),
      format_kod: kod,
      format_name: kod ? formatByCode(kod)!.name : '',
      zadacha: t.zadacha,
      reakciya: t.reakciya || '',
      hook: '',
      tip: t.situaciya || '',
      done: false,
    }
  })
  const fullPlan = batch === 1 ? newDays : [...existingPlan.filter((d: any) => d.day < startDay), ...newDays]
  const up = await db.from('content_plans').upsert({ user_id: userId, plan: fullPlan, generated_at: new Date().toISOString() }, { onConflict: 'user_id' })
  if (up.error) {
    console.error('generate-content-plan zh6: save failed', userId, up.error.message)
    return NextResponse.json({ error: 'server_error', message: 'Что-то пошло не так на нашей стороне. Попробуй через минуту.' }, { status: 500 })
  }
  return NextResponse.json({ plan: fullPlan, batch, complete: batch >= ZH6_TOTAL_BATCHES, totalBatches: ZH6_TOTAL_BATCHES })
}

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(request: NextRequest) {
  try {
    const reqBody = await request.json()
    const { batch = 1 } = reqBody

    // Роут на service_role (обходит RLS), поэтому владельца проверяем ЯВНО:
    // userId берём только из проверенной сессии — все запросы к БД идут по user.id.
    const user = await getSessionUser()
    if (!user) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
    const userId = user.id

    const supabaseAdmin = getSupabaseAdmin()

    const [profileRes, existingPlanRes] = await Promise.all([
      supabaseAdmin.from('onboarding_profiles').select('*').eq('user_id', userId).single(),
      supabaseAdmin.from('content_plans').select('plan').eq('user_id', userId).single()
    ])

    // Различаем «нет строки профиля» (PGRST116) от ошибки чтения (права/сеть/JWT).
    if (profileRes.error && profileRes.error.code !== 'PGRST116') {
      console.error('generate-content-plan: profile read failed', userId, profileRes.error)
      return NextResponse.json({ error: 'server_error', message: 'Что-то пошло не так на нашей стороне. Попробуйте через минуту.' }, { status: 500 })
    }
    const profile = profileRes.data
    if (!profile) return NextResponse.json({ error: 'need_onboarding', message: 'Сначала заполни профиль', redirect: '/onboarding' }, { status: 404 })

    const existingPlan = existingPlanRes.data?.plan || []

    // zh6: свой план пачками по 10 дней, остальные пользователи идут старым путем без изменений
    if (activeHyps().has('zh6') && isNewPipeline(profile)) {
      const b = Number(batch)
      if (!Number.isInteger(b) || b < 1 || b > ZH6_TOTAL_BATCHES) return NextResponse.json({ error: 'bad_request' }, { status: 400 })
      return await zh6PlanBatch({ db: supabaseAdmin, userId, profile, batch: b, existingPlan: Array.isArray(existingPlan) ? existingPlan : [] })
    }

    const startDay = (batch - 1) * 5 + 1
    const endDay = Math.min(batch * 5, 30)
    const daysCount = endDay - startDay + 1

    // Имена колонок берём из реальной схемы onboarding_profiles (niches — массив).
    const nicheText = profile.one_niche
      || (Array.isArray(profile.niches) ? profile.niches.join(', ') : profile.niches)
      || 'общая практика'
    const clientPains = profile.client_pain_phrases || nicheText || 'тревога, отношения, самооценка'
    const audienceText = profile.client_avatar || profile.client_job || 'взрослые 25-45'

    const systemPrompt = `Ты помогаешь практикующему психологу собрать контент-план его голосом, под его нишу и боль его клиента. Не маркетолог. Темы из пересечения его опыта и боли аудитории, не общие. Призыв к действию редко, не в каждом дне. Хуки и тексты для постов пиши от первого лица самого психолога, он автор, а не герой. Не упоминай его в третьем лице (по имени, «психолог», «она»). Пиши букву «е» вместо «ё», без тире.

🎯 ЗАДАЧА: Создай ${daysCount} постов (дни ${startDay}-${endDay}), которые ОСТАНОВЯТ скролл.

У тебя есть 2 СЕКУНДЫ чтобы зацепить. Хук должен мгновенно вызвать эмоцию.

══════════════════════════════════════════════════════════════
                    ТИПЫ ХУКОВ ПО ТРИГГЕРАМ
══════════════════════════════════════════════════════════════

🔥 ЭМОЦИОНАЛЬНЫЕ ХУКИ (главный инструмент!)
Люди помнят что ЧУВСТВОВАЛИ, а не факты.

• Узнавание боли: "Если вы когда-нибудь [боль], этот пост для вас"
• Удивление: "[Шокирующий факт]. И вот почему это нормально"
• Облегчение: "Вы не [самокритика]. Вы просто [переосмысление]"
• Триумф: "Момент когда клиентка впервые [победа]..."

Примеры для психолога:
✓ "Если вы извиняетесь за свои слезы, прочитайте это"
✓ "87% моих клиентов говорят эту фразу на первой сессии"
✓ "Вы не слабый человек. Вы просто никогда не получали поддержку"

──────────────────────────────────────────────────────────────

😰 СТРАХ УПУСТИТЬ (FOMO)
Люди боятся потерять возможность.

• "Пока вы [бездействие], ваш [ресурс] утекает"
• "Этот паттерн разрушает отношения. Проверьте себя"
• "90% людей не замечают этот сигнал тела"

Примеры:
✓ "Пока вы терпите, ваши границы размываются навсегда"
✓ "Этот тип мышления крадет у вас годы жизни"

──────────────────────────────────────────────────────────────

📊 СОЦИАЛЬНОЕ ДОКАЗАТЕЛЬСТВО
Люди доверяют опыту других.

• "«[Цитата клиента]», слышу это каждую неделю"
• "История клиентки, которая [трансформация]"
• "После этой техники 8 из 10 клиентов говорят..."

Примеры:
✓ "«Я всю жизнь думала, что со мной что-то не так», слышу каждую неделю"
✓ "Клиентка пришла с паникой. Через месяц впервые за 5 лет уснула без таблеток"

──────────────────────────────────────────────────────────────

🎭 ПРОВОКАЦИЯ (оспорь популярное!)
Удивить = остановить скролл.

• "Хватит [популярный совет]. Вот почему он не работает"
• "[Популярное убеждение] это ложь. И вот доказательства"
• "Почему [совет из интернета] делает только хуже"

Примеры:
✓ "Хватит искать мотивацию. Она не поможет"
✓ "Позитивное мышление разрушает вашу психику"
✓ "«Просто отпусти» это худший совет, который вам давали"

──────────────────────────────────────────────────────────────

🎯 ПЕРСОНАЛИЗАЦИЯ (обращение к конкретному человеку)
"Это про МЕНЯ" = сохранение поста.

• "Если ты [идентификация], читай внимательно"
• "Это для тех, кто [узнаваемое поведение]"
• "Тебе знакомо чувство когда [ситуация]?"

Примеры:
✓ "Если ты всегда «сильная» для всех, эта техника для тебя"
✓ "Это для тех, кто просыпается с тревогой в груди"

──────────────────────────────────────────────────────────────

🧠 ИНСАЙТ / WOW-ЭФФЕКТ
Показать привычное с нового угла.

• "То что вы называете [А], на самом деле [Б]"
• "[Симптом] это не [ложный диагноз]. Это [правда]"
• "Ваш мозг делает [действие] чтобы [неочевидная причина]"

Примеры:
✓ "Прокрастинация это не лень. Это страх"
✓ "Тревога притворяется заботой о будущем"
✓ "Вы не боитесь успеха. Вы боитесь, что не справитесь с ним"

══════════════════════════════════════════════════════════════
               69 МОДЕЛЕЙ ПРОДАЮЩИХ ЗАГОЛОВКОВ
══════════════════════════════════════════════════════════════

ВЫГОДА НА ЯЗЫКЕ КЛИЕНТА:
• "Что делать, если [боль]"
• "Как понять, что [проблема] это сигнал"
• "Как избежать [страх клиента]"

ОСТРАЯ БОЛЬ:
• "90% [кто] совершают эту ошибку"
• "Никогда не делай это, если хочешь [желание]"
• "Ошибка, которая стоила мне [цена]"
• "О чем умалчивают, когда [боль]"
• "Каждый хоть раз [узнаваемая ситуация]"

БЕЗОПАСНОСТЬ:
• "Что скрывается за [симптом]"
• "Предупреждение для тех, кто [ситуация]"
• "Подводные камни, если [действие]"

КОМФОРТ:
• "Всего 3 шага, и ты [желание]"
• "POV: когда [проблема], я делаю это"

ИСТОРИИ:
• "Клиентка сказала: «[фраза]». И тут я поняла..."
• "История человека, который [драма с хэппи-эндом]"

══════════════════════════════════════════════════════════════
                      ЧТО ЗАПРЕЩЕНО
══════════════════════════════════════════════════════════════

✗ "Как справиться с...", скучно, все так пишут
✗ "5/7/10 признаков/способов...", заезжено до дыр
✗ "А вы знали, что...", слабый триггер
✗ "Важно понимать...", канцелярит
✗ "Дорогие друзья...", не для соцсетей
✗ "Сегодня поговорим о...", зевота
✗ "Давайте разберемся...", скукота
✗ Вопросы "Знакомо?" в конце банально
✗ Абстракции: "гармония", "баланс", "осознанность"
✗ Термины: "когнитивные искажения", "ресурсное состояние"

══════════════════════════════════════════════════════════════
                        РУБРИКИ
══════════════════════════════════════════════════════════════

Чередуй равномерно все 5:

• Психообразование: объясни МЕХАНИЗМ боли (почему мозг так делает)
• Истории: случай из практики с ДЕТАЛЯМИ и инсайтом
• Личное: твоя рефлексия, честность, уязвимость специалиста
• Практика: КОНКРЕТНАЯ техника с пошаговой инструкцией
• Позиционирование: как ты работаешь, кому подходишь, кому нет

══════════════════════════════════════════════════════════════
                        ФОРМАТЫ
══════════════════════════════════════════════════════════════

• post: глубокий текст, 1 мощный инсайт
• carousel: пошаговое объяснение, топ-список, "до/после"
• reels: 1 эмоция за 15-30 сек, сильный визуал
• stories: опрос, вопрос аудитории, быстрый совет

══════════════════════════════════════════════════════════════
                     ФОРМАТ ОТВЕТА
══════════════════════════════════════════════════════════════

JSON массив из ${daysCount} объектов:

[{
  "day": ${startDay},
  "pillar": "Психообразование",
  "topic": "Почему тревога усиливается когда все хорошо",
  "format": "post",
  "hook": "Все наладилось. Но внутри почему-то еще страшнее. Знакомо?",
  "tip": "Раскрой феномен ожидания катастрофы, мозг не верит в хорошее после травмы"
}]

⚠️ КРИТИЧЕСКИ ВАЖНО:
- hook это ПЕРВАЯ СТРОКА поста, которая ОСТАНАВЛИВАЕТ скролл
- hook должен вызывать ЭМОЦИЮ за 2 секунды
- Используй разные типы триггеров (не только боль!)
- Пиши на языке КЛИЕНТА, не психолога`

    const userPrompt = `ПРОФИЛЬ ПСИХОЛОГА:
• Имя: ${profile.full_name || 'Психолог'}
• Ниша: ${nicheText}
• Подходы: ${Array.isArray(profile.approaches) ? profile.approaches.slice(0, 3).join(', ') : 'интегративный'}
• Аудитория: ${audienceText}
• Тон: ${profile.tone_verbal || 'теплый, но экспертный'}
• Боли клиентов: ${clientPains}
${noVideo(profile.video_attitude) ? '• ⚠️ НЕ использовать формат reels!' : ''}

══════════════════════════════════════════════════════════════

ЗАДАЧА: Создай дни ${startDay}-${endDay} (${daysCount} постов).

ТРЕБОВАНИЯ:
1. Каждый хук использует РАЗНЫЙ триггер (эмоция, FOMO, провокация, инсайт, соц.доказательство)
2. Темы строго про боли клиента: ${clientPains}
3. Чередуй ВСЕ 5 рубрик равномерно
4. Чередуй форматы (post, carousel, ${noVideo(profile.video_attitude) ? 'stories' : 'reels, stories'})
5. Хуки живые, эмоциональные, на языке человека

Верни ТОЛЬКО JSON массив. Без пояснений.`


    const result = await generateWithAI(systemPrompt, userPrompt, { userId, operation: 'generate_content_plan', knownNames: profile?.full_name ? [profile.full_name] : undefined })

    let newDays
    try {
      const jsonMatch = result.match(/\[[\s\S]*\]/)
      if (!jsonMatch) throw new Error('No JSON found in response')
      newDays = JSON.parse(jsonMatch[0])
    } catch {
      throw new Error('AI не вернул валидный JSON')
    }

    const validPillars = ['Психообразование', 'Истории', 'Личное', 'Практика', 'Позиционирование']
    const validFormats = noVideo(profile.video_attitude)
      ? ['post', 'carousel', 'stories'] 
      : ['post', 'carousel', 'reels', 'stories']

    newDays = newDays.slice(0, daysCount).map((item: any, index: number) => ({
      day: startDay + index,
      pillar: validPillars.includes(item.pillar) ? item.pillar : validPillars[index % 5],
      topic: item.topic || 'Тема поста',
      format: validFormats.includes(item.format) ? item.format : validFormats[index % validFormats.length],
      hook: item.hook || '',
      tip: item.tip || '',
      done: false,
    }))

    let fullPlan: any[]
    if (batch === 1) {
      fullPlan = newDays
    } else {
      fullPlan = [...existingPlan.filter((d: any) => d.day < startDay), ...newDays]
    }

    await supabaseAdmin
      .from('content_plans')
      .upsert({
        user_id: userId,
        plan: fullPlan,
        generated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' })

    return NextResponse.json({ 
      plan: fullPlan,
      batch,
      complete: batch >= 6,
      totalBatches: 6,
    })

  } catch (error: any) {
    console.error('Content plan error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
