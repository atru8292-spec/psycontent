import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateWithAI } from '@/lib/openrouter'

export const maxDuration = 60

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const SYSTEM_PROMPT = `Ты — эксперт по контент-стратегии для психологов. Анализируй видео конкурента.

Структура ответа:

## 📊 АНАЛИЗ КОНТЕНТА

### Тема и ключевые мысли
[О чём видео, главный посыл]

### Формат и структура
[Какой формат, как построено]

### Хуки и приёмы
[Что цепляет в первые 3 секунды]

### Что работает хорошо
[Сильные стороны]

---

## 🎯 ЧТО ВЗЯТЬ СЕБЕ

- [Приём 1]
- [Приём 2]
- [Удачная формулировка]

---

## ✍️ АДАПТАЦИЯ ДЛЯ ПСИХОЛОГА

[Как адаптировать под психолога — конкретные советы]

---

## 🎬 ГОТОВЫЙ СЦЕНАРИЙ (30-60 сек)

**[0:00-0:03] ХУК:**
[Цепляющее начало]

**[0:03-0:10] ПРОБЛЕМА:**
[Описание боли]

**[0:10-0:25] ОСНОВА:**
[Главный контент]

**[0:25-0:30] CTA:**
[Призыв к действию]

Пиши на русском, живым языком.`

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) return NextResponse.json({ error: 'No authorization header' }, { status: 401 })

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const reqBody = await request.json()
    const { url, transcript, platform } = reqBody

    if (!transcript || transcript.trim().length < 20) {
      return NextResponse.json({ error: 'Транскрипция обязательна' }, { status: 400 })
    }

    const userPrompt = `Платформа: ${platform || 'Unknown'}\n\nТранскрипция видео:\n${transcript}`
  // Получаем предпочитаемую модель пользователя
  const { data: userSettings } = await supabase
    .from('user_settings')
    .select('preferred_model')
    .eq('user_id', userId)
    .maybeSingle()
  const model = reqBody.model || userSettings?.preferred_model || 'anthropic/claude-sonnet-4-5'

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
