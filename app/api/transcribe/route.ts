import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const maxDuration = 60

const SUPADATA_API_KEY = process.env.SUPADATA_API_KEY
const SUPADATA_BASE_URL = 'https://api.supadata.ai/v1'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function detectPlatform(url: string): 'youtube' | 'instagram' | 'tiktok' | 'other' {
  if (url.includes('youtube.com') || url.includes('youtu.be')) return 'youtube'
  if (url.includes('instagram.com')) return 'instagram'
  if (url.includes('tiktok.com')) return 'tiktok'
  return 'other'
}

async function getYouTubeTranscript(url: string): Promise<string> {
  const response = await fetch(
    `${SUPADATA_BASE_URL}/youtube/transcript?url=${encodeURIComponent(url)}&text=true`,
    { method: 'GET', headers: { 'x-api-key': SUPADATA_API_KEY! } }
  )
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.message || `YouTube transcript error: ${response.status}`)
  }
  const data = await response.json()
  if (typeof data.content === 'string') return data.content
  if (Array.isArray(data.content)) return data.content.map((c: any) => c.text).join(' ')
  throw new Error('Unexpected transcript format')
}

function extractContent(data: any): string | null {
  if (typeof data.content === 'string' && data.content.trim()) return data.content
  if (Array.isArray(data.content)) return data.content.map((c: any) => c.text || '').join(' ')
  return null
}

async function getSocialTranscript(url: string): Promise<string> {
  // mode=auto: try native first, fallback to AI generation
  // text=true: return plain string instead of chunks
  const startResponse = await fetch(
    `${SUPADATA_BASE_URL}/transcript?url=${encodeURIComponent(url)}&mode=auto&text=true`,
    { method: 'GET', headers: { 'x-api-key': SUPADATA_API_KEY! } }
  )

  // 200 — got transcript immediately
  if (startResponse.status === 200) {
    const data = await startResponse.json()
    const content = extractContent(data)
    if (content) return content
    throw new Error('Empty transcript returned')
  }

  // 202 — async job started, need to poll
  if (startResponse.status === 202) {
    const { jobId } = await startResponse.json()
    if (!jobId) throw new Error('No jobId returned')

    // Poll every 2s up to 25 attempts = max ~50s
    const maxAttempts = 25
    const delayMs = 2000

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise(resolve => setTimeout(resolve, delayMs))

      // Correct endpoint per docs: /transcript/{jobId}
      const statusResponse = await fetch(
        `${SUPADATA_BASE_URL}/transcript/${jobId}`,
        { method: 'GET', headers: { 'x-api-key': SUPADATA_API_KEY! } }
      )
      if (!statusResponse.ok) continue

      const statusData = await statusResponse.json()

      if (statusData.status === 'completed') {
        const content = extractContent(statusData)
        if (content) return content
        throw new Error('Transcript completed but content is empty')
      }

      if (statusData.status === 'failed') {
        throw new Error(statusData.error || 'Transcript job failed')
      }
      // queued / active — continue polling
    }

    throw new Error('Время ожидания истекло. Попробуй ещё раз через несколько секунд')
  }

  // 206 — transcript unavailable (private/restricted video)
  if (startResponse.status === 206) {
    throw new Error('Видео недоступно — оно может быть закрытым или требовать авторизацию')
  }

  // 404 — video not found or private
  if (startResponse.status === 404) {
    throw new Error('Видео не найдено — проверь что ссылка публичная и открывается без авторизации')
  }

  // 403 — authentication required
  if (startResponse.status === 403) {
    throw new Error('Видео требует авторизации — проверь что оно открывается в режиме инкогнито')
  }

  const errorBody = await startResponse.text().catch(() => '')
  console.error(`Supadata error ${startResponse.status}:`, errorBody)
  let errorMessage = `Transcript error: ${startResponse.status}`
  try {
    const parsed = JSON.parse(errorBody)
    errorMessage = parsed.message || parsed.error || errorMessage
  } catch {}
  throw new Error(errorMessage)
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) return NextResponse.json({ error: 'No authorization header' }, { status: 401 })

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    if (!SUPADATA_API_KEY) return NextResponse.json({ error: 'Supadata API key not configured' }, { status: 500 })

    const { url } = await request.json()
    if (!url) return NextResponse.json({ error: 'URL обязателен' }, { status: 400 })

    const platform = detectPlatform(url)
    if (platform === 'other') {
      return NextResponse.json({ error: 'Поддерживаются только YouTube, Instagram и TikTok' }, { status: 400 })
    }

    const platformNames: Record<string, string> = {
      youtube: 'YouTube',
      instagram: 'Instagram Reels',
      tiktok: 'TikTok',
    }

    let transcript: string
    try {
      transcript = platform === 'youtube'
        ? await getYouTubeTranscript(url)
        : await getSocialTranscript(url)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return NextResponse.json({ error: `Не удалось получить транскрипцию: ${message}` }, { status: 400 })
    }

    if (!transcript || transcript.trim().length < 20) {
      return NextResponse.json({ error: 'В видео нет речи или субтитры слишком короткие' }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      transcript,
      platform: platformNames[platform],
    })

  } catch (error) {
    console.error('Transcribe error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Ошибка транскрипции' },
      { status: 500 }
    )
  }
}
