'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Sparkles, ArrowLeft, Loader2, CalendarDays,
  AlignLeft, Image, Film, FileText,
  CheckCircle2, Circle, PenTool, X,
  RefreshCw, Lightbulb, ChevronRight,
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
  post:     { icon: AlignLeft, label: 'Пост',    color: 'text-purple-600', bg: 'bg-purple-100' },
  carousel: { icon: Image,     label: 'Карусель', color: 'text-blue-600',   bg: 'bg-blue-100'   },
  reels:    { icon: Film,      label: 'Рилс',     color: 'text-pink-600',   bg: 'bg-pink-100'   },
  stories:  { icon: FileText,  label: 'Stories',  color: 'text-orange-600', bg: 'bg-orange-100' },
}

const PILLAR_META: Record<string, { color: string; dot: string }> = {
  'Психообразование': { color: 'text-indigo-600 bg-indigo-50 border-indigo-200',  dot: 'bg-indigo-400' },
  'Личное':          { color: 'text-rose-600 bg-rose-50 border-rose-200',         dot: 'bg-rose-400'   },
  'Практика':        { color: 'text-green-600 bg-green-50 border-green-200',      dot: 'bg-green-400'  },
  'Истории':         { color: 'text-amber-600 bg-amber-50 border-amber-200',      dot: 'bg-amber-400'  },
  'Позиционирование':{ color: 'text-violet-600 bg-violet-50 border-violet-200',   dot: 'bg-violet-400' },
}

function getPillarMeta(pillar: string) {
  return PILLAR_META[pillar] || { color: 'text-gray-600 bg-gray-50 border-gray-200', dot: 'bg-gray-400' }
}

