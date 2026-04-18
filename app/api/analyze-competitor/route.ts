import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateWithAI } from '@/lib/openrouter'

const SUPADATA_API_KEY = process.env.SUPADATA_API_KEY
const SUPADATA_BASE_URL = 'https://api.supadata.ai/v1'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Определяем платформу
function detectPlatform(url: string): 'youtube' | 'instagram' | 'tiktok' | 'other' {
  if (url.includes('youtube.com') || url.includes('youtu.be')) return 'youtube'
  if (url.includes('instagram.com')) return 'instagram'
  if (url.includes('tiktok.com')) return 'tiktok'
  return 'other'
}

// Получаем транскрипцию для YouTube (синхронно)
async function getYouTubeTranscript(url: string): Promise<string> {
  const response = await fetch(
    `${SUPADATA_BASE_URL}/youtube/transcript?url=${encodeURIComponent(url)}&text=true`,
    {
      method: 'GET',
      headers: { 'x-api-key': SUPADATA_API_KEY! },
    }
  )
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.message || `YouTube transcript error: ${response.status}`)
  }
  
  const data = await response.json()
  
  // С text=true возвращается plain text
  if (typeof data.content === 'string') {
    return data.content
  }
  
  // Если всё же массив чанков
  if (Array.isArray(data.content)) {
    return data.content.map((chunk: any) => chunk.text).join(' ')
  }
  
  throw new Error('Unexpected transcript format')
}

// Получаем транскрипцию для Instagram/TikTok (асинхронно с polling)
async function getSocialTranscript(url: string): Promise<string> {
  // Шаг 1: Запускаем job
  const startResponse = await fetch(
    `${SUPADATA_BASE_URL}/transcript?url=${encodeURIComponent(url)}`,
    {
      method: 'GET',
      headers: { 'x-api-key': SUPADATA_API_KEY! },
    }
  )
  
  // Если сразу 200 — транскрипция готова
  if (startResponse.status === 200) {
    const data = await startResponse.json()
    if (typeof data.content === 'string') return data.content
    if (Array.isArray(data.content)) {
      return data.content.map((chunk: any) => chunk.text).join(' ')
    }
  }
  
  // Если 202 — асинхронная обработка
  if (startResponse.status === 202) {
    const { jobId } = await startResponse.json()
    
    if (!jobId) {
      throw new Error('No jobId returned for async transcript')
    }
    
    // Шаг 2: Polling — проверяем статус каждые 3 секунды (макс 60 сек)
    const maxAttempts = 20
    const delayMs = 3000
    
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise(resolve => setTimeout(resolve, delayMs))
      
      const statusResponse = await fetch(
        `${SUPADATA_BASE_URL}/job/${jobId}`,
        {
          method: 'GET',
          headers: { 'x-api-key': SUPADATA_API_KEY! },
        }
      )
      
      if (!statusResponse.ok) {
        continue // Пробуем ещё раз
      }
      
      const statusData = await statusResponse.json()
      
      if (statusData.status === 'completed') {
        if (typeof statusData.content === 'string') return statusData.content
        if (Array.isArray(statusData.content)) {
          return statusData.content.map((chunk: any) => chunk.text).join(' ')
        }
        if (statusData.result) {
          if (typeof statusData.result === 'string') return statusData.result
          if (typeof statusData.result.content === 'string') return statusData.result.content
          if (Array.isArray(statusData.result.content)) {
            return statusData.result.content.map((chunk: any) => chunk.text).join(' ')
          }
        }
        throw new Error('Transcript completed but no content found')
      }
      
      if (statusData.status === 'failed' || statusData.status === 'error') {
        throw new Error(statusData.error || 'Transcript job failed')
      }
      
      // Статус pending/processing — продолжаем polling
    }
    
    throw new Error('Transcript timeout — video too long or service busy')
  }
  
  // Другие ошибки
  const error = await startResponse.json().catch(() => ({}))
  throw new Error(error.message || `Transcript error: ${startResponse.status}`)
}

// Универсальная функция получения транскрипции
async function getTranscript(url: string, platform: string): Promise<string> {
  if (platform === 'youtube') {
    return getYouTubeTranscript(url)
  }
  return getSocialTranscript(url)
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
    if (!authHeader) {
      return NextResponse.json({ error: 'No authorization header' }, { status: 401 })
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!SUPADATA_API_KEY) {
      return NextResponse.json({ error: 'Supadata API key not configured' }, { status: 500 })
    }

    const { url } = await request.json()

    if (!url) {
      return NextResponse.json({ error: 'URL обязателен' }, { status: 400 })
    }

    const platform = detectPlatform(url)
    
    if (platform === 'other') {
      return NextResponse.json(
        { error: 'Поддерживаются только YouTube, Instagram и TikTok' },
        { status: 400 }
      )
    }

    // Получаем транскрипцию
    let transcript: string
    try {
      transcript = await getTranscript(url, platform)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return NextResponse.json(
        { error: `Не удалось получить транскрипцию: ${message}` },
        { status: 400 }
      )
    }

    if (!transcript || transcript.trim().length < 20) {
      return NextResponse.json(
        { error: 'В видео нет речи или субтитры слишком короткие' },
        { status: 400 }
      )
    }

    // Анализируем через AI
    const platformNames: Record<string, string> = {
      youtube: 'YouTube',
      instagram: 'Instagram Reels',
      tiktok: 'TikTok',
    }
    
    const userPrompt = `Платформа: ${platformNames[platform]}\n\nТранскрипция видео:\n${transcript}`
    const analysis = await generateWithAI(SYSTEM_PROMPT, userPrompt)

    // Сохраняем в базу
    await supabaseAdmin.from('competitor_analyses').insert({
      user_id: user.id,
      url,
      platform: platformNames[platform],
      transcript,
      metadata: null,
      analysis,
    })

    return NextResponse.json({
      success: true,
      analysis,
      transcript,
      metadata: null,
      platform: platformNames[platform],
    })
    
  } catch (error) {
    console.error('Competitor analysis error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Ошибка анализа' },
      { status: 500 }
    )
  }
}
