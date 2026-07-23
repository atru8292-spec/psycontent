'use client'

// Логика записи голоса: getUserMedia -> MediaRecorder -> POST /api/voice-transcribe -> текст.
// Headless (без разметки и текстов интерфейса), состояние отдает наружу. Реюз в
// VoiceTextarea и тесте-архетипе через общие компоненты VoiceButton/VoiceStatus.
// Аудио живет только в памяти клиента до успешной отправки (для «Повторить»), на диск
// ничего не пишем. Обезличивание не нужно тут: голос идет на НАШ Whisper, не в OpenAI.

import { useCallback, useEffect, useRef, useState } from 'react'

export type VoiceState = 'idle' | 'requesting' | 'recording' | 'transcribing' | 'error'
export type VoiceError = 'denied' | 'network' | 'empty' | null

const MAX_SECONDS = 120 // авто-стоп на 2 минутах (решение по 6.2)
const NEAR_LIMIT = 105 // 1:45, мягкое предупреждение «заканчивай мысль»

export interface VoiceRecorder {
  state: VoiceState
  elapsed: number
  errorKind: VoiceError
  nearLimit: boolean
  justFinished: boolean
  start: () => void
  stop: () => void
  cancel: () => void
  retry: () => void
  reset: () => void
}

export function useVoiceRecorder(onText: (text: string) => void): VoiceRecorder {
  const [state, setState] = useState<VoiceState>('idle')
  const [elapsed, setElapsed] = useState(0)
  const [errorKind, setErrorKind] = useState<VoiceError>(null)
  const [justFinished, setJustFinished] = useState(false)

  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const cancelledRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const finishTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastBlobRef = useRef<Blob | null>(null)
  // onText в ref, чтобы upload видел свежий колбэк (замыкание с актуальным value поля).
  const onTextRef = useRef(onText)
  onTextRef.current = onText

  const clearTimer = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
  }

  const upload = useCallback(async (blob: Blob) => {
    lastBlobRef.current = blob
    setState('transcribing')
    try {
      const ext = blob.type.includes('mp4') ? 'mp4' : blob.type.includes('ogg') ? 'ogg' : 'webm'
      const fd = new FormData()
      fd.append('file', blob, `voice.${ext}`)
      const res = await fetch('/api/voice-transcribe', { method: 'POST', body: fd })
      if (!res.ok) { setState('error'); setErrorKind('network'); return }
      const data = await res.json().catch(() => null)
      const text = typeof data?.text === 'string' ? data.text.trim() : ''
      // Отменили пока ждали расшифровку -> текст не вставляем (фантомная вставка).
      if (cancelledRef.current) { setState('idle'); return }
      if (!text) { setState('error'); setErrorKind('empty'); return }
      onTextRef.current(text)
      setState('idle')
      setElapsed(0)
      setJustFinished(true)
      if (finishTimerRef.current) clearTimeout(finishTimerRef.current)
      finishTimerRef.current = setTimeout(() => setJustFinished(false), 1500)
    } catch {
      setState('error'); setErrorKind('network')
    }
  }, [])

  const stop = useCallback(() => {
    clearTimer()
    const mr = recorderRef.current
    if (mr && mr.state !== 'inactive') mr.stop() // onstop соберет blob и вызовет upload
  }, [])
  const stopRef = useRef(stop)
  stopRef.current = stop

  const start = useCallback(async () => {
    setErrorKind(null)
    setJustFinished(false)
    setState('requesting')
    try {
      if (!navigator.mediaDevices || typeof MediaRecorder === 'undefined') {
        setState('error'); setErrorKind('denied'); return
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const mr = new MediaRecorder(stream)
      recorderRef.current = mr
      chunksRef.current = []
      cancelledRef.current = false

      mr.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunksRef.current.push(e.data) }
      mr.onstop = () => {
        // Гасим микрофон (иначе индикатор записи висит в браузере).
        streamRef.current?.getTracks().forEach((t) => t.stop())
        streamRef.current = null
        if (cancelledRef.current) { setState('idle'); setElapsed(0); return }
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || 'audio/webm' })
        chunksRef.current = []
        if (blob.size === 0) { setState('error'); setErrorKind('empty'); return }
        upload(blob)
      }

      mr.start()
      setState('recording')
      setElapsed(0)
      clearTimer()
      timerRef.current = setInterval(() => {
        setElapsed((prev) => {
          const next = prev + 1
          if (next >= MAX_SECONDS) stopRef.current() // авто-стоп с отправкой
          return next
        })
      }, 1000)
    } catch {
      // NotAllowedError (отказ) или NotFoundError (нет микрофона) -> одна мягкая ветка.
      setState('error'); setErrorKind('denied')
    }
  }, [upload])

  const cancel = useCallback(() => {
    // true и при recording, и при transcribing: upload по завершении не вставит текст.
    cancelledRef.current = true
    clearTimer()
    const mr = recorderRef.current
    if (mr && mr.state !== 'inactive') mr.stop()
    else { setState('idle'); setElapsed(0) }
  }, [])

  const retry = useCallback(() => {
    if (lastBlobRef.current) { cancelledRef.current = false; upload(lastBlobRef.current) }
  }, [upload])

  const reset = useCallback(() => { setErrorKind(null); setState('idle') }, [])

  // Уборка при размонтировании: стоп таймера и микрофона.
  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (finishTimerRef.current) clearTimeout(finishTimerRef.current)
    streamRef.current?.getTracks().forEach((t) => t.stop())
  }, [])

  return {
    state, elapsed, errorKind,
    nearLimit: state === 'recording' && elapsed >= NEAR_LIMIT,
    justFinished,
    start, stop, cancel, retry, reset,
  }
}