function DayCard({ item, onToggle, onGenerate }: { item: DayItem; onToggle: () => void; onGenerate: () => void }) {
  const [hover, setHover] = useState(false)
  const fmt = FORMAT_META[item.format] || FORMAT_META.post
  const pillar = getPillarMeta(item.pillar)
  const Icon = fmt.icon

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className={`relative rounded-2xl border transition-all duration-200 overflow-hidden ${
        item.done
          ? 'border-green-200 bg-green-50/50 opacity-70'
          : 'border-brand-border bg-white hover:border-brand-accent/40 hover:shadow-md'
      }`}
    >
      {/* Day number + done toggle */}
      <div className="flex items-start justify-between p-4 pb-2">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-bold w-7 h-7 rounded-full flex items-center justify-center ${
            item.done ? 'bg-green-100 text-green-600' : 'bg-brand-highlight text-brand-accent'
          }`}>
            {item.day}
          </span>
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${pillar.color}`}>
            {item.pillar}
          </span>
        </div>
        <button onClick={onToggle} className="cursor-pointer transition">
          {item.done
            ? <CheckCircle2 className="w-5 h-5 text-green-500" />
            : <Circle className={`w-5 h-5 ${hover ? 'text-brand-accent' : 'text-gray-200'} transition`} />
          }
        </button>
      </div>

      {/* Format */}
      <div className="px-4 pb-2">
        <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg ${fmt.bg}`}>
          <Icon className={`w-3.5 h-3.5 ${fmt.color}`} />
          <span className={`text-xs font-semibold ${fmt.color}`}>{fmt.label}</span>
        </div>
      </div>

      {/* Topic */}
      <div className="px-4 pb-3">
        <p className={`text-sm font-semibold leading-tight ${item.done ? 'text-gray-400 line-through' : 'text-brand-text'}`}>
          {item.topic}
        </p>
      </div>

      {/* Hook preview */}
      {item.hook && !item.done && (
        <div className="mx-4 mb-3 p-2 rounded-lg bg-brand-bg border border-brand-border">
          <p className="text-xs text-brand-text-secondary italic leading-relaxed line-clamp-2">
            «{item.hook}»
          </p>
        </div>
      )}

      {/* Generate button on hover */}
      <AnimatePresence>
        {hover && !item.done && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            className="px-4 pb-4"
          >
            <button
              onClick={onGenerate}
              className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl bg-brand-accent text-white text-xs font-semibold hover:bg-brand-accent-hover transition cursor-pointer"
            >
              <PenTool className="w-3.5 h-3.5" />
              Написать пост
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

function DetailPanel({ item, onClose, onGenerate }: { item: DayItem; onClose: () => void; onGenerate: () => void }) {
  const fmt = FORMAT_META[item.format] || FORMAT_META.post
  const pillar = getPillarMeta(item.pillar)

  return (
    <motion.div
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 40 }}
      className="bg-white rounded-2xl border border-brand-border p-6 sticky top-24"
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-full bg-brand-highlight text-brand-accent text-sm font-bold flex items-center justify-center">
            {item.day}
          </span>
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${pillar.color}`}>
            {item.pillar}
          </span>
        </div>
        <button onClick={onClose} className="cursor-pointer text-brand-text-secondary hover:text-brand-text transition">
          <X className="w-5 h-5" />
        </button>
      </div>

      <h3 className="text-lg font-bold text-brand-text mb-4 leading-snug">
        {item.topic}
      </h3>

      <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg ${FORMAT_META[item.format]?.bg || 'bg-gray-100'} mb-4`}>
        {(() => { const Icon = fmt.icon; return <Icon className={`w-4 h-4 ${fmt.color}`} /> })()}
        <span className={`text-sm font-semibold ${fmt.color}`}>{fmt.label}</span>
      </div>

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
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-brand-accent text-white font-semibold hover:bg-brand-accent-hover transition shadow-lg shadow-brand-accent/20 cursor-pointer"
      >
        <Sparkles className="w-4 h-4" />
        Сгенерировать пост
        <ChevronRight className="w-4 h-4" />
      </button>
    </motion.div>
  )
}

export default function ContentPlan() {
  const [user, setUser] = useState<any>(null)
  const [plan, setPlan] = useState<DayItem[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<DayItem | null>(null)
  const [filter, setFilter] = useState<string>('all')
  const router = useRouter()

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/'); return }
      setUser(user)

      // Load saved plan
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
    try {
      const res = await fetch('/api/generate-content-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Ошибка генерации')
      setPlan(data.plan)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setGenerating(false)
    }
  }

  const toggleDone = (day: number) => {
    setPlan(prev => prev.map(item =>
      item.day === day ? { ...item, done: !item.done } : item
    ))
    // Save to supabase
    supabase.from('content_plans').upsert({
      user_id: user?.id,
      plan: plan.map(item => item.day === day ? { ...item, done: !item.done } : item),
      generated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })
  }

  const handleGoGenerate = (item: DayItem) => {
    // Navigate to post generator with pre-filled topic
    const params = new URLSearchParams({
      topic: item.topic,
      format: item.format,
      pillar: item.pillar,
    })
    router.push(`/dashboard/post-generator?${params}`)
  }

  const pillars = ['all', 'Психообразование', 'Личное', 'Практика', 'Истории', 'Позиционирование']
  const filtered = filter === 'all' ? plan : plan.filter(d => d.pillar === filter)
  const done = plan.filter(d => d.done).length
  const progress = plan.length > 0 ? Math.round((done / plan.length) * 100) : 0

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
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <button
            onClick={() => router.push('/dashboard')}
            className="flex items-center gap-2 text-brand-text-secondary hover:text-brand-text transition cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
            Назад в кабинет
          </button>
          <div className="flex items-center gap-3">
            {plan.length > 0 && (
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="flex items-center gap-2 text-sm text-brand-text-secondary hover:text-brand-accent transition cursor-pointer px-3 py-1.5 rounded-lg hover:bg-brand-highlight"
              >
                <RefreshCw className={`w-4 h-4 ${generating ? 'animate-spin' : ''}`} />
                Обновить план
              </button>
            )}
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-brand-accent" />
              <span className="font-bold text-brand-text">PsyContent</span>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-6 py-10">
        {/* Title */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <div className="inline-flex items-center gap-2 bg-green-100 text-green-700 px-4 py-2 rounded-full text-sm font-medium mb-4">
            <CalendarDays className="w-4 h-4" />
            Контент-план
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-brand-text mb-2">
            30 дней контента для вашего блога
          </h1>
          <p className="text-brand-text-secondary">
            Персональный план на основе вашего паспорта бренда. Нажмите на карточку — получите готовый пост.
          </p>
        </motion.div>

        {/* Empty state */}
        {!plan.length && !generating && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-lg mx-auto text-center py-20"
          >
            <div className="w-20 h-20 bg-green-100 rounded-3xl flex items-center justify-center mx-auto mb-6">
              <CalendarDays className="w-10 h-10 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold text-brand-text mb-3">Создайте план на 30 дней</h2>
            <p className="text-brand-text-secondary mb-8">
              AI составит персональный контент-план с темами, форматами и хуками для каждого дня
            </p>
            <button
              onClick={handleGenerate}
              className="inline-flex items-center gap-3 bg-brand-accent text-white px-10 py-4 rounded-2xl text-lg font-semibold hover:bg-brand-accent-hover transition shadow-lg shadow-brand-accent/25 cursor-pointer"
            >
              <Sparkles className="w-5 h-5" />
              Сгенерировать план
            </button>
            <p className="text-sm text-brand-text-secondary mt-3">Займёт около 30 секунд</p>
            {error && (
              <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">{error}</div>
            )}
          </motion.div>
        )}

        {/* Loading */}
        {generating && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-24"
          >
            <div className="relative w-16 h-16 mx-auto mb-6">
              <Loader2 className="w-16 h-16 text-brand-accent animate-spin" />
              <CalendarDays className="w-6 h-6 text-brand-accent absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
            </div>
            <h2 className="text-xl font-bold text-brand-text mb-2">Составляем план на 30 дней...</h2>
            <p className="text-brand-text-secondary">AI подбирает темы под ваш голос и нишу</p>
            <div className="mt-6 flex flex-col items-center gap-2 text-sm text-brand-text-secondary">
              {['Анализируем ваш паспорт бренда...', 'Подбираем темы по рубрикам...', 'Составляем расписание...'].map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-brand-accent animate-pulse" style={{ animationDelay: `${i * 0.4}s` }} />
                  {s}
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Plan */}
        {plan.length > 0 && !generating && (
          <div className={`flex gap-8 ${selected ? 'items-start' : ''}`}>
            {/* Left: calendar */}
            <div className="flex-1 min-w-0">
              {/* Stats + progress */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-2xl border border-brand-border p-5 mb-6"
              >
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
                      <p className="text-2xl font-bold text-brand-text">{progress}%</p>
                      <p className="text-xs text-brand-text-secondary">выполнено</p>
                    </div>
                  </div>

                  {/* Legend */}
                  <div className="hidden md:flex items-center gap-4">
                    {Object.entries(PILLAR_META).map(([name, meta]) => (
                      <div key={name} className="flex items-center gap-1.5">
                        <div className={`w-2 h-2 rounded-full ${meta.dot}`} />
                        <span className="text-xs text-brand-text-secondary">{name}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Progress bar */}
                <div className="w-full bg-gray-100 rounded-full h-2">
                  <motion.div
                    className="bg-brand-accent h-2 rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 0.6 }}
                  />
                </div>
              </motion.div>

              {/* Filter pills */}
              <div className="flex gap-2 flex-wrap mb-5">
                {pillars.map(p => (
                  <button
                    key={p}
                    onClick={() => setFilter(p)}
                    className={`px-4 py-1.5 rounded-full text-sm font-medium transition cursor-pointer ${
                      filter === p
                        ? 'bg-brand-accent text-white'
                        : 'bg-white border border-brand-border text-brand-text-secondary hover:border-brand-accent/50'
                    }`}
                  >
                    {p === 'all' ? 'Все 30 дней' : p}
                  </button>
                ))}
              </div>

              {/* Grid */}
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
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
                      <DayCard
                        item={item}
                        onToggle={(e?: any) => { e?.stopPropagation?.(); toggleDone(item.day) }}
                        onGenerate={() => handleGoGenerate(item)}
                      />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </div>

            {/* Right: detail panel */}
            <AnimatePresence>
              {selected && (
                <motion.div
                  key="detail"
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: 320 }}
                  exit={{ opacity: 0, width: 0 }}
                  className="shrink-0"
                  style={{ width: 320 }}
                >
                  <DetailPanel
                    item={selected}
                    onClose={() => setSelected(null)}
                    onGenerate={() => handleGoGenerate(selected)}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  )
}
