import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { analyzeWithHaiku } from '@/lib/openrouter'

export const maxDuration = 25

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const SYSTEM_PROMPT = `Ты — эксперт по контент-стратегии для психологов. Анализируй видео конкурента. Отвечай без лишних вводных слов, сразу по структуре.

## 📊 АНАЛИЗ

### Тема и посыл
[о чём видео, 2-3 предложения]

### Хук и приёмы
[что цепляет в первые 3 сек, что работает]

### Что взять себе
- [приём 1]
- [приём 2]
- [удачная формулировка]

---

## 🎬 ГОТОВЫЙ СЦЕНАРИЙ ДЛЯ ПСИХОЛОГА (30-60 сек)

**ХУК [0:00-0:03]:** [цепляющее начало]
**ПРОБЛЕМА [0:03-0:10]:** [боль клиента]
**ОСНОВА [0:10-0:25]:** [полезный контент]
**CTA [0:25-0:30]:** [призыв]

Пиши на русском, живым языком.`

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) return NextResponse.json({ error: 'No authorization header' }, { status: 401 })

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { url, transcript, platform } = await request.json()

    if (!transcript || transcript.trim().length < 20) {
      return NextResponse.json({ error: 'Транскрипция обязательна' }, { status: 400 })
    }

    // Обрезаем транскрипт до 2000 символов — достаточно для анализа Reels
    const trimmedTranscript = transcript.length > 2000
      ? transcript.slice(0, 2000) + '...'
      : transcript

    const userPrompt = `Платформа: ${platform || 'Unknown'}\n\nТранскрипция:\n${trimmedTranscript}`
    const analysis = await analyzeWithHaiku(SYSTEM_PROMPT, userPrompt)

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
