// app/api/analyze-competitor/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { generateWithAI } from '@/lib/openrouter'

const SUPADATA_API_KEY = process.env.SUPADATA_API_KEY
const SUPADATA_BASE_URL = 'https://api.supadata.ai/v1'

// Получить транскрипцию
async function getTranscript(url: string) {
  const response = await fetch(
    `${SUPADATA_BASE_URL}/transcript?url=${encodeURIComponent(url)}`,
    {
      method: 'GET',
      headers: {
        'x-api-key': SUPADATA_API_KEY!,
      },
    }
  )

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.message || `Supadata error: ${response.status}`)
  }

  return response.json()
}

// Получить метадату
async function getMetadata(url: string) {
  try {
    const response = await fetch(
      `${SUPADATA_BASE_URL}/metadata?url=${encodeURIComponent(url)}`,
      {
        method: 'GET',
        headers: {
          'x-api-key': SUPADATA_API_KEY!,
        },
      }
    )

    if (!response.ok) return null
    return response.json()
  } catch {
    return null
  }
}

// Определить платформу
function detectPlatform(url: string): string {
  if (url.includes('instagram.com')) return 'Instagram'
  if (url.includes('youtube.com') || url.includes('youtu.be')) return 'YouTube'
  if (url.includes('tiktok.com')) return 'TikTok'
  if (url.includes('facebook.com') || url.includes('fb.watch')) return 'Facebook'
  if (url.includes('twitter.com') || url.includes('x.com')) return 'X'
  return 'Video'
}

const SYSTEM_PROMPT = `Ты — эксперт по контент-стратегии для психологов в социальных сетях. Тебе дают транскрипцию видео конкурента.

Твоя задача — сделать глубокий анализ и помочь адаптировать контент.

Структура ответа:

## 📊 АНАЛИЗ КОНТЕНТА

### Тема и ключевые мысли
[О чём видео, главный посыл]

### Формат и структура
[Какой формат: история, советы, разбор кейса, мотивация]
[Как построено видео]

### Хуки и приёмы
[Что цепляет в первые 3 секунды]
[Риторические приёмы]

### Что работает хорошо
[Сильные стороны]

---

## 🎯 ЧТО ВЗЯТЬ СЕБЕ

- [Приём 1]
- [Приём 2]
- [Удачная формулировка]
- [Структурное решение]

---

## ✍️ АДАПТАЦИЯ ПОД ТЕБЯ

[Если есть паспорт бренда — как адаптировать под стиль и нишу]
[Если нет — универсальные рекомендации для психолога]

---

## 🎬 ГОТОВЫЙ СЦЕНАРИЙ

**Хронометраж:** 30-60 секунд

**[0:00-0:03] ХУК:**
[Сильное начало]

**[0:03-0:10] ПРОБЛЕМА:**
[Обозначение боли]

**[0:10-0:25] ОСНОВНАЯ ЧАСТЬ:**
[Контент/советы]

**[0:25-0:30] CTA:**
[Призыв к действию]

---

## 💡 ИДЕИ НА ПОТОМ

1. [Тема 1]
2. [Тема 2]
3. [Тема 3]

---

Пиши живым разговорным языком на русском. Сценарий — не копия, а вдохновение с другим углом.`

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!SUPADATA_API_KEY) {
      return NextResponse.json({ error: 'Supadata not configured' }, { status: 500 })
    }

    const { url, brandPassport } = await request.json()

    if (!url) {
      return NextResponse.json({ error: 'URL обязателен' }, { status: 400 })
    }

    const platform = detectPlatform(url)

    // 1. Транскрипция
    let transcriptData
    try {
      transcriptData = await getTranscript(url)
    } catch (error) {
      return NextResponse.json(
        { error: `Не удалось получить транскрипцию: ${error instanceof Error ? error.message : 'Unknown'}` },
        { status: 400 }
      )
    }

    // Склеиваем текст
    let transcript = ''
    if (transcriptData.content && Array.isArray(transcriptData.content)) {
      transcript = transcriptData.content.map((s: any) => s.text).join(' ')
    }

    if (!transcript.trim()) {
      return NextResponse.json(
        { error: 'В видео нет речи или субтитров' },
        { status: 400 }
      )
    }

    // 2. Метадата
    const metadata = await getMetadata(url)

    // 3. Формируем промпт
    const metaBlock = metadata
      ? `
Метаданные:
- Автор: ${metadata.author || 'н/д'}
- Название: ${metadata.title || 'н/д'}
- Просмотры: ${metadata.viewCount?.toLocaleString() || 'н/д'}
- Лайки: ${metadata.likeCount?.toLocaleString() || 'н/д'}
- Комментарии: ${metadata.commentCount?.toLocaleString() || 'н/д'}
- Длительность: ${metadata.duration ? `${Math.round(metadata.duration)} сек` : 'н/д'}`
      : ''

    const brandBlock = brandPassport
      ? `
Паспорт бренда пользователя:
${brandPassport}`
      : ''

    const userPrompt = `Платформа: ${platform}

Транскрипция видео:
${transcript}
${metaBlock}
${brandBlock}`

    // 4. Анализ через OpenRouter
    const analysis = await generateWithAI(SYSTEM_PROMPT, userPrompt)

    // 5. Сохраняем
    await supabase.from('competitor_analyses').insert({
      user_id: user.id,
      url,
      platform,
      transcript,
      metadata,
      analysis,
    })

    return NextResponse.json({
      success: true,
      analysis,
      transcript,
      metadata,
      platform,
    })
  } catch (error) {
    console.error('Competitor analysis error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Ошибка анализа' },
      { status: 500 }
    )
  }
}
