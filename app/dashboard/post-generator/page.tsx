'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Sparkles,
  ArrowLeft,
  Loader2,
  PenTool,
  Copy,
  Check,
  RefreshCw,
  FileText,
  Film,
  Image,
  AlignLeft,
  ChevronRight,
  Lightbulb,
} from 'lucide-react'

const formats = [
  { id: 'post', label: 'Пост', icon: AlignLeft, desc: 'Текстовый пост для Instagram/Telegram', color: 'text-purple-500', bg: 'bg-purple-50', border: 'border-purple-200' },
  { id: 'carousel', label: 'Карусель', icon: Image, desc: 'Серия слайдов с текстом', color: 'text-blue-500', bg: 'bg-blue-50', border: 'border-blue-200' },
  { id: 'reels', label: 'Рилс-скрипт', icon: Film, desc: 'Сценарий для видео 30–60 сек', color: 'text-pink-500', bg: 'bg-pink-50', border: 'border-pink-200' },
  { id: 'stories', label: 'Stories', icon: FileText, desc: 'Серия из 4–5 историй', color: 'text-orange-500', bg: 'bg-orange-50', border: 'border-orange-200' },
]

const defaultPillars = [
  { id: 'edu', label: 'Психообразование', topics: ['Как тревога влияет на тело', 'Что такое психологические границы', 'Разница между депрессией и грустью', 'Почему мы саботируем успех', 'Как работает прокрастинация'] },
  { id: 'personal', label: 'Личное / Рефлексия', topics: ['Почему я выбрала эту профессию', 'Случай из практики (анонимно)', 'Что меня удивляет в клиентах', 'Мои ошибки как начинающего психолога', 'Что я думаю о ChatGPT в терапии'] },
  { id: 'practical', label: 'Практические советы', topics: ['3 техники при панической атаке', 'Как говорить о своих потребностях', 'Упражнение на заземление за 2 минуты', 'Как восстановиться после выгорания', 'Техника СТОП при сильных эмоциях'] },
  { id: 'stories_pillar', label: 'Истории клиентов', topics: ['До и после работы с тревогой', 'Как человек нашёл себя после развода', 'История того, кто не верил в психологию', 'Как 3 сессии изменили взгляд на отношения', 'История преодоления выгорания'] },
  { id: 'positioning', label: 'Позиционирование', topics: ['Чем я отличаюсь от других психологов', 'С кем мне не по пути', 'Мой взгляд на быстрые результаты', 'Почему я против «гарантий» в психологии', 'Мои принципы работы'] },
]

function formatResult(text: string, format: string) {
  if (format === 'carousel') {
    const slides = text.split(/(?=Слайд\s+\d+)/i).filter(s => s.trim())
    if (slides.length > 1) {
      return (
        <div className="space-y-4">
          {slides.map((slide, i) => (
            <div key={i} className="p-4 rounded-xl bg-brand-bg border border-brand-border">
              <p className="text-sm leading-relaxed text-brand-text whitespace-pre-wrap">{slide.trim()}</p>
            </div>
          ))}
        </div>
      )
    }
  }
  return (
    <p className="text-brand-text text-sm leading-relaxed whitespace-pre-wrap">{text}</p>
  )
}

