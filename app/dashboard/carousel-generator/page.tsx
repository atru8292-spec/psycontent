// app/dashboard/carousel-generator/page.tsx

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
  Download,
} from 'lucide-react'

type Slide = {
  slide: number
  text: string
}

function downloadFile(filename: string, content: string, contentType: string) {
  const blob = new Blob([content], { type: contentType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function CarouselGeneratorContent() {
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  const [topic, setTopic] = useState('')
  const [pillar, setPillar] = useState<string | null>(null)
  
  const [generating, setGenerating] = useState(false)
  const [slides, setSlides] = useState<Slide[]>([])
  const [currentSlide, setCurrentSlide] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<number | null>(null)
  const [copiedAll, setCopiedAll] = useState(false)
  const [carouselId, setCarouselId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [regeneratingSlide, setRegeneratingSlide] = useState(false)

  const router = useRouter()
  const searchParams = useSearchParams()

  // Получаем параметры из URL (если пришли из контент-плана)
  useEffect(() => {
    const urlTopic = searchParams.get('topic')
    const urlPillar = searchParams.get('pillar')
    
    if (urlTopic) setTopic(urlTopic)
    if (urlPillar) setPillar(urlPillar)
  }, [searchParams])

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/'); return }
      setUser(user)
      setLoading(false)
    }
    init()
  }, [router])

  const handleGenerate = async () => {
    if (!user || !topic.trim()) return
    
    setGenerating(true)
    setSlides([])
    setCurrentSlide(0)
    setError(null)
    setCarouselId(null)
    setSaved(false)

    try {
      const response = await fetch('/api/generate-carousel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          topic: topic.trim(),
          pillar,
        }),
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Ошибка генерации')
      
      setSlides(data.slides)
      setCarouselId(data.carouselId || null)

    } catch (err: any) {
      setError(err.message)
    } finally {
      setGenerating(false)
    }
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

  const updateSlideText = (index: number, text: string) => {
    setSlides(prev => prev.map((slide, i) => (i === index ? { ...slide, text } : slide)))
    setSaved(false)
  }

  const exportTxt = () => {
    if (!slides.length) return
    const text = slides.map((s, i) => `[Слайд ${i + 1}]\n${s.text}`).join('\n\n')
    downloadFile(`carousel-${Date.now()}.txt`, text, 'text/plain;charset=utf-8')
  }

  const exportJson = () => {
    if (!slides.length) return
    downloadFile(`carousel-${Date.now()}.json`, JSON.stringify(slides, null, 2), 'application/json;charset=utf-8')
  }

  const nextSlide = () => {
    if (currentSlide < slides.length - 1) {
      setCurrentSlide(currentSlide + 1)
    }
  }

  const prevSlide = () => {
    if (currentSlide > 0) {
      setCurrentSlide(currentSlide - 1)
    }
  }

  useEffect(() => {
    if (!slides.length) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight') nextSlide()
      if (event.key === 'ArrowLeft') prevSlide()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [slides.length, currentSlide])

  const saveEdits = async () => {
    if (!user || !slides.length || saving) return
    setSaving(true)
    setError(null)
    try {
      const response = await fetch('/api/save-carousel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          carouselId,
          topic: topic.trim(),
          pillar,
          slides,
        }),
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Не удалось сохранить')
      setCarouselId(data.carouselId || carouselId)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const regenerateCurrentSlide = async () => {
    if (!user || !slides.length || regeneratingSlide) return
    setRegeneratingSlide(true)
    setError(null)
    try {
      const response = await fetch('/api/regenerate-carousel-slide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          topic: topic.trim(),
          pillar,
          slideNumber: currentSlide + 1,
          totalSlides: slides.length,
          currentSlideText: slides[currentSlide].text,
          allSlides: slides,
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Не удалось перегенерировать слайд')
      updateSlideText(currentSlide, data.text || slides[currentSlide].text)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setRegeneratingSlide(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5F7FA] flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-[#6B7AA1] border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F5F7FA]">
      {/* Навбар */}
      <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur border-b border-[#DCE1EB]">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <button
            onClick={() => router.push('/dashboard')}
            className="flex items-center gap-2 text-[#828AA0] hover:text-[#2D3748] transition cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
            Назад в кабинет
          </button>
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-[#6B7AA1]" />
            <span className="font-bold text-[#2D3748]">PsyContent</span>
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
          <div className="inline-flex items-center gap-2 bg-[#6B7AA1]/10 text-[#6B7AA1] px-4 py-2 rounded-full text-sm font-medium mb-4">
            <Layers className="w-4 h-4" />
            Генератор каруселей
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-[#2D3748] mb-2">
            Создайте карусель для Instagram
          </h1>
          <p className="text-[#828AA0]">
            AI создаст 8-10 слайдов с цепляющим хуком и логичной структурой
          </p>
        </motion.div>

        <div className="grid lg:grid-cols-2 gap-8">
          {/* Левая колонка — форма */}
          <div className="space-y-6">
            <motion.div 
              initial={{ opacity: 0, y: 20 }} 
              animate={{ opacity: 1, y: 0 }} 
              transition={{ delay: 0.1 }}
              className="bg-white rounded-2xl border border-[#DCE1EB] p-6"
            >
              <h2 className="font-semibold text-[#2D3748] mb-4">Тема карусели</h2>
              
              {pillar && (
                <div className="mb-3">
                  <span className="inline-block px-3 py-1 bg-[#6B7AA1]/10 text-[#6B7AA1] text-xs font-medium rounded-full">
                    {pillar}
                  </span>
                </div>
              )}
              
              <textarea
                value={topic}
                onChange={e => setTopic(e.target.value)}
                placeholder="Например: Почему мы выбираем тех, кто делает нам больно"
                rows={3}
                className="w-full px-4 py-3 rounded-xl border border-[#DCE1EB] bg-white text-[#2D3748] text-sm focus:outline-none focus:ring-2 focus:ring-[#6B7AA1]/50 focus:border-[#6B7AA1] resize-none transition"
              />
              
              <p className="text-xs text-[#828AA0] mt-2">
                Опишите тему или идею — AI раскроет её в формате карусели
              </p>
            </motion.div>

            <motion.button
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              onClick={handleGenerate}
              disabled={!topic.trim() || generating}
              className={`w-full flex items-center justify-center gap-3 py-4 rounded-xl text-base font-semibold transition cursor-pointer ${
                topic.trim() && !generating
                  ? 'bg-[#6B7AA1] text-white hover:bg-[#5A6890]'
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed'
              }`}
            >
              {generating ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Генерирую слайды...
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5" />
                  Сгенерировать карусель
                </>
              )}
            </motion.button>

            {/* Список всех слайдов (миниатюры) */}
            {slides.length > 0 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="bg-white rounded-2xl border border-[#DCE1EB] p-4"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-[#2D3748]">
                    Все слайды ({slides.length})
                  </span>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={copyAll}
                      className="flex items-center gap-1.5 text-xs text-[#6B7AA1] hover:text-[#5A6890] transition cursor-pointer"
                    >
                      {copiedAll ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      {copiedAll ? 'Скопировано!' : 'Копировать все'}
                    </button>
                    <button
                      onClick={exportTxt}
                      className="flex items-center gap-1.5 text-xs text-[#6B7AA1] hover:text-[#5A6890] transition cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      TXT
                    </button>
                    <button
                      onClick={exportJson}
                      className="flex items-center gap-1.5 text-xs text-[#6B7AA1] hover:text-[#5A6890] transition cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      JSON
                    </button>
                  </div>
                </div>
                
                <div className="grid grid-cols-5 gap-2">
                  {slides.map((slide, i) => (
                    <button
                      key={i}
                      onClick={() => setCurrentSlide(i)}
                      className={`aspect-square rounded-lg flex items-center justify-center text-sm font-bold transition cursor-pointer ${
                        currentSlide === i
                          ? 'bg-[#6B7AA1] text-white'
                          : 'bg-[#F5F7FA] text-[#828AA0] hover:bg-[#DCE1EB]'
                      }`}
                    >
                      {i + 1}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </div>

          {/* Правая колонка — превью */}
          <div>
            <AnimatePresence mode="wait">
              {/* Пустое состояние */}
              {!slides.length && !generating && !error && (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="h-full flex flex-col items-center justify-center text-center py-20 bg-white rounded-2xl border border-dashed border-[#DCE1EB]"
                >
                  <Layers className="w-12 h-12 text-[#DCE1EB] mb-4" />
                  <p className="text-[#828AA0] font-medium">Введите тему карусели</p>
                  <p className="text-sm text-[#828AA0] mt-1">Превью слайдов появится здесь</p>
                </motion.div>
              )}

              {/* Загрузка */}
              {generating && (
                <motion.div
                  key="loading"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="h-full flex flex-col items-center justify-center text-center py-20 bg-white rounded-2xl border border-[#DCE1EB]"
                >
                  <Loader2 className="w-10 h-10 text-[#6B7AA1] animate-spin mb-4" />
                  <p className="font-semibold text-[#2D3748]">AI создаёт карусель...</p>
                  <p className="text-sm text-[#828AA0] mt-1">Обычно 15–30 секунд</p>
                </motion.div>
              )}

              {/* Ошибка */}
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

              {/* Результат — превью слайда */}
              {slides.length > 0 && !generating && (
                <motion.div
                  key="result"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-4"
                >
                  {/* Превью текущего слайда (как в Instagram) */}
                  <div className="bg-white rounded-2xl border border-[#DCE1EB] overflow-hidden">
                    {/* Шапка */}
                    <div className="flex items-center justify-between px-5 py-3 border-b border-[#DCE1EB] bg-[#F5F7FA]">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-[#2D3748]">
                          Слайд {currentSlide + 1} из {slides.length}
                        </span>
                      </div>
                      <button
                        onClick={() => copySlide(currentSlide)}
                        className="flex items-center gap-1.5 text-xs font-medium text-white bg-[#6B7AA1] hover:bg-[#5A6890] transition cursor-pointer px-3 py-1.5 rounded-lg"
                      >
                        {copied === currentSlide ? (
                          <><Check className="w-3.5 h-3.5" /> Скопировано!</>
                        ) : (
                          <><Copy className="w-3.5 h-3.5" /> Копировать</>
                        )}
                      </button>
                    </div>

                    {/* Контент слайда */}
                    <div className="relative">
                      {/* Имитация Instagram карусели */}
                      <div className="aspect-square bg-gradient-to-br from-[#6B7AA1]/5 to-[#8E9CC2]/10 flex items-center justify-center p-8">
                        <div className="max-w-[280px] text-center">
                          {/* Номер слайда */}
                          <div className="text-[80px] font-bold text-[#DCE1EB] leading-none mb-4">
                            {String(currentSlide + 1).padStart(2, '0')}
                          </div>
                          {/* Текст слайда */}
                          <p className="text-[#2D3748] text-lg leading-relaxed whitespace-pre-wrap">
                            {slides[currentSlide].text}
                          </p>
                        </div>
                      </div>

                      {/* Навигация */}
                      <button
                        onClick={prevSlide}
                        disabled={currentSlide === 0}
                        className={`absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/90 shadow-lg flex items-center justify-center transition cursor-pointer ${
                          currentSlide === 0 ? 'opacity-30 cursor-not-allowed' : 'hover:bg-white'
                        }`}
                      >
                        <ChevronLeft className="w-5 h-5 text-[#2D3748]" />
                      </button>
                      
                      <button
                        onClick={nextSlide}
                        disabled={currentSlide === slides.length - 1}
                        className={`absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/90 shadow-lg flex items-center justify-center transition cursor-pointer ${
                          currentSlide === slides.length - 1 ? 'opacity-30 cursor-not-allowed' : 'hover:bg-white'
                        }`}
                      >
                        <ChevronRight className="w-5 h-5 text-[#2D3748]" />
                      </button>

                      {/* Индикаторы (точки) */}
                      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5">
                        {slides.map((_, i) => (
                          <button
                            key={i}
                            onClick={() => setCurrentSlide(i)}
                            className={`w-2 h-2 rounded-full transition cursor-pointer ${
                              currentSlide === i ? 'bg-[#6B7AA1]' : 'bg-[#DCE1EB]'
                            }`}
                          />
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="bg-white rounded-2xl border border-[#DCE1EB] p-4">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-medium text-[#2D3748]">Редактировать текущий слайд</p>
                      <span className="text-xs text-[#828AA0]">{slides[currentSlide].text.length} символов</span>
                    </div>
                    <textarea
                      value={slides[currentSlide].text}
                      onChange={(e) => updateSlideText(currentSlide, e.target.value)}
                      rows={4}
                      className="w-full px-3 py-2 rounded-xl border border-[#DCE1EB] text-sm text-[#2D3748] focus:outline-none focus:ring-2 focus:ring-[#6B7AA1]/50 resize-none"
                    />
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={regenerateCurrentSlide}
                        disabled={regeneratingSlide}
                        className="px-3 py-2 rounded-lg border border-[#DCE1EB] text-xs font-medium text-[#6B7AA1] hover:bg-[#F5F7FA] transition disabled:opacity-50 cursor-pointer"
                      >
                        {regeneratingSlide ? 'Генерирую...' : 'Перегенерировать этот слайд'}
                      </button>
                      <button
                        onClick={saveEdits}
                        disabled={saving}
                        className="px-3 py-2 rounded-lg bg-[#6B7AA1] text-white text-xs font-medium hover:bg-[#5A6890] transition disabled:opacity-50 cursor-pointer"
                      >
                        {saving ? 'Сохраняю...' : saved ? 'Сохранено!' : 'Сохранить правки'}
                      </button>
                    </div>
                  </div>

                  {/* Кнопки действий */}
                  <div className="flex gap-3">
                    <button
                      onClick={handleGenerate}
                      className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border border-[#DCE1EB] text-[#828AA0] hover:text-[#2D3748] hover:border-[#6B7AA1] transition cursor-pointer text-sm font-medium"
                    >
                      <RefreshCw className="w-4 h-4" />
                      Переделать
                    </button>
                    <button
                      onClick={() => router.push('/dashboard/content-plan')}
                      className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border border-[#DCE1EB] text-[#828AA0] hover:text-[#2D3748] hover:border-[#6B7AA1] transition cursor-pointer text-sm font-medium"
                    >
                      ← К контент-плану
                    </button>
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

export default function CarouselGeneratorPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#F5F7FA] flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-[#6B7AA1] border-t-transparent rounded-full" />
      </div>
    }>
      <CarouselGeneratorContent />
    </Suspense>
  )
}
