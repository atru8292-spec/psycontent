'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Sparkles,
  ArrowLeft,
  Loader2,
  RefreshCcw,
  Copy,
  Check,
  AlignLeft,
  Image as ImageIcon,
  Film,
  FileText,
  Wand2,
  BrainCircuit,
  MessageSquare,
  TrendingUp
} from 'lucide-react'

const formats = [
  { id: 'post', label: 'Текстовый пост', icon: AlignLeft },
  { id: 'carousel', label: 'Карусель', icon: ImageIcon },
  { id: 'reels', label: 'Рилс-скрипт', icon: Film },
  { id: 'stories', label: 'Сторис', icon: FileText },
]

const rewriteGoals = [
  { id: 'clearer', label: 'Сделать проще и понятнее', icon: Wand2, desc: 'Убрать сложный академический язык' },
  { id: 'engaging', label: 'Добавить вовлечения', icon: MessageSquare, desc: 'Добавить крутой хук и сторителлинг' },
  { id: 'expert', label: 'Повысить экспертность', icon: BrainCircuit, desc: 'Глубже раскрыть механизмы психики' },
  { id: 'sales', label: 'Мягко продать услугу', icon: TrendingUp, desc: 'Добавить нативную подводку к записи' },
]

export default function RewriteGenerator() {
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  const [sourceText, setSourceText] = useState('')
  const [selectedFormat, setSelectedFormat] = useState('post')
  const [selectedGoal, setSelectedGoal] = useState('engaging')

  const [generating, setGenerating] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const router = useRouter()

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/'); return }
      setUser(user)

      const { data } = await supabase
        .from('onboarding_profiles')
        .select('*')
        .eq('user_id', user.id)
        .single()

      if (!data) { router.push('/onboarding'); return }
      setLoading(false)
    }
    init()
  }, [router])

  const canGenerate = sourceText.trim().length > 20

  const handleRewrite = async () => {
    if (!user || !canGenerate) return
    setGenerating(true)
    setResult(null)
    setError(null)

    try {
      const response = await fetch('/api/rewrite-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          sourceText,
          format: selectedFormat,
          goal: selectedGoal,
        }),
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Ошибка переписывания')
      setResult(data.post)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setGenerating(false)
    }
  }

  const handleCopy = () => {
    if (result) {
      navigator.clipboard.writeText(result)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const formatResult = (text: string) => {
    return text.split('\n').map((line, i) => {
      if (!line.trim()) return <br key={i} />
      
      const isSlide = line.match(/^\[(Слайд\s*\d+|Последний слайд)\]/i)
      const isReelBlock = line.trim().startsWith('[') && line.trim().endsWith(']')

      if (isSlide) {
        const slideText = line.substring(line.indexOf(']') + 1).trim()
        return (
          <div key={i} className="mb-4 mt-6 first:mt-0 bg-blue-50 border border-blue-100 p-4 rounded-xl">
            <span className="inline-block bg-blue-600 text-white font-bold px-2 py-0.5 rounded text-xs mb-2">
              {line.substring(line.indexOf('[') + 1, line.indexOf(']'))}
            </span>
            <p className="text-brand-text font-medium">{slideText}</p>
          </div>
        )
      }

      if (isReelBlock) {
        return (
          <div key={i} className="mt-4 first:mt-0">
            <span className="inline-block bg-indigo-50 text-indigo-700 font-bold px-3 py-1 rounded border border-indigo-100 text-sm mb-1">
              {line}
            </span>
          </div>
        )
      }

      const hasBold = line.includes('**')
      if (hasBold) {
        const parts = line.split('**')
        return (
          <p key={i} className="text-brand-text text-sm leading-relaxed mb-2">
            {parts.map((part, j) => j % 2 === 1 ? <strong key={j}>{part}</strong> : part)}
          </p>
        )
      }
      return <p key={i} className="text-brand-text text-sm leading-relaxed mb-2">{line}</p>
    })
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-brand-bg flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-brand-accent border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-brand-bg flex flex-col">
      {/* Header */}
      <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur border-b border-brand-border">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
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

      <div className="max-w-7xl mx-auto px-6 py-8 w-full flex-1 flex flex-col">
        {/* Title */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-brand-text mb-2 flex items-center gap-3">
              <RefreshCcw className="w-7 h-7 text-cyan-500" />
              Превратить мысли в пост
            </h1>
            <p className="text-brand-text-secondary">
              Вставьте свои заметки, скучный текст или расшифровку аудио, а ИИ упакует это в вирусный контент.
            </p>
          </div>
          
          <motion.button
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            onClick={handleRewrite}
            disabled={!canGenerate || generating}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl font-semibold transition cursor-pointer ${canGenerate && !generating ? 'bg-cyan-500 text-white hover:bg-cyan-600 shadow-lg shadow-cyan-500/25' : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}
          >
            {generating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Wand2 className="w-5 h-5" />}
            {generating ? 'Магия в процессе...' : 'Переписать'}
          </motion.button>
        </motion.div>

        {/* Workspace */}
        <div className="grid lg:grid-cols-2 gap-6 flex-1 min-h-[600px]">
          
          {/* Left Panel: Input & Settings */}
          <div className="flex flex-col gap-6">
            
            {/* Input area */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="flex-1 flex flex-col bg-white rounded-2xl border border-brand-border overflow-hidden">
              <div className="bg-gray-50 border-b border-brand-border px-4 py-3 font-semibold text-brand-text flex items-center gap-2">
                <span className="w-6 h-6 rounded bg-gray-200 flex items-center justify-center text-xs">1</span>
                Ваш исходный текст
              </div>
              <textarea
                value={sourceText}
                onChange={(e) => setSourceText(e.target.value)}
                placeholder="Вставьте сюда свой текст, черновик, или 'поток мыслей'..."
                className="flex-1 w-full p-4 resize-none focus:outline-none text-brand-text leading-relaxed"
              />
              <div className="bg-gray-50 border-t border-brand-border px-4 py-2 flex justify-end">
                <span className={`text-xs ${sourceText.length > 20 ? 'text-gray-500' : 'text-red-400'}`}>
                  {sourceText.length} символов {sourceText.length <= 20 && '(нужно больше)'}
                </span>
              </div>
            </motion.div>

            {/* Settings area */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-white rounded-2xl border border-brand-border p-5">
              <div className="font-semibold text-brand-text mb-4 flex items-center gap-2">
                <span className="w-6 h-6 rounded bg-gray-200 flex items-center justify-center text-xs">2</span>
                Настройки адаптации
              </div>

              {/* Format selection */}
              <div className="mb-5">
                <p className="text-xs font-semibold text-brand-text-secondary uppercase tracking-wider mb-2">Во что превратить?</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {formats.map(f => {
                    const Icon = f.icon
                    const isSelected = selectedFormat === f.id
                    return (
                      <button
                        key={f.id}
                        onClick={() => setSelectedFormat(f.id)}
                        className={`flex flex-col items-center justify-center gap-1.5 p-3 rounded-lg border cursor-pointer transition ${isSelected ? 'border-cyan-500 bg-cyan-50 text-cyan-700' : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:bg-gray-50'}`}
                      >
                        <Icon className="w-5 h-5" />
                        <span className="text-xs font-medium">{f.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Goal selection */}
              <div>
                <p className="text-xs font-semibold text-brand-text-secondary uppercase tracking-wider mb-2">Что нужно улучшить?</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {rewriteGoals.map(g => {
                    const Icon = g.icon
                    const isSelected = selectedGoal === g.id
                    return (
                      <button
                        key={g.id}
                        onClick={() => setSelectedGoal(g.id)}
                        className={`flex items-start gap-3 p-3 rounded-lg border text-left cursor-pointer transition ${isSelected ? 'border-cyan-500 bg-cyan-50' : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'}`}
                      >
                        <Icon className={`w-5 h-5 mt-0.5 ${isSelected ? 'text-cyan-600' : 'text-gray-400'}`} />
                        <div>
                          <p className={`text-sm font-medium ${isSelected ? 'text-cyan-800' : 'text-gray-700'}`}>{g.label}</p>
                          <p className={`text-[10px] mt-0.5 ${isSelected ? 'text-cyan-600' : 'text-gray-500'}`}>{g.desc}</p>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>

            </motion.div>
          </div>

          {/* Right Panel: Output */}
          <div className="flex flex-col">
            <AnimatePresence mode="wait">
              {!result && !generating && !error && (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="flex-1 flex flex-col items-center justify-center text-center p-12 bg-white rounded-2xl border border-dashed border-gray-300"
                >
                  <RefreshCcw className="w-16 h-16 text-gray-100 mb-4" />
                  <p className="text-brand-text-secondary font-medium text-lg">Готовый результат</p>
                  <p className="text-sm text-brand-text-secondary mt-2 max-w-sm">Мы не придумываем новые факты, но делаем так, чтобы текст цеплял внимание и продавал вашу экспертность.</p>
                </motion.div>
              )}

              {generating && (
                <motion.div
                  key="loading"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="flex-1 flex flex-col items-center justify-center text-center p-12 bg-white rounded-2xl border border-brand-border"
                >
                  <div className="relative">
                    <Loader2 className="w-12 h-12 text-cyan-500 animate-spin mb-4" />
                    <Sparkles className="w-5 h-5 text-yellow-400 absolute top-0 -right-2 animate-pulse" />
                  </div>
                  <p className="font-semibold text-brand-text text-lg">Улучшаем текст...</p>
                  <p className="text-sm text-brand-text-secondary mt-1">Добавляем хуки, убираем воду, настраиваем ваш Tone of Voice.</p>
                </motion.div>
              )}

              {error && (
                <motion.div
                  key="error"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className="p-6 bg-red-50 border border-red-200 rounded-2xl text-red-600 text-sm"
                >
                  {error}
                </motion.div>
              )}

              {result && !generating && (
                <motion.div
                  key="result"
                  initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                  className="flex-1 flex flex-col bg-white rounded-2xl border border-brand-border overflow-hidden"
                >
                  <div className="flex items-center justify-between px-4 py-3 border-b border-brand-border bg-gray-50">
                    <div className="flex items-center gap-2">
                      <span className="flex w-2 h-2 rounded-full bg-green-500">
                        <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-green-400 opacity-75"></span>
                      </span>
                      <span className="text-sm font-semibold text-brand-text">Готово</span>
                    </div>
                    <button
                      onClick={handleCopy}
                      className="flex items-center gap-1.5 text-xs font-semibold text-cyan-700 bg-cyan-100 hover:bg-cyan-200 transition cursor-pointer px-3 py-1.5 rounded-lg"
                    >
                      {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      {copied ? 'Скопировано!' : 'Скопировать'}
                    </button>
                  </div>

                  <div className="p-6 flex-1 overflow-y-auto">
                    {formatResult(result)}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

        </div>
      </div>
    </div>
  )
}
