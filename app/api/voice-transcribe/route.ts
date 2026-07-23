// app/api/voice-transcribe/route.ts
// Мост браузер -> транскрибатор. Принимает аудио от вошедшего психолога, пересылает
// на наш Whisper-сервис (отдельный сервер) и возвращает текст. Свое аудио на диск не
// пишем, держим в памяти на время пересылки. Реальную запись голоса в браузере и
// подключение к полям делаем в 6.2, тут только серверный мост (этап 6.1, часть Б).
//
// Энергия тут НЕ списывается: голосовой ввод в поля профиля это setup, а не генерация
// контента, брать за него энергию оттолкнет. Финальное решение по учету примем в 6.2,
// когда фича доходит до пользователя.

import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'

export const runtime = 'nodejs'
// Верхний порог ожидания. Длинный монолог (6.3) на small/CPU идет дольше короткой
// диктовки. Значение подстроим под реальный замер latency с сервера транскрибатора.
export const maxDuration = 120

const SERVICE_URL = process.env.WHISPER_SERVICE_URL
const SERVICE_TOKEN = process.env.WHISPER_SERVICE_TOKEN
const MAX_BYTES = 25 * 1024 * 1024 // 25 МБ, зеркалит лимит сервиса
const UPSTREAM_TIMEOUT_MS = 110_000 // чуть меньше maxDuration, чтобы успеть отдать ответ

export async function POST(request: NextRequest) {
  try {
    const user = await getSessionUser()
    if (!user) {
      return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
    }

    if (!SERVICE_URL || !SERVICE_TOKEN) {
      console.error('voice-transcribe: WHISPER_SERVICE_URL/TOKEN не заданы')
      return NextResponse.json({ error: 'Транскрибация временно недоступна' }, { status: 503 })
    }

    // Ранний заслон по заголовку, ДО чтения тела в память: гигантский запрос отбиваем
    // до formData(), чтобы не грузить слабый сервер. Запас на multipart-обвязку.
    const contentLength = Number(request.headers.get('content-length') || 0)
    if (contentLength > MAX_BYTES + 1024 * 1024) {
      return NextResponse.json({ error: 'Запись слишком длинная' }, { status: 413 })
    }

    const form = await request.formData()
    const file = form.get('file')
    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'Файл не передан' }, { status: 400 })
    }

    const blob = file as Blob
    if (blob.size === 0) {
      return NextResponse.json({ error: 'Пустой файл' }, { status: 400 })
    }
    if (blob.size > MAX_BYTES) {
      return NextResponse.json({ error: 'Запись слишком длинная' }, { status: 413 })
    }

    // Пересобираем multipart и шлем на сервис с СЕРВЕРНЫМ токеном (клиент его не видит).
    const upstreamForm = new FormData()
    upstreamForm.append('file', blob, (file as File).name || 'audio')

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS)

    let res: Response
    try {
      res = await fetch(`${SERVICE_URL}/transcribe`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${SERVICE_TOKEN}` },
        body: upstreamForm,
        signal: controller.signal,
      })
    } catch (e: any) {
      if (e?.name === 'AbortError') {
        return NextResponse.json({ error: 'Расшифровка заняла слишком долго, попробуй короче' }, { status: 504 })
      }
      console.error('voice-transcribe: сервис недоступен:', e?.message)
      return NextResponse.json({ error: 'Транскрибация временно недоступна' }, { status: 503 })
    } finally {
      clearTimeout(timer)
    }

    if (res.status === 413) {
      return NextResponse.json({ error: 'Запись слишком длинная' }, { status: 413 })
    }
    if (res.status === 504) {
      return NextResponse.json({ error: 'Расшифровка заняла слишком долго, попробуй короче' }, { status: 504 })
    }
    if (!res.ok) {
      // 401 от сервиса это наш кривой токен (конфиг), а не вина юзера. Не палим детали.
      console.error('voice-transcribe: сервис вернул', res.status)
      return NextResponse.json({ error: 'Не удалось расшифровать, попробуй еще раз' }, { status: 502 })
    }

    const data = await res.json().catch(() => null)
    const text = typeof data?.text === 'string' ? data.text.trim() : ''
    // Пустой текст при 200 = речь не распозналась (контракт сервиса). Отдаем как есть,
    // клиент покажет мягкое «не расслышал, повтори». Текст не логируем (перс. данные).
    return NextResponse.json({ text })
  } catch (e: any) {
    console.error('voice-transcribe error:', e?.message)
    return NextResponse.json({ error: 'Не удалось расшифровать, попробуй еще раз' }, { status: 500 })
  }
}
