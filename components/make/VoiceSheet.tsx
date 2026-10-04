'use client'

// Лист записи голоса на «Сделать»: до 3 минут, за 20 секунд предупреждение, волна по громкости.
// Запись и расшифровку ведет хук useVoiceRecorder в Composer: лист закрывается на «Готово», а поле
// показывает «Расшифровываю...». Расшифровка своим Whisper, ничего не считаем.

import { useEffect, useRef, useState } from 'react'
import BottomSheet from './BottomSheet'
import type { VoiceRecorder } from '@/lib/use-voice-recorder'

export const VOICE_MAX = 180
export const VOICE_NEAR = 160
const INTRO_KEY = 'psycont_mic_intro_seen'

const plural = (n: number, one: string, few: string, many: string) => {
  const a = n % 10, b = n % 100
  return a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many
}
// На айфоне спрашивает Safari, в остальных браузерах просто «браузер»
const isIosSafari = () => typeof navigator !== 'undefined' && /iPhone|iPad|iPod/.test(navigator.userAgent) && !/CriOS|FxiOS|EdgiOS|YaBrowser/.test(navigator.userAgent)

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

function Wave({ rec }: { rec: VoiceRecorder }) {
  const [bars, setBars] = useState<number[]>(() => Array(28).fill(0.08))
  const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  useEffect(() => {
    if (rec.state !== 'recording') return
    let raf = 0, last = 0
    const tick = (t: number) => {
      if (t - last > 90) {
        last = t
        const v = Math.max(0.08, rec.getLevel())
        setBars(b => [...b.slice(1), v])
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [rec.state, rec.getLevel])
  if (reduce) {
    const v = bars[bars.length - 1]
    return <div className="h-16 flex items-center"><div className="h-1.5 rounded-full bg-brand-accent transition-[width]" style={{ width: `${Math.round(v * 100)}%` }} /></div>
  }
  return (
    <div className="h-16 flex items-center justify-center gap-[3px]" aria-hidden="true">
      {bars.map((v, i) => <span key={i} className="w-[3px] rounded-full bg-brand-accent" style={{ height: `${Math.round(8 + v * 56)}px` }} />)}
    </div>
  )
}

export default function VoiceSheet({ open, rec, onClose, onWriteText, maxSeconds = VOICE_MAX, prompt = 'Говори, как подруге. Паузы не страшны.' }: {
  open: boolean
  rec: VoiceRecorder
  onClose: () => void
  onWriteText: () => void
  maxSeconds?: number // предел записи для подсчета «Осталось N секунд» (онбординг: 60)
  prompt?: string     // подсказка над волной (онбординг: «как с клиенткой»)
}) {
  const [intro, setIntro] = useState(false)
  const [tooShort, setTooShort] = useState(false)

  // открыли лист: первый раз объясняем системный вопрос про микрофон, потом сразу пишем
  useEffect(() => {
    if (!open) return
    setTooShort(false)
    let seen = false
    try { seen = localStorage.getItem(INTRO_KEY) === '1' } catch {}
    if (!seen) setIntro(true)
    else if (rec.state === 'idle') rec.start()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // «Готово» или авто-стоп на пределе записи: пошла расшифровка, лист больше не нужен
  useEffect(() => { if (open && rec.state === 'transcribing') onClose() }, [open, rec.state, onClose])

  const close = () => { if (rec.state === 'recording' || rec.state === 'requesting') rec.cancel(); onClose() }
  const done = () => {
    if (rec.elapsed < 1) { rec.cancel(); setTooShort(true); return }
    rec.stop()
  }
  const again = () => { setTooShort(false); rec.cancel(); setTimeout(() => rec.start(), 50) }
  const okIntro = () => {
    try { localStorage.setItem(INTRO_KEY, '1') } catch {}
    setIntro(false)
    rec.start()
  }

  const denied = rec.state === 'error' && rec.errorKind === 'denied'
  const empty = tooShort || (rec.state === 'error' && rec.errorKind === 'empty')
  const btn = 'h-[52px] rounded-2xl text-[16px] font-semibold cursor-pointer transition'

  let body: React.ReactNode
  let footer: React.ReactNode = null
  if (intro) {
    body = <p className="text-[18px] leading-6 text-brand-text py-4">{isIosSafari() ? 'Сейчас Safari спросит про микрофон. Нажми «Разрешить»' : 'Сейчас браузер спросит про микрофон. Нажми «Разрешить»'}</p>
    footer = <button type="button" onClick={okIntro} className={`w-full ${btn} bg-brand-accent text-white hover:bg-brand-accent-hover`}>Понятно</button>
  } else if (denied) {
    body = <p className="text-[16px] leading-6 text-brand-text py-4">{isIosSafari() ? 'Микрофон выключен. Включи его: Настройки → Safari → Микрофон. Или напиши текстом' : 'Микрофон выключен. Включи его в настройках браузера для этого сайта. Или напиши текстом'}</p>
    footer = <button type="button" onClick={onWriteText} className={`w-full ${btn} bg-brand-accent text-white hover:bg-brand-accent-hover`}>Написать текстом</button>
  } else if (empty) {
    body = <p className="text-[16px] leading-6 text-brand-text py-4">Ничего не записалось. Попробуешь еще раз?</p>
    footer = <button type="button" onClick={again} className={`w-full ${btn} bg-brand-accent text-white hover:bg-brand-accent-hover`}>Еще раз</button>
  } else {
    const left = maxSeconds - rec.elapsed
    body = (
      <div className="py-2">
        <p className="text-[18px] leading-6 text-brand-text">{prompt}</p>
        <div className="mt-4"><Wave rec={rec} /></div>
        <p className="mt-2 text-center text-[28px] font-semibold tabular-nums text-brand-text" aria-live="off">{mmss(rec.elapsed)}</p>
        <p className="h-5 text-center text-[13px] text-brand-muted" aria-live="polite">{rec.nearLimit ? `Осталось ${Math.max(0, left)} ${plural(Math.max(0, left), 'секунда', 'секунды', 'секунд')}` : ''}</p>
      </div>
    )
    footer = (
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={again} disabled={rec.state !== 'recording'} className={`${btn} border border-brand-border text-brand-text hover:bg-brand-soft disabled:opacity-40`}>Заново</button>
        <button type="button" onClick={done} disabled={rec.state !== 'recording'} className={`${btn} bg-brand-accent text-white hover:bg-brand-accent-hover disabled:opacity-40`}>Готово</button>
      </div>
    )
  }

  return <BottomSheet open={open} onClose={close} title="Запись голоса" footer={footer}>{body}</BottomSheet>
}
