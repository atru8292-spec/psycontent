'use client'

// Презентация записи голоса: VoiceButton (кнопка 36px в углу textarea) и VoiceStatus
// (строка-статус под textarea). Оба принимают один объект хука useVoiceRecorder, так
// что VoiceTextarea и тест-архетип показывают одинаковое поведение без рассинхрона.
// Тексты состояний тут (проверены copywriter). Красный не используем (бренд), тревогу
// несет текст, не цвет.

import { AnimatePresence, motion } from 'framer-motion'
import { Mic, Square, Loader2, Check } from 'lucide-react'
import type { VoiceRecorder } from '@/lib/use-voice-recorder'

function fmt(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

// ── Кнопка в углу textarea (родитель ставит ее в absolute right-3 bottom-3) ──
export function VoiceButton({ rec }: { rec: VoiceRecorder }) {
  const { state, errorKind } = rec
  const recording = state === 'recording'
  const busy = state === 'requesting' || state === 'transcribing'

  const label =
    recording ? 'Остановить запись' :
    state === 'transcribing' ? 'Расшифровываю голос' :
    'Записать голосом'

  const onClick = () => {
    if (recording) rec.stop()
    else if (!busy) rec.start()
  }

  return (
    <div className="relative">
      {/* Тихая пульсация за кнопкой во время записи (без движения при reduced-motion) */}
      {recording && (
        <span className="absolute inset-0 rounded-full bg-brand-accent/30 motion-safe:animate-ping pointer-events-none" aria-hidden />
      )}
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        aria-label={label}
        className={`relative w-9 h-9 rounded-full border flex items-center justify-center transition cursor-pointer disabled:cursor-default ${
          recording
            ? 'bg-brand-accent border-brand-accent text-white'
            : 'bg-white border-brand-border-soft text-brand-accent hover:bg-brand-soft'
        }`}
      >
        {state === 'requesting' || state === 'transcribing' ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : recording ? (
          <Square className="w-3.5 h-3.5 fill-current" />
        ) : (
          <Mic className="w-4 h-4" />
        )}
      </button>

      {/* Отказ в доступе объясняем поповером (текста больше, чем в строке-статусе) */}
      <AnimatePresence>
        {errorKind === 'denied' && (
          <motion.div
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.18 }}
            className="absolute right-0 bottom-11 w-60 rounded-xl bg-brand-soft border border-brand-border-soft p-3 text-xs text-brand-text/80 leading-relaxed shadow-[0_10px_30px_-12px_rgba(91,79,160,0.35)] z-10"
          >
            <p>Браузер не пускает к микрофону. Разреши доступ в настройках сайта, и продиктуешь.</p>
            <button type="button" onClick={rec.reset} className="mt-2 text-brand-accent font-medium cursor-pointer">Понятно</button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Строка-статус под textarea. Высота зарезервирована, чтобы верстка не прыгала ──
export function VoiceStatus({ rec }: { rec: VoiceRecorder }) {
  const { state, elapsed, errorKind, nearLimit, justFinished } = rec

  let content: React.ReactNode = null

  if (state === 'recording') {
    content = (
      <div className="flex items-center gap-2 text-brand-accent">
        <span className="tabular-nums shrink-0">{fmt(elapsed)}</span>
        <span className="truncate">{nearLimit ? 'Заканчивай мысль, скоро остановлю' : 'Слушаю'}</span>
        <button type="button" onClick={rec.cancel} className="shrink-0 ml-auto text-brand-muted hover:text-brand-text transition cursor-pointer">Отменить</button>
      </div>
    )
  } else if (state === 'transcribing') {
    content = (
      <div className="flex items-center gap-2 text-brand-muted">
        <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
        <span>Перевожу в текст, пару секунд</span>
      </div>
    )
  } else if (errorKind === 'network') {
    content = (
      <div className="flex items-center gap-2 text-brand-text/80">
        <span className="truncate">Связь подвела. Попробуй записать еще раз.</span>
        <button type="button" onClick={rec.retry} className="shrink-0 ml-auto text-brand-accent font-medium hover:underline cursor-pointer">Повторить</button>
      </div>
    )
  } else if (errorKind === 'empty') {
    content = (
      <div className="flex items-center gap-2 text-brand-text/80">
        <span className="truncate">Ничего не расслышал. Повтори чуть ближе к микрофону.</span>
        <button type="button" onClick={rec.reset} className="shrink-0 ml-auto text-brand-muted hover:text-brand-text transition cursor-pointer">Скрыть</button>
      </div>
    )
  } else if (justFinished) {
    content = (
      <div className="flex items-center gap-1.5 text-brand-sage">
        <Check className="w-3.5 h-3.5 shrink-0" />
        <span>Готово</span>
      </div>
    )
  }

  // min-h держит место под одну строку всегда (idle пусто, поле не дергается).
  return <div className="min-h-[20px] mt-1.5 text-xs leading-tight">{content}</div>
}
