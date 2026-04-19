'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { motion, AnimatePresence } from 'framer-motion'
import { generatePDF } from '@/lib/pdf-export'
import {
  Sparkles, ArrowLeft, Loader2, CalendarDays,
  AlignLeft, Image, Film, FileText,
  CheckCircle2, Circle, PenTool, X,
  RefreshCw, Lightbulb, ChevronRight,
  Download, Copy, FileSpreadsheet, Check,
  Layers, // ← Добавил иконку для каруселей
} from 'lucide-react'

type DayItem = {
  day: number
  pillar: string
  topic: string
  format: string
  hook: string
  tip: string
  done?: boolean
}

const FORMAT_META: Record<string, { icon: any; label: string; color: string; bg: string }> = {
  post:     { icon: AlignLeft, label: 'Пост',     color: 'text-purple-600', bg: 'bg-purple-100' },
  carousel: { icon: Layers,    label: 'Карусель', color: 'text-blue-600',   bg: 'bg-blue-100'   },
  reels:    { icon: Film,      label: 'Рилс',     color: 'text-pink-600',   bg: 'bg-pink-100'   },
  stories:  { icon: FileText,  label: 'Stories',  color: 'text-orange-600', bg: 'bg-orange-100' },
}

const PILLAR_META: Record<string, { color: string; dot: string }> = {
  'Психообразование': { color: 'text-indigo-600 bg-indigo-50 border-indigo-200', dot: 'bg-indigo-400' },
  'Личное':           { color: 'text-rose-600 bg-rose-50 border-rose-200',        dot: 'bg-rose-400'   },
  'Практика':         { color: 'text-green-600 bg-green-50 border-green-200',     dot: 'bg-green-400'  },
  'Истории':          { color: 'text-amber-600 bg-amber-50 border-amber-200',     dot: 'bg-amber-400'  },
  'Позиционирование': { color: 'text-violet-600 bg-violet-50 border-violet-200',  dot: 'bg-violet-400' },
}

function getPillarMeta(pillar: string) {
  return PILLAR_META[pillar] || { color: 'text-gray-600 bg-gray-50 border-gray-200', dot: 'bg-gray-400' }
}

