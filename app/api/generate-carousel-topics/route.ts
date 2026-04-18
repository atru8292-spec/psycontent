import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { generateWithAI } from '@/lib/openrouter'

const SUPADATA_API_KEY = process.env.SUPADATA_API_KEY
const SUPADATA_BASE_URL = 'https://api.supadata.ai/v1'

async function getTranscript(url: string) {
  const response = await fetch(
    `${SUPADATA_BASE_URL}/youtube/transcript?url=${encodeURIComponent(url)}`,
    {
      method: 'GET',
      headers: { 'x-api-key': SUPADATA_API_KEY! },
    }
  )
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.message || `Supadata error: ${response.status}`)
  }
  return response.json()
}

function detectPlatform(url: string): string {
  if (url.includes('instagram.com')) return 'Instagram'
  if (url.includes('youtube.com') || url.includes('youtu.be')) return 'YouTube'
  if (url.includes('tiktok.com')) return 'TikTok'
  return 'Video'
}

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

## ✍️ АДАПТАЦИЯ

[Как адаптировать под психолога]

---

## 🎬 ГОТОВЫЙ СЦЕНАРИЙ (30-60 сек)

**[0:00-0:03] ХУК:**
[Начало]

**[0:03-0:10] ПРОБЛЕМА:**
[Боль]

**[0:10-0:25] ОСНОВА:**
[Контент]

**[0:25-0:30] CTA:**
[Призыв]

Пиши на русском, живым языком.`

export async function POST(request: NextRequest) {
  try {
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!SUPADATA_API_KEY) {
      return NextResponse.json({ error: 'Supadata not configured' }, { status: 500 })
    }

    const { url } = await request.json()

    if (!url) {
      return NextResponse.json({ error: 'URL обязателен' }, { status: 400 })
    }

    const platform = detectPlatform(url)

    let transcriptData
    try {
      transcriptData = await getTranscript(url)
    } catch (error) {
      return NextResponse.json(
        { error: `Не удалось получить транскрипцию: ${error instanceof Error ? error.message : 'Unknown'}` },
        { status: 400 }
      )
    }

    let transcript = ''
    if (transcriptData.content && Array.isArray(transcriptData.content)) {
      transcript = transcriptData.content.map((s: any) => s.text).join(' ')
    } else if (typeof transcriptData.content === 'string') {
      transcript = transcriptData.content
    }

    if (!transcript.trim()) {
      return NextResponse.json({ error: 'В видео нет речи или субтитров' }, { status: 400 })
    }

    const userPrompt = `Платформа: ${platform}\n\nТранскрипция:\n${transcript}`

    const analysis = await generateWithAI(SYSTEM_PROMPT, userPrompt)

    await supabase.from('competitor_analyses').insert({
      user_id: user.id,
      url,
      platform,
      transcript,
      metadata: null,
      analysis,
    })

    return NextResponse.json({ success: true, analysis, transcript, metadata: null, platform })
  } catch (error) {
    console.error('Competitor analysis error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Ошибка анализа' },
      { status: 500 }
    )
  }
}