export default function PostGenerator() {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  const [selectedFormat, setSelectedFormat] = useState('post')
  const [selectedPillar, setSelectedPillar] = useState<string | null>(null)
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null)
  const [customTopic, setCustomTopic] = useState('')
  const [useCustom, setUseCustom] = useState(false)

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
      setProfile(data)
      setLoading(false)
    }
    init()
  }, [router])

  const currentPillar = defaultPillars.find(p => p.id === selectedPillar)
  const canGenerate = selectedFormat && (useCustom ? customTopic.trim() : selectedTopic)

  const handleGenerate = async () => {
    if (!user || !canGenerate) return
    setGenerating(true)
    setResult(null)
    setError(null)

    try {
      const response = await fetch('/api/generate-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          topic: selectedTopic,
          customTopic: useCustom ? customTopic : undefined,
          format: selectedFormat,
          pillar: currentPillar?.label,
        }),
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Ошибка генерации')
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

  if (loading) {
    return (
      <div className="min-h-screen bg-brand-bg flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-brand-accent border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-brand-bg">
      {/* Header */}
      <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur border-b border-brand-border">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
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

      <div className="max-w-6xl mx-auto px-6 py-12">
        {/* Title */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-10">
          <div className="inline-flex items-center gap-2 bg-blue-100 text-blue-600 px-4 py-2 rounded-full text-sm font-medium mb-4">
            <PenTool className="w-4 h-4" />
            Генератор постов
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-brand-text mb-2">
            Создайте пост в вашем голосе
          </h1>
          <p className="text-brand-text-secondary">
            AI учитывает ваш подход, тон и нишу — контент будет звучать как вы
          </p>
        </motion.div>

        <div className="grid lg:grid-cols-2 gap-8">
          {/* Left — Settings */}
          <div className="space-y-6">
            {/* Step 1: Format */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-white rounded-2xl border border-brand-border p-6">
              <h2 className="font-bold text-brand-text mb-4 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-brand-accent text-white text-xs flex items-center justify-center font-bold">1</span>
                Формат контента
              </h2>
              <div className="grid grid-cols-2 gap-3">
                {formats.map(fmt => {
                  const Icon = fmt.icon
                  const active = selectedFormat === fmt.id
                  return (
                    <button
                      key={fmt.id}
                      onClick={() => setSelectedFormat(fmt.id)}
                      className={`p-4 rounded-xl border-2 text-left transition cursor-pointer ${active ? `${fmt.border} ${fmt.bg}` : 'border-brand-border hover:border-gray-300 bg-brand-bg'}`}
                    >
                      <Icon className={`w-5 h-5 mb-2 ${active ? fmt.color : 'text-brand-text-secondary'}`} />
                      <p className={`font-semibold text-sm ${active ? 'text-brand-text' : 'text-brand-text-secondary'}`}>{fmt.label}</p>
                      <p className="text-xs text-brand-text-secondary mt-0.5">{fmt.desc}</p>
                    </button>
                  )
                })}
              </div>
            </motion.div>

            {/* Step 2: Topic */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-white rounded-2xl border border-brand-border p-6">
              <h2 className="font-bold text-brand-text mb-4 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-brand-accent text-white text-xs flex items-center justify-center font-bold">2</span>
                Тема поста
              </h2>

              {/* Pillars */}
              <div className="space-y-2 mb-4">
                {defaultPillars.map(pillar => (
                  <div key={pillar.id}>
                    <button
                      onClick={() => {
                        setSelectedPillar(selectedPillar === pillar.id ? null : pillar.id)
                        setUseCustom(false)
                        setSelectedTopic(null)
                      }}
                      className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border transition cursor-pointer text-sm font-medium ${selectedPillar === pillar.id ? 'border-brand-accent bg-brand-highlight text-brand-text' : 'border-brand-border bg-brand-bg text-brand-text-secondary hover:border-brand-accent/50'}`}
                    >
                      {pillar.label}
                      <ChevronRight className={`w-4 h-4 transition-transform ${selectedPillar === pillar.id ? 'rotate-90' : ''}`} />
                    </button>

                    <AnimatePresence>
                      {selectedPillar === pillar.id && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="pl-3 pt-2 space-y-1">
                            {pillar.topics.map(topic => (
                              <button
                                key={topic}
                                onClick={() => { setSelectedTopic(topic); setUseCustom(false) }}
                                className={`w-full text-left px-4 py-2.5 rounded-lg text-sm transition cursor-pointer ${selectedTopic === topic && !useCustom ? 'bg-brand-accent text-white font-medium' : 'text-brand-text-secondary hover:bg-brand-highlight hover:text-brand-text'}`}
                              >
                                {topic}
                              </button>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ))}
              </div>

              {/* Custom topic */}
              <div className="border-t border-brand-border pt-4">
                <button
                  onClick={() => { setUseCustom(!useCustom); setSelectedTopic(null); setSelectedPillar(null) }}
                  className={`w-full flex items-center gap-2 px-4 py-3 rounded-xl border text-sm font-medium transition cursor-pointer ${useCustom ? 'border-brand-accent bg-brand-highlight text-brand-text' : 'border-brand-border bg-brand-bg text-brand-text-secondary hover:border-brand-accent/50'}`}
                >
                  <Lightbulb className="w-4 h-4" />
                  Своя тема
                </button>
                {useCustom && (
                  <textarea
                    value={customTopic}
                    onChange={e => setCustomTopic(e.target.value)}
                    placeholder="Напишите тему или идею поста..."
                    rows={2}
                    className="w-full mt-2 px-4 py-3 rounded-xl border border-brand-border bg-white text-brand-text text-sm focus:outline-none focus:ring-2 focus:ring-brand-accent resize-none"
                    autoFocus
                  />
                )}
              </div>
            </motion.div>

            {/* Generate button */}
            <motion.button
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              onClick={handleGenerate}
              disabled={!canGenerate || generating}
              className={`w-full flex items-center justify-center gap-3 py-4 rounded-2xl text-base font-semibold transition cursor-pointer ${canGenerate && !generating ? 'bg-brand-accent text-white hover:bg-brand-accent-hover shadow-lg shadow-brand-accent/25' : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}
            >
              {generating ? (
                <><Loader2 className="w-5 h-5 animate-spin" /> Генерирую...</>
              ) : (
                <><Sparkles className="w-5 h-5" /> Сгенерировать</>
              )}
            </motion.button>
          </div>

          {/* Right — Result */}
          <div>
            <AnimatePresence mode="wait">
              {!result && !generating && !error && (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="h-full flex flex-col items-center justify-center text-center py-20 bg-white rounded-2xl border border-dashed border-brand-border"
                >
                  <PenTool className="w-12 h-12 text-gray-200 mb-4" />
                  <p className="text-brand-text-secondary font-medium">Выберите формат и тему</p>
                  <p className="text-sm text-brand-text-secondary mt-1">Пост появится здесь</p>
                </motion.div>
              )}

              {generating && (
                <motion.div
                  key="loading"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="h-full flex flex-col items-center justify-center text-center py-20 bg-white rounded-2xl border border-brand-border"
                >
                  <Loader2 className="w-10 h-10 text-brand-accent animate-spin mb-4" />
                  <p className="font-semibold text-brand-text">AI пишет пост...</p>
                  <p className="text-sm text-brand-text-secondary mt-1">Обычно 10–20 секунд</p>
                </motion.div>
              )}

              {error && (
                <motion.div
                  key="error"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="p-6 bg-red-50 border border-red-200 rounded-2xl text-red-600 text-sm"
                >
                  {error}
                </motion.div>
              )}

              {result && !generating && (
                <motion.div
                  key="result"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white rounded-2xl border border-brand-border overflow-hidden"
                >
                  {/* Result header */}
                  <div className="flex items-center justify-between px-6 py-4 border-b border-brand-border bg-brand-bg">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-green-400" />
                      <span className="text-sm font-semibold text-brand-text">Готово!</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleGenerate}
                        className="flex items-center gap-1.5 text-xs text-brand-text-secondary hover:text-brand-accent transition cursor-pointer px-3 py-1.5 rounded-lg hover:bg-white"
                      >
                        <RefreshCw className="w-3.5 h-3.5" /> Переписать
                      </button>
                      <button
                        onClick={handleCopy}
                        className="flex items-center gap-1.5 text-xs font-semibold text-white bg-brand-accent hover:bg-brand-accent-hover transition cursor-pointer px-3 py-1.5 rounded-lg"
                      >
                        {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        {copied ? 'Скопировано!' : 'Копировать'}
                      </button>
                    </div>
                  </div>

                  {/* Content */}
                  <div className="p-6">
                    {formatResult(result, selectedFormat)}
                  </div>

                  {/* Character count */}
                  <div className="px-6 pb-4">
                    <p className="text-xs text-brand-text-secondary">{result.length} символов</p>
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
