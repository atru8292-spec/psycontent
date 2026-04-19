'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Sparkles,
  ArrowLeft,
  Loader2,
  Copy,
  Check,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Layers,
  HelpCircle,
  X,
  Lightbulb,
  Target,
  TrendingUp,
  ListChecks,
} from 'lucide-react'

type Slide = {
  slide: number
  text: string
}

type TopicSuggestion = {
  title: string
  description: string
}

function CarouselGeneratorContent() {
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  const [step, setStep] = useState<'topics' | 'carousel'>('topics')
  const [suggestedTopics, setSuggestedTopics] = useState<TopicSuggestion[]>([])
  const [loadingTopics, setLoadingTopics] = useState(false)
  const [selectedTopic, setSelectedTopic] = useState<TopicSuggestion | null>(null)

  const [customTopic, setCustomTopic] = useState('')
  const [showCustomInput, setShowCustomInput] = useState(false)

  const [generating, setGenerating] = useState(false)
  const [slides, setSlides] = useState<Slide[]>([])
  const [currentSlide, setCurrentSlide] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<number | null>(null)
  const [copiedAll, setCopiedAll] = useState(false)

  const [showHelp, setShowHelp] = useState(false)

  const router = useRouter()
  const searchParams = useSearchParams()

  const isFromPlan = !!searchParams.get('topic')

  // Загружаем user
  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/'); return }
      setUser(user)
      setLoading(false)
    }
    init()
  }, [router])

  // Когда user готов — проверяем URL параметры
  useEffect(() => {
    if (!user) return

    const urlTopic = searchParams.get('topic')
    const urlPillar = searchParams.get('pillar')

    if (urlTopic) {
      const topic = { title: urlTopic, description: urlPillar || '' }
      setSelectedTopic(topic)
      setStep('carousel')
      // НЕ запускаем автоматически — пользователь нажмёт кнопку
    } else {
      loadTopics(user.id)
    }
  }, [user, searchParams])

  // Генерация карусели
  const handleGenerate = async (topic?: string) => {
    const topicToUse = topic || selectedTopic?.title
    if (!user || !topicToUse) return

    setGenerating(true)
    setSlides([])
    setCurrentSlide(0)
    setError(null)

    try {
      const response = await fetch('/api/generate-carousel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          topic: topicToUse,
          pillar: selectedTopic?.description || '',
        }),
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Ошибка генерации')

      setSlides(data.slides)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setGenerating(false)
    }
  }

  // Загрузка предложенных тем
  const loadTopics = async (userId: string) => {
    setLoadingTopics(true)
    setError(null)

    try {
      const response = await fetch('/api/generate-carousel-topics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Ошибка загрузки тем')

      setSuggestedTopics(data.topics)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoadingTopics(false)
    }
  }

  const handleSelectTopic = (topic: TopicSuggestion) => {
    setSelectedTopic(topic)
    setStep('carousel')
  }

  const handleCustomTopic = () => {
    if (!customTopic.trim()) return
    const topic = { title: customTopic.trim(), description: 'Своя тема' }
    setSelectedTopic(topic)
    setStep('carousel')
  }

  const backToTopics = () => {
    setStep('topics')
    setSelectedTopic(null)
    setSlides([])
    setShowCustomInput(false)
    setCustomTopic('')
    setError(null)
  }

  const copySlide = (index: number) => {
    navigator.clipboard.writeText(slides[index].text)
    setCopied(index)
    setTimeout(() => setCopied(null), 2000)
  }

  const copyAll = () => {
    const allText = slides.map((s, i) => `[Слайд ${i + 1}]\n${s.text}`).join('\n\n')
    navigator.clipboard.writeText(allText)
    setCopiedAll(true)
    setTimeout(() => setCopiedAll(false), 2000)
  }

  const nextSlide = () => {
    if (currentSlide < slides.length - 1) setCurrentSlide(currentSlide + 1)
  }

  const prevSlide = () => {
    if (currentSlide > 0) setCurrentSlide(currentSlide - 1)
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
      {/* Навбар */}
      <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur border-b border-brand-border">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <button
            onClick={() => {
              if (isFromPlan) {
                router.push('/dashboard/content-plan')
              } else if (step === 'carousel') {
                backToTopics()
              } else {
                router.push('/dashboard')
              }
            }}
            className="flex items-center gap-2 text-brand-text-secondary hover:text-brand-text transition cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
            {isFromPlan ? 'К контент-плану' : step === 'carousel' ? 'К выбору темы' : 'Назад в кабинет'}
          </button>
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-brand-accent" />
            <span className="font-bold text-brand-text">PsyContent</span>
          </div>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-6 py-12">
        {/* Заголовок */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-10"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="inline-flex items-center gap-2 bg-brand-accent/10 text-brand-accent px-4 py-2 rounded-full text-sm font-medium">
              <Layers className="w-4 h-4" />
              Генератор каруселей
            </div>
            <button
              onClick={() => setShowHelp(true)}
              className="inline-flex items-center gap-1.5 text-brand-text-secondary hover:text-brand-accent text-sm transition cursor-pointer"
            >
              <HelpCircle className="w-4 h-4" />
              Что такое карусель?
            </button>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-brand-text mb-2">
            {step === 'topics' ? 'Выберите тему для карусели' : 'Ваша карусель'}
          </h1>
          <p className="text-brand-text-secondary">
            {step === 'topics'
              ? 'AI подобрал 5 тем на основе вашей ниши — выберите одну или напишите свою'
              : `Тема: ${selectedTopic?.title}`
            }
          </p>
        </motion.div>

        {/* Модальное окно — Что такое карусель */}
        <AnimatePresence>
          {showHelp && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
              onClick={() => setShowHelp(false)}
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                onClick={e => e.stopPropagation()}
                className="bg-white rounded-2xl max-w-lg w-full max-h-[80vh] overflow-y-auto shadow-xl"
              >
                <div className="flex items-center justify-between p-6 border-b border-brand-border">
                  <h2 className="text-xl font-bold text-brand-text">Что такое карусель?</h2>
                  <button
                    onClick={() => setShowHelp(false)}
                    className="p-2 hover:bg-brand-bg rounded-lg transition cursor-pointer"
                  >
                    <X className="w-5 h-5 text-brand-text-secondary" />
                  </button>
                </div>

                <div className="p-6 space-y-6">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-8 h-8 rounded-lg bg-brand-accent/10 flex items-center justify-center">
                        <Layers className="w-4 h-4 text-brand-accent" />
                      </div>
                      <h3 className="font-semibold text-brand-text">Что это?</h3>
                    </div>
                    <p className="text-sm text-brand-text-secondary leading-relaxed">
                      Карусель — это пост в Instagram из <strong>нескольких картинок</strong> (слайдов),
                      которые листаются влево-вправо. Обычно 5-10 слайдов с текстом на каждом.
                    </p>
                  </div>

                  <div className="bg-brand-bg rounded-xl p-4">
                    <div className="flex items-center gap-2 overflow-x-auto pb-2">
                      {['Хук', 'Проблема', 'Развитие', 'Решение', 'CTA'].map((text, i) => (
                        <div
                          key={i}
                          className="flex-shrink-0 w-16 h-16 bg-white rounded-lg border border-brand-border flex flex-col items-center justify-center p-2"
                        >
                          <span className="text-lg font-bold text-brand-accent">{i + 1}</span>
                          <span className="text-[8px] text-brand-text-secondary text-center">{text}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center">
                        <Target className="w-4 h-4 text-green-600" />
                      </div>
                      <h3 className="font-semibold text-brand-text">Зачем психологу?</h3>
                    </div>
                    <ul className="text-sm text-brand-text-secondary space-y-1">
                      <li>✓ Больше вовлечения — люди листают</li>
                      <li>✓ Показываете экспертность</li>
                      <li>✓ Часто сохраняют в закладки</li>
                    </ul>
                  </div>

                  <div className="bg-gradient-to-r from-brand-accent/10 to-brand-accent/5 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <TrendingUp className="w-4 h-4 text-brand-accent" />
                      <span className="text-sm font-medium text-brand-text">Статистика</span>
                    </div>
                    <p className="text-xs text-brand-text-secondary">
                      Карусели получают <strong>в 3 раза больше вовлечения</strong>, чем обычные посты.
                    </p>
                  </div>
                </div>

                <div className="p-6 border-t border-brand-border">
                  <button
                    onClick={() => setShowHelp(false)}
                    className="w-full py-3 bg-brand-accent text-white rounded-xl font-medium hover:bg-brand-accent/90 transition cursor-pointer"
                  >
                    Понятно!
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ═══ ШАГ 1: Выбор темы ═══ */}
        {step === 'topics' && (
          <div className="max-w-2xl mx-auto">
            {loadingTopics && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center py-16"
              >
                <Loader2 className="w-10 h-10 text-brand-accent animate-spin mx-auto mb-4" />
                <p className="font-semibold text-brand-text">AI подбирает темы для вас...</p>
                <p className="text-sm text-brand-text-secondary mt-1">На основе вашей ниши и целевой аудитории</p>
              </motion.div>
            )}

            {!loadingTopics && suggestedTopics.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-4"
              >
                <div className="flex items-center gap-2 mb-6">
                  <ListChecks className="w-5 h-5 text-brand-accent" />
                  <span className="font-medium text-brand-text">Выберите тему:</span>
                </div>

                {suggestedTopics.map((topic, index) => (
                  <motion.button
                    key={index}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1 }}
                    onClick={() => handleSelectTopic(topic)}
                    className="w-full text-left p-5 bg-white rounded-xl border border-brand-border hover:border-brand-accent hover:shadow-md transition cursor-pointer group"
                  >
                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 rounded-full bg-brand-accent/10 flex items-center justify-center flex-shrink-0 group-hover:bg-brand-accent transition">
                        <span className="font-bold text-brand-accent group-hover:text-white transition">
                          {index + 1}
                        </span>
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold text-brand-text mb-1 group-hover:text-brand-accent transition">
                          {topic.title}
                        </h3>
                        <p className="text-sm text-brand-text-secondary">{topic.description}</p>
                      </div>
                      <ChevronRight className="w-5 h-5 text-brand-border group-hover:text-brand-accent transition flex-shrink-0 mt-2" />
                    </div>
                  </motion.button>
                ))}

                <div className="flex items-center gap-4 py-4">
                  <div className="flex-1 h-px bg-brand-border" />
                  <span className="text-sm text-brand-text-secondary">или</span>
                  <div className="flex-1 h-px bg-brand-border" />
                </div>

                {!showCustomInput ? (
                  <motion.button
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    onClick={() => setShowCustomInput(true)}
                    className="w-full p-5 border-2 border-dashed border-brand-border rounded-xl text-brand-text-secondary hover:border-brand-accent hover:text-brand-accent transition cursor-pointer"
                  >
                    <div className="flex items-center justify-center gap-2">
                      <Lightbulb className="w-5 h-5" />
                      <span className="font-medium">Написать свою тему</span>
                    </div>
                  </motion.button>
                ) : (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="bg-white rounded-xl border border-brand-border p-5"
                  >
                    <label className="block text-sm font-medium text-brand-text mb-2">
                      Своя тема для карусели:
                    </label>
                    <textarea
                      value={customTopic}
                      onChange={e => setCustomTopic(e.target.value)}
                      placeholder="Например: Почему мы выбираем тех, кто делает нам больно"
                      rows={2}
                      className="w-full px-4 py-3 rounded-xl border border-brand-border bg-white text-brand-text text-sm focus:outline-none focus:ring-2 focus:ring-brand-accent/50 focus:border-brand-accent resize-none transition"
                      autoFocus
                    />
                    <div className="flex gap-3 mt-3">
                      <button
                        onClick={() => {
                          setShowCustomInput(false)
                          setCustomTopic('')
                        }}
                        className="flex-1 py-2.5 rounded-xl border border-brand-border text-brand-text-secondary hover:text-brand-text transition cursor-pointer text-sm font-medium"
                      >
                        Отмена
                      </button>
                      <button
                        onClick={handleCustomTopic}
                        disabled={!customTopic.trim()}
                        className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition cursor-pointer ${
                          customTopic.trim()
                            ? 'bg-brand-accent text-white hover:bg-brand-accent/90'
                            : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                        }`}
                      >
                        Создать карусель
                      </button>
                    </div>
                  </motion.div>
                )}

                <div className="text-center pt-4">
                  <button
                    onClick={() => loadTopics(user.id)}
                    className="inline-flex items-center gap-2 text-sm text-brand-text-secondary hover:text-brand-accent transition cursor-pointer"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Предложить другие темы
                  </button>
                </div>
              </motion.div>
            )}

            {error && !loadingTopics && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="p-6 bg-red-50 border border-red-200 rounded-2xl text-red-600 text-sm text-center"
              >
                {error}
                <button
                  onClick={() => loadTopics(user.id)}
                  className="block mx-auto mt-3 text-red-700 underline hover:no-underline cursor-pointer"
                >
                  Попробовать снова
                </button>
              </motion.div>
            )}
          </div>
        )}

        {/* ═══ ШАГ 2: Карусель ═══ */}
        {step === 'carousel' && (
          <div className="grid lg:grid-cols-2 gap-8">
            {/* Левая колонка */}
            <div className="space-y-6">
              {/* Выбранная тема */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-2xl border border-brand-border p-6"
              >
                <div className="flex items-start justify-between mb-4">
                  <h2 className="font-semibold text-brand-text">Тема карусели</h2>
                  {!isFromPlan && (
                    <button
                      onClick={backToTopics}
                      className="text-xs text-brand-accent hover:underline cursor-pointer"
                    >
                      Изменить тему
                    </button>
                  )}
                </div>

                <div className="p-4 bg-brand-bg rounded-xl">
                  <p className="font-medium text-brand-text">{selectedTopic?.title}</p>
                  {selectedTopic?.description && selectedTopic.description !== 'Своя тема' && (
                    <p className="text-sm text-brand-text-secondary mt-1">{selectedTopic.description}</p>
                  )}
                </div>

                {/* ★ КНОПКА ГЕНЕРАЦИИ — когда нет слайдов и не генерируем */}
                {slides.length === 0 && !generating && !error && (
                  <button
                    onClick={() => handleGenerate(selectedTopic?.title)}
                    className="mt-4 w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-brand-accent text-white font-semibold hover:bg-brand-accent/90 transition shadow-lg shadow-brand-accent/25 cursor-pointer"
                  >
                    <Sparkles className="w-5 h-5" />
                    Сгенерировать карусель
                  </button>
                )}
              </motion.div>

              {/* Список всех слайдов */}
              {slides.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="bg-white rounded-2xl border border-brand-border p-4"
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-medium text-brand-text">
                      Все слайды ({slides.length})
                    </span>
                    <button
                      onClick={copyAll}
                      className="flex items-center gap-1.5 text-xs text-brand-accent hover:text-brand-accent/80 transition cursor-pointer"
                    >
                      {copiedAll ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      {copiedAll ? 'Скопировано!' : 'Копировать все'}
                    </button>
                  </div>

                  <div className="grid grid-cols-5 gap-2">
                    {slides.map((_, i) => (
                      <button
                        key={i}
                        onClick={() => setCurrentSlide(i)}
                        className={`aspect-square rounded-lg flex items-center justify-center text-sm font-bold transition cursor-pointer ${
                          currentSlide === i
                            ? 'bg-brand-accent text-white'
                            : 'bg-brand-bg text-brand-text-secondary hover:bg-brand-border'
                        }`}
                      >
                        {i + 1}
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}

              {/* Кнопки действий */}
              {slides.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="flex gap-3"
                >
                  <button
                    onClick={() => handleGenerate()}
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border border-brand-border text-brand-text-secondary hover:text-brand-text hover:border-brand-accent transition cursor-pointer text-sm font-medium bg-white"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Переделать
                  </button>
                  {!isFromPlan && (
                    <button
                      onClick={backToTopics}
                      className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border border-brand-border text-brand-text-secondary hover:text-brand-text hover:border-brand-accent transition cursor-pointer text-sm font-medium bg-white"
                    >
                      Другая тема
                    </button>
                  )}
                </motion.div>
              )}
            </div>

            {/* Правая колонка — превью */}
            <div>
              <AnimatePresence mode="wait">
                {/* Загрузка */}
                {generating && (
                  <motion.div
                    key="loading"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="h-full flex flex-col items-center justify-center text-center py-20 bg-white rounded-2xl border border-brand-border"
                  >
                    <Loader2 className="w-10 h-10 text-brand-accent animate-spin mb-4" />
                    <p className="font-semibold text-brand-text">AI создаёт карусель...</p>
                    <p className="text-sm text-brand-text-secondary mt-1">Обычно 15–30 секунд</p>
                  </motion.div>
                )}

                {/* Ошибка */}
                {error && !generating && (
                  <motion.div
                    key="error"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="p-6 bg-red-50 border border-red-200 rounded-2xl text-red-600 text-sm"
                  >
                    {error}
                    <button
                      onClick={() => handleGenerate()}
                      className="block mt-3 text-red-700 underline hover:no-underline cursor-pointer"
                    >
                      Попробовать снова
                    </button>
                  </motion.div>
                )}

                {/* Пустое состояние — подсказка справа */}
                {slides.length === 0 && !generating && !error && (
                  <motion.div
                    key="empty"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="h-full flex flex-col items-center justify-center text-center py-20 bg-white rounded-2xl border border-brand-border"
                  >
                    <div className="w-16 h-16 bg-brand-accent/10 rounded-2xl flex items-center justify-center mb-4">
                      <Layers className="w-8 h-8 text-brand-accent" />
                    </div>
                                      <p className="font-semibold text-brand-text mb-1">Готово к генерации</p>
                    <p className="text-sm text-brand-text-secondary">Нажмите кнопку слева чтобы создать карусель</p>
                  </motion.div>
                )}

                {/* Результат */}
                {slides.length > 0 && !generating && (
                  <motion.div
                    key="result"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-4"
                  >
                    <div className="bg-green-50 border border-green-200 rounded-xl p-3">
                      <p className="text-xs text-green-700">
                        ✨ <strong>Готово!</strong> Скопируйте тексты и создайте картинки в Canva
                      </p>
                    </div>

                    {/* Превью слайда */}
                    <div className="bg-white rounded-2xl border border-brand-border overflow-hidden">
                      <div className="flex items-center justify-between px-5 py-3 border-b border-brand-border bg-brand-bg">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-brand-text">
                            Слайд {currentSlide + 1} из {slides.length}
                          </span>
                          {currentSlide === 0 && (
                            <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Хук</span>
                          )}
                          {currentSlide === slides.length - 1 && (
                            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Финал</span>
                          )}
                        </div>
                        <button
                          onClick={() => copySlide(currentSlide)}
                          className="flex items-center gap-1.5 text-xs font-medium text-white bg-brand-accent hover:bg-brand-accent/90 transition cursor-pointer px-3 py-1.5 rounded-lg"
                        >
                          {copied === currentSlide ? (
                            <><Check className="w-3.5 h-3.5" /> Скопировано!</>
                          ) : (
                            <><Copy className="w-3.5 h-3.5" /> Копировать</>
                          )}
                        </button>
                      </div>

                      <div className="relative">
                        <div className="aspect-square bg-gradient-to-br from-brand-accent/5 to-brand-accent/5 flex items-center justify-center p-8">
                          <div className="max-w-[280px] text-center">
                            <div className="text-[80px] font-bold text-brand-border leading-none mb-4">
                              {String(currentSlide + 1).padStart(2, '0')}
                            </div>
                            <p className="text-brand-text text-lg leading-relaxed whitespace-pre-wrap">
                              {slides[currentSlide].text}
                            </p>
                          </div>
                        </div>

                        <button
                          onClick={prevSlide}
                          disabled={currentSlide === 0}
                          className={`absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/90 shadow-lg flex items-center justify-center transition cursor-pointer ${
                            currentSlide === 0 ? 'opacity-30 cursor-not-allowed' : 'hover:bg-white'
                          }`}
                        >
                          <ChevronLeft className="w-5 h-5 text-brand-text" />
                        </button>

                        <button
                          onClick={nextSlide}
                          disabled={currentSlide === slides.length - 1}
                          className={`absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/90 shadow-lg flex items-center justify-center transition cursor-pointer ${
                            currentSlide === slides.length - 1 ? 'opacity-30 cursor-not-allowed' : 'hover:bg-white'
                          }`}
                        >
                          <ChevronRight className="w-5 h-5 text-brand-text" />
                        </button>

                        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5">
                          {slides.map((_, i) => (
                            <button
                              key={i}
                              onClick={() => setCurrentSlide(i)}
                              className={`w-2 h-2 rounded-full transition cursor-pointer ${
                                currentSlide === i ? 'bg-brand-accent' : 'bg-brand-border'
                              }`}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function CarouselGeneratorPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-brand-bg flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-brand-accent border-t-transparent rounded-full" />
      </div>
    }>
      <CarouselGeneratorContent />
    </Suspense>
  )
}
