'use client'

// Textarea с записью голоса. Микрофон в углу пишет речь, расшифровка добавляется в
// КОНЕЦ текста (не заменяет напечатанное). Логика в useVoiceRecorder, презентация в
// VoiceButton/VoiceStatus, поэтому поведение едино с тестом-архетипом.

import { VoiceButton, VoiceStatus } from '@/components/VoiceButton'
import { useVoiceRecorder } from '@/lib/use-voice-recorder'

// Приклеиваем распознанный кусок к тому, что уже в поле, аккуратной пунктуацией.
export function appendVoiceText(prev: string, add: string): string {
  const p = (prev || '').trimEnd()
  if (!p) return add
  const needsDot = !/[.!?…\n]$/.test(p)
  return p + (needsDot ? '. ' : ' ') + add
}

export default function VoiceTextarea({
  value,
  onChange,
  placeholder,
  minHeight = 140,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  minHeight?: number
}) {
  const rec = useVoiceRecorder((text) => onChange(appendVoiceText(value, text)))

  return (
    <div>
      <div className="relative">
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          style={{ minHeight }}
          className="w-full rounded-2xl bg-[#FDFBF7] border-2 border-gray-200 p-4 pb-12 text-lg text-brand-text leading-relaxed resize-none placeholder:text-brand-muted/50 focus:outline-none focus:border-brand-accent transition"
        />
        <div className="absolute right-3 bottom-3">
          <VoiceButton rec={rec} />
        </div>
      </div>
      <VoiceStatus rec={rec} />
    </div>
  )
}
