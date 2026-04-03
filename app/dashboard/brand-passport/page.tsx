'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { motion } from 'framer-motion'
import {
  Sparkles,
  ArrowLeft,
  Loader2,
  Target,
  RefreshCw,
  Copy,
  Check,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'

export default function BrandPassport() {
  const [user, setUser] = useState<any>(null)
  const [passport, setPassport] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/')
        return
      }
      setUser(user)

      const { data } = await supabase
        .from('brand_passports')
        .select('content')
        .eq('user_id', user.id)
        .single()

      if (data?.content) {
        setPassport(data.content)
      }
      setLoading(false)
    }
    init()
  }, [router])

  const handleGenerate = async () => {
    if (!user) return
    setGenerating(true)
    setError(null)

    try {
      const response = await fetch('/api/generate-passport', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Ошибка генерации')
      }

      setPassport(data.passport)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setGenerating(false)
    }
  }

  const handleCopy = () => {
    if (passport) {
      navigator.clipboard.writeText(passport)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-brand-bg flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-brand-accent border-t-transparent rounded-full"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-brand-bg">
      {/* Header */}
      <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur border-b border-brand-border">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
          <button
            onClick={() => router.push('/dashboard')}
            className="flex items-center gap-2 text-brand-text-secondary hover:text-brand-text transition cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
            Назад в кабинет
          </button>
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-brand-accent" />
            <span className="font-bold text-brand-text">PsyContent</span>
          </div>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-6 py-12">
        {/* Title */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-10"
        >
          <div className="inline-flex items-center gap-2 bg-purple-100 text-purple-600 px-4 py-2 rounded-full text-sm font-medium mb-4">
            <Target className="w-4 h-4" />
            Паспорт бренда
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-brand-text mb-3">
            Ваш персональный паспорт бренда
          </h1>
          <p className="text-brand-text-secondary max-w-xl mx-auto">
            AI проанализирует вашу распаковку и создаст документ с позиционированием,
            тоном голоса, аватаром клиента и контент-стратегией
          </p>
        </motion.div>

        {/* Generate Button */}
        {!passport && !generating && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-center"
          >
            <button
              onClick={handleGenerate}
              className="inline-flex items-center gap-3 bg-brand-accent text-white px-10 py-5 rounded-2xl text-lg font-semibold hover:bg-brand-accent-hover transition shadow-lg shadow-brand-accent/25 cursor-pointer"
            >
              <Sparkles className="w-6 h-6" />
              Сгенерировать паспорт бренда
            </button>
            <p className="text-sm text-brand-text-secondary mt-4">
              Генерация занимает 30-60 секунд
            </p>

            {error && (
              <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
                {error}
              </div>
            )}
          </motion.div>
        )}

        {/* Loading */}
        {generating && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-20"
          >
            <Loader2 className="w-12 h-12 text-brand-accent animate-spin mx-auto mb-6" />
            <h2 className="text-xl font-bold text-brand-text mb-2">
              AI создаёт ваш паспорт бренда...
            </h2>
            <p className="text-brand-text-secondary mb-4">
              Анализируем вашу распаковку, подбираем архетип, формулируем позиционирование
            </p>
            <div className="max-w-md mx-auto space-y-3 text-left">
              <div className="flex items-center gap-3 text-sm text-brand-text-secondary">
                <div className="animate-pulse w-2 h-2 bg-brand-accent rounded-full"></div>
                Определяем миссию и позиционирование...
              </div>
              <div className="flex items-center gap-3 text-sm text-brand-text-secondary">
                <div className="animate-pulse w-2 h-2 bg-brand-accent rounded-full" style={{ animationDelay: '0.5s' }}></div>
                Подбираем архетип бренда...
              </div>
              <div className="flex items-center gap-3 text-sm text-brand-text-secondary">
                <div className="animate-pulse w-2 h-2 bg-brand-accent rounded-full" style={{ animationDelay: '1s' }}></div>
                Формулируем тон голоса и контентные столбы...
              </div>
              <div className="flex items-center gap-3 text-sm text-brand-text-secondary">
                <div className="animate-pulse w-2 h-2 bg-brand-accent rounded-full" style={{ animationDelay: '1.5s' }}></div>
                Пишем примеры постов в вашем тоне...
              </div>
            </div>
          </motion.div>
        )}

        {/* Result */}
        {passport && !generating && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            {/* Action buttons */}
            <div className="flex items-center justify-between mb-6">
              <button
                onClick={handleCopy}
                className="flex items-center gap-2 text-sm text-brand-text-secondary hover:text-brand-accent transition cursor-pointer"
              >
                {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Скопировано!' : 'Копировать весь текст'}
              </button>
              <button
                onClick={handleGenerate}
                className="flex items-center gap-2 text-sm text-brand-text-secondary hover:text-brand-accent transition cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
                Сгенерировать заново
              </button>
            </div>

            {/* Passport content */}
            <div className="bg-white rounded-2xl border border-brand-border p-8 md:p-12 shadow-sm">
              <div className="flex items-center gap-3 mb-8 pb-6 border-b border-brand-border">
                <div className="w-12 h-12 bg-brand-highlight rounded-xl flex items-center justify-center">
                  <Target className="w-6 h-6 text-brand-accent" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-brand-text">Паспорт бренда</h2>
                  <p className="text-sm text-brand-text-secondary">
                    Создано AI на основе вашей распаковки
                  </p>
                </div>
              </div>

              <div className="prose prose-lg max-w-none prose-headings:text-brand-text prose-headings:font-bold prose-p:text-brand-text-secondary prose-li:text-brand-text-secondary prose-strong:text-brand-text">
                <ReactMarkdown>{passport}</ReactMarkdown>
              </div>
            </div>

            {/* Next step */}
            <div className="mt-8 p-6 bg-brand-accent rounded-2xl text-white text-center">
              <h3 className="text-lg font-bold mb-2">Паспорт готов! Что дальше? 🚀</h3>
              <p className="text-white/80 mb-4">
                Теперь используйте контентные столбы для генерации постов
              </p>
              <button
                onClick={() => router.push('/dashboard')}
                className="bg-white text-brand-accent px-6 py-2 rounded-full font-semibold hover:bg-white/90 transition cursor-pointer"
              >
                Вернуться в кабинет
              </button>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  )
}
