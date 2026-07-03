'use client'

// Textarea с иконкой микрофона и заглушкой «скоро». Реальной транскрибации пока нет
// (Whisper не подключен), но место под голосовой ввод заложено во всех развернутых
// текстовых полях, чтобы психолог мог диктовать, когда транскрибацию включат.
// Тот же паттерн, что в тесте-архетипе (открытые вопросы). Реализацию транскрибации
// сюда, когда появится свой Whisper (см. раздел обезличивания в CLAUDE.md).

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Mic } from 'lucide-react'

const MIC_SOON = 'Наговорить голосом можно будет скоро. А пока просто напиши, как сказал бы вслух.'

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
  const [micOpen, setMicOpen] = useState(false)
  return (
    <div className="relative">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ minHeight }}
        className="w-full rounded-2xl bg-[#FDFBF7] border-2 border-gray-200 p-4 pb-12 text-lg text-brand-text leading-relaxed resize-none placeholder:text-brand-muted/50 focus:outline-none focus:border-brand-accent transition"
      />
      <div className="absolute right-3 bottom-3">
        <button
          type="button"
          onClick={() => setMicOpen((v) => !v)}
          aria-label="Голосовой ввод"
          className="w-9 h-9 rounded-full border border-brand-border-soft bg-white flex items-center justify-center text-brand-accent hover:bg-brand-soft transition cursor-pointer"
        >
          <Mic className="w-4 h-4" />
        </button>
        <AnimatePresence>
          {micOpen && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              transition={{ duration: 0.18 }}
              className="absolute right-0 bottom-11 w-56 rounded-xl bg-brand-soft border border-brand-border-soft p-3 text-xs text-brand-text/80 leading-relaxed shadow-[0_10px_30px_-12px_rgba(91,79,160,0.35)] z-10"
            >
              {MIC_SOON}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
