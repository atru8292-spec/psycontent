'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { motion } from 'framer-motion'
import { AI_MODELS, DEFAULT_MODEL, type ModelId } from '@/lib/openrouter'
import {
  Sparkles, ArrowLeft, Check, Zap, Star, Clock, Save, CheckCircle2
} from 'lucide-react'

export default function SettingsPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [selectedModel, setSelectedModel] = useState<ModelId>(DEFAULT_MODEL)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/'); return }
      setUserId(user.id)

      const { data } = await supabase
        .from('user_settings')
        .select('preferred_model')
        .eq('user_id', user.id)
        .maybeSingle()

      if (data?.preferred_model) {
        setSelectedModel(data.preferred_model as ModelId)
      }
    }
    init()
  }, [router])

  const handleSave = async () => {
    if (!userId) return
    setSaving(true)
    await supabase
      .from('user_settings')
      .upsert({ user_id: userId, preferred_model: selectedModel, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const qualityDots = (n: number) => Array.from({ length: 5 }, (_, i) => (
    <div key={i} className={`w-2 h-2 rounded-full ${i < n ? 'bg-brand-accent' : 'bg-brand-border'}`} />
  ))

  const speedColor = (s: string) => {
    if (s === 'Очень быстрая') return 'text-green-600 bg-green-50'
    if (s === 'Быстрая') return 'text-blue-600 bg-blue-50'
    return 'text-amber-600 bg-amber-50'
  }

  const badgeColor = (b: string | null) => {
    if (!b) return ''
    if (b === 'Рекомендуем') return 'bg-brand-accent text-white'
    if (b === 'Быстрый') return 'bg-blue-500 text-white'
    if (b === 'Новый') return 'bg-purple-500 text-white'
    if (b === 'Бесплатно') return 'bg-green-500 text-white'
    return 'bg-brand-highlight text-brand-accent'
  }

  return (
    <div className="min-h-screen bg-brand-bg">
      {/* Header */}
      <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur border-b border-brand-border">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center gap-3">
          <button
            onClick={() => router.push('/dashboard')}
            className="p-2 -ml-2 text-brand-text-secondary hover:text-brand-text hover:bg-brand-highlight rounded-xl transition cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <Sparkles className="w-5 h-5 text-brand-accent" />
          <span className="font-bold text-brand-text">Настройки AI</span>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>

          <h1 className="text-2xl font-bold text-brand-text mb-1">Модель AI</h1>
          <p className="text-brand-text-secondary mb-8">
            Выберите модель для генерации постов, каруселей, хуков и других материалов.
            Выбор применяется ко всем инструментам сразу.
          </p>

          <div className="flex flex-col gap-3 mb-8">
            {AI_MODELS.map((model) => {
              const active = selectedModel === model.id
              return (
                <motion.button
                  key={model.id}
                  onClick={() => setSelectedModel(model.id as ModelId)}
                  whileTap={{ scale: 0.99 }}
                  className={`w-full text-left p-4 sm:p-5 rounded-2xl border-2 transition cursor-pointer ${
                    active
                      ? 'border-brand-accent bg-brand-highlight/60'
                      : 'border-brand-border bg-white hover:border-brand-accent/40 hover:bg-brand-bg'
                  }`}
                >
                  <div className="flex items-start gap-4">
                    {/* Выбор */}
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 transition ${
                      active ? 'border-brand-accent bg-brand-accent' : 'border-brand-border'
                    }`}>
                      {active && <div className="w-2 h-2 rounded-full bg-white" />}
                    </div>

                    {/* Инфо */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="font-bold text-brand-text">{model.name}</span>
                        <span className="text-xs text-brand-text-secondary">{model.provider}</span>
                        {model.badge && (
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${badgeColor(model.badge)}`}>
                            {model.badge}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-brand-text-secondary mb-3">{model.desc}</p>
                      <div className="flex flex-wrap items-center gap-4">
                        <div className="flex items-center gap-1.5">
                          <Star className="w-3.5 h-3.5 text-brand-text-secondary" />
                          <span className="text-xs text-brand-text-secondary mr-1">Качество</span>
                          <div className="flex gap-0.5">{qualityDots(model.quality)}</div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-brand-text-secondary" />
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${speedColor(model.speed)}`}>
                            {model.speed}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Активная галочка */}
                    {active && <CheckCircle2 className="w-5 h-5 text-brand-accent shrink-0 mt-0.5" />}
                  </div>
                </motion.button>
              )
            })}
          </div>

          {/* Сохранить */}
          <button
            onClick={handleSave}
            disabled={saving || saved}
            className={`w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-semibold text-white transition cursor-pointer ${
              saved
                ? 'bg-green-500'
                : 'bg-brand-accent hover:bg-brand-accent-hover active:scale-[0.98]'
            }`}
          >
            {saved ? (
              <><Check className="w-5 h-5" /> Сохранено</>
            ) : saving ? (
              <><Zap className="w-4 h-4 animate-pulse" /> Сохраняем...</>
            ) : (
              <><Save className="w-5 h-5" /> Сохранить выбор</>
            )}
          </button>

          <p className="text-center text-xs text-brand-text-secondary mt-4">
            Модель применится при следующей генерации. Перезагружать страницы не нужно.
          </p>
        </motion.div>
      </div>
    </div>
  )
}
