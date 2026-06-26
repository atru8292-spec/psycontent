'use client'

import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { ArrowLeft, Cpu, Info } from 'lucide-react'

export default function SettingsPage() {
  const router = useRouter()

  return (
    <div className="min-h-screen bg-brand-bg">
      {/* Header */}
      <nav className="sticky top-0 z-50 bg-brand-card/80 backdrop-blur border-b border-brand-border">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center gap-3">
          <button
            onClick={() => router.push('/dashboard')}
            className="p-2 -ml-2 text-brand-muted hover:text-brand-text hover:bg-brand-soft rounded-2xl transition cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <Cpu className="w-5 h-5 text-brand-accent" />
          <span className="font-bold text-brand-text">Настройки</span>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>

          <h1 className="text-2xl font-bold text-brand-text mb-1">AI-модель</h1>
          <p className="text-brand-muted mb-8">
            Все генерации используют одну модель, GPT&nbsp;5.4. Она подобрана специально под психологический контент и обеспечивает лучший результат.
          </p>

          <div className="soft-panel flex items-start gap-4">
            <div className="w-10 h-10 rounded-2xl bg-brand-soft-2 flex items-center justify-center shrink-0">
              <Info className="w-5 h-5 text-brand-accent" />
            </div>
            <div>
              <p className="font-semibold text-brand-text mb-1">GPT 5.4, единая модель</p>
              <p className="text-sm text-brand-muted leading-relaxed">
                Мы провели тесты и выбрали модель, которая лучше всего понимает контекст психологических текстов и звучит как живой человек, а не как нейросеть. Выбор модели вручную временно недоступен.
              </p>
            </div>
          </div>

        </motion.div>
      </div>
    </div>
  )
}