// ============ EXPORT COMPONENT ============
function ExportMenu({ plan }: { plan: DayItem[] }) {
  const [copied, setCopied] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [exporting, setExporting] = useState(false)

  const copyAsText = () => {
    const text = plan.map(day => 
`День ${day.day}
Рубрика: ${day.pillar}
Формат: ${day.format}
Тема: ${day.topic}
${day.hook ? `Хук: ${day.hook}` : ''}
---`
    ).join('\n\n')

    navigator.clipboard.writeText(text)
    setCopied(true)
    setShowMenu(false)
    setTimeout(() => setCopied(false), 2000)
  }

  const exportToCSV = () => {
    const headers = ['День', 'Рубрика', 'Формат', 'Тема', 'Хук', 'Статус']
    const rows = plan.map(day => [
      day.day,
      `"${day.pillar}"`,
      `"${day.format}"`,
      `"${day.topic.replace(/"/g, '""')}"`,
      `"${(day.hook || '').replace(/"/g, '""')}"`,
      day.done ? 'Готово' : 'Не готово'
    ])

    const csv = [headers.join(','), ...rows.map(row => row.join(','))].join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `content-plan-${new Date().toISOString().split('T')[0]}.csv`
    link.click()
    URL.revokeObjectURL(url)
    setShowMenu(false)
  }

  const exportToPDF = async () => {
    setExporting(true)
    setShowMenu(false)

    try {
      await generatePDF(plan)
    } catch (error) {
      console.error('PDF export error:', error)
      alert('Ошибка при создании PDF')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setShowMenu(!showMenu)}
        disabled={exporting}
        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-brand-text-secondary hover:text-brand-text bg-white border border-brand-border rounded-xl hover:border-brand-accent/50 transition cursor-pointer disabled:opacity-50"
      >
        {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
        {exporting ? 'Создаю PDF...' : 'Экспорт'}
      </button>

      {showMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
          <div className="absolute right-0 top-full mt-2 w-56 bg-white border border-brand-border rounded-xl shadow-lg z-50 overflow-hidden">
            <button onClick={copyAsText} className="w-full flex items-center gap-3 px-4 py-3 text-sm text-brand-text hover:bg-brand-bg transition cursor-pointer text-left">
              {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4 text-brand-text-secondary" />}
              {copied ? 'Скопировано!' : 'Копировать текст'}
            </button>
            <button onClick={exportToCSV} className="w-full flex items-center gap-3 px-4 py-3 text-sm text-brand-text hover:bg-brand-bg transition cursor-pointer text-left border-t border-brand-border">
              <FileSpreadsheet className="w-4 h-4 text-green-600" />
              <div>
                <p>Google Sheets / Excel</p>
                <p className="text-xs text-brand-text-secondary">Скачать CSV</p>
              </div>
            </button>
            <button onClick={exportToPDF} className="w-full flex items-center gap-3 px-4 py-3 text-sm text-brand-text hover:bg-brand-bg transition cursor-pointer text-left border-t border-brand-border">
              <FileText className="w-4 h-4 text-red-500" />
              <div>
                <p>Скачать PDF</p>
                <p className="text-xs text-brand-text-secondary">Красивый дизайн</p>
              </div>
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// ============ DAY CARD ============
function DayCard({ item, onToggle, onGenerate }: { item: DayItem; onToggle: () => void; onGenerate: () => void }) {
  const [hover, setHover] = useState(false)
  const fmt = FORMAT_META[item.format] || FORMAT_META.post
  const pillar = getPillarMeta(item.pillar)
  const Icon = fmt.icon

  // Текст кнопки в зависимости от формата
  const buttonText = item.format === 'carousel' ? 'Создать карусель' : 'Написать пост'

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className={`relative rounded-2xl border transition-all duration-200 overflow-hidden ${
        item.done ? 'border-green-200 bg-green-50/50 opacity-70' : 'border-brand-border bg-white hover:border-brand-accent/40 hover:shadow-md'
      }`}
    >
      <div className="flex items-start justify-between p-4 pb-2">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-bold w-7 h-7 rounded-full flex items-center justify-center ${item.done ? 'bg-green-100 text-green-600' : 'bg-brand-highlight text-brand-accent'}`}>
            {item.day}
          </span>
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${pillar.color}`}>
            {item.pillar}
          </span>
        </div>
        <button onClick={(e) => { e.stopPropagation(); onToggle(); }} className="cursor-pointer transition">
          {item.done ? <CheckCircle2 className="w-5 h-5 text-green-500" /> : <Circle className={`w-5 h-5 ${hover ? 'text-brand-accent' : 'text-gray-200'} transition`} />}
        </button>
      </div>

      <div className="px-4 pb-2">
        <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg ${fmt.bg}`}>
          <Icon className={`w-3.5 h-3.5 ${fmt.color}`} />
          <span className={`text-xs font-semibold ${fmt.color}`}>{fmt.label}</span>
        </div>
      </div>

      <div className="px-4 pb-3">
        <p className={`text-sm font-semibold leading-tight ${item.done ? 'text-gray-400 line-through' : 'text-brand-text'}`}>
          {item.topic}
        </p>
      </div>

      {item.hook && !item.done && (
        <div className="mx-4 mb-3 p-2 rounded-lg bg-brand-bg border border-brand-border">
          <p className="text-sm text-brand-text-secondary italic leading-relaxed line-clamp-2">«{item.hook}»</p>
        </div>
      )}

      <AnimatePresence>
        {hover && !item.done && (
          <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }} className="px-4 pb-4">
            <button
              onClick={(e) => { e.stopPropagation(); onGenerate(); }}
              className={`w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-white text-xs font-semibold transition cursor-pointer ${
                item.format === 'carousel' 
                  ? 'bg-blue-500 hover:bg-blue-600' 
                  : 'bg-brand-accent hover:bg-brand-accent-hover'
              }`}
            >
              {item.format === 'carousel' ? <Layers className="w-3.5 h-3.5" /> : <PenTool className="w-3.5 h-3.5" />}
              {buttonText}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// ============ DETAIL PANEL ============
function DetailPanel({ item, onClose, onGenerate }: { item: DayItem; onClose: () => void; onGenerate: () => void }) {
  const fmt = FORMAT_META[item.format] || FORMAT_META.post
  const pillar = getPillarMeta(item.pillar)
  const Icon = fmt.icon

  // Текст и стиль кнопки в зависимости от формата
  const isCarousel = item.format === 'carousel'
  const buttonText = isCarousel ? 'Создать карусель' : 'Сгенерировать пост'
  const buttonClass = isCarousel 
    ? 'bg-blue-500 hover:bg-blue-600 shadow-blue-500/20' 
    : 'bg-brand-accent hover:bg-brand-accent-hover shadow-brand-accent/20'

  return (
    <motion.div
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 40 }}
      className="bg-white rounded-2xl border border-brand-border p-6 sticky top-24"
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-full bg-brand-highlight text-brand-accent text-sm font-bold flex items-center justify-center">{item.day}</span>
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${pillar.color}`}>{item.pillar}</span>
        </div>
        <button onClick={onClose} className="cursor-pointer text-brand-text-secondary hover:text-brand-text transition">
          <X className="w-5 h-5" />
        </button>
      </div>

      <h3 className="text-lg font-bold text-brand-text mb-4 leading-snug">{item.topic}</h3>

      <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg ${fmt.bg} mb-4`}>
        <Icon className={`w-4 h-4 ${fmt.color}`} />
        <span className={`text-sm font-semibold ${fmt.color}`}>{fmt.label}</span>
      </div>

      {/* Подсказка для карусели */}
      {isCarousel && (
        <div className="mb-4 p-3 bg-blue-50 rounded-xl border border-blue-200">
          <p className="text-sm text-blue-700">
            <strong>Карусель</strong> — это 8-10 слайдов с текстом. AI создаст хук, развитие мысли и CTA.
          </p>
        </div>
      )}

      {item.hook && (
        <div className="mb-4">
          <p className="text-xs font-bold text-brand-text-secondary uppercase tracking-wider mb-2">Хук (первая строка)</p>
          <div className="p-3 bg-brand-highlight rounded-xl border border-brand-accent/20">
            <p className="text-sm text-brand-text italic">«{item.hook}»</p>
          </div>
        </div>
      )}

      {item.tip && (
        <div className="mb-6">
          <p className="text-xs font-bold text-brand-text-secondary uppercase tracking-wider mb-2">Подсказка</p>
          <div className="flex items-start gap-2 p-3 bg-amber-50 rounded-xl border border-amber-200">
            <Lightbulb className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
            <p className="text-sm text-amber-800 leading-relaxed">{item.tip}</p>
          </div>
        </div>
      )}

      <button
        onClick={onGenerate}
        className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl text-white font-semibold transition shadow-lg cursor-pointer ${buttonClass}`}
      >
        {isCarousel ? <Layers className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
        {buttonText}
        <ChevronRight className="w-4 h-4" />
      </button>
    </motion.div>
  )
}

// ============ BATCH CONFIG ============
const BATCH_SIZE = 5
const TOTAL_DAYS = 30
const TOTAL_BATCHES = Math.ceil(TOTAL_DAYS / BATCH_SIZE)

// ============ MAIN PAGE ============
export default function ContentPlan() {
  const [user, setUser] = useState<any>(null)
  const [plan, setPlan] = useState<DayItem[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [currentBatch, setCurrentBatch] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<DayItem | null>(null)
  const [filter, setFilter] = useState<string>('all')
  const router = useRouter()

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/'); return }
      setUser(user)

      const { data } = await supabase
        .from('content_plans')
        .select('plan')
        .eq('user_id', user.id)
        .single()

      if (data?.plan) setPlan(data.plan)
      setLoading(false)
    }
    init()
  }, [router])

  const handleGenerate = async () => {
    if (!user) return
    setGenerating(true)
    setError(null)
    setPlan([])
    setCurrentBatch(0)
    
    try {
      for (let batch = 1; batch <= TOTAL_BATCHES; batch++) {
        setCurrentBatch(batch)
        
        const res = await fetch('/api/generate-content-plan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user.id, batch }),
        })
        
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Ошибка генерации')
        
        setPlan(data.plan)
        
        if (data.complete) break
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setGenerating(false)
      setCurrentBatch(0)
    }
  }

  const toggleDone = (day: number) => {
    const updated = plan.map(item => item.day === day ? { ...item, done: !item.done } : item)
    setPlan(updated)
    supabase.from('content_plans').upsert({
      user_id: user?.id,
      plan: updated,
      generated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })
  }

  // ============ ИЗМЕНЁННАЯ ФУНКЦИЯ ============
  const handleGoGenerate = (item: DayItem) => {
    const params = new URLSearchParams({ 
      topic: item.topic, 
      pillar: item.pillar 
    })
    
    // Карусели → отдельный генератор
    if (item.format === 'carousel') {
      router.push(`/dashboard/carousel-generator?${params}`)
    } else {
      // Посты, stories, reels → обычный генератор
      params.append('format', item.format)
      router.push(`/dashboard/post-generator?${params}`)
    }
  }

  const pillars = ['all', 'Психообразование', 'Личное', 'Практика', 'Истории', 'Позиционирование']
  const filtered = filter === 'all' ? plan : plan.filter(d => d.pillar === filter)
  const done = plan.filter(d => d.done).length
  const progressPercent = plan.length > 0 ? Math.round((done / plan.length) * 100) : 0

  const genProgress = currentBatch > 0 ? Math.round((currentBatch / TOTAL_BATCHES) * 100) : 0
  const currentDayStart = (currentBatch - 1) * BATCH_SIZE + 1
  const currentDayEnd = Math.min(currentBatch * BATCH_SIZE, TOTAL_DAYS)

  if (loading) {
    return (
      <div className="min-h-screen bg-brand-bg flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-brand-accent border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-brand-bg">
      <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur border-b border-brand-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between">
          <button onClick={() => router.push('/dashboard')} className="flex items-center gap-2 text-brand-text-secondary hover:text-brand-text transition cursor-pointer">
            <ArrowLeft className="w-5 h-5" />
            Назад в кабинет
          </button>
          <div className="flex items-center gap-3">
            {plan.length > 0 && !generating && (
              <>
                <ExportMenu plan={plan} />
                <button onClick={handleGenerate} disabled={generating} className="flex items-center gap-2 text-sm text-brand-text-secondary hover:text-brand-accent transition cursor-pointer px-3 py-1.5 rounded-lg hover:bg-brand-highlight">
                  <RefreshCw className={`w-4 h-4 ${generating ? 'animate-spin' : ''}`} />
                  Обновить план
                </button>
              </>
            )}
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-brand-accent" />
              <span className="font-bold text-brand-text">PsyContent</span>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <div className="inline-flex items-center gap-2 bg-green-100 text-green-700 px-4 py-2 rounded-full text-sm font-medium mb-4">
            <CalendarDays className="w-4 h-4" />
            Контент-план
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-brand-text mb-2">30 дней контента для вашего блога</h1>
          <p className="text-brand-text-secondary">Персональный план на основе вашего паспорта бренда. Нажмите на карточку — получите готовый пост.</p>
        </motion.div>

        {!plan.length && !generating && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-lg mx-auto text-center py-10 sm:py-20">
            <div className="w-20 h-20 bg-green-100 rounded-3xl flex items-center justify-center mx-auto mb-6">
              <CalendarDays className="w-10 h-10 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold text-brand-text mb-3">Создайте план на 30 дней</h2>
            <p className="text-brand-text-secondary mb-8">AI составит персональный контент-план с темами, форматами и хуками для каждого дня</p>
            <button onClick={handleGenerate} className="inline-flex items-center gap-3 bg-brand-accent text-white px-10 py-4 rounded-2xl text-lg font-semibold hover:bg-brand-accent-hover transition shadow-lg shadow-brand-accent/25 cursor-pointer">
              <Sparkles className="w-5 h-5" />
              Сгенерировать план
            </button>
            <p className="text-sm text-brand-text-secondary mt-3">Займёт около 30-40 секунд</p>
            {error && <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">{error}</div>}
          </motion.div>
        )}

        {generating && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-24">
            <div className="relative w-16 h-16 mx-auto mb-6">
              <Loader2 className="w-16 h-16 text-brand-accent animate-spin" />
              <CalendarDays className="w-6 h-6 text-brand-accent absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
            </div>
            <h2 className="text-xl font-bold text-brand-text mb-2">
              Генерирую дни {currentDayStart}-{currentDayEnd}...
            </h2>
            <p className="text-brand-text-secondary mb-6">AI подбирает темы под ваш голос и нишу</p>
            
            <div className="max-w-md mx-auto">
              <div className="flex justify-between text-xs text-brand-text-secondary mb-2">
                {[1, 2, 3, 4, 5, 6].map(b => (
                  <span key={b} className={currentBatch >= b ? 'text-brand-accent font-medium' : ''}>
                    {(b-1)*5+1}-{b*5}
                  </span>
                ))}
              </div>
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <motion.div 
                  className="h-full bg-brand-accent"
                  initial={{ width: '0%' }}
                  animate={{ width: `${genProgress}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>
            </div>

            {plan.length > 0 && (
              <p className="text-sm text-green-600 mt-4">
                ✓ Готово: {plan.length} дней
              </p>
            )}
          </motion.div>
        )}

        {plan.length > 0 && !generating && (
          <div className={`flex gap-8 ${selected ? 'items-start' : ''}`}>
            <div className="flex-1 min-w-0">
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-2xl border border-brand-border p-5 mb-6">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-6">
                    <div>
                      <p className="text-2xl font-bold text-brand-accent">{done}</p>
                      <p className="text-xs text-brand-text-secondary">опубликовано</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-brand-text">{plan.length - done}</p>
                      <p className="text-xs text-brand-text-secondary">осталось</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-brand-text">{progressPercent}%</p>
                      <p className="text-xs text-brand-text-secondary">выполнено</p>
                    </div>
                  </div>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2">
                  <motion.div className="bg-brand-accent h-2 rounded-full" initial={{ width: 0 }} animate={{ width: `${progressPercent}%` }} transition={{ duration: 0.6 }} />
                </div>
              </motion.div>

              <div className="flex gap-2 flex-wrap mb-5">
                {pillars.map(p => (
                  <button
                    key={p}
                    onClick={() => setFilter(p)}
                    className={`px-4 py-1.5 rounded-full text-sm font-medium transition cursor-pointer ${filter === p ? 'bg-brand-accent text-white' : 'bg-white border border-brand-border text-brand-text-secondary hover:border-brand-accent/50'}`}
                  >
                    {p === 'all' ? `Все ${plan.length} дней` : p}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
                <AnimatePresence>
                  {filtered.map((item, i) => (
                    <motion.div
                      key={item.day}
                      layout
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: i * 0.02 }}
                      onClick={() => setSelected(selected?.day === item.day ? null : item)}
                      className={`cursor-pointer ${selected?.day === item.day ? 'ring-2 ring-brand-accent ring-offset-1 rounded-2xl' : ''}`}
                    >
                      <DayCard item={item} onToggle={() => toggleDone(item.day)} onGenerate={() => handleGoGenerate(item)} />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </div>

                        <AnimatePresence>
              {selected && (
                <motion.div key="detail" initial={{ opacity: 0, width: 0 }} animate={{ opacity: 1, width: 320 }} exit={{ opacity: 0, width: 0 }} className="shrink-0" style={{ width: 320 }}>
                  <DetailPanel item={selected} onClose={() => setSelected(null)} onGenerate={() => handleGoGenerate(selected)} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {error && !generating && (
          <div className="max-w-lg mx-auto mt-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm text-center">
            {error}
            <button 
              onClick={handleGenerate}
              className="block mx-auto mt-3 text-brand-accent hover:underline cursor-pointer"
            >
              Попробовать снова
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
